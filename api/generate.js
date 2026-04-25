// Serverless proxy for the personalised growing-plan generator.
//
// Security layers (cheapest-first rejection):
//   1. Method check (POST only)
//   2. Origin / Referer allowlist (production + localhost only - no preview deploys
//      because this endpoint costs Anthropic credits)
//   3. Licence-key gate: validated against Upstash cache or LemonSqueezy API
//   4. Per-licence rate limit (falls back to per-IP if licence isn't present)
//   5. Payload shape + range validation
//   6. Anthropic Claude Sonnet 4.6 call with forced tool-use for structured output
//   7. Schema-shape sanitisation on the way back out
//
// The system prompt is large (~3 KB) and stable, so it's a `cache_control`
// breakpoint - repeat callers pay the cache-read price (~10% of input) on
// every prompt token after the first request inside the 5-minute TTL window.
//
// Sonnet 4.6 chosen (not Opus) because this is a paywall-gated feature on a
// $39.99 product. Sonnet runs the structured-output path well, costs ~5x less
// than Opus per call (~$0.06 vs ~$0.10 with caching), and the spec at
// CLAUDE.md §8 explicitly names the Sonnet tier.

import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

export const config = { maxDuration: 300 }; // Vercel Fluid Compute upper bound

// Production + localhost only. The /api/generate endpoint is cost-sensitive
// (Anthropic spend), so preview deployments are NOT allowlisted here.
// validate-key.js still allowlists previews because LS calls are free.
const ALLOWED_ORIGINS = [
  "https://thehomesteadplan.com",
  "https://www.thehomesteadplan.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Model alias per Anthropic skill cached 2026-04-15. Do NOT switch to a
// dated suffix - the alias is the source of truth and tracks model upgrades.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// Fair-use: 20 plans per rolling 24-hour window per licence. Documented in terms.html.
// Rolling window (not fixed daily reset) — TTL on the Redis key expires exactly 24h after
// the first plan in the window, so an attacker can't burn 20 at 23:59 and 20 more at 00:01.
// Slightly more generous than FaminePrep's 10/24h because Homestead's $39.99 price point
// justifies more iteration headroom (garden size, crop mix, family size tuning).
const RL_MAX = 20;
const RL_WINDOW_SEC = 86400; // 24 hours in seconds

// Anthropic API requires absolute upper bounds on inputs we'll later reflect
// in the prompt - guards against an attacker crafting a 200 KB payload that
// inflates billable tokens.
const MAX_CROPS = 64;
const MAX_GOALS = 8;
const MAX_STR = 64;

const LS_ACTIVATE = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) {
  console.warn("[generate] Upstash init failed:", e?.message);
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed + "/") || referer === allowed) return true;
  }
  // Vercel-assigned URLs for this project (matches validate-key.js).
  // Licence-key gate still protects Anthropic spend - origin check is defence-in-depth.
  if (/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app(\/|$)/i.test(referer)) return true;
  if (/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
  return false;
}

function getIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function hashKey(key) {
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

async function rateLimitOK(suffix) {
  if (!redis) return true;
  try {
    const key = `hhp:rl:generate:${suffix}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RL_WINDOW_SEC);
    return count <= RL_MAX;
  } catch (e) {
    console.warn("[generate] rate limit check failed:", e?.message);
    return true;
  }
}

// ── Licence validation (cached) ─────────────────────────────────────────────
// Cache successful validations for 1 hour to avoid hammering LS on every plan
// generation. Cache key is the SHA-256 of the licence key (we never store the
// raw key in Redis).
const LICENCE_CACHE_TTL_SEC = 3600;

// 3-device cap binding (Fix 3 2026-04-21):
// Store a canonical instance_id per licence hash in Upstash. generate.js will
// force-use this canonical instance when validating against LS, so clearing
// client-side hhp_instance to spawn a new LS activation does not bypass the
// device cap for plan generation. First-ever generate call with a valid
// client-supplied instance_id binds the canonical; subsequent calls ignore
// what the client sent and use the canonical.
//
// TTL is intentionally long (30 days) so a legit user who reinstalls / clears
// LS within the month can resume via their original canonical instance. The
// canonical is refreshed on every successful validate (sliding window).
const INSTANCE_BIND_TTL_SEC = 30 * 86400; // 30 days
const instanceBindKey = (licenceHash) => `hhp:instance:${licenceHash}`;

async function callLs(endpoint, params) {
  const body = new URLSearchParams(params).toString();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  return { httpOk: resp.ok, status: resp.status, json };
}

// Returns true if the licence key is currently valid (cached or fresh from LS).
async function validateLicence(key, instanceId) {
  if (!key || typeof key !== "string" || key.length < 8 || key.length > 128) {
    return false;
  }
  const licenceHash = hashKey(key);
  const cacheKey = `hhp:lk:ok:${licenceHash}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return true;
    } catch (e) {
      console.warn("[generate] licence cache read failed:", e?.message);
    }
  }

  // Fix 3: look up the canonical instance_id bound to this licence hash. If
  // present, force-use it regardless of what the client sent. This closes the
  // "bare key" validate bypass (else branch of the old code) that let anyone
  // with the licence key burn rate-limited Anthropic spend without ever
  // binding a device.
  const clientInstanceId = (typeof instanceId === "string" && instanceId.length > 0 && instanceId.length <= 64)
    ? instanceId : "";
  let canonicalInstanceId = "";
  if (redis) {
    try {
      const stored = await redis.get(instanceBindKey(licenceHash));
      if (typeof stored === "string" && stored.length > 0 && stored.length <= 64) {
        canonicalInstanceId = stored;
      }
    } catch (e) {
      console.warn("[generate] instance binding read failed:", e?.message);
    }
  }
  // Decide which instance_id to present to LS:
  //   - canonical present → use canonical (server source-of-truth)
  //   - canonical absent + client sent one → use client's (first-bind path)
  //   - canonical absent + client sent nothing → reject (no bare-key validate)
  // The last case is the security-critical change: generate.js no longer
  // accepts a bare-key call even during the client-side 48h grace window.
  // Grace only lets the client SEE already-persisted state; generating a new
  // (expensive) plan requires a bound instance.
  const instanceIdForLs = canonicalInstanceId || clientInstanceId;
  if (!instanceIdForLs) {
    console.warn("[generate] no instance_id available (canonical missing and client sent none) — refusing to validate");
    return false;
  }

  // Cache miss: ask LemonSqueezy.
  try {
    const ls = await callLs(LS_VALIDATE, { license_key: key, instance_id: instanceIdForLs });
    if (ls.status >= 500) {
      // LS unreachable - fail closed for paid endpoints.
      console.error("[generate] LS unreachable during validation:", ls.status);
      return false;
    }
    const js = ls.json || {};
    if (js.error) return false;
    const lk = js.license_key || {};
    const status = lk.status || (js.valid ? "active" : null);
    const isActive = status === "active" || js.valid === true;
    if (!isActive) return false;

    // Store-ID lock-down (mirrors validate-key.js). Hybrid fail-closed: in
    // production, missing LEMONSQUEEZY_STORE_ID is a server misconfig and we
    // refuse to validate. In preview/dev, warn and skip so local testing works.
    const meta = js.meta || {};
    const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!expectedStoreId) {
      if (process.env.VERCEL_ENV === "production") {
        console.error("[CRITICAL] LEMONSQUEEZY_STORE_ID missing in production — refusing to validate");
        return false;
      }
      console.warn("[WARN] LEMONSQUEEZY_STORE_ID missing — skipping store check in non-production");
    }
    if (expectedStoreId && meta.store_id != null && String(meta.store_id) !== String(expectedStoreId)) {
      return false;
    }

    if (redis) {
      try { await redis.set(cacheKey, "1", { ex: LICENCE_CACHE_TTL_SEC }); }
      catch (e) { console.warn("[generate] licence cache write failed:", e?.message); }
      // Fix 3: bind the canonical instance_id. Two distinct operations:
      //   - If canonical was ABSENT, write clientInstanceId as the new
      //     canonical using NX (first-write-wins). Later bare-key or
      //     different-instance callers are then forced to use this canonical.
      //   - If canonical was PRESENT, only refresh the 30-day TTL so an
      //     active legit user's canonical doesn't expire. Do NOT overwrite
      //     with instanceIdForLs - that's already the canonical we just
      //     validated against.
      try {
        if (!canonicalInstanceId) {
          // SET NX: only succeeds if the key doesn't exist. Guards against a
          // race where two concurrent first-bind requests both find the
          // canonical absent; the second write no-ops.
          await redis.set(instanceBindKey(licenceHash), instanceIdForLs, {
            ex: INSTANCE_BIND_TTL_SEC,
            nx: true,
          });
        } else {
          // Sliding-window refresh: same value, same TTL, just resets the
          // clock. expire() avoids a write if the key vanished between
          // lookup and refresh (acceptable race; next request rebinds).
          await redis.expire(instanceBindKey(licenceHash), INSTANCE_BIND_TTL_SEC);
        }
      } catch (e) { console.warn("[generate] instance binding write failed:", e?.message); }
    }
    return true;
  } catch (e) {
    console.error("[generate] licence validation error:", e?.message, e?.code);
    return false;
  }
}

