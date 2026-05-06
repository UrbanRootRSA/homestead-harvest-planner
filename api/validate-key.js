// Serverless validator for LemonSqueezy license keys.
//
// Security layers (ordered by rejection cost - cheapest first):
//   1. Method check (POST only)
//   2. Origin / Referer allowlist - stops this endpoint from being a public oracle
//   3. Upstash Redis rate limit per IP (fails open if Upstash env is missing)
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
    if (expectedStoreId && meta.store_id != null && String(meta.store_id) !== String(expectedStoreId)) {
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
