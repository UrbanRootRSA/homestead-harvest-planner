// Serverless validator for LemonSqueezy license keys.
//
// Security layers (ordered by rejection cost — cheapest first):
//   1. Method check (POST only)
//   2. Origin / Referer allowlist — stops this endpoint from being a public oracle
//   3. Upstash Redis rate limit per IP (fails open if Upstash env is missing)
//   4. Payload shape validation
//   5. LemonSqueezy activate/validate call
//   6. Store-ID check (optional env var LEMONSQUEEZY_STORE_ID) — rejects keys from
//      other LS stores that happened to hit our endpoint.
//
// The LS license endpoints (/activate, /validate) are public and do NOT require
// an API key. We still proxy them so origin + rate limit + store check apply.

import { Redis } from "@upstash/redis";

const ALLOWED_ORIGINS = [
  "https://thehomesteadplan.com",
  "https://www.thehomesteadplan.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const LS_ACTIVATE = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";

const RL_MAX = 10;
const RL_WINDOW_SEC = 600;

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
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

async function rateLimitOK(ip) {
  if (!redis) return true;
  try {
    const key = `hhp:rl:validate-key:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RL_WINDOW_SEC);
    return count <= RL_MAX;
  } catch (e) {
    console.warn("[validate-key] rate limit check failed:", e?.message);
    return true;
  }
}

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

export default async function handler(req, res) {
  // Lock down CORS — same-origin only via the allowlist check.
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, error: "Method not allowed" });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ valid: false, error: "Origin not allowed" });
  }

  const ip = getIp(req);
  if (!(await rateLimitOK(ip))) {
    return res.status(429).json({ valid: false, error: "Too many attempts. Try again in a few minutes." });
  }

  const body = req.body || {};
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const instanceId = typeof body.instance_id === "string" ? body.instance_id.trim() : "";
  const instanceName = typeof body.instance_name === "string" ? body.instance_name.trim() : "";

  if (key.length < 8 || key.length > 128) {
    return res.status(400).json({ valid: false, error: "Invalid licence key format." });
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
      return res.status(200).json({
        valid: false,
        error: String(js.error).slice(0, 200),
        retry_activation: Boolean(instanceId),
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

    // Optional store-ID lock-down. Set LEMONSQUEEZY_STORE_ID in Vercel once you
    // know it (it appears in meta.store_id of the first successful validate).
    const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID;
    if (expectedStoreId && meta.store_id != null && String(meta.store_id) !== String(expectedStoreId)) {
      return res.status(200).json({ valid: false, error: "This licence key is for a different product." });
    }

    return res.status(200).json({
      valid: true,
      instance_id: inst?.id || instanceId || null,
      // Surfaced for client-side logging + future store-ID env lookup. No PII.
      store_id: meta.store_id ?? null,
      activation_limit: lk.activation_limit ?? null,
      activation_usage: lk.activation_usage ?? null,
    });
  } catch (e) {
    console.error("[validate-key] error:", e);
    return res.status(500).json({ valid: false, error: "Server error during validation. Try again." });
  }
}
