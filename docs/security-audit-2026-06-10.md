# SECURITY AUDIT — The Homestead Plan

**Date:** 2026-06-10
**Auditor:** security-auditor (Urban Root)
**Commit audited:** `c51452a` on `main` (tree clean; deployed + live-verified — Buy overlay + CSP gate passed in Chrome DevTools today)
**Diff range:** `81b1a23..c51452a` (today's 19-finding fix batch) + the standing 5-layer stack
**Baseline:** `docs/security-audit-2026-05-06.md` (Phase-2, 0C/0H/5M/6L, SHIP-READY) + `docs/code-review-2026-06-10.md`

## Summary

Today's 19-finding fix batch is **net-positive for security and introduces no new exploitable exposure.** The security-relevant changes — C1 (transient de-license), H2 (validate-before-activate), M1 (fail-closed store_id in both API files), M5 (drop `script-src 'unsafe-inline'`), L4 (max_tokens guard), L11 (grace-window panel) — were each reviewed against the attack scenarios in the brief and against the live deployment. All are correctly implemented.

**Net-new findings: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (actionable) / 3 INFO.** The three INFO items are defence-in-depth observations (two pre-existing, one new-but-requires-an-already-broken-deployment precondition); none block ship. The CRITICAL (C1) and HIGH (H2) cross-product bug families that were *live* at the start of today are now **closed and verified**, completing the cross-product hardening trajectory — Homestead was the last unfixed product for both the C1 de-license family and the H2 store_id slot-burn family.

**Verdict: SHIP-READY.**

## 5-Layer Stack Status

| Layer | Status | Notes |
|---|---|---|
| L1 Origin Allowlist | OK | Both API files allowlist prod hosts + localhost; `validate-key.js` allows preview deploys (LS free), `generate.js` excludes them (Anthropic-cost). **Live-verified:** `POST /api/generate` with non-allowlisted origin returns `403 {"ok":false,"error":"Origin not allowed"}` — no info leak. |
| L2 Licence Gate | OK | `/api/generate` runs canonical-instance NX binding *before* the cache short-circuit (round-3 H1 reorder intact); bare-key validate structurally refused. Both store_id sites now **fail-closed** (M1). H2 adds validate-before-activate. URL-key both-gates (`skipStoredInstance` read + cleanup-write) intact at App.jsx:7186/7148. |
| L3 Redis Rate Limit | OK | Upstash two-tier on both endpoints. `validate-key`: per-IP 10/10min + per-licence 50/h, **both fire before** the new H2 pre-check. `generate`: per-IP 60/h + per-licence 20/24h. SHA-256-hashed keys, `hhp:` namespaced. Fails OPEN on Redis error (correct — licence gate is the boundary). |
| L4 CSP Header | OK (tightened) | **Live-verified:** `script-src` now WITHOUT `'unsafe-inline'` (M5 shipped). All 8 headers present (CSP, COOP same-origin, HSTS 2yr+preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, X-XSS-Protection). `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. |
| L5 DOMPurify | n/a | Zero `dangerouslySetInnerHTML` / `eval` / `Function` / `setTimeout(string)` in `src` (re-grepped). Report HTML is a downloaded Blob (file:// origin) with `escapeHtml` on every model string — verified preserved after the L1 harvest-row refactor. |

## Critical Findings

**None.**

## High Findings

**None.**

## Medium Findings

**None.**

## Low Findings

**None actionable.** (See INFO below for three defence-in-depth observations.)

## Informational

### I1 — Pre-check store comparison (H2) omits the production-refuse-on-missing-env arm that the post-activate check carries
- **Status:** FIXED `344b808` (branch `session-8-r2-hardening`) — pre-check now mirrors the post-activate hybrid: missing `LEMONSQUEEZY_STORE_ID` in production → 500 refuse before `LS_ACTIVATE`; preview/dev warn-and-skip.
- **OWASP:** A05:2025 (Security Misconfiguration flavour) — defence-in-depth asymmetry
- **Location:** `api/validate-key.js:201-205` (new H2 pre-check) vs `:258-272` (post-activate hybrid)
- **What:** The new pre-`/activate` store gate uses `const expectedStoreIdPre = process.env.LEMONSQUEEZY_STORE_ID; if (expectedStoreIdPre && String(preMeta.store_id) !== String(expectedStoreIdPre)) reject`. Unlike the post-activate block, it has **no** `if (!expectedStoreId && VERCEL_ENV === "production") refuse` arm. So if `LEMONSQUEEZY_STORE_ID` were ever unset in production, the pre-check store comparison is silently skipped and execution falls through to `LS_ACTIVATE` — burning a slot on a wrong-store key — *before* the post-activate hybrid returns its 500 "Server misconfigured" refusal.
- **Why only INFO:** The precondition (`LEMONSQUEEZY_STORE_ID` unset in production) is itself a fully-broken deployment: the post-activate hybrid refuses **all** validation in that state, so no customer can unlock the product at all. The only incremental harm is a wrong-store key burning one activation slot during that already-broken window. Not attacker-forcible (env vars aren't client-controllable). The env var is currently set (`348457`).
- **Fix (optional, ~4 LOC):** Mirror the hybrid in the pre-check — in production, treat missing `LEMONSQUEEZY_STORE_ID` as a 500 refuse before reaching `LS_ACTIVATE`, so the pre-check fails closed symmetrically with the post-activate check.

### I2 — `img-src 'https:'` is broad; cross-product siblings tightened to the LS-host allowlist (PRE-EXISTING, out of today's diff)
- **Status:** FIXED `21f6f24` (branch `session-8-r2-hardening`) — `img-src 'self' data: blob: https://assets.lemonsqueezy.com https://app.lemonsqueezy.com https://cdn.lemonsqueezy.com` (FaminePrep standard + cdn host for the LS store avatar). Live-Buy verification required before deploy.
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** `vercel.json` CSP `img-src 'self' data: blob: https:`
- **What:** `img-src https:` permits image loads from any HTTPS origin. Images can't execute JS, but a broad `img-src` is a tracking/exfil-pixel primitive if a markup-injection ever landed, and is flagged by CSP evaluators. Grow Room (`0cb6c1d`) and FaminePrep tightened this to an explicit LS-host allowlist; Homestead still carries `https:`.
- **Why only INFO:** **This directive is unchanged by today's diff** (the `git diff` shows the `img-src` line byte-identical before/after). It was present in the 2026-05-06 baseline and was not flagged there. Recorded here only for cross-product consistency tracking — per the brief's scope rule, it is not a today-introduced finding. No active XSS path exists to exploit it (no `dangerouslySetInnerHTML`, double-escaped LLM output).
- **Fix (deferred, cross-product hygiene):** When next editing `vercel.json`, narrow `img-src` to `'self' data: blob: https://assets.lemonsqueezy.com` (or whatever LS image host the checkout overlay uses), matching the sibling products.

### I3 — `attempt()` instance-rewipe edge: definitive-stale-then-transient can leave `LS_INSTANCE` wiped (PRE-EXISTING, not C1-introduced)
- **OWASP:** A10:2025 Mishandling of Exceptional Conditions — narrow double-fault
- **Location:** `src/App.jsx:7148-7153` (`attempt` retry helper) interacting with the C1 transient branch at `:7227`
- **What:** On the stored-key path, if the first `validateKeyRemote` returns a **definitive** `retry_activation:true` (HTTP-200, genuine stale instance deactivated from the LS dashboard), `attempt` runs `clearLS(LS_INSTANCE)` then retries with a bare key. If that retry then hits a **transient** failure (5xx/429/network during the activate), the caller's C1 branch keeps `LS_KEY` (correct) but `LS_INSTANCE` was already wiped at `:7149`. The next reload sends `attempt(storedKey, "")` → server no-instance branch → (after H2 pre-check) a fresh `LS_ACTIVATE` → burns a slot.
- **Why only INFO:** Requires a *genuine* stale-instance signal first (the slot was going to be re-activated anyway — the instance really is gone), and the slot-burn only fires if the bare-key retry's pre-check returns a clean 200 (H2's pre-check returns 502 on transient → client transient → no activate). So the amplifier is largely closed by H2. The `clearLS(LS_INSTANCE)` at `:7149` is **pre-existing** (not changed by today's C1 fix, which only edited the caller's transient branch). Strictly better than the pre-C1 behaviour (which wiped on *any* transient).
- **Fix (optional):** Gate the `attempt` retry's `clearLS(LS_INSTANCE)` to fire only after the retry confirms a definitive verdict, or re-persist the instance if the retry comes back transient.

