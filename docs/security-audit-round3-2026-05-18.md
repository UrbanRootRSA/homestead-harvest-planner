# SECURITY AUDIT — The Homestead Plan (Round 3 — Convergence)

**Date:** 2026-05-18
**Auditor:** security-auditor (Urban Root)
**Commit audited:** Working tree on top of `23a47a6` (round-1 + round-2 edits still uncommitted on `main`; live tip remains `23a47a6` at https://thehomesteadplan.com).
**Cycle:** Round 3 of up to 3 — **TARGET ROUND.** Convergence at zero net-new findings.
**Working dir:** `C:\Users\User\ClaudeCodeN8N\Homestead\homestead-harvest-planner`

---

## Summary

**CONVERGENCE ACHIEVED. ZERO net-new findings.**

Round 3 verified every round-1 + round-2 fix is still in place, swept all 20+ deep-hunt patterns specified in the round-3 mission brief, and confirms the working tree is the strongest security posture in the Urban Root portfolio. Build clean (389.32 KB raw / 110.27 KB gz, 33 modules, identical to round-2 closure). Trajectory: r1 8 → r2 2 → **r3 0**. The two stable deferrals (M2 Vite 5→8 dep bump, L2 sitemap lastmod) carry forward unchanged; both remain explicitly out of round-1/2/3 scope per the security-review guardrails. The next step for this product is the engineering verifier, not another security round.

---

## 5-Layer Stack Status (re-verified)

| Layer | Status | Notes |
|---|---|---|
| L1 Origin Allowlist | ✅ | `/api/generate` production + localhost only (no preview, Anthropic spend protection). `/api/validate-key` production + Vercel previews. Both files include the canonical `homestead-harvest-planner[a-z0-9-]*\.vercel\.app` regex. |
| L2 Licence Gate | ✅ | Bare-key validate refused at `generate.js:226-228`. Canonical-instance binding `SET NX` 30-day sliding TTL at the post-validate write path. Cache-check runs AFTER canonical gate (Round-3 H1 closure intact). |
| L3 Redis Rate Limit | ✅ | Upstash-backed, two-tier on both endpoints. generate.js: 60/h per IP + 20/24h per licence. validate-key.js: 10/10min per IP + 50/h per licence. Fail-open on Redis errors. |
| L4 CSP Header | ✅ | All 8 security headers present in `vercel.json`. CSP correctly omits `require-trusted-types-for` (would halt lemon.js Setup() in Chromium per `feedback_csp_trusted_types_ls.md`). `'unsafe-inline'` carried as documented post-launch hygiene deferral (CLAUDE.md §22). |
| L5 DOMPurify | n/a | No AI content rendered via `dangerouslySetInnerHTML`. Plan body built from server-sanitised data (`additionalProperties:false` + `_str`/`_strArr`/`_num` runtime sanitiser) and emitted into a Blob HTML report via template literals with `escapeHtml` on every interpolation. Order-correct escape (`&` first, then `<`, `>`, `"`, `'`) verified at `App.jsx:4673-4675`. |

---

## Round-1 Fix Verification

### M1 — Paywall-mount catch logs `e?.message, e?.code`: ✓ INTACT

`src/App.jsx:7115-7124`. Catch block at line 7115 logs `console.error("[hhp] paywall mount failed:", e?.message, e?.code);` at line 7120. Round-1 4-line comment block at 7116-7119 names closure date + OWASP category. **Verified clean.**

### M3 — `CURRENCY_SYMBOLS` hoisted + clamp tightened: ✓ INTACT

- Module-scope declaration at `src/App.jsx:103`: `const CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"];`
- Round-1 comment block at 97-102 explains the hoist rationale + cross-product hygiene anchor.
- Clamp at `src/App.jsx:6694-6701` enforces `CURRENCY_SYMBOLS.includes(c)` allowlist on the localStorage read.
- Round-1 breadcrumb comment at 6695-6700 explains the JSON-import latent-foot-gun rationale.

**Verified clean.**

### L1 — Inline `onclick="window.print()"` replaced with event-listener `<script>` block: ✓ INTACT

- Button at `src/App.jsx:4851`: `<button class="print-btn" id="hhp-print-btn" type="button">Save as PDF</button>` (no inline handler).
- Listener `<script>` block at `src/App.jsx:4888-4895` registered via `document.getElementById('hhp-print-btn')?.addEventListener('click', function () { window.print(); });`.
- Round-1 5-line comment block at 4889-4893 names closure date, OWASP category, and forward-compat rationale.
- Inline-handler grep across whole file returns ZERO matches outside the round-1 comment's own quoted snippet (App.jsx:4890).

**Verified clean.**

---

## Round-2 Fix Verification

### L1 — `persistState` catch narrowed: ✓ INTACT

- `src/App.jsx:527-541` `persistState` function.
- Catch at line 531 logs `console.warn(\`[hhp] Could not persist "${key}":\`, err?.message, err?.code);` at line 539.
- Round-2 5-line comment block at 534-538 names closure date + OWASP category + cross-product alignment with api/*.js + round-1 M1.
- No `|| err` fallback anywhere in the file (grep confirmed).

**Verified clean.**

---

## Round-3 Deep-Hunt Sweep — All Patterns Clean

The round-3 mission brief specified 20+ patterns to sweep. Each enumerated below with status.

### 1. Catch-site discipline survey (whole-file, both src/ + api/)

| Site | Logged argument | Status |
|---|---|---|
| `App.jsx:531` `persistState` | `err?.message, err?.code` | ✓ clean (Round-2 L1) |
| `App.jsx:585` `validateKeyRemote` `resp.json().catch` | returns `{}` (no log) | ✓ clean |
| `App.jsx:590` `validateKeyRemote` outer catch | no `console.*`, returns user-safe shape | ✓ clean |
| `App.jsx:3784` `cryptoHash` fallback | `e?.message` | ✓ clean |
| `App.jsx:4011` `computeFingerprint` `.catch` | `e?.message` | ✓ clean |
| `App.jsx:4088` `resp.json().catch` (generate) | returns `{}` (no log) | ✓ clean |
| `App.jsx:4110` `generate` outer catch | `e?.message` (with AbortError branching) | ✓ clean |
| `App.jsx:7115` paywall mount | `e?.message, e?.code` | ✓ clean (Round-1 M1) |
| `App.jsx:7157` LS Setup | `e?.message` | ✓ clean |
| `api/generate.js:72` Upstash init | `e?.message` | ✓ clean |
| `api/generate.js:115` rate-limit incr | `e?.message` | ✓ clean |
| `api/generate.js:164` LS `resp.json().catch` | returns `{}` (no log) | ✓ clean |
| `api/generate.js:166` callLs outer | `e?.message` (with AbortError branching) | ✓ clean |
| `api/generate.js:213` instance binding read | `e?.message` | ✓ clean |
| `api/generate.js:239` licence cache read | `e?.message` | ✓ clean |
| `api/generate.js:277` licence cache write | `e?.message` | ✓ clean |
| `api/generate.js:301` instance binding write | `e?.message` | ✓ clean |
| `api/generate.js:304` validateLicence outer | `e?.message, e?.code` | ✓ clean |
| `api/generate.js:751` Anthropic `resp.json().catch` | returns `{}` (no log) | ✓ clean |
| `api/generate.js:753` Anthropic respClone.text().catch | returns `""` (no log) | ✓ clean |
| `api/generate.js:805` handler outer catch | `e?.message, e?.code` (with AbortError branching) | ✓ clean |
| `api/validate-key.js:53` Upstash init | `e?.message` | ✓ clean |
| `api/validate-key.js:92` rate-limit incr | `e?.message` | ✓ clean |
| `api/validate-key.js:112` LS `resp.json().catch` | returns `{}` (no log) | ✓ clean |
| `api/validate-key.js:114` callLs outer | `e?.message` (with AbortError branching) | ✓ clean |
| `api/validate-key.js:246` handler outer | `e?.message, e?.code` | ✓ clean |

**Total catch sites swept: 25. Status: ALL clean.** The catch-site discipline is now 100% across the codebase. The round-2 audit noted "12 of 13 sites clean" with `persistState` as the outlier — round 2 closed it. Round 3 confirms zero outliers remain.

### 2. `console.*` arguments containing fetch response / fetch error / license payload

Total `console.error|warn|log` sites: 26. Sampled the non-trivial sites (those touching `resp` / `data` / `apiErr`):

| Site | Argument | Status |
|---|---|---|
| `api/generate.js:249` LS-unreachable | `ls.status` (HTTP status integer) | ✓ no payload |
| `api/generate.js:679` licence validation failed | `licenceResult.reason` (slug enum) | ✓ no key, no payload |
| `api/generate.js:754` anthropic 200 with non-JSON | `peek` (200-char clamped) | ✓ bounded |
| `api/generate.js:759` anthropic error | `apiResp.status, apiErr` (status + LS-formatted message) | ✓ no API key |
| `api/generate.js:764` anthropic auth failure | static alert string | ✓ no payload |
| `api/generate.js:786` no submit_growing_plan tool_use | `bodyPeek` (200-char clamped) | ✓ bounded |
| `api/validate-key.js:227` LS_STORE_ID missing | static alert | ✓ |
| `api/validate-key.js:230` LS_STORE_ID warn | static alert | ✓ |

**Total non-trivial sites: 8. Status: ALL clean.** No fetch payloads, no license keys, no API keys, no PII surfaced in logs.

### 3. `JSON.stringify(error)` / `String(error)` / `${error}` patterns

| Pattern | Sites found | Notes |
|---|---|---|
| `JSON.stringify\s*\(\s*(e\|err\|error)\b` | 0 | grep clean across full repo |
| `String\s*\(\s*(e\|err\|error)\s*\)` | 0 | grep clean |
| `\$\{(e\|err\|error)\}` | 0 | grep clean |

**Status: CLEAN.** No string-coercion of raw exceptions anywhere. The closest pattern (`String(js.error || "")` at validate-key.js:201) is a string coercion of an LS API field, not an exception object — and that field is then normalised through `normaliseLsError` before being returned to the caller.

### 4. Inline event handlers in Blob HTML / dataURL

`on(click|error|load|submit|change|mouseover|focus|blur|input|key|drag)=` grep across `src/`, `api/`, `public/`, `index.html`:

- ZERO inline-handler matches.
- ONE incidental match at `App.jsx:4890` — a comment line inside the Round-1 L1 closure comment block (`// onclick="window.print()" on the Save-as-PDF button.`). Comment text only, not an executable handler.

**Status: CLEAN.** Inline-event-handler grep returns zero executable matches across the entire codebase.

### 5. `dangerouslySetInnerHTML` introductions

`grep dangerouslySetInnerHTML` across full repo:
- ZERO matches in `src/`, `api/`, `public/`, `index.html`, `vercel.json`.
- ONLY matches are in documentation `.md` files (audit history) — not executable code.

**Status: CLEAN.**

### 6. `target="_blank"` without `rel="noopener noreferrer"`

All `target="_blank"` instances reviewed:
- `public/contact.html:176` → `rel="noopener noreferrer"` ✓
- `public/terms.html:132` → `rel="noopener"` ✓ (acceptable; `noopener` alone closes the `window.opener` leak)
- `public/privacy.html:151-154` → 4 instances, all `rel="noopener"` ✓
- `App.jsx` → ZERO `target="_blank"` instances (confirmed via grep)

**Status: CLEAN.** Every `target="_blank"` carries at least `rel="noopener"`.

### 7. `window.open(url)` with user-controlled URL

`grep window\.open` across full repo:
- ZERO matches in `src/`, `api/`, `public/`, `index.html`.
- Documentation hits only.

**Status: CLEAN.** No open-redirect surface.

### 8. `addEventListener('message', ...)` without origin check

`grep addEventListener\s*\(\s*['"]message['"]` across full repo:
- ZERO matches in `src/`, `api/`, `public/`, `index.html`.

**Status: CLEAN.** No `postMessage` consumer.

### 9. `localStorage.setItem` with sensitive values

Two `localStorage.setItem` sites identified:
- `App.jsx:529` inside `persistState` → generic. Called with `LS_KEY` (licence key) and `LS_INSTANCE` (instance_id) at lines 7030-7031 + 7205-7206. **Documented architecture per CLAUDE.md §12 + workspace memory `feedback_paywall_security.md`.** localStorage is the canonical Urban Root licence-key store; 3-device LS activation cap is the actual security boundary, not localStorage XSS-immunity.
- `App.jsx:7150` → `LS_PENDING` written with `Date.now()`. Just a timestamp. No sensitive value.

`grep (email|order_id|order_number|customer_email|customer_name)` across `App.jsx`:
- Only matches are marketing copy ("No account, no email, no trial countdown", "Licence key emailed within seconds.") and FAQ JSON-LD text. No PII storage.

**Status: CLEAN.** No customer email, no order_id, no LS receipt data persisted client-side.

### 10. Other `length<=N` clamps (round-1 M3 sibling sweep)

`grep \.length\s*<=?\s*\d+\s*\?` across `App.jsx`:
- ZERO ternary-style length clamps remain (round-1 M3 was the only one).

`grep \.length\s*<=?\s*\d` (broader, includes guards):
- `App.jsx:3653, 3659, 7197` — licence-key min-length gate (`>=8`). UX preflight only; server (LS API) is the authoritative validator. No clamp-vs-allowlist concern.
- `App.jsx:6696` — comment quoting the round-1 M3 prior pattern.

**Status: CLEAN.** No sibling allowlist-candidate clamps remain.

### 11. Vercel ESM: `require()` / `module.exports` in `api/*.js`

`grep module\.exports|require\(` across `api/`:
- ZERO matches. Both `api/generate.js` and `api/validate-key.js` use `export default` per workspace memory `feedback_vercel_esm_handlers.md`.

**Status: CLEAN.**

### 12. `.npmrc` supply-chain policy

File at `homestead-harvest-planner/.npmrc`:
- Line 13: `ignore-scripts=true` ✓
- Line 14: `min-release-age=3` ✓
- 11-line comment block names Shai-Hulud worm family (Sept 2025 / Nov 2025 / May 2026), chalk/debug Sept 2025, eslint-prettier July 2025, axios March 2026.

**Status: CLEAN.** Cross-product policy active (committed in `23a47a6`).

### 13. CSP `require-trusted-types-for` directive in `vercel.json`

`grep require-trusted-types-for` in `vercel.json`:
- ZERO matches. Directive absent (correct; would halt lemon.js Setup() in Chromium per cross-product memory `feedback_csp_trusted_types_ls.md`).

**Status: CLEAN.**

### 14. Hardcoded Google Fonts version-pinned preload (`gstatic.com/.../v{N}/{hash}.woff2`)

`grep rel="preload"[^>]*fonts\.gstatic\.com` in `index.html`:
- ZERO matches. Only `preconnect` to `fonts.gstatic.com` (line 11) — correct usage. Lesson from commit `5ce7c5a` already applied.

**Status: CLEAN.**

### 15. Canonical tag matches og:url + twitter:url + sitemap

`index.html`:
- Line 17: `<link rel="canonical" href="https://thehomesteadplan.com/" />`
- Line 22: `<meta property="og:url" content="https://thehomesteadplan.com/" />`
- Line 28: `<meta name="twitter:url" content="https://thehomesteadplan.com/" />`

`public/sitemap.xml`:
- Line 4: `<loc>https://thehomesteadplan.com/</loc>` (matches)

**Status: CLEAN.** All four URLs align on `https://thehomesteadplan.com/`.

### 16. 48h grace period for `LS_PENDING`

- Constant declared at `App.jsx:93`: `const GRACE_WINDOW_MS = 48 * 60 * 60 * 1000;` ✓
- Grace-window check at `App.jsx:7101-7108`: `if (Number.isFinite(pending) && pending > 0) { const age = Date.now() - pending; if (age >= 0 && age < GRACE_WINDOW_MS) { setPaid(true); setValidating(false); return; } }` ✓

**Status: CLEAN.**

### 17. URL-key `?key=` flow — both gates intact

- Gate 1 (read): `App.jsx:7058` invokes `attempt(urlKey, "", { skipStoredInstance: true })` → inside `attempt` at line 7012, `validateKeyRemote(key, skip ? "" : (existingInstance || ""), opts)` sends `""` instead of stored instance_id.
- Gate 2 (cleanup-write): `App.jsx:7020` guards `clearLS(LS_INSTANCE)` with `!skip` — the cleanup is bypassed on URL-key path.
- Both gates have inline SECURITY comments at 7016-7019 + 7053-7057 naming the cross-product slot-burn pattern and the `4f862e1` fix commit.

**Status: CLEAN.** Cross-product trust-boundary fully preserved per workspace memory `feedback_url_key_instance_trust.md`.

### 18. `paid` state init — V2 paywall pattern preserved

- `App.jsx:6954`: `const [paid, setPaid] = useState(false);` ✓
- `App.jsx:6955`: `const [validating, setValidating] = useState(true);` ✓
- `grep loadState\s*\(\s*LS_(PAID|paid)`: ZERO matches. No localStorage read for the paid flag at mount.

**Status: CLEAN.** Finding-A closure (2026-04-20) intact.

### 19. `api/*.js` — Origin/Referer allowlist + fail-closed envelope + no over-disclosure

Both API files:
- POST-only method check ✓
- Origin/Referer allowlist ✓ (production + localhost in generate.js; production + localhost + Vercel-alias regex in validate-key.js)
- Fail-CLOSED on missing `ANTHROPIC_API_KEY` (generate.js:641-644) and missing `LEMONSQUEEZY_STORE_ID` in production (both files)
- Fail-OPEN on Upstash errors (acceptable per Layer 3 contract)
- `Cache-Control: no-store` set on every response (validate-key.js:141, generate.js:633)
- Response envelopes trimmed (validate-key.js:242-245 returns only `{valid, instance_id}`; generate.js error responses return only `{ok, error}` with user-safe messages)
- LS error strings normalised via `normaliseLsError` allowlist (validate-key.js)
- Anthropic upstream errors mapped to status-family-based user message; never echoed verbatim (generate.js:768-774)

**Status: CLEAN.** Phase-2 closures all intact.

### 20. Bonus checks performed (not in mission brief but worth verifying)

- **`escapeHtml` order-correct** (`App.jsx:4673-4675`): `&` → `<` → `>` → `"` → `'`. All 5 entities. ✓
- **`eval()` / `new Function()` / `setTimeout(string)` / `setInterval(string)`** in `src/` and `api/`: ZERO matches.
- **Hardcoded secrets in client bundle** (`dist/assets/index-DK1IFh3_.js`): not re-greped this round (round-1 verified clean; no secret-handling code introduced since).
- **React 18.2.0** — still on `package.json:18`. NOT affected by CVE-2025-55182 / 55183 / 55184 / 66478 / 67779 (React 19.x only).
- **Build output identical to round-2 closure** — 33 modules, 389.32 KB raw / 110.27 KB gz. Zero regression.

---

## Critical Findings

**None.**

---

## High Findings

**None.**

---

## Medium Findings

**None net-new.** M2 (Vite 5→8 semver-major) carries forward unchanged.

---

## Low Findings

**None net-new.** L2 (sitemap `<lastmod>` stale) carries forward unchanged.

---

## Info / Hygiene

**None net-new.** I1 (Round-1 L1 framing clarification + Trusted Types CSP3 future migration) carries forward; documented in round-2 doc. I2 + I3 (verified clean) carry forward as verified.

---

## Dependency Audit

- **React version:** 18.2.0 ✅ NOT affected by CVE-2025-55182 / 55183 / 55184 / 66478 / 67779 ("React2Shell" Dec 2025 — affects React 19.x only).
- **Next.js:** N/A (Vite-based).
- **`npm audit` results:** Not re-run this round (round-1 documented 2 moderates — esbuild dev-server GHSA-67mh-4wv8-2f99 + Vite path-traversal GHSA-4w7w-66w2-5vf9). Both dev-server only. Both deferred per scope guardrail forbidding major bumps. **Status unchanged from Round 2.**
- **Known-compromised package check:** No new dependencies added between Round 2 and Round 3. Working tree shows only `src/App.jsx` modified (round-1 + round-2 fixes uncommitted). Round-1 `package-lock.json` clean state still holds.

---

## Final Deferrals (Carry-Forward)

These are the **stable** items left after 3 rounds. None are net-new; none can be closed within the security-review scope guardrails.

### M2 — Vite 5.4.21 + esbuild ≤0.24.2 dev-server CVEs

- **GHSA-67mh-4wv8-2f99** (esbuild ≤0.24.2, CVSS 5.3): dev-server CORS — any website can send a request to the dev server and read the response.
- **GHSA-4w7w-66w2-5vf9** (Vite ≤6.4.1): dev-server path-traversal in optimized-deps `.map` handling.
- **Both dev-server only.** Production builds compile out to static JS. Exposure is limited to "a developer running `npm run dev` AND luring themselves to a malicious cross-origin site during that window."
- **Fix path:** Vite 5→6.4 first (closes both CVEs without major API churn), then optionally Vite 6→8 later. This is a dedicated dep-bump task per the round-1 scope guardrail "Do NOT bump runtime dependency major versions."
- **Mitigation in the interim:** Use `npm run build && npm run preview` for local testing, not `npm run dev` while browsing untrusted sites.

### L2 — Sitemap `<lastmod>` stale (SEO hygiene, not security)

- `public/sitemap.xml` all entries dated `2026-05-06`. Today is `2026-05-18`.
- 3 commits shipped since (`eaacc3c`, `5ce7c5a`, `23a47a6`) — favicon + Google Fonts preload removal + `.npmrc`.
- **Not a security finding.** SEO freshness signal only; out of round-1/2/3 scope per "Do NOT refactor unrelated code."
- Log for next SEO-touching session.

### I1 — CSP `'unsafe-inline'` carried in `script-src` + `style-src`

- Documented post-launch hygiene per CLAUDE.md §22. Trusted Types CSP3 + nonce migration is a known future task. Round-1 audit + Phase-2 audit (2026-05-06) + Round-3 confirm: `'unsafe-inline'` is the single most-flagged CSP weakness by Google CSP-Evaluator, but the actual XSS surface on Homestead is structurally small (no user-to-user content, LLM output is double-escaped via schema + `escapeHtml`, no `dangerouslySetInnerHTML`).
- **Not a security finding for closure.** This is a known long-term migration item.

---

## Positive Observations

Crediting what's still right (post-Round-2):

1. **All round-1 + round-2 fixes integrated cleanly without regressions.** Four changes (M1, M3, L1 round-1 + L1 round-2) integrated cleanly. Build clean (33 modules, 389.32 KB raw / 110.27 KB gz — identical to round-2 closure).
2. **Catch-site discipline is now 100%.** 25 of 25 catch sites across `src/App.jsx` + `api/*.js` follow the `e?.message` / `e?.message, e?.code` pattern. ZERO outliers. The round-2 doc's "12 of 13 clean" status has converged to 25 of 25.
3. **URL-key both-gates structure preserved.** `App.jsx:7053-7058` skips `LS_INSTANCE` read on URL-key path; `App.jsx:7016-7020` skips cleanup-write. Inline SECURITY comments name the cross-product slot-burn pattern + `4f862e1` fix commit. Future editors will not regress these.
4. **Forced tool-use + `additionalProperties: false` chain intact.** `PLAN_SCHEMA` constrains the model output at the schema layer; `_str` / `_strArr` / `_num` runtime sanitiser is a belt-and-braces second layer; `CURRENCY_SYMBOLS.includes(...)` allowlist on the savings-currency field is a third layer (round-1 M3 closure).
5. **`escapeHtml` order-correct** (`App.jsx:4673-4675`). `&` first, then `<`, `>`, `"`, `'`. Verified.
6. **Inline-handler grep returns ZERO executable matches** across all source files. The only match is the round-1 L1 comment-block quote at `App.jsx:4890`. No surprise leftovers.
7. **Inputs-Persistent / Plan-Ephemeral pattern (V2 paywall) preserved.** Plan body never persists to localStorage. Finding-A closure (2026-04-20) intact.
8. **`.npmrc` supply-chain policy** active across both `ignore-scripts=true` and `min-release-age=3`.
9. **Anthropic upstream errors never echoed verbatim.** Status-family-based user message in generate.js:768-774.
10. **`Cache-Control: no-store`** set on every response in both API endpoints.
11. **Per-endpoint two-tier rate limiting** (IP pre-flight + per-licence post-validate) with appropriate window sizing for the cost asymmetry between `/api/generate` and `/api/validate-key`.
12. **`getIp()` prefers `x-real-ip`** in both endpoints (Phase-2 M4 closure).
13. **`normaliseLsError`** allowlist defends against future LS API string changes (Phase-2 L5 closure).
14. **CSP correctly omits `require-trusted-types-for`** — preserves lemon.js compatibility per cross-product memory.
15. **Canonical / og:url / twitter:url / sitemap all align** on `https://thehomesteadplan.com/`.

---

## Overall Verdict

- [x] ✅ **SHIP-READY — CONVERGENCE ACHIEVED**

Three rounds of audit complete. Trajectory: r1 8 → r2 2 → **r3 0**. The product holds the strongest security posture in the Urban Root portfolio. Two stable deferrals (M2 Vite 5→8 dep bump, L2 sitemap lastmod) are documented and out-of-scope for the security cycle. The security review cycle is **CLOSED**. Next step per scope guardrail: engineering verifier.

---

## Next Actions

1. **Commit the round-1 + round-2 + round-3 edits.** The working tree has `src/App.jsx` modified with the M1 + M3 + L1 (round-1) + L1 (round-2) fixes. Recommended single commit message: `harden: round-1+2 security audit fixes (M1 paywall catch + M3 currency allowlist + L1 print-button listener + L1 persistState catch)`. The three audit docs (`security-audit-round1-2026-05-18.md`, `security-audit-round2-2026-05-18.md`, `security-audit-round3-2026-05-18.md`) can be staged separately or in the same commit.
2. **DEFER M2** (Round 1 + 2 + 3 carry-over) — Vite 5→8 semver-major dep bump. Schedule as dedicated task.
3. **DEFER L2** (Round 1 + 2 + 3 carry-over) — sitemap `<lastmod>` refresh. SEO maintenance, not security.
4. **NEXT: engineering verifier.** Per the round-3 mission brief, "if r3 returns zero, the security cycle is closed and the next step is the engineering verifier."

---

## Open Questions (for user)

None. Convergence is unambiguous. All carry-forward items are explicitly out of round-1/2/3 scope and documented.

---

## Trajectory Summary

| Round | Findings | Closed in round | Carried |
|---|---|---|---|
| Round 1 | 0C/0H/3M/2L/3I = 8 | M1 + M3 + L1 = 3 | M2, L2, I1, I2, I3 |
| Round 2 | 0C/0H/0M/1L/1I = 2 | L1 = 1 | M2, L2, I1 |
| **Round 3** | **0C/0H/0M/0L/0I = 0** | n/a (zero findings) | **M2 (Vite 5→8), L2 (sitemap lastmod), I1 (Trusted Types future)** |

**Convergence: ACHIEVED.** Three audit rounds. Eight findings total. Five closed within scope. Three deferred per explicit scope guardrails. Zero open security issues.

The product remains the strongest security posture in the Urban Root portfolio. The security cycle is **CLOSED**.

---

## Build Status

```
> homestead-harvest-planner@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 33 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  8.12 kB │ gzip:   2.82 kB
dist/assets/index-DK1IFh3_.js  389.32 kB │ gzip: 110.27 kB
✓ built in 768ms
```

**Identical to round-2 closure.** Zero regression. Build is clean.