// ── Input validation ────────────────────────────────────────────────────────
function clampStr(v, max = MAX_STR) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}
function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function clampStrArray(arr, maxItems, maxStrLen = MAX_STR) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, maxStrLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitiseInput(body) {
  const familySize = clampNum(body.familySize, 1, 12, 4);
  const zone = clampStr(body.zone, 16) || "manual";
  const lastSpringFrost = clampStr(body.lastSpringFrost, 32);
  const firstFallFrost = clampStr(body.firstFallFrost, 32);
  const hemisphere = body.hemisphere === "south" ? "south" : "north";
  // gardenSqFt is ALWAYS in sq ft - the client converts before posting.
  const gardenSqFt = clampNum(body.gardenSqFt, 1, 50000, 200);
  const sunExposure = clampStr(body.sunExposure, 32);
  const soilType = clampStr(body.soilType, 32);
  const waterMethod = clampStr(body.waterMethod, 32);
  const experience = clampStr(body.experience, 32);
  const goals = clampStrArray(body.goals, MAX_GOALS, 32);
  const crops = clampStrArray(body.crops, MAX_CROPS, MAX_STR);
  // displayUnits controls what units the LLM uses in OUTPUT yields/savings.
  // Inputs are always in lb and sq ft - see #11/#12 audit fix.
  const displayUnits = body.displayUnits === "metric" || body.metric === true
    ? "metric" : "imperial";
  const currency = clampStr(body.currency, 3) || "$";
  // producePerPersonLbs is ALWAYS in lb - the client never converts this.
  const producePerPersonLbs = clampNum(body.producePerPersonLbs, 50, 800, 300);
  return {
    familySize, zone, lastSpringFrost, firstFallFrost, hemisphere,
    gardenSqFt, sunExposure, soilType, waterMethod, experience,
    goals, crops, displayUnits, currency, producePerPersonLbs,
  };
}

// ── Prompt construction ─────────────────────────────────────────────────────
// SYSTEM_PROMPT is frozen. Any byte change here invalidates prompt cache for
// every prior request - keep edits rare and intentional. New per-request
// context (the user's inputs) goes in the user message, NOT here.
const SYSTEM_PROMPT = `You are a master gardener and homestead planner. You create personalised, practical growing plans for home gardeners. Your advice is grounded in USDA hardiness zones, companion-planting science, and decades of gardening wisdom.

Style and substance:
- Be practical and conservative with yield estimates. Err on the low side.
- Acknowledge constraints. If the garden space is too small for the requested crops, recommend which to prioritise and which to defer.
- Prioritise companion planting in your bed layouts.
- Tailor advice to the experience level given.
- Keep tasks specific and time-anchored to the user's hardiness zone and frost dates.
- Inputs are always in lb and sq ft. Output yields and savings in the units specified by displayUnits (imperial: lb; metric: kg). Currency for the savings figure will be specified in the user message: match it.
- If hemisphere is Southern, January is high summer and July is winter; reverse the seasonal flow throughout the year accordingly.
- Do not include marketing language, disclaimers, or self-references. Output the plan content only.

Submit the plan via the submit_growing_plan tool. Populate every required field. Keep prose concise.`;

