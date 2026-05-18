# SECURITY AUDIT — The Homestead Plan (Round 1)

**Date:** 2026-05-18
**Auditor:** security-auditor (Urban Root)
**Commit audited:** `23a47a6` on `main` (live at `https://thehomesteadplan.com`)
**Cycle:** Round 1 of up to 3. Convergence target: zero findings by round 3.
**Working dir:** `C:\Users\User\ClaudeCodeN8N\Homestead\homestead-harvest-planner`

---

## Summary

Strongest security posture in the Urban Root portfolio at this commit. Phase-2 audit closures (2026-05-06 `7f9e9d7`) are intact and load-bearing. Round 1 finds **0 CRITICAL / 0 HIGH / 3 MEDIUM / 2 LOW / 3 INFO** = 8 findings net-new. Two MEDIUMs are pre-existing dependency CVEs (Vite 5 / esbuild — dev-server only, deferred per scope guardrail forbidding major bumps). One MEDIUM (paywall-mount full-error log) is a client-side mirror of the Phase-2 Round-3 L5 narrowing that was applied to API files but not to the client catch. Both URL-key trust-boundary gates intact (commit `4f862e1`); V2 paywall pattern preserved.

---

## 5-Layer Stack Status

| Layer | Status | Notes |
|---|---|---|
| L1 Origin Allowlist | ✅ | `/api/generate` (production + localhost only — no preview to protect Anthropic spend). `/api/validate-key` (production + previews). Vercel-alias regex matches `homestead-harvest-planner[a-z0-9-]*.vercel.app`. |
| L2 Licence Gate | ✅ | Bare-key validate refused; canonical-instance binding `SET NX` 30-day sliding TTL; cache-check runs AFTER canonical gate (Round-3 H1 closure intact). |
| L3 Redis Rate Limit | ✅ | Upstash-backed, two-tier on both endpoints. generate.js: 60/h per IP + 20/24h per licence. validate-key.js: 10/10min per IP + 50/h per licence. Fail-open on Redis errors. |
| L4 CSP Header | ✅ | All 8 security headers present in `vercel.json`. CSP correctly omits `require-trusted-types-for` (avoids lemon.js halt). `'unsafe-inline'` carried as documented post-launch hygiene deferral (CLAUDE.md §22). |
| L5 DOMPurify | n/a | No AI content rendered via `dangerouslySetInnerHTML`. Plan body built from server-sanitised data (`additionalProperties:false` + `_str`/`_strArr`/`_num` runtime sanitiser) and emitted into a Blob HTML report via template literals with `escapeHtml` on every interpolation. |

---

## Pre-existing protections verified intact

Confirming Phase-2 audit closures (`7f9e9d7` 2026-05-06) and the URL-key fix (`4f862e1` 2026-04-27) are still in place:

- **URL-key trust boundary (BOTH gates):** `App.jsx:7025-7030` skips `LS_INSTANCE` read on URL-key path; `App.jsx:6988-6997` skips cleanup-write on `retry_activation` when `opts.skipStoredInstance`. Cross-product slot-burn defence preserved.
- **V2 paywall pattern (Finding A 2026-04-20):** `paid` starts `false`, `validating` starts `true` at mount; `hhp_plan_v2` stores inputs + fingerprint only, NEVER plan body; `hhp_paid` never read on mount.
- **Hybrid `LEMONSQUEEZY_STORE_ID` check:** Fails CLOSED in production if env var missing; warn-and-skip in preview/dev. Both API files.
- **`Cache-Control: no-store`:** Both API endpoints. Prevents proxies from caching licence-validation responses.
- **Per-fetch `AbortController` timeouts:** `LS_TIMEOUT_MS=8000` (both endpoints LS calls); `ANTHROPIC_TIMEOUT_MS=75000` (generate.js Anthropic call). OWASP A10:2025 closure.
- **`getIp()` prefers `x-real-ip`:** Vercel-platform-attested at edge; drops socket fallback that bucketed pod-internal IPs. Both API files.
- **Validate-key response trim:** Only `valid` + `instance_id` returned on success (Phase-2 L2). No reconnaissance leak.
- **`normaliseLsError()`:** 4-bucket allowlist for LS error wording (Phase-2 L5). Defends against future LS API string changes.
- **`escapeHtml` coverage in report:** All 5 HTML entities, order-correct (`&` first), applied at every interpolation in `buildPlanReportHtml`. Cross-product fmtMoney audit 2026-05-07 verified structurally immune.
- **`.npmrc` supply-chain policy:** `ignore-scripts=true` + `min-release-age=3` present (commit `23a47a6`).
- **No `dangerouslySetInnerHTML`, `eval()`, `new Function()`, string-form `setTimeout`/`setInterval`** in `src/`. Grep clean.
- **No hardcoded secrets in client bundle:** `dist/assets/index-DV_DVmGf.js` greps clean for `sk-ant`, `ANTHROPIC_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `UPSTASH_REDIS`.
- **Vercel ESM handlers:** Both `api/*.js` use `export default` (not `module.exports`). `type: "module"` compliant.
- **Canonical tag matches sitemap/og:url/twitter:url:** All three point at `https://thehomesteadplan.com/`. Prevents Vercel-alias dedup.
- **No `target="_blank"` without `rel="noopener"`:** App.jsx grep returns zero unsafe instances; only safe instance is `privacy.html` LS link which has `rel="noopener"`.
- **Box-sizing reset present:** `*, *::before, *::after { box-sizing: border-box; }` in `privacy.html:24` (legal pages); main app uses inline styles only so reset is moot.

---

## Critical Findings (🔴)

**None.**

---

## High Findings (🟠)

**None.**

---

## Medium Findings (🟡)

### M1 — Paywall-mount catch logs raw exception object (A09:2025 Logging Failure)

- **Severity:** MEDIUM
- **OWASP category:** A09:2025 — Security Logging and Alerting Failures
- **Location:** `src/App.jsx:7088`
- **Current code:**
  ```js
  } catch (e) {
    console.error("[hhp] paywall mount failed:", e);
    if (!cancelled) {
      setPaid(false);
      setValidating(false);
    }
  }
  ```
- **Why this matters:** Every other catch in the codebase uses `e?.message` / `e?.code` (matches Phase-2 Round-3 L5 closure pattern applied to `api/*.js`). The full exception object can carry a `cause` chain. For network errors thrown inside `validateKeyRemote`, the cause chain CAN include `RequestInit` data including the JSON request body (which holds the licence key). Vercel Logs persist `console.error` output for ~7 days and are accessible to anyone with project access. A licence key landing in logs is one breach away from being exposed to a third party (Vercel ops, log-aggregator misconfig, copy-paste into a Slack thread for debugging, etc.).
- **Attack scenario:** Customer's browser network is throttled. A `validateKeyRemote` mount call throws an `AbortError` whose `cause` chain happens to retain the `body` field. Vercel log aggregator persists `[hhp] paywall mount failed: AbortError ...licenseKey=ABCD-1234-...`. Anyone with project log access reads the customer's key. Note: this is a low-probability path on modern browsers (most fetch implementations don't preserve body in the error chain), but the narrowing is free and aligns the client with the server-side pattern.
- **Fix:** Narrow to `e?.message` to match `generate.js:809` and `validate-key.js:250`:
  ```js
  } catch (e) {
    console.error("[hhp] paywall mount failed:", e?.message, e?.code);
    if (!cancelled) {
      setPaid(false);
      setValidating(false);
    }
  }
  ```
- **Priority:** Apply this round (Round 1).

---

### M2 — Vite 5.4.21 + esbuild ≤0.24.2 — moderate dev-server vulnerabilities (A03:2025 Supply Chain / A05:2025 Misconfig)

- **Severity:** MEDIUM
- **OWASP category:** A03:2025 — Software Supply Chain Failures (and A05:2025 Security Misconfiguration for the dev-only scope)
- **Location:** `package.json:21` (vite ^5.4.21), `package-lock.json` (esbuild ≤0.24.2 transitive)
- **Current state:** `npm audit` reports 2 moderate findings:
  1. **GHSA-67mh-4wv8-2f99** (esbuild ≤0.24.2, CVSS 5.3) — any website can send any request to the dev server and read the response. Dev-server only.
  2. **GHSA-4w7w-66w2-5vf9** (Vite ≤6.4.1) — path traversal in optimized-deps `.map` handling. Dev-server only.
- **Why this matters (and the bounds of it):** Both vulnerabilities affect ONLY the dev server (`npm run dev`). Vercel production builds compile out to static JS and do not run the dev server. The exposure is therefore: a developer running `npm run dev` locally is briefly vulnerable to malicious cross-origin sites that know your dev-server URL. The blast radius for The Homestead Plan specifically is "an attacker who knows you're running `npm run dev` AND knows the port AND lures you to a malicious site during that window can read source files." Not a production-data risk.
- **Fix:** `vite ^8.0.13` is the upstream patched version. Vite 5→8 is **semver-major** and a separate task per the round-1 scope guardrail "Do NOT bump runtime dependency major versions". The bump path is FaminePrep-style: Vite 5→6.4 first (closes both CVEs without major API churn), then Vite 6→8 later.
- **Priority:** **DEFERRED** to a dedicated dep-bump task. Round 1 documents the finding; no edit applied.
- **Mitigation in the interim:** Avoid running `npm run dev` while browsing untrusted sites; use `npm run build && npm run preview` for local testing (no dev-server exposure).

---

### M3 — Currency localStorage clamp accepts arbitrary 3-character strings (A06:2025 Insecure Design)

- **Severity:** MEDIUM (defence-in-depth; structurally bounded today)
- **OWASP category:** A06:2025 — Insecure Design
- **Location:** `src/App.jsx:6672-6675`
- **Current code:**
  ```js
  const [currency, setCurrency] = useState(() => {
    const c = loadState(LS_CURRENCY, "$");
    return typeof c === "string" && c.length <= 3 ? c : "$";
  });
  ```
- **Why this matters:** The clamp accepts ANY ≤3-character string. Today this is safe because:
  - The HTML-report path escapes via `escapeHtml(plan.savingsEstimate.currency || currency)` at `App.jsx:4808`.
  - There is no JSON-import / Load-Design feature, so an attacker cannot push a tampered `hhp_currency` value into another user's localStorage.
  - JSX consumers benefit from React's auto-escape.
- **What changes the risk profile:** If a future iteration adds a "Load Design" / state-import feature (FaminePrep + Aero-Calc both have one), a payload like `hhp_currency: "<x>"` would slip through the clamp, satisfy `escapeHtml` at the emit point (which DOES neutralise it), but become a **latent foot-gun** if any future caller forgets the `escapeHtml` wrapper. The Aero-Calc cross-product audit (2026-05-06) identified this pattern: a helper "safe in 6 of 7 call sites" eventually meets a 7th site that drops the escape.
- **Fix:** Tighten the source clamp to the closed allowlist used by `CurrencySelect` and `sanitisePlanShape`. Cross-product hygiene tweak consistent with `feedback_fmt_helper_html_escape_audit.md`:
  ```js
  const [currency, setCurrency] = useState(() => {
    const c = loadState(LS_CURRENCY, "$");
    return CURRENCY_SYMBOLS.includes(c) ? c : "$";
  });
  ```
  Requires moving the `CURRENCY_SYMBOLS` constant declaration up before the App component, OR replicating the small array literal at the call site. The first option preserves single-source-of-truth.
- **Priority:** Apply this round (Round 1). Cheap, lossless (5 valid values reload identically), and structurally immunises the source before a future JSON-import feature lands.

---

## Low Findings (🟢)

### L1 — Report HTML uses inline `onclick="window.print()"` (A05:2025 Misconfig — defence-in-depth)

- **Severity:** LOW
- **OWASP category:** A05:2025 — Security Misconfiguration
- **Location:** `src/App.jsx:4837` (template literal in `buildPlanReportHtml`)
- **Current code:**
  ```js
  <button class="print-btn" type="button" onclick="window.print()">Save as PDF</button>
  ```
- **Why this matters:** The downloaded HTML report is opened in a Blob URL document. Blob URLs do NOT inherit the parent page's CSP — they have their own (empty) CSP. The inline `onclick` works today because the Blob document has no CSP. If a future browser change ever applies a default CSP to Blob: documents (W3C is discussing this for service-worker isolation), the Print-to-PDF button silently breaks for users. This is a known forward-compat smell.
- **Fix:** Replace the inline handler with a script tag that registers the listener:
  ```js
  // In the report's <head> or end of <body>:
  <script>document.querySelector('.print-btn')?.addEventListener('click', function(){ window.print(); });</script>
  // And drop the inline onclick:
  <button class="print-btn" type="button">Save as PDF</button>
  ```
  The script tag inside a Blob document is still allowed under any forward-compatible CSP that uses `'self'` for `script-src`. Inline event handlers are NOT.
- **Priority:** Apply this round (Round 1). 4-line change. Low cost. Forward-protects the print feature against any future Blob CSP default.

---

### L2 — Sitemap `<lastmod>` timestamps stale (A09:2025 — informational; not a security finding per se)

- **Severity:** LOW (SEO hygiene; security-adjacent only as a "freshness" signal to crawlers)
- **OWASP category:** N/A (SEO-only signal)
- **Location:** `public/sitemap.xml` — all entries dated `2026-05-06`. Today is `2026-05-18`. Commits `eaacc3c`, `5ce7c5a`, `23a47a6` shipped since.
- **Why this matters:** Stale `<lastmod>` doesn't change security posture. It does signal to Google + Bing that nothing changed since the last crawl, which can slow re-indexing if (e.g.) the canonical tag, robots.txt, or any of the legal pages get an important update.
- **Fix:** Bump all `<lastmod>` to `2026-05-18` (or to the most recent meaningful change date per URL).
- **Priority:** **DEFERRED** — explicit scope guardrail "Do NOT refactor unrelated code. Do NOT add features or tests. Do NOT touch the design/UI unless a finding directly requires it." Sitemap update is SEO maintenance, not a security fix. Logged here so the next SEO-touching session catches it.

---

## Info / Hygiene (ℹ)

### I1 — CSP `'unsafe-inline'` in `script-src` + `style-src` carried over

- **Status:** Documented deferral. CLAUDE.md §22 covers this: "Vite 5→6 dep bump, nonce-based CSP migration" is post-launch hygiene. The CSP is still production-grade — full Trusted Types CSP3 migration is a known future task.
- **Action:** No fix this round. Same posture as 2026-05-06 audit.

### I2 — `console.log` / `console.warn` in api/*.js leak no sensitive data (verified)

- Grepped both API files. All logs use `e?.message` / `e?.code` patterns. Licence keys never logged (only `hashKey(key)` = first 16 hex chars of SHA-256). LS endpoint error strings normalised through `normaliseLsError`. Anthropic upstream errors not echoed verbatim. **Clean.**

### I3 — `.npmrc` supply-chain policy active and correct

- File present, contains both `ignore-scripts=true` and `min-release-age=3`. Cross-product `23a47a6` commit landed correctly. Comment block names the threat (Shai-Hulud npm worm, chalk/debug Sept 2025, eslint-prettier July 2025, axios March 2026) and the rationale (72h cooldown defends smash-and-grab waves with 2-24h attack windows). **Clean.**

---

## Dependency Audit

- **React version:** 18.2.0 ✅ NOT affected by CVE-2025-55182 / 55183 / 55184 / 66478 / 67779 ("React2Shell" Dec 2025 — affects React 19.x only).
- **Next.js:** N/A (Vite-based, not Next.js).
- **`npm audit` results:** 2 moderate (esbuild dev-server CORS GHSA-67mh-4wv8-2f99 + Vite path-traversal GHSA-4w7w-66w2-5vf9). Both dev-server only. Fix is `vite@^8` semver-major. **DEFERRED** per scope.
- **Known-compromised package check (Shai-Hulud `bundle.js` / `telemetry.js` / `setup_bun.js` / `bun_environment.js` indicators):** None found in `node_modules/` listing. **Clean.**
- **Chalk/debug Sept-2025 compromise check:** Not present in `package-lock.json`. **Clean.**

---

## Positive Observations

Crediting what's already right (this matters — pattern reinforcement):

1. **Two-gate URL-key trust boundary** preserved across both `attempt()` and the URL-key handler in mount effect. This is the strongest implementation of the Urban Root cross-product pattern.
2. **Canonical-instance binding via `SET NX`** correctly placed AFTER the canonical-gate check, not before — closes Round-3 H1 (warm-cache short-circuit). Comment block at `generate.js:190` explains WHY in detail. Future editors will not regress this.
3. **`escapeHtml` order-correct** (`&` first, then `<`, `>`, `"`, `'`). Applied to every string interpolation in `buildPlanReportHtml`. The 2026-05-07 fmtMoney cross-product audit verified the immunity is structural.
4. **Forced tool-use with `additionalProperties: false`** at every level of `PLAN_SCHEMA`. Constrains model output shape end-to-end. Pair with `_str` / `_strArr` / `_num` runtime sanitiser is belt-and-braces.
5. **Telemetry-via-`reason`-slug** (Round-3 H4 fix) — `validateLicence` returns `{ok, reason}`; the user-facing response stays opaque. Logs say WHICH gate rejected; attackers can't probe per-key.
6. **`stripUnsafeChars` codepoint inventory** documented as a paired regex+comment block at `generate.js:320-327`. Future audits can verify the regex matches the comment without grepping the Unicode tables.
7. **Anthropic prompt-cache security comment** at `generate.js:720-726` explicitly forbids per-user content in cached blocks. Phase-2 SEC-HIGH2 closure is self-documenting.
8. **Per-component fetch timeouts** match `maxDuration: 300` slot headroom (`75000` Anthropic + `8000` LS = ~83 s out of 300 s wall-clock budget) — leaves room for cold-start + Redis + retry.
9. **Vercel-alias redirect** (308 from `homestead-harvest-planner*.vercel.app` to `thehomesteadplan.com`) covers both `/` and `/:path*` (cycle-3 bare-path fix). No SEO duplicate-content drift.
10. **`hhp_paid` deprecation comment** at `App.jsx:86-89` explicitly names the race-window failure mode and points future editors at `engineering-patterns.md §8`. Prevents accidental regression.

---

## Overall Verdict

- [x] ⚠️ **SHIP WITH CAUTION — Round 1 of 3**

Three MEDIUM findings; one to apply this round (M1 narrow log), one to apply this round (M3 currency allowlist), one DEFERRED (M2 Vite 5→8 major bump). Two LOWs; one to apply this round (L1 print-button event listener), one DEFERRED (L2 sitemap lastmod, out of scope for security review). All Phase-2 closures intact. URL-key both-gates verified. No critical exposure.

**Net post-fix state:** Round 1 closes M1, M3, L1 → carries forward M2 (dep bump task), L2 (SEO task), I1 (CSP migration), I2 (verified clean), I3 (verified clean). Round 2 will be empty unless something new lands; the product converges to "carry-only" by round 2.

---

## Next Actions

1. **APPLY M1** — narrow paywall-mount `console.error` to `e?.message, e?.code`. `src/App.jsx:7088`. ~1 LOC.
2. **APPLY M3** — tighten `currency` localStorage clamp to `CURRENCY_SYMBOLS.includes(c)`. Requires hoisting `CURRENCY_SYMBOLS` declaration. `src/App.jsx:6672-6675` (read site) + add hoisted const near top. ~4 LOC.
3. **APPLY L1** — replace inline `onclick="window.print()"` with event-listener pattern in `buildPlanReportHtml`. `src/App.jsx:4837` + add tiny inline `<script>`. ~4 LOC.
4. **DEFER M2** — Vite 5→8 major bump. Schedule as dedicated dep-bump task.
5. **DEFER L2** — sitemap.xml `<lastmod>` refresh. Out of round-1 scope; logged for next SEO touch.

---

## Open Questions (for user)

None. All findings have a clear path. Scope guardrail explicit: no major version bumps, no SEO refactors.

---

## Post-Apply Fix Log

All three in-scope findings applied. Build verified: `vite build` exits clean, 33 modules transformed, 389.30 KB raw / 110.27 KB gzipped (delta from baseline: +0.53 KB raw / +0.31 KB gzipped, ~0.13% — comment block + 1 hoisted const + tiny listener script).

### M1 — APPLIED at `src/App.jsx:7088` (paywall mount catch)

Before:
```js
console.error("[hhp] paywall mount failed:", e);
```
After:
```js
console.error("[hhp] paywall mount failed:", e?.message, e?.code);
```
Plus a 4-line comment naming the closure date and OWASP category. Matches the api/*.js logging discipline (Phase-2 Round-3 L5).

### M3 — APPLIED at `src/App.jsx:95-101` (hoist) + `src/App.jsx:6685-6694` (clamp)

1. Hoisted `const CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"];` to the global-constants band (just after `PRICE_USD`) with a 6-line comment block explaining the cross-product hygiene anchor.
2. Removed the original declaration at the prior position (was inside the `sanitisePlanShape` neighbourhood) — replaced with a one-line breadcrumb comment so future readers can find the hoisted location.
3. Tightened `useState` clamp from `typeof c === "string" && c.length <= 3` to `CURRENCY_SYMBOLS.includes(c)`.

Behaviour preservation verified: all 5 valid symbols (`$ € £ R ¥`) are present in the allowlist, so any stored value identical to the prior default reloads identically. Hostile strings (`"<x>"`, `"$$$"`, `"a"`) now fall back to `"$"` at source instead of relying on every emit site to escape correctly.

### L1 — APPLIED at `src/App.jsx:4837` (button) + `src/App.jsx:4882-4889` (listener script)

1. Replaced `<button class="print-btn" type="button" onclick="window.print()">` with `<button class="print-btn" id="hhp-print-btn" type="button">`.
2. Added a 7-line `<script>` block just before `</body>` that registers the click listener via `addEventListener`.

The Save-as-PDF button still fires `window.print()` on click. Behaviour preserved end-to-end. The Blob document now uses no inline event handlers — forward-compatible with any future browser-default CSP on Blob: URLs.

### Deferred (no edit)

- **M2 (Vite 5.4.21 + esbuild dev-server CVEs)** — semver-major bump. Schedule as dedicated `vite-5-to-8.md` task.
- **L2 (sitemap `<lastmod>` stale)** — SEO maintenance, not security; out of scope per scope guardrail.

### Net result

Round 1 closes 3 of 5 actionable findings. Round-2 expected to be empty unless new code lands between now and re-audit. The product remains the strongest security posture in the Urban Root portfolio.
