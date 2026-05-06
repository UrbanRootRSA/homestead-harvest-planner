# SECURITY AUDIT — The Homestead Plan
**Date:** 2026-05-06
**Auditor:** security-auditor (Urban Root)
**Tip audited:** `4b6f5e3` on `main` (prior to this audit; round-6 code-review verdict 0/0/0/0 on cycle-3)
**Scope:** Phase 2 of 3-phase pre-deployment hardening pass. Full OWASP Top 10:2025 + Urban Root 5-layer defence-in-depth review.

## Summary

The Homestead Plan is in the strongest security posture of any Urban Root product audited to date. After 6 code-review rounds + Phase-1 security-research closures (`97e173e` → `35b67a0` → `4b6f5e3`), every classical attack surface has been addressed: origin allowlist matches across both API files, canonical-instance binding closes the bare-key bypass, prompt-cache TTFT side-channel is documented, store-ID hybrid is fail-closed in production, Vite is patched to 5.4.21, UNSAFE_CHAR_RE covers ~14 codepoint families, error logs are narrowed to message+code (no exception cause-chain leakage), and a clean codebase grep confirms zero `dangerouslySetInnerHTML` in production source.

This audit confirms the Phase-1 closures and goes one level deeper. Findings are: **0 CRITICAL, 0 HIGH, 5 MEDIUM, 6 LOW, 8 INFO**. None are exploit-ready against the current architecture; all are defence-in-depth tightening, dashboard hygiene, or future-resilience items.

**Verdict: SHIP-READY** for Phase 3. Three of the five MEDIUM findings require **out-of-band action** (Vercel dashboard, LemonSqueezy dashboard, Anthropic dashboard) and cannot be closed by code edits.

## 5-Layer Stack Status