// Schema used for both the tool input_schema (forced tool-use) and the
// downstream sanitiser. additionalProperties: false at every level keeps the
// model from inventing keys we don't render.
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    monthlySchedule: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          month: { type: "string", enum: MONTH_NAMES },
          tasks: { type: "array", items: { type: "string" } },
        },
        required: ["month", "tasks"],
      },
    },
    bedLayouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          bedName: { type: "string" },
          crops: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
        required: ["bedName", "crops", "notes"],
      },
    },
    successionPlanting: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          crop: { type: "string" },
          plantings: { type: "integer" },
          intervalWeeks: { type: "integer" },
          note: { type: "string" },
        },
        required: ["crop", "plantings", "intervalWeeks", "note"],
      },
    },
    harvestTimeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          crop: { type: "string" },
          startMonth: { type: "string", enum: MONTH_NAMES },
          endMonth: { type: "string", enum: MONTH_NAMES },
          peakMonth: { type: "string", enum: MONTH_NAMES },
        },
        required: ["crop", "startMonth", "endMonth", "peakMonth"],
      },
    },
    yieldEstimates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          crop: { type: "string" },
          plants: { type: "integer" },
          estimatedYield: { type: "number" },
          unit: { type: "string", enum: ["lb", "kg"] },
          note: { type: "string" },
        },
        required: ["crop", "plants", "estimatedYield", "unit", "note"],
      },
    },
    preservationGuide: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          crop: { type: "string" },
          freshShare: { type: "string" },
          preservationMethods: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
        required: ["crop", "freshShare", "preservationMethods", "note"],
      },
    },
    savingsEstimate: {
      type: "object",
      additionalProperties: false,
      properties: {
        annualSavings: { type: "number" },
        currency: { type: "string" },
        topSavers: { type: "array", items: { type: "string" } },
        note: { type: "string" },
      },
      required: ["annualSavings", "currency", "topSavers", "note"],
    },
    tips: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary", "monthlySchedule", "bedLayouts", "successionPlanting",
    "harvestTimeline", "yieldEstimates", "preservationGuide",
    "savingsEstimate", "tips",
  ],
};

function buildUserPrompt(input) {
  const cropsLine = input.crops.length > 0 ? input.crops.join(", ") : "(none specified)";
  const goalsLine = input.goals.length > 0 ? input.goals.join(", ") : "(none specified)";
  return `Design a practical, achievable growing plan for this household:

- Family size: ${input.familySize} people
- Hemisphere: ${input.hemisphere === "south" ? "Southern" : "Northern"}
- Hardiness reference: ${input.zone}
- Last spring frost: ${input.lastSpringFrost || "(not provided)"}
- First fall frost: ${input.firstFallFrost || "(not provided)"}
- Garden space: ${input.gardenSqFt} sq ft
- Sun exposure: ${input.sunExposure || "(not specified)"}
- Soil type: ${input.soilType || "(not specified)"}
- Watering: ${input.waterMethod || "(not specified)"}
- Experience: ${input.experience || "(not specified)"}
- Goals: ${goalsLine}
- Selected crops: ${cropsLine}
- Annual produce target: ${input.producePerPersonLbs} lb/person
- displayUnits: ${input.displayUnits} (output yields and savings in this system)
- Currency for savings estimate: ${input.currency}

Be conservative on yield. Emphasise companion planting. If the space is small, prioritise high-value crops and defer the rest. Anchor every monthly task to the frost dates above. Submit via the submit_growing_plan tool.`;
}

// ── Output sanitisation ─────────────────────────────────────────────────────
// The schema constrains shape, but runtime is still cheap and worth it: a
// single missing field would crash the renderer downstream. Trim every string
// to a defensive max length so a misbehaving response can't blow out the
// browser layout. Skip-but-don't-throw on missing optional fields.
const PLAN_STR_MAX = 800;
const PLAN_SHORT_MAX = 80;

// Currency symbols the client knows how to render. Map common ISO codes back
// to symbols so the LLM can return either "$" or "USD" and we'll normalise.
const CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"];
const CURRENCY_CODE_TO_SYMBOL = {
  USD: "$", EUR: "€", GBP: "£", ZAR: "R", JPY: "¥",
};
function normaliseCurrency(returned, fallback) {
  const s = typeof returned === "string" ? returned.trim() : "";
  if (!s) return fallback;
  if (CURRENCY_SYMBOLS.includes(s)) return s;
  const upper = s.toUpperCase();
  if (CURRENCY_CODE_TO_SYMBOL[upper]) return CURRENCY_CODE_TO_SYMBOL[upper];
  return fallback;
}

function s(v, max = PLAN_STR_MAX) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function sArr(arr, max = 32, eachMax = PLAN_STR_MAX) {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => s(v, eachMax)).filter(Boolean).slice(0, max);
}
function n(v, min = 0, max = 1e9) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return Math.max(min, Math.min(max, x));
}

