// Serverless validator for LemonSqueezy license keys.
//
// Security layers (ordered by rejection cost - cheapest first):
//   1. Method check (POST only)
//   2. Origin / Referer allowlist - stops this endpoint from being a public oracle
//   3. Upstash Redis rate limit per IP (fails CLOSED in production if the
//      Upstash env vars are missing — Aero-Calc audit 2026-07-10 L1; only
//      TRANSIENT Redis call failures on a constructed client fail open)
//   4. Payload shape validation
//   5. LemonSqueezy activate/validate call
//   6. Store-ID check (optional env var LEMONSQUEEZY_STORE_ID) - rejects keys from
//      other LS stores that happened to hit our endpoint.
//
// The LS license endpoints (/activate, /validate) are public and do NOT require
// an API key. We still proxy them so origin + rate limit + store check apply.

import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

const ALLOWED_ORIGINS = [
  "https://thehomesteadplan.com",
  "https://www.thehomesteadplan.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const LS_ACTIVATE = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";

// Per-IP: anti-spam pre-flight before LS round-trip
const RL_IP_MAX = 10;
const RL_IP_WINDOW_SEC = 600;
// Phase-2 L6: per-licence bucket — caps an attacker holding a stolen key from
// firing /api/validate-key from N residential-proxy IPs to probe activation
// state. Wider window because validate-key is the cheap endpoint and legit
// users hit it more than /api/generate (mount-revalidate, URL-key flow).
const RL_LICENCE_MAX = 50;
const RL_LICENCE_WINDOW_SEC = 3600;

// Phase-2 M5: bound the LS fetch (mirrors generate.js LS_TIMEOUT_MS).
const LS_TIMEOUT_MS = 8000;

// Vercel auto-injects different env var names depending on which Marketplace
// integration the user installed:
//   - New Upstash Marketplace integration → UPSTASH_REDIS_REST_URL / _TOKEN
//   - Legacy Vercel KV integration         → KV_REST_API_URL / _TOKEN
// We accept both so the endpoint Just Works regardless of which the user picked.
let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
  } else {
    // Aero-Calc security audit 2026-07-10 L1: missing env vars used to boot
    // silently with rate limiting OFF (redis stays null, zero log output).
    // Log loudly here; the handler fails closed in production below.
    console.error("[validate-key] Upstash env vars missing — rate limiting DISABLED");
  }
} catch (e) {
  console.warn("[validate-key] Upstash init failed:", e?.message);
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed + "/") || referer === allowed) return true;
  }
  // Vercel preview deployments from this project.
  if (/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app(\/|$)/i.test(referer)) return true;
  if (/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
  return false;
}

function getIp(req) {
  // Phase-2 M4: prefer x-real-ip (Vercel-platform-attested at the edge).
  // Drops socket.remoteAddress fallback (returned Vercel-pod-internal IPs
  // that bucketed many distinct clients into one rate-limit slot).
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return "no-ip";
}