## Brief-Item Verdicts (explicit)

### 1. C1 transient handling — does failing SOFT create a new bypass? **CLEAN**
- `validateKeyRemote` now treats **only** an HTTP-200 body with `typeof data.valid === "boolean"` as definitive (App.jsx:603-617). 429 / 5xx / 403 / 400 / malformed-body / network / 15s-timeout all return `{valid:false, transient:true}`.
- **No render bypass:** the mount transient branch (App.jsx:7227) calls `setKeyError` only — it never calls `setPaid(true)`. `paid` stays `false` for the session. An attacker inducing transient errors gets nothing rendered.
- **No revenue impact:** the client soft-fail is render-gate-only. `/api/generate` re-validates the licence server-side on **every** call (`validateLicence` → LS, fail-closed on `licence_inactive` for revoked/refunded keys, and bare-key refused). A revoked key cannot generate a plan regardless of client state. Key-string persistence in localStorage is inert without a server `valid:true`.
- The transient branch falls through to the grace window (step 3); a refunded user could only reach grace within 48h of a `hhp_pending` timestamp, i.e. inside their legitimate refund window, and even then only the *static* paid tabs render (generate still 401s). Pre-existing grace behaviour, unchanged by C1.
- `activateKey` (paywall + new grace panel) handles transient correctly: on `r.transient` it returns `{ok:false, error}` with no state mutation and no `setPaid(true)`.