| Layer | Status | Notes |
|---|---|---|
| L1 Origin Allowlist | OK | Production hosts + localhost; `validate-key.js` includes Vercel preview regex (LS calls free); `generate.js` correctly excludes preview deploys (Anthropic-cost-protected). Both regexes match `vercel.json` redirect host pattern. |
| L2 Licence Gate | OK | `/api/generate` runs canonical-instance binding BEFORE cache lookup (post-H1 reorder, cycle 1 `97e173e`). Bare-key validate path is structurally rejected. Hybrid store-ID fail-closed in production. URL-key slot-burn defence verified at both gates. |
| L3 Redis Rate Limit | OK | Upstash-backed both endpoints. Two-tier on `/api/generate`: per-IP (60/h, anti-abuse) + per-licence (20/24h, cost-control), keyed by SHA-256 hash. `/api/validate-key` is per-IP 10/10min. Fails OPEN on Redis errors (correct — Redis isn't a security boundary, the licence gate is). Namespaced under `hhp:rl:*` and `hhp:lk:*` / `hhp:instance:*`. |
| L4 CSP Header | OK with one tightenable item | `vercel.json` carries the full 6-header block (X-Content-Type-Options, X-Frame-Options DENY, X-XSS-Protection, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, CSP). CSP includes `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. `'unsafe-inline'` retained in script-src + style-src — see M3 below for nuance. |
| L5 DOMPurify | n/a | Production source contains zero `dangerouslySetInnerHTML`. The `escapeHtml` chain operates on template-string concatenation that produces a Blob downloaded as an HTML file (not rendered into the live DOM). DOMPurify is unnecessary; `escapeHtml` covers `&<>"'` correctly. |

## Critical Findings

**None.**

## High Findings

**None.**

## Medium Findings

### M1: Vercel env vars not flagged "Sensitive" — April 2026 breach exposure window
- **OWASP:** A02:2025 Security Misconfiguration / A03:2025 Software Supply Chain Failures
- **Location:** Vercel dashboard (out-of-band, no code change)
- **Current state:** `ANTHROPIC_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_TOKEN` all configured in Vercel project settings. Per security-research-2026-05-06.md HIGH-1, none have been verified as marked "Sensitive" in the Vercel dashboard.
- **Reproduce / attack scenario:** The April 2026 Vercel breach exposed *non-Sensitive* env vars (those decryptable to plaintext) for a "limited subset of customers" via an internal-employee browser-extension OAuth pivot. The breach is upstream of Hobby/Pro tier — it's about which env vars Vercel encrypts at rest in a way attackers can't enumerate. Without "Sensitive" flag, the env var sits in Vercel's storage in a form that any future similar incident can read. The Anthropic key is the high-value target: an attacker with it has direct billing access until the next manual rotation.
- **Impact:** If the Anthropic key leaks via a future Vercel-internal incident, the $100/mo Anthropic spending limit (per CLAUDE.md §8) is the only containment until rotation. At Sonnet 4.6 pricing (~$3 per 1M input + $15 per 1M output), $100 buys roughly 1,000 abusive calls — small enough that an attacker would notice the cap and move on, but large enough to wipe a month's revenue on a $39.99 product.
- **Recommended action (NO CODE CHANGE):**
  1. In Vercel dashboard → Settings → Environment Variables, edit `ANTHROPIC_API_KEY` and toggle "Sensitive". Also do `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_TOKEN`. `LEMONSQUEEZY_STORE_ID` is public (348457 is in CLAUDE.md) — flagging it Sensitive is harmless but optional.
  2. After flipping the flag, **redeploy production** — Vercel docs confirm rotation/flag-changes do NOT retroactively apply to old deployments. Old deployments still serve traffic with the old, unflagged value until redeployed.
  3. Verify the Anthropic dashboard spending limit is still set to $100/mo (was set per CLAUDE.md §8).
  4. Consider quarterly rotation cadence going forward.
- **Why MEDIUM not HIGH:** Vercel notified affected customers individually for the April 2026 incident — if no notification arrived, Homestead was not in the affected subset. This is forward-protection, not active-leak-cleanup.

### M2: LemonSqueezy product UUID test-mode-vs-live-mode verification
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** LemonSqueezy dashboard (out-of-band) + verify `App.jsx:94` `CHECKOUT_URL`
- **Current state:** `CHECKOUT_URL = "https://thehomesteadplan.lemonsqueezy.com/checkout/buy/6aecd238-c4b2-41a1-9a05-255dc8bfc822"`. Per CLAUDE.md §17 this is the LIVE-mode UUID. Confirmed against per-product memory (`project_homestead.md` notes "Real $39.99 purchase verified end-to-end 2026-04-27").
- **Reproduce / attack scenario:** Cross-product Urban Root memory flags this as a known bug class. Test-mode and live-mode have different UUIDs; ship the wrong one and customers either pay nothing (test-mode → no real charge → no licence delivery) or the wrong product appears in checkout. This is a configuration drift risk on the next product update — not a current-state vulnerability.
- **Impact:** If test-mode UUID accidentally lands in production via a bad copy-paste, every checkout silently fails to bill. Revenue stops without any error signal until support tickets arrive.
- **Recommended action (NO CODE CHANGE for now):**
  1. In LS dashboard → Products → The Homestead Plan, verify the product is in LIVE mode (not test mode) and the UUID matches `App.jsx:94`.
  2. Verify activation_limit is 3 (the device cap headline-feature requires this — without it, the canonical-instance binding becomes the only enforcement).
  3. Verify the confirmation modal redirect URL is `thehomesteadplan.com?key=[license_key]` per CLAUDE.md §17.
  4. **Optional code-side hardening:** Add a server-side env var `LEMONSQUEEZY_PRODUCT_UUID` and reject a validation if the LS response's `meta.product_id` doesn't match. Belt-and-braces beyond the existing `store_id` check.
- **Why MEDIUM:** Memory-driven, not exploit-driven. The store_id check at `validate-key.js:181-183` and `generate.js:241-243` already provides the same defence at the store level. Product-UUID drift would manifest as customer-visible checkout failure, not silent compromise.

### M3: CSP `'unsafe-inline'` in `script-src` — long-tail XSS amplifier
- **OWASP:** A02:2025 Security Misconfiguration / A05:2025 Injection
- **Location:** `vercel.json:29` (CSP header)
- **Current code:**
  ```
  script-src 'self' 'unsafe-inline' https://assets.lemonsqueezy.com https://app.lemonsqueezy.com https://va.vercel-scripts.com
  ```
- **Reproduce / attack scenario:** `'unsafe-inline'` allows any inline `<script>` block to execute. Today this is required because:
  1. Two `<script type="application/ld+json">` blocks in `index.html:34-127` (WebApplication + FAQPage SEO data — these are inert content scripts, never executed, but CSP doesn't differentiate by `type` attribute)
  2. Vercel Analytics injects an inline initialization snippet
  3. LemonSqueezy SDK has been historically injected inline (currently it's `<script src="...lemon.js" defer></script>` per `index.html:15` — this is *external*, not inline, so doesn't itself need `'unsafe-inline'`)
- **Impact:** If a future XSS bug ever lands (e.g., someone forgets `escapeHtml` on a new field that ends up in the live DOM via `dangerouslySetInnerHTML`), `'unsafe-inline'` allows the injected payload to execute. This is *defence-in-depth* — Homestead's actual XSS surface is small (no user-to-user content, LLM output is double-escaped via schema + `escapeHtml`, no `dangerouslySetInnerHTML` exists), but `'unsafe-inline'` is the single most-flagged CSP weakness by Google CSP-Evaluator.
- **Recommended fix (would require Vercel Edge Middleware):**
  - Replace `'unsafe-inline'` with `'nonce-{NONCE}'` where `{NONCE}` is generated per-request via Edge Middleware. The nonce is injected into both the CSP header and onto each `<script>` tag at render time. `vite-plugin-csp` or a hand-rolled middleware can do this.
  - Tradeoff: dynamic per-request HTML (no static CDN caching). Acceptable for a paywalled product where most users render fresh.
  - Alternative cheaper option: Switch JSON-LD blocks to use SHA-256 hashes (`'sha256-...'`). Vite produces the same bytes every build, so the hash is stable until copy changes. No dynamic middleware needed.
- **Why MEDIUM not HIGH:** No current XSS path. This is purely future-protection. Without `'unsafe-inline'`, the JSON-LD blocks stop loading and SEO breaks — so any fix must include hash/nonce migration of those blocks first.
- **Defer-decision rationale:** The CLAUDE.md §22 outstanding-items list already calls out "nonce-based CSP migration if budget permits" — this is an explicitly-deferred item, not new debt.

### M4: Per-IP rate limit uses `x-forwarded-for[0]` instead of Vercel-attested IP header
- **OWASP:** A02:2025 Security Misconfiguration / A05:2025 (rate-limit bypass)
- **Location:** `api/generate.js:90-94`, `api/validate-key.js:59-63`
- **Current code:**
  ```js
  function getIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
    return req.socket?.remoteAddress || "unknown";
  }
  ```
- **Reproduce / attack scenario:** Per security-research-2026-05-06.md MED-2: Vercel's documented client-IP header is `x-real-ip`, and the canonical multi-proxy header is `x-vercel-forwarded-for`. `x-forwarded-for[0]` is the *original* client (correct for direct-to-Vercel), but if a customer ever puts Cloudflare in front of Vercel, the leftmost entry becomes Cloudflare's recorded `cf-connecting-ip`-like value, which Cloudflare in turn took from the request — creating a single-hop spoof window. `req.socket.remoteAddress` fallback returns Vercel-pod-internal IPs that collapse many distinct clients into one rate-limit bucket.
- **Impact:** Today, direct-to-Vercel traffic is unaffected (Vercel overwrites `x-forwarded-for`, so `[0]` is the genuine client IP). Future risk only if Cloudflare or similar fronts Vercel. The `unknown` bucket fallback creates one collision-prone bucket for any request lacking XFF — currently happens with localhost dev runs, but anyone bypassing the edge could land there.
- **Recommended fix:**
  ```js
  function getIp(req) {
    // Vercel-platform-trusted client IP (overwritten at the edge, can't be spoofed
    // by client). Falls back to x-forwarded-for first hop for non-Vercel hosts.
    const real = req.headers["x-real-ip"];
    if (typeof real === "string" && real.length > 0) return real.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
    // No trusted IP — use a deterministic constant. Don't return socket address;
    // it returns Vercel-pod IPs that bucket all unknown clients together.
    return "no-ip";
  }
  ```
  - Add an inline comment noting this is defence-in-depth; the licence gate is the actual cost-control.
- **Why MEDIUM:** Per-IP is *defence-in-depth* — the per-licence gate (20/24h, hashed) is the actual cost ceiling. An attacker who bypasses per-IP still hits the licence gate. But fixing this is ~10 LOC and removes a future-Cloudflare-fronting failure mode.

### M5: 90s wall-clock fetch in `validateLicence` is unbounded — only outer rate-limit prevents stuck calls
- **OWASP:** A10:2025 Mishandling of Exceptional Conditions
- **Location:** `api/generate.js:133-145` (`callLs` function), and indirectly all callers
- **Current code:**
  ```js
  async function callLs(endpoint, params) {
    const body = new URLSearchParams(params).toString();
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { ... },
      body,
    });
    ...
  }
  ```
- **Reproduce / attack scenario:** `fetch()` to LemonSqueezy has no `signal` / no `AbortController` / no per-request timeout. The whole `/api/generate` handler has `maxDuration: 300` (Vercel Fluid Compute). If LS hangs (holds the connection but never responds — slow-loris-like behaviour from a degraded LS), the handler waits up to 300s before Vercel kills it. The Anthropic call later in the handler is also a `fetch()` without explicit timeout. The client-side `validateKeyRemote` at `App.jsx:553` does have a 15s `AbortController`, but the server-side LS calls inside `validateLicence` and the Anthropic call inside the main handler do not.
- **Impact:** Ordinary slowness is contained by Vercel function timeout. But a degraded LS / Anthropic that *almost* responds (TLS handshake completes, headers sent, body never finishes) ties up a serverless function slot for up to 300s. With Vercel Fluid Compute's per-instance concurrency, a small number of stuck requests can saturate a function instance and prevent legitimate traffic from being served. The rate-limit gate (60/h per IP, 20/24h per licence) prevents an attacker from amplifying this, but a single bad upstream actor doing slow-loris from outside is unrate-limited.
- **Recommended fix:**
  ```js
  // At the top of generate.js
  const LS_TIMEOUT_MS = 8000;       // LS validate is fast (~500ms) under normal load
  const ANTHROPIC_TIMEOUT_MS = 75000; // generate.js has maxDuration:300; this leaves 225s headroom for the post-call sanitiser

  // Inside callLs:
  async function callLs(endpoint, params) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LS_TIMEOUT_MS);
    try {
      const body = new URLSearchParams(params).toString();
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { ... },
        body,
        signal: ac.signal,
      });
      const json = await resp.json().catch(() => ({}));
      return { httpOk: resp.ok, status: resp.status, json };
    } finally {
      clearTimeout(timer);
    }
  }
  ```
  - Wrap the Anthropic `fetch` similarly with `ANTHROPIC_TIMEOUT_MS`.
  - On `AbortError`, return `{ httpOk: false, status: 504, json: {} }` so the handler's existing `>= 500` branch returns the LS-unreachable message.
- **Why MEDIUM:** No active exploit, but A10:2025 is the new (2025) OWASP category specifically to catch missing-timeout failure modes. The fix is ~15 LOC.

## Low Findings

### L1: Per-IP Redis bucket on `validate-key.js` increments BEFORE method check passes
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** `api/validate-key.js:103-106`
- **Current state:** Method check passes first (line 96), origin check passes second (line 99-101), THEN the IP rate-limit `redis.incr` runs. So this finding is actually CLEAN — it does NOT increment for non-POST or wrong-origin requests. **Marking as INFORMATIONAL audit-pass note**, not a real finding.

### L2: Successful `/api/validate-key` response leaks `activation_limit` + `activation_usage` + `store_id` to client
- **OWASP:** A09:2025 Security Logging and Alerting Failures (information disclosure flavour)
- **Location:** `api/validate-key.js:185-192`
- **Current code:**
  ```js
  return res.status(200).json({
    valid: true,
    instance_id: inst?.id || instanceId || null,
    store_id: meta.store_id ?? null,
    activation_limit: lk.activation_limit ?? null,
    activation_usage: lk.activation_usage ?? null,
  });
  ```
- **Reproduce / attack scenario:** Cross-product memory (Grow Room d87a210 audit, M2) flags this exact pattern. `App.jsx:573` does `return data` from the validator wrapper, but the consuming code at `App.jsx:7172-7174` only uses `data.valid` and `data.instance_id`. The `activation_limit`, `activation_usage`, and `store_id` are leaked but never used — they let an attacker who has stolen a key probe the activation count remotely without burning their own slot ("does this key still have room?").
- **Impact:** Useful reconnaissance for a stolen key. Not directly dangerous (the canonical-instance binding at `/api/generate` is the actual gate), but every leaked field is free signal for an attacker.
- **Recommended fix:** Remove the three unused fields from the response:
  ```js
  return res.status(200).json({
    valid: true,
    instance_id: inst?.id || instanceId || null,
  });
  ```
  - `App.jsx` doesn't read these fields; safe to drop.
- **Why LOW not MEDIUM:** Same severity-tier reasoning as Grow Room d87a210 M2. The fields are ambient information about a key, not a credential. The canonical-instance binding gate makes them low-value for actual abuse. Worth tightening as cross-product hygiene.

### L3: Cross-Origin-Resource-Policy header missing
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** `vercel.json:23-30`
- **Current state:** The 6-header block does not include `Cross-Origin-Resource-Policy: same-origin`.
- **Reproduce / attack scenario:** CORP prevents another origin from including this site's resources via `<img>`, `<iframe>`, etc. With `frame-ancestors 'none'` already in CSP, the iframe path is closed. CORP closes the cross-origin `<img>` / `<script>` /  `<link>` inclusion paths that could be used for side-channel timing attacks against the static asset cache.
- **Impact:** Minor. Static assets aren't sensitive (they're public). The og-image, favicon, sitemap, etc. are intentionally publicly fetchable. CORP `same-origin` would block legitimate uses.
- **Recommended fix:** Add `Cross-Origin-Opener-Policy: same-origin` (allows window-open isolation) but leave CORP as-is. COOP is the modern complement to `frame-ancestors 'none'`.
  ```json
  { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
  ```
- **Why LOW:** Defence-in-depth, no current threat path.

### L4: HSTS missing from `vercel.json`
- **OWASP:** A02:2025 Security Misconfiguration / A04:2025 Cryptographic Failures
- **Location:** `vercel.json:23-30`
- **Current state:** No `Strict-Transport-Security` header explicitly declared. Round-6 verification probe at `code-review-2026-05-06-round6.md:37` notes `Strict-Transport-Security: preload` was retained on Vercel-aliased redirects — implying Vercel platform injects HSTS by default.
- **Recommended action:**
  - Verify in browser DevTools that production thehomesteadplan.com responses carry `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` or similar.
  - If not present, add explicitly to `vercel.json` headers block.
- **Why LOW:** Vercel HTTPS-only default + automatic HSTS injection means this is likely a no-op finding. Worth verifying once.

### L5: `validate-key.js` returns LS error string slice(0,200) — could leak LS internal state
- **OWASP:** A02:2025 Security Misconfiguration / A09:2025 Logging Failures
- **Location:** `api/validate-key.js:152-156`
- **Current code:**
  ```js
  return res.status(200).json({
    valid: false,
    error: errStr.slice(0, 200),
    retry_activation: looksLikeStaleInstance,
  });
  ```
- **Reproduce / attack scenario:** LS returns business errors like `"This license key has been disabled"` or `"This license key does not belong to this instance"`. The slice(0,200) caps length but verbatim-passes the LS error string to the client. If LS ever changes their error format to include internal IDs, account info, or staff-debug strings, those would leak.
- **Impact:** Today, LS error strings are short and benign. Future LS API changes could regress this without Homestead noticing.
- **Recommended fix:** Map LS error strings to a small allowlist of normalised messages:
  ```js
  const errStr = String(js.error || "");
  const normalised =
    /not found/i.test(errStr) ? "This licence key was not found." :
    /expired/i.test(errStr) ? "This licence key has expired." :
    /disabled/i.test(errStr) ? "This licence key has been disabled." :
    /instance/i.test(errStr) ? "This device is no longer activated." :
    "This licence key could not be validated.";
  return res.status(200).json({
    valid: false,
    error: normalised,
    retry_activation: looksLikeStaleInstance,
  });
  ```
- **Why LOW:** Current LS error strings are safe. Defence-in-depth against future LS API changes.

### L6: `validate-key.js` does not include `/api/generate`'s anti-amplifier per-licence rate-limit
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** `api/validate-key.js:103-106`
- **Current state:** `/api/validate-key` rate-limits by IP only (10/10min). It does NOT have a per-licence-key bucket.
- **Reproduce / attack scenario:** An attacker holding a stolen key can call `/api/validate-key` from N IPs (residential proxy network) and hit the activation/validate endpoint up to N × 10 times per 10 min. LS itself rate-limits at their layer, but those calls all show up against Homestead's own request quota and Vercel function invocations.
- **Impact:** Minimal. LS endpoints are free. Vercel function invocations are within Hobby tier limits. No financial impact.
- **Recommended fix:** Add a hashed per-key bucket alongside the per-IP bucket, e.g., `hhp:rl:validate-key:lk:<licenceHash>` with a wider window (50/hour). Mirrors the `/api/generate` two-tier pattern.
- **Why LOW:** No financial driver. `validate-key.js` is the cheap endpoint per spec.

## Informational

### I1: Origin allowlist regex matches preview deploys for `validate-key.js` — verify intended
- **Location:** `api/validate-key.js:54-55`
- **State:** Both regexes match `/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app(\/|$)/i` — i.e., production preview deploys can validate licence keys. This is intentional per the comment at `generate.js:84` ("LS calls are free"). `/api/generate` correctly excludes preview deploys (Anthropic-cost-protected). Cross-confirmed against `vercel.json` redirect host pattern.
- **No action.**

### I2: `escapeHtml` covers `& < > " '` — sufficient for the report-builder use case
- **Location:** `src/App.jsx:4653-4661`
- **State:** Correct character set for HTML entity escaping. The five characters cover the standard XSS-prevention canonical set per OWASP XSS Prevention Cheat Sheet for "HTML body context" + "HTML attribute context (quoted)". Used everywhere LLM strings are concatenated into the Blob HTML report. The Blob is then offered as a download — the user opens it in their browser as a *new origin* (the file:// origin), so even if XSS landed there, it can't reach thehomesteadplan.com cookies / localStorage.
- **No action.**

### I3: `dangerouslySetInnerHTML` grep returns zero matches in production source
- **Location:** `src/**/*.jsx` (grep run during this audit)
- **State:** Confirmed clean. Only matches are in `docs/security-research-2026-05-06.md` (the research doc itself).
- **No action.** This is the canonical Urban Root anti-pattern that's been absent here from inception. Worth memorialising as the L5 / DOMPurify rationale.

### I4: Forced tool-use `additionalProperties: false` at every schema level
- **Location:** `api/generate.js:374-479`
- **State:** Verified. Every nested object in `PLAN_SCHEMA` has `additionalProperties: false`. This blocks the LLM from inventing fields the renderer doesn't expect. Cross-checked against the round-3 audit, which already verified this.
- **No action.** Canonical Urban Root pattern.

### I5: Anthropic API key only ever read inside serverless handler — never bundled into client
- **Location:** `api/generate.js:611-613`
- **State:** `process.env.ANTHROPIC_API_KEY` referenced only at the handler entry guard and the `x-api-key` header construction. Never imported or referenced in `src/`. Vite production build (verified during round-6) is 388.77 KB / 109.96 KB gz with 33 modules — no env var leakage to the client bundle is possible.
- **No action.** Confirmed clean.

### I6: Vite 5.4.21 is current ceiling at time of audit
- **Location:** `package.json:21` (`"vite": "^5.4.21"`)
- **State:** Cycle-1 (commit `97e173e`) bumped from 5.0 → 5.4.21, closing 6 dev-server CVEs. 5.4.x is the safe long-term-support line. Vite 6 is documented as a "post-launch hygiene" item per CLAUDE.md §22; not blocking.
- **No action.**

### I7: `CHECKOUT_URL` hardcoded with live-mode UUID — verify on every re-deploy
- **Location:** `src/App.jsx:94`
- **State:** Live-mode UUID confirmed via real $39.99 purchase 2026-04-27 per project_homestead.md memory. See M2 above for ongoing verification.
- **No action.** Listed for completeness.

### I8: Anthropic spend ceiling ($100/mo) is the actual cost-DOS containment
- **Location:** Anthropic dashboard (out-of-band)
- **State:** Per CLAUDE.md §8 + memory `feedback_paid_api_endpoint_security.md`. The licence-key cap, rate limits, and store_id check all operate above the spend ceiling — if a key is stolen and an attacker bypasses every code-side gate, the Anthropic dashboard cap stops the bleed at $100. This is the canonical containment for a worst-case key-leak scenario.
- **Action:** Quarterly verify the cap is still set at $100. Memorialised in CLAUDE.md.

## Defence-in-depth chain (verified)

In order from cheapest rejection to most expensive:

1. **Method check** (POST only) — both endpoints. Cheap O(1) string compare.
2. **Origin / Referer allowlist** — both endpoints. Hardcoded production hosts + localhost. `validate-key.js` allows preview deploys; `generate.js` does NOT (Anthropic-cost-protected).
3. **Per-IP rate limit** — both endpoints. `validate-key.js` is 10/10min; `generate.js` is 60/hour. Upstash-backed. Fails OPEN on Redis errors (correct — Redis isn't a security boundary, and false-locking paying users would be worse than the attack).
4. **Payload shape validation** — both endpoints. Length-bounded, type-checked, NaN-coerced.
5. **Licence gate** (`generate.js` only) — `validateLicence` runs the canonical-instance check BEFORE the cache lookup (post-H1 reorder). Bare-key validate is structurally rejected. Cache only short-circuits the LS round-trip after the canonical gate passes. Hybrid store-ID is fail-CLOSED in production.
6. **Per-licence rate limit** (`generate.js` only) — 20/24h, hashed key. Primary cost-control gate.
7. **Schema integrity** (`generate.js`) — Forced tool-use with `additionalProperties: false` at every level. Locks shape end-to-end.
8. **Output sanitisation** (`generate.js`) — `sanitisePlan` re-validates every field shape and trims to defensive max-lengths.
9. **HTML escape** (`App.jsx`) — `escapeHtml` runs on every LLM string concatenated into the downloadable HTML report Blob.
10. **CSP + 5 sibling headers** — `vercel.json` restricts script/connect/frame sources, blocks `<object>`, blocks framing, sets Referrer-Policy.

Each layer fails CLOSED for paid-feature access (refuses to grant). The rate-limit + Redis layers fail OPEN (refuse to throttle / refuse to use cache) so a Redis outage doesn't lock paying customers out — the licence gate is the actual security boundary.

## Recent SaaS threat patterns — Urban Root cross-product checks

| Threat | Status |
|---|---|
| Paywall race window (paid:false → flash → paid:true) | CLEAN. `paid` starts false, render-gated on `validating`. |
| Anthropic key in client bundle | CLEAN. Verified via I5 + Vite build inspection (the API key string never lands in `src/`). |
| URL-key slot-burn (Grow Room class) | CLEAN. Both gates (`skipStoredInstance: true` on read AND on cleanup-write) verified at App.jsx:6979-7050. Cross-product memory `feedback_url_key_instance_trust.md` checklist passes. |
| Anonymous broadcast multiplayer | n/a (not a multiplayer product). |
| Prompt-cache TTFT timing side-channel | DOCUMENTED. Cycle-1 added comment at `generate.js:684-697`. System prompt has no business secrets — accepted risk. |
| LemonSqueezy webhook signature spoofing | n/a. Homestead does NOT use LS webhooks. |
| LemonSqueezy product UUID test/live mismatch | See M2. Verified live, no current drift. |
| @anthropic-ai/sdk Memory Tool sandbox escape (CVE-2026-34451) | n/a. Homestead uses raw `fetch()`, no SDK. |
| React 19 RSC RCE class (CVE-2025-55182 etc.) | n/a. Homestead is React 18.2.0, pure CSR. |
| Vercel April 2026 env-var breach | See M1 above. Forward-protection action only. |
| Shai-Hulud npm worm | CLEAN. Direct deps minimal (4 production, 2 dev). No `chalk`/`debug` versions in lockfile. |

## OWASP Top 10:2025 mapping

| # | Category | Status | Notes |
|---|---|---|---|
| **A01** | Broken Access Control | OK | Origin allowlist + canonical-instance binding + licence gate + URL-key slot-burn defence. |
| **A02** | Security Misconfiguration | OK with M1+M3 | "Sensitive" env-var flag (M1, dashboard) + `'unsafe-inline'` (M3, deferred). |
| **A03** | Software Supply Chain Failures | OK | Direct deps minimal. Vercel breach posture covered by M1. |
| **A04** | Cryptographic Failures | OK | Only crypto is `createHash('sha256')` for licence hashing — used correctly. HTTPS forced by Vercel. |
| **A05** | Injection | OK | Forced tool-use schema + `escapeHtml` + UNSAFE_CHAR_RE (~14 codepoint families) + length clamping at every input boundary. |
| **A06** | Insecure Design | OK | Paywall V2, hybrid fail-closed, defence-in-depth chain documented. |
| **A07** | Authentication Failures | OK with M2 | Licence-key + 3-device cap with canonical binding (M2 verifies LS-side config). |
| **A08** | Software / Data Integrity Failures | OK | No SRI on LS SDK (CSP is the substitute). Forced tool-use schema = output integrity. |
| **A09** | Logging Failures | OK with L5 | Errors logged but no sensitive data in logs (cycle-1 closure). L5 is forward-protection on LS error strings. |
| **A10** | Mishandling of Exceptional Conditions | OK with M5 | Hybrid fail-closed pattern is good. M5 closes the missing-LS-timeout gap. |

## Positive Observations

Explicit credit for what's already correct:

1. **Cycle-1 H1 reorder is the right fix.** Moving the canonical-instance gate before the cache lookup closes the warm-cache bypass exactly. Reading the cache *after* canonical pass is correct because the cache only encodes "LS recently said this licence is valid" — never "this caller is authorised."
2. **Two-tier rate-limit constants are well-tuned.** Per-IP 60/h is generous enough for shared-NAT (CGNAT, family routers, dorms) without becoming a DoS amplifier. Per-licence 20/24h is generous for a $39.99 product at ~$0.06/call.
3. **Hybrid store-ID check** is the cleanest pattern in the Urban Root portfolio: production fails CLOSED on missing env, preview/dev warns and skips. Mirrors validate-key.js exactly.
4. **`UNSAFE_CHAR_RE` codepoint inventory** in cycle-3's comment block (regex paired 1:1 with documentation labels) is a cross-product anti-drift discipline worth memorialising.
5. **`escapeHtml` "0" handling fix** at `App.jsx:4654-4657` (returning `""` for null but coercing 0 / false correctly) is a quiet but important boundary defence.
6. **`rateLimitOK` fails OPEN** on Redis errors — this is the correct decision for Urban Root. Redis is an availability dependency, not a security dependency. Failing closed would lock out paying users during Upstash outages.
7. **Anthropic call uses raw `fetch()`** — avoids the entire @anthropic-ai/sdk attack surface (Memory Tool, MCP, Files API). This is a deliberate architecture choice that pays dividends every CVE cycle.
8. **`maxDuration: 300` Vercel Fluid Compute** is generous enough to absorb cold-start + cold Upstash + cold LS + slow Anthropic, but bounded enough that a stuck request can't run forever.
9. **`Cache-Control: no-store`** on both API endpoints prevents intermediate proxies from caching auth-related responses.
10. **Origin allowlist regexes** match exactly across `vercel.json` + `generate.js` + `validate-key.js`. No drift.

## Overall Verdict

**SHIP-READY for Phase 3.** Zero CRITICAL, zero HIGH. Five MEDIUM findings are all defence-in-depth tightening:
- M1, M2 require **out-of-band action** (Vercel + LS dashboards) — recommend completing before Phase 3 distribution push.
- M3 is **deferred per CLAUDE.md §22** — the nonce-CSP migration is correctly identified as post-launch hygiene.
- M4 + M5 are 10-15 LOC code fixes that can ship in a single follow-up commit (M5 is the more durable one — A10:2025 is the new OWASP category).

The 6 LOW + 8 INFO are pure hygiene / future-resilience.

## Next Actions (priority-ordered)

1. **OUT-OF-BAND M1**: Mark `ANTHROPIC_API_KEY` and Upstash tokens as "Sensitive" in Vercel dashboard → redeploy production. ~5 minutes.
2. **OUT-OF-BAND M2**: Verify LS dashboard shows live-mode UUID, activation_limit=3, confirmation modal redirect URL. ~5 minutes.
3. **OUT-OF-BAND I8**: Verify Anthropic dashboard spending limit is still set at $100/mo. ~2 minutes.
4. **CODE M4**: Replace `getIp()` to use `x-real-ip` and drop socket fallback. ~10 LOC, both files.
5. **CODE M5**: Add `LS_TIMEOUT_MS` and `ANTHROPIC_TIMEOUT_MS` AbortControllers to `callLs` and the Anthropic fetch. ~15 LOC.
6. **CODE L2**: Drop unused `activation_limit` / `activation_usage` / `store_id` from `validate-key.js` success response. ~3 LOC.
7. **CODE L5**: Map LS error strings to a normalised allowlist before client return. ~10 LOC.
8. **CODE L6**: Add per-licence-hash bucket to `validate-key.js`. ~5 LOC. (Lowest priority.)

Items M3 (nonce-CSP) and M-future remain explicitly deferred per CLAUDE.md §22.

## Open Questions (for user)

1. **Did Vercel notify Homestead's Hobby project about the April 2026 incident?** If yes, M1 escalates to HIGH and requires immediate Anthropic-key rotation + redeploy. If no notification, M1 is forward-protection and can be done in normal cadence.
2. **Is the Anthropic dashboard $100/mo cap still active?** This is the canonical containment ceiling — if it has been silently changed (e.g., raised to support a future product launch), the cost-DOS exposure widens.
3. **Should L2 (activation_limit/usage/store_id leak in validate-key response) be back-ported to the other Urban Root products?** Cross-product memory flags this exact pattern — likely also present in FaminePrep + Aero-Calc. Worth a portfolio-wide audit if the user agrees the response trim is right.
4. **Is the post-launch Vite 6 bump still on the roadmap?** Doesn't affect this audit but would be a natural pairing with M5's timeout work.