function hashKey(key) {
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

async function rateLimitOK(suffix, max, windowSec) {
  // !redis is dev/preview-only: the 2026-07-10 L1 handler gate fails closed
  // (503) in production before any limiter runs.
  if (!redis) return true;
  try {
    const key = `hhp:rl:validate-key:${suffix}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    return count <= max;
  } catch (e) {
    console.warn("[validate-key] rate limit check failed:", e?.message);
    return true;
  }
}

async function callLs(endpoint, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LS_TIMEOUT_MS);
  try {
    const body = new URLSearchParams(params).toString();
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body,
      signal: ac.signal,
    });
    const json = await resp.json().catch(() => ({}));
    return { httpOk: resp.ok, status: resp.status, json };
  } catch (e) {
    const isAbort = e?.name === "AbortError";
    console.warn("[validate-key] callLs error:", isAbort ? "timeout" : e?.message);
    return { httpOk: false, status: 504, json: {} };
  } finally {
    clearTimeout(timer);
  }
}

// Phase-2 L5: map LS verbatim error strings to a small allowlist of normalised
// messages. LS error wording is not contractually stable; if they ever surface
// internal staff-debug strings (e.g. account IDs) verbatim-passing leaks them
// to the client. The four buckets cover all current LS error states.
function normaliseLsError(errStr) {
  if (/expired/i.test(errStr)) return "This licence key has expired.";
  if (/disabled/i.test(errStr)) return "This licence key has been disabled.";
  if (/instance/i.test(errStr)) return "This device is no longer activated. Try re-entering your licence key.";
  if (/not found|invalid/i.test(errStr)) return "This licence key was not found.";
  return "This licence key could not be validated.";
}

export default async function handler(req, res) {
  // Lock down CORS - same-origin only via the allowlist check.
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, error: "Method not allowed" });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ valid: false, error: "Origin not allowed" });
  }

  // Aero-Calc security audit 2026-07-10 L1: if the Upstash client never
  // initialised (env vars missing at boot), the per-IP AND per-licence rate
  // limits are OFF for the whole deploy. Same hybrid as the store_id gate
  // below: production fails CLOSED (503 — validateKeyRemote treats non-200
  // as transient and keeps stored keys), dev/preview warns and continues so
  // local work without Upstash still functions. Transient Redis call
  // failures on a constructed client keep their deliberate fail-open in
  // rateLimitOK.
  if (!redis) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[CRITICAL] Upstash not configured — refusing to validate in production");
      return res.status(503).json({ error: "Service temporarily unavailable. Try again shortly." });
    }
    console.warn("[WARN] Upstash not configured — rate limiting disabled in non-production");
  }

  const ip = getIp(req);
  if (!(await rateLimitOK(`ip:${ip}`, RL_IP_MAX, RL_IP_WINDOW_SEC))) {
    return res.status(429).json({ valid: false, error: "Too many attempts. Try again in a few minutes." });
  }

  const body = req.body || {};
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const instanceId = typeof body.instance_id === "string" ? body.instance_id.trim() : "";
  const instanceName = typeof body.instance_name === "string" ? body.instance_name.trim() : "";

  if (key.length < 8 || key.length > 128) {
    return res.status(400).json({ valid: false, error: "Invalid licence key format." });
  }

  // Phase-2 L6: per-licence bucket. Caps an attacker who has a key from firing
  // validate-key from many proxy IPs to probe activation state without burning
  // a single per-IP bucket. Mirrors the two-tier pattern on /api/generate.
  if (!(await rateLimitOK(`lk:${hashKey(key)}`, RL_LICENCE_MAX, RL_LICENCE_WINDOW_SEC))) {
    return res.status(429).json({ valid: false, error: "Too many attempts for this licence. Try again in an hour." });
  }

  try {
    let ls;
    if (instanceId) {
      ls = await callLs(LS_VALIDATE, { license_key: key, instance_id: instanceId });
    } else {
      // Pre-/activate store gate (code-review 2026-06-10 H2; FaminePrep /
      // Grow Room / Vertica / Aero cross-product pattern): LS_ACTIVATE
      // succeeds for a valid key from ANY LemonSqueezy store and burns one
      // of that key's activation slots before the post-activation store
      // check below can reject it. A multi-product customer pasting e.g.
      // their Aero-Calc key here would burn a slot on their legitimate
      // other-product licence. Do a non-mutating LS_VALIDATE first, read
      // meta.store_id, and reject wrong-store keys BEFORE activating. Costs
      // one extra LS round-trip per fresh activation. The post-/activate
      // check below stays as defence-in-depth and covers the instanceId
      // branch, which doesn't pass through this pre-check.
      const preCheck = await callLs(LS_VALIDATE, { license_key: key });
      if (preCheck.status >= 500) {
        return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
      }
      // R2-H1 (code-review 2026-06-10 round 2): a non-200 LS response without
      // a recognisable business-error body (LS-edge 429/403 WAF challenge
      // with an HTML body, JSON:API errors[] shape) is an upstream anomaly,
      // not a licence verdict. Without this guard an empty json fell through
      // to the store compare below and returned a definitive "different
      // product" 200 - which the client trusts and wipes the stored licence
      // (the C1 harm class). 502 → client flags transient → key kept.
      // Non-200s WITH .error (e.g. LS 404 "license_key not found") still
      // flow to the definitive bail below, exactly as before.
      if (preCheck.status !== 200 && !(preCheck.json && preCheck.json.error)) {
        return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
      }
      // Bail early on a confirmed-bad key (e.g. "license_key not found") so
      // the fail-closed store compare below can't mislabel it as a
      // wrong-product key, and an invalid key costs 1 LS round-trip not 2.
      if (preCheck.json && preCheck.json.error) {
        return res.status(200).json({
          valid: false,
          error: normaliseLsError(String(preCheck.json.error)),
          retry_activation: false,
        });
      }
      // SEC-4 (2026-06-12, Grow 3264c1a / Vertica 6d30289 port): R2-H1
      // residual one layer deeper - an LS HTTP **200** whose body carries
      // neither a business error (handled above) nor any recognisable verdict
      // shape (boolean `valid` / a `license_key` object) is an upstream
      // contract break (maintenance/WAF JSON behind a 200, non-JSON body →
      // {} via the .catch, shape drift), NOT a licence verdict. Previously it
      // fell through to the store compare below (String(undefined) !==
      // expected) → fabricated definitive 200 "different product" - which
      // the C1-hardened client trusts and wipes hhp_key/hhp_instance.
      // 502 → validateKeyRemote flags transient → key kept. Genuine 200
      // verdicts (any body with license_key or boolean valid, incl.
      // valid:false and store_id mismatches) keep exact current behaviour.
      if (!preCheck.json || (typeof preCheck.json.valid !== "boolean" && !preCheck.json.license_key)) {
        return res.status(502).json({ valid: false, error: "Licence server returned an unexpected response. Try again." });
      }
      // Fail CLOSED (code-review 2026-06-10 M1): no `!= null` escape hatch.
      // If LS ever drops meta.store_id, String(undefined) !== expected
      // rejects - a noisy reject on LS API drift beats a silent store-gate
      // bypass.
      const expectedStoreIdPre = process.env.LEMONSQUEEZY_STORE_ID;
      // Hybrid fail-closed mirror of the post-/activate check (security
      // audit 2026-06-10 I1): in production, a missing LEMONSQUEEZY_STORE_ID
      // must refuse HERE, before LS_ACTIVATE can burn a slot on a
      // wrong-store key. Preview/dev keeps warn-and-skip for local testing.
      if (!expectedStoreIdPre) {
        if (process.env.VERCEL_ENV === "production") {
          console.error("[CRITICAL] LEMONSQUEEZY_STORE_ID missing in production — refusing to validate");
          return res.status(500).json({ valid: false, error: "Server misconfigured. Please contact support." });
        }
        console.warn("[WARN] LEMONSQUEEZY_STORE_ID missing — skipping store check in non-production");
      }
      const preMeta = (preCheck.json && preCheck.json.meta) || {};
      if (expectedStoreIdPre && String(preMeta.store_id) !== String(expectedStoreIdPre)) {
        return res.status(200).json({ valid: false, error: "This licence key is for a different product." });
      }
      const name = (instanceName && instanceName.length <= 64)
        ? instanceName
        : `browser-${Math.random().toString(36).slice(2, 10)}`;
      ls = await callLs(LS_ACTIVATE, { license_key: key, instance_name: name });
    }

    // Distinguish transport failure from LS business rejection. LS returns 200 with
    // { activated: false, error: "..." } for invalid keys, not a 4xx.
    if (ls.status >= 500) {
      return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
    }

    const js = ls.json || {};
    const lk = js.license_key || {};
    const inst = js.instance || null;
    const meta = js.meta || {};

    // R2-H1 (code-review 2026-06-10 round 2): a non-200 LS response without
    // a recognisable business-error body is an upstream anomaly (LS-edge
    // 429/403 WAF HTML body → json {}, JSON:API errors[] shape), not a
    // licence verdict. Previously it fell through `isActive` into a
    // fabricated definitive 200 valid:false, which the client trusts and
    // wipes the stored licence - fleet-wide if LS rate-limits a shared
    // Vercel egress IP during mount revalidations. 502 → client flags
    // transient → key kept. Genuine LS rejections are untouched: 200 bodies
    // (incl. the inactive-key valid:false shape) and non-200s WITH .error
    // (e.g. 404 "license_key not found") stay definitive exactly as before.
    if (ls.status !== 200 && !js.error) {
      return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
    }

    // LS returns error strings inline when invalid.
    if (js.error) {
      // Retry path: caller sent instance_id that LS no longer recognises (e.g.
      // deactivated from the dashboard). Surface a clean error so the client
      // can drop the cached instance and re-activate.
      // SECURITY: narrow retry_activation to errors that actually mention an
      // instance — over-firing it on every error condition (e.g. "key not
      // found") makes URL-key phishing-link slot-burn easier to exploit.
      // Cross-product pattern documented in workspace memory
      // `feedback_url_key_instance_trust.md`. Fix shipped in commit `4f862e1`.
      // Phase-2 L5: normalise verbatim LS strings to an allowlist instead of
      // slice(0,200). Future LS API changes can no longer leak internal info.
      const errStr = String(js.error || "");
      const looksLikeStaleInstance = Boolean(instanceId) && /instance/i.test(errStr);
      return res.status(200).json({
        valid: false,
        error: normaliseLsError(errStr),
        retry_activation: looksLikeStaleInstance,
      });
    }

    // SEC-4 (2026-06-12, Grow 3264c1a / Vertica 6d30289 port): same
    // verdict-shape gate as the pre-check site. A 200 body with no error
    // (handled above), no boolean `valid`, and no `license_key` object
    // (json {} from an unparseable 200 body, or LS shape drift) previously
    // fell through to `isActive` false → fabricated definitive 200 "not
    // active" → client mount-wipe of hhp_key/hhp_instance, then a re-paste
    // burns one of the customer's 3 LS activation slots. 502 → transient.
    // Genuine LS rejections are untouched: inactive/expired/disabled bodies
    // all carry license_key.status, and /activate successes carry
    // license_key + instance (no boolean `valid` - the !js.license_key
    // disjunct covers that leg).
    if (typeof js.valid !== "boolean" && !js.license_key) {
      return res.status(502).json({ valid: false, error: "Licence server returned an unexpected response. Try again." });
    }
    const status = lk.status || (js.valid ? "active" : null);
    const isActive = status === "active" || js.valid === true;
    if (!isActive) {
      const msg =
        status === "expired" ? "This licence key has expired." :
        status === "disabled" ? "This licence key has been disabled." :
        status === "inactive" ? "This licence key is not active yet." :
        "This licence key is not active.";
      return res.status(200).json({ valid: false, error: msg });
    }

    // Store-ID lock-down. Hybrid fail-closed: in production, missing
    // LEMONSQUEEZY_STORE_ID is a server misconfig (refuse to validate). In
    // preview/dev, warn and skip the check so local testing still works.
    const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!expectedStoreId) {
      if (process.env.VERCEL_ENV === "production") {
        console.error("[CRITICAL] LEMONSQUEEZY_STORE_ID missing in production — refusing to validate");
        return res.status(500).json({ valid: false, error: "Server misconfigured. Please contact support." });
      }
      console.warn("[WARN] LEMONSQUEEZY_STORE_ID missing — skipping store check in non-production");
    }
    // Fail CLOSED (code-review 2026-06-10 M1): `meta.store_id != null` guard
    // removed — a response missing store_id now rejects instead of silently
    // skipping the store gate. The env-var side keeps the warn-and-skip
    // hybrid in preview/dev above.
    if (expectedStoreId && String(meta.store_id) !== String(expectedStoreId)) {
      return res.status(200).json({ valid: false, error: "This licence key is for a different product." });
    }

    // Phase-2 L2: trim response to the fields the client actually consumes.
    // The previously-leaked store_id / activation_limit / activation_usage
    // were free reconnaissance for a stolen-key attacker probing activation
    // state. Cross-product pattern (Grow Room d87a210 M2). The canonical-
    // instance gate at /api/generate is the actual enforcement; these were
    // legacy fields no caller in src/App.jsx reads.
    return res.status(200).json({
      valid: true,
      instance_id: inst?.id || instanceId || null,
    });
  } catch (e) {
    // Round-3 L5: log message + code only (matches generate.js pattern).
    // Logging the full exception object can pull request body / header
    // info into log aggregators via the error's `cause` chain.
    console.error("[validate-key] error:", e?.message, e?.code);
    return res.status(500).json({ valid: false, error: "Server error during validation. Try again." });
  }
}