### 2. H2 pre-check — new licence-oracle / enumeration surface? Rate-limit coverage? Field leak? **CLEAN**
- **Rate-limit ordering:** both the per-IP (`ip:` 10/10min, line 147) and per-licence (`lk:` 50/h, line 163) buckets are enforced **before** the try block containing the new pre-check. The pre-check cannot amplify LS calls beyond the existing limits.
- **Non-mutating:** the pre-check is `LS_VALIDATE` (validate, not activate) — it burns **zero** activation slots. It is strictly safer than the prior activate-first behaviour.
- **No new oracle:** the distinctions an attacker can observe (key-not-found / wrong-store / expired / disabled) are exactly what the **public, unauthenticated** LS `/v1/licenses/validate` endpoint already returns to anyone hitting LS directly. The "different product" message already existed post-activate before H2; H2 merely moves it pre-activate (no slot burned). Homestead adds origin + the 50/h per-licence cap on top, and `normaliseLsError` prevents verbatim LS-string leakage.
- **No field leak:** the three pre-check error returns carry only a fixed/normalised `error` string (and `retry_activation:false` on the confirmed-bad path). `preMeta.store_id` is read internally for the comparison but never echoed. The success path returns only `{valid:true, instance_id}` (L2 trim intact).
- **retry_activation discipline:** the confirmed-bad pre-check returns `retry_activation:false`, so it cannot trigger the `attempt` cleanup-write slot-burn path.

### 3. M1 fail-closed conversion + VERCEL_ENV hybrid spoofing **CLEAN** (see I1 for one asymmetry)
- Both sites now `if (expectedStoreId && String(meta.store_id) !== String(expectedStoreId)) reject` — the `!= null` escape hatch is removed. In production `expectedStoreId` is set, so a response missing `store_id` yields `"undefined" !== "348457"` → reject. Fail-closed confirmed in `validate-key.js:270` and `generate.js:275`.
- **VERCEL_ENV cannot be header-spoofed:** `process.env.VERCEL_ENV` is a platform-set server environment variable, not derived from any request header. A client cannot influence it. The warn-and-skip path is reachable only in genuine preview/dev with the env var unset; production both-conditions-fail forces refuse.