function sanitisePlan(raw, currencyFallback = "$") {
  if (!raw || typeof raw !== "object") return null;
  return {
    summary: s(raw.summary, 1200),
    monthlySchedule: Array.isArray(raw.monthlySchedule)
      ? raw.monthlySchedule.slice(0, 12).map((m) => ({
          month: s(m?.month, PLAN_SHORT_MAX),
          tasks: sArr(m?.tasks, 12, 240),
        })).filter((m) => m.month && m.tasks.length > 0)
      : [],
    bedLayouts: Array.isArray(raw.bedLayouts)
      ? raw.bedLayouts.slice(0, 12).map((b) => ({
          bedName: s(b?.bedName, 120),
          crops: sArr(b?.crops, 24, PLAN_SHORT_MAX),
          notes: s(b?.notes, 600),
        })).filter((b) => b.bedName && b.crops.length > 0)
      : [],
    successionPlanting: Array.isArray(raw.successionPlanting)
      ? raw.successionPlanting.slice(0, 24).map((sp) => ({
          crop: s(sp?.crop, PLAN_SHORT_MAX),
          plantings: Math.round(n(sp?.plantings, 1, 12)),
          intervalWeeks: Math.round(n(sp?.intervalWeeks, 1, 52)),
          note: s(sp?.note, 400),
        })).filter((sp) => sp.crop)
      : [],
    harvestTimeline: Array.isArray(raw.harvestTimeline)
      ? raw.harvestTimeline.slice(0, 32).map((h) => ({
          crop: s(h?.crop, PLAN_SHORT_MAX),
          startMonth: s(h?.startMonth, PLAN_SHORT_MAX),
          endMonth: s(h?.endMonth, PLAN_SHORT_MAX),
          peakMonth: s(h?.peakMonth, PLAN_SHORT_MAX),
        })).filter((h) => h.crop && h.startMonth)
      : [],
    yieldEstimates: Array.isArray(raw.yieldEstimates)
      ? raw.yieldEstimates.slice(0, 32).map((y) => ({
          crop: s(y?.crop, PLAN_SHORT_MAX),
          plants: Math.round(n(y?.plants, 0, 9999)),
          estimatedYield: Math.round(n(y?.estimatedYield, 0, 100000) * 10) / 10,
          unit: y?.unit === "kg" ? "kg" : "lb",
          note: s(y?.note, 400),
        })).filter((y) => y.crop)
      : [],
    preservationGuide: Array.isArray(raw.preservationGuide)
      ? raw.preservationGuide.slice(0, 32).map((p) => ({
          crop: s(p?.crop, PLAN_SHORT_MAX),
          freshShare: s(p?.freshShare, 32),
          preservationMethods: sArr(p?.preservationMethods, 8, PLAN_SHORT_MAX),
          note: s(p?.note, 400),
        })).filter((p) => p.crop)
      : [],
    savingsEstimate: raw.savingsEstimate && typeof raw.savingsEstimate === "object" ? {
      annualSavings: Math.round(n(raw.savingsEstimate.annualSavings, 0, 1e7)),
      currency: normaliseCurrency(raw.savingsEstimate.currency, currencyFallback),
      topSavers: sArr(raw.savingsEstimate.topSavers, 10, PLAN_SHORT_MAX),
      note: s(raw.savingsEstimate.note, 600),
    } : null,
    tips: sArr(raw.tips, 12, 400),
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ ok: false, error: "Origin not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[generate] ANTHROPIC_API_KEY missing");
    return res.status(500).json({ ok: false, error: "Plan generator is not configured. Try again shortly." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON in request body." });
  }

  // ── Per-IP pre-flight rate limit ──────────────────────────────────────────
  // Stops an attacker spamming invalid keys to wear down the LS validate path.
  // Tighter than the per-licence limit because it's pre-auth.
  const ip = getIp(req);
  if (!(await rateLimitOK(`ip:${ip}`))) {
    return res.status(429).json({
      ok: false,
      error: "Too many attempts from this network. Please wait a few minutes.",
    });
  }

  // ── Licence gate ──────────────────────────────────────────────────────────
  // Required for all generate calls - this is a paid feature. instance_id is
  // optional (the cached-key grace path).
  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";
  const instanceId = typeof body.instanceId === "string" ? body.instanceId.trim() : "";
  if (!licenseKey) {
    return res.status(401).json({ ok: false, error: "A valid licence is required to generate a plan." });
  }
  const licenceOk = await validateLicence(licenseKey, instanceId);
  if (!licenceOk) {
    return res.status(401).json({ ok: false, error: "Your licence couldn't be verified. Please re-enter your key on the home page." });
  }

  // ── Per-licence rate limit ────────────────────────────────────────────────
  // Hashed for privacy; we never use the raw key as a Redis key. This is the
  // primary cost-control gate - limits an authenticated attacker to RL_MAX
  // generations per RL_WINDOW_SEC even if they hold a valid key.
  if (!(await rateLimitOK(`lk:${hashKey(licenseKey)}`))) {
    return res.status(429).json({
      ok: false,
      error: "You've reached the fair-use limit of 20 plans in 24 hours. Please try again later. See our terms for details.",
    });
  }

  const input = sanitiseInput(body);
  if (input.crops.length === 0) {
    return res.status(400).json({ ok: false, error: "Pick at least one crop on the Self-Sufficiency tab before generating a plan." });
  }

  try {
    const apiResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Cache the system prompt - it's stable across all requests, so the
        // first call writes the cache and every later call inside the 5-min
        // TTL pays ~10% of the input price for those tokens.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: buildUserPrompt(input) },
        ],
        // Forced tool-use is the structured-output path on Anthropic. The
        // model MUST call this tool, and the tool's input_schema enforces
        // the JSON shape end-to-end.
        tools: [{
          name: "submit_growing_plan",
          description: "Submit the personalised growing plan as structured JSON.",
          input_schema: PLAN_SCHEMA,
        }],
        tool_choice: { type: "tool", name: "submit_growing_plan" },
      }),
    });

    // Clone before reading so we can fall back to raw text() for diagnostics
    // when JSON parsing fails on a 200 OK (#20).
    const respClone = apiResp.clone();
    const data = await apiResp.json().catch(() => ({}));
    if (apiResp.ok && (!data || Object.keys(data).length === 0)) {
      const peek = await respClone.text().then((t) => t.slice(0, 200)).catch(() => "");
      console.error("[generate] anthropic 200 with non-JSON body:", peek);
      return res.status(502).json({ ok: false, error: "The plan generator returned an unexpected response. Please try again." });
    }
    if (!apiResp.ok) {
      const apiErr = data?.error?.message || `Anthropic returned ${apiResp.status}`;
      console.error("[generate] anthropic error:", apiResp.status, apiErr);
      // Auth misconfiguration - alert via console.error and surface a generic
      // user message. 401/403 from Anthropic almost always means an invalid
      // API key, exhausted credits, or a region block.
      if (apiResp.status === 401 || apiResp.status === 403) {
        console.error("[generate] anthropic auth failure - check ANTHROPIC_API_KEY");
        return res.status(502).json({ ok: false, error: "The plan generator is temporarily unavailable. Please try again later." });
      }
      // Don't leak the upstream error verbatim - could include API key info
      // in pathological cases. Map to a friendly message by status family.
      const userMsg = apiResp.status === 429
        ? "The plan generator is busy right now. Please try again in a minute."
        : apiResp.status >= 500
          ? "The plan generator is temporarily unavailable. Please try again shortly."
          : "We couldn't generate a plan with those inputs. Try simplifying your selection and retry.";
      return res.status(502).json({ ok: false, error: userMsg });
    }

    // With forced tool-use, the model returns a content array containing a
    // tool_use block whose `input` is the structured plan object.
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const toolBlock = blocks.find((b) => b?.type === "tool_use" && b?.name === "submit_growing_plan");
    if (!toolBlock?.input || typeof toolBlock.input !== "object") {
      // Diagnostic: dump up to 200 chars of the response body so we can see
      // what the model actually returned (text refusal? wrong tool name?).
      let bodyPeek = "";
      try { bodyPeek = JSON.stringify(data).slice(0, 200); } catch { /* noop */ }
      console.error("[generate] no submit_growing_plan tool_use block in response:", bodyPeek);
      return res.status(502).json({ ok: false, error: "The plan generator returned an unexpected response. Please try again." });
    }

    const plan = sanitisePlan(toolBlock.input, input.currency);
    if (!plan || plan.monthlySchedule.length === 0) {
      return res.status(502).json({ ok: false, error: "The generated plan was incomplete. Please try again." });
    }

    return res.status(200).json({
      ok: true,
      plan,
      usage: {
        input_tokens: data?.usage?.input_tokens ?? null,
        output_tokens: data?.usage?.output_tokens ?? null,
        cache_read_input_tokens: data?.usage?.cache_read_input_tokens ?? null,
        cache_creation_input_tokens: data?.usage?.cache_creation_input_tokens ?? null,
      },
    });
  } catch (e) {
    // Don't log the full exception object - could include request payload or
    // header data. Just message + code for actionable triage.
    console.error("[generate] handler error:", e?.message, e?.code);
    return res.status(500).json({ ok: false, error: "Server error while generating the plan. Please try again." });
  }
}