### 4. CSP after M5 — full header review **CLEAN** (verified live)
- `script-src 'self' https://assets.lemonsqueezy.com https://app.lemonsqueezy.com https://va.vercel-scripts.com` — no `'unsafe-inline'`. Exactly the hosts needed: own bundle + `/contact-copy.js` (`'self'`), lemon.js (assets.lemonsqueezy.com), LS app, Vercel Analytics loader (va.vercel-scripts.com). JSON-LD `application/ld+json` blocks are inert data (not governed by `script-src` for execution) so they still load. Vercel Analytics injects an **external** script element (not inline) → no `'unsafe-inline'` needed.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — `'unsafe-inline'` correctly **retained** (React inline styles + Google Fonts). No `require-trusted-types-for` (would break lemon.js Setup() — `feedback_csp_trusted_types_ls.md`).
- `connect-src` scoped to LS api/app + Vercel vitals/scripts; **no** `*.lemonsqueezy.com` wildcard (matches the CLAUDE.md §3 hardening note). `frame-src`/`form-action` retain `*.lemonsqueezy.com` (required for store-subdomain checkout iframes — documented).
- Mandatory Live-Buy verification was performed per the brief (overlay opened, no CSP violations) — corroborated by the live header fetch showing the tightened CSP serving on `c51452a`.

### 5. `/api/generate` full pass **CLEAN**
- Origin allowlist (no preview deploys) ✓; POST-only ✓; licence gate with canonical NX binding **before** cache short-circuit ✓; two-tier rate limits ✓; prompt-bound fields all clamped (`clampStr`/`clampNum`/`clampStrArray` + `stripUnsafeChars` over the 14-codepoint injection-anchor inventory) ✓; `additionalProperties:false` at every schema level + forced `tool_choice` ✓; `sanitisePlan` re-coerces every field (months/currency/numbers/lengths) ✓; **new max_tokens branch (L4)** returns 502 on `data.stop_reason === "max_tokens"` before the tool-block extraction — correct, authoritative truncation signal ✓; extraction is `blocks.find(tool_use)` only — no `.map(b=>b.text).join("")` narration-leak path ✓; opaque `401` (never echoes `reason`); upstream errors mapped to generic messages by status family, never verbatim; 8s LS / 75s Anthropic AbortControllers ✓.

### 6. New static surface **CLEAN**
- `public/blog/*.html` (5 articles + index) and `public/about.html`: each contains **only** an `application/ld+json` block (inert) — zero inline `<script>`, zero inline event handlers (grep-confirmed `NONE`). No user input, no `document.write`, no `innerHTML`. Static, server-rendered.
- `public/contact-copy.js`: same-origin external script (`script-src 'self'`). Hardcoded address, no user input, no DOM injection sink — reads a fixed element by id and uses `navigator.clipboard.writeText` / `window.prompt`. Safe.
- **Clickjacking:** `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` apply to all `/(.*)` responses including the static pages (verified live).
- **robots/sitemap:** `robots.txt` has `Disallow: /api/` + correct Sitemap directive. `sitemap.xml` lists 12 real URLs 1:1 with files, all canonical to thehomesteadplan.com, **no hash-fragment entries** (prior L9 fixed). `lastmod 2026-05-18` is stale (SEO hygiene, not security).
- **Dev-only Vite middleware** (`vite.config.js publicDirectoryIndex`): traversal guard is sound — `path.resolve(path.join(publicDir, urlPath, 'index.html'))` then `if (!candidate.startsWith(publicDir + path.sep)) return next()`. `req.url` is not URL-decoded, so `%2e%2e` stays a literal directory name; raw `..` resolves then fails the prefix check; the `+ path.sep` defeats the sibling-prefix (`publicEVIL`) bypass; serves only files literally named `index.html`. Runs under `configureServer` → **dev-only, no-op in `vite build`/`vite preview`, absent from the Vercel production runtime**. Zero production attack surface.

### 7. Secrets hygiene **CLEAN**
- `dist/` grep: no `sk-ant-`, no `ANTHROPIC_API_KEY`, no Upstash/KV tokens, no `Bearer`/AWS patterns. Only the **public** checkout UUID `6aecd238-...` appears (expected — it's the LemonSqueezy checkout link).
- `src/` grep: no `sk-ant-`; `process.env.ANTHROPIC/UPSTASH/KV` referenced nowhere in client code (server-only).
- `.npmrc` present with `ignore-scripts=true` + `min-release-age=3` (note: `min-release-age` is inert under npm — pnpm-only — but `ignore-scripts` is active and is the live Shai-Hulud defence).
- `npm audit --omit=dev`: **0 vulnerabilities**.

### 8. OWASP Top-10:2025 delta vs 2026-05-06 baseline **NO NEW EXPOSURE**
- **A01 Broken Access Control:** improved — H2 closes the wrong-store slot-burn; C1 closes the de-license/slot-burn; licence gate unchanged and intact.
- **A02 Security Misconfiguration:** improved — M5 drops `script-src 'unsafe-inline'`; all headers verified live. (I2 `img-src https:` pre-existing, not today.)
- **A05 Injection:** unchanged — new static pages add zero executable inline script; no new sink in src.
- **A07 Identification/Auth:** improved — C1 stops transient de-licensing; store_id fail-closed (M1).
- **A10 Mishandling of Exceptional Conditions:** improved — C1 transient/definitive split is the textbook fix; L4 max_tokens guard. (I3 narrow double-fault edge pre-existing.)
- No movement in A03/A04/A06/A08/A09 from today's diff. Documented accepted trade-offs (Vite 5 dev-only CVE, LS SDK no-SRI, out-of-band dashboard TODOs) **not re-litigated** per scope.

## Positive Observations (credit where due)

- **C1 fix is the correct shape** — definitive (HTTP-200 + boolean verdict) vs transient split, with the render gate held closed on transient and a clear non-destructive user message. Matches FaminePrep `bc54755`. This is the highest-customer-harm bug class Urban Root tracks, now closed on the last affected product.
- **H2 uses a non-mutating `LS_VALIDATE` pre-check** (burns no slot) and bails early on confirmed-bad keys with `retry_activation:false` — both details matter and both are right.
- **M1 fail-closed comments are honest** about the trade-off ("a noisy reject on LS API drift beats a silent store-gate bypass").
- **M5 achieved a strictly-stronger CSP with zero nonce/middleware complexity** by externalizing the one inline script — exactly the FaminePrep approach. `style-src 'unsafe-inline'` correctly kept; no Trusted Types.
- **The L1 report-builder refactor preserved `escapeHtml(r.crop)`** — refactoring a sanitiser-adjacent path without weakening the escape is the easy thing to get wrong, and it was gotten right.
- **The new public surface added zero executable inline script** — the blog/about pages were authored CSP-clean from the start.

## Overall Verdict

- [x] **SHIP-READY** — all 5 layers green, 0 critical / 0 high / 0 medium / 0 actionable-low net-new. Today's batch closed one CRITICAL (C1) + one HIGH (H2) + one MEDIUM (M1) and hardened CSP (M5), all verified including against the live deployment.

## Next Actions

1. ~~**(Optional, ~4 LOC)** I1 — mirror the production-refuse-on-missing-env hybrid into the H2 pre-check store comparison for fail-closed symmetry.~~ ✔ DONE `344b808` (session-8-r2-hardening).
2. ~~**(Deferred, cross-product hygiene)** I2 — narrow `img-src 'https:'` to the LS image host.~~ ✔ DONE `21f6f24` (session-8-r2-hardening).
3. **(Optional)** I3 — re-persist `LS_INSTANCE` (or defer its wipe) in `attempt` when the bare-key retry returns transient, closing the narrow definitive-stale-then-transient slot-burn edge.
4. **(SEO, not security)** refresh `sitemap.xml` `lastmod` from 2026-05-18 when next editing.
5. **(Standing dashboard TODOs, unchanged)** Vercel env vars "Sensitive" flag + redeploy; Anthropic $100/mo cap verification; LS activation_limit=3 confirmation — per 2026-05-06 M1/M2/I8, out-of-band.

## Open Questions (for user)

- None blocking. The three INFO items are all optional hardening; none gate this ship.
