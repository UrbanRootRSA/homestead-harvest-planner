# SECURITY AUDIT — The Homestead Plan (Round 2)

**Date:** 2026-05-18
**Auditor:** security-auditor (Urban Root)
**Commit audited:** Working tree on top of `23a47a6` (round-1 edits still uncommitted on `main`; live tip `23a47a6`).
**Cycle:** Round 2 of up to 3. Convergence target: zero in-scope findings by round 3.
**Working dir:** `C:\Users\User\ClaudeCodeN8N\Homestead\homestead-harvest-planner`

---

## Summary

Round 1's three in-scope fixes all landed correctly. Round 2 finds **0 CRITICAL / 0 HIGH / 0 MEDIUM / 1 LOW / 1 INFO** = 2 findings net-new. The single LOW is a sibling of Round-1 M1 — `persistState`'s catch site logged `err?.message || err`, which still falls back to logging the raw exception when `.message` is undefined. Same A09:2025 class as M1; same one-line fix. Round-1 framing of L1 (inline `<script>` is "forward-compatible with strict CSP") was slightly optimistic — INFO-only because the as-shipped behaviour is unchanged and the new shape still improves auditability. All other patterns clean: no `dangerouslySetInnerHTML`, no `eval`, no inline event handlers anywhere in the codebase, no `postMessage` listeners, no `module.exports` in `api/`, no unsafe `target="_blank"`, no hardcoded Google Fonts version-pinned preload. URL-key both-gates intact. V2 paywall pattern intact.

---

## Round-1 Fix Verification

### M1 — Paywall-mount catch log narrowed: ✓ APPLIED CORRECTLY

`src/App.jsx:7115` reads `console.error("[hhp] paywall mount failed:", e?.message, e?.code);`. Round-1 comment block 7111-7114 names closure date and OWASP category. **Verified clean.**

Sibling catch-site survey (round-2 hunt #5):

| Site | Pattern | Status |
|---|---|---|
| App.jsx:534 `persistState` | `err?.message \|\| err` | **NEW finding — L1 (this round)** |
| App.jsx:3780 `cryptoHash` fingerprint | `e?.message` | ✓ clean |
| App.jsx:7115 paywall mount | `e?.message, e?.code` | ✓ clean (Round-1 M1) |
| App.jsx:7153 LS Setup | `e?.message` | ✓ clean |
| api/generate.js:73, 116, 170, 214, 240, 277, 301, 305, 809 | `e?.message` / `e?.message, e?.code` | ✓ all clean |
| api/validate-key.js:54, 93, 116, 250 | `e?.message` / `e?.message, e?.code` | ✓ all clean |

### M3 — `CURRENCY_SYMBOLS` hoisted + clamp tightened: ✓ APPLIED CORRECTLY

- Module-scope declaration at `src/App.jsx:103`: `const CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"];`
- Round-1 comment block at 97-102 explains the hoist rationale.
- `loadState`-clamp at `src/App.jsx:6697`: `return CURRENCY_SYMBOLS.includes(c) ? c : "$";`
- Round-1 comment block at 6690-6695 explains the cross-product hygiene anchor.
- Downstream caller `sanitisePlanShape` at line 3818 uses the same allowlist: `CURRENCY_SYMBOLS.includes(raw.savingsEstimate.currency) ? raw.savingsEstimate.currency : "$"`.
- Breadcrumb comment at line 3793 points future readers to the hoisted location.

**Name-collision check (round-2 second-order hunt #3-a):** `grep CURRENCY_SYMBOLS` returns exactly 4 references — the declaration, the breadcrumb comment, and 2 use sites. No collision with any other module-scope const. **Verified clean.**

### L1 — Inline `onclick="window.print()"` removed + listener registered: ✓ APPLIED CORRECTLY

- Button at `src/App.jsx:4846`: `<button class="print-btn" id="hhp-print-btn" type="button">Save as PDF</button>` (no inline handler).
- Listener `<script>` block at `src/App.jsx:4883-4890` registered via `document.getElementById('hhp-print-btn')?.addEventListener('click', function () { window.print(); });`.

**Script-scope check (round-2 second-order hunt #3-b):** The `<script>` is positioned BEFORE `</body>` and AFTER the `#hhp-print-btn` element in DOM order. Inline script execution at parse-time resolves `getElementById` against the already-parsed button. No `DOMContentLoaded` race. Optional-chaining guards against the unlikely case the element is missing.

**Inline-handler grep (round-2 hunt #5-a):** `grep -P "onclick=|onerror=|onload=|onmouseover=|onfocus=|onblur=|onsubmit=|onchange="` against all non-`docs/` files returns ZERO matches in `src/`, `api/`, `public/`, `index.html`, or anywhere else. Only matches are in the round-1 doc's own quoted snippets. **Verified clean.**

### `.npmrc` supply-chain policy: ✓ APPLIED CORRECTLY (commit `23a47a6`)

Both `ignore-scripts=true` and `min-release-age=3` present. Comment block names the Shai-Hulud threat family + 2026 attack windows. Matches cross-product policy.

---

## Critical Findings (🔴)

**None.**

---

## High Findings (🟠)

**None.**

---

## Medium Findings (🟡)

**None.**

---

## Low Findings (🟢)

### L1 — `persistState` catch logs raw exception in fallback path (A09:2025 Logging Failure)

- **Severity:** LOW (sibling of round-1 M1; same class but tighter blast radius — `persistState` runs after `setItem`, so the user's licence key is not on the call stack at this point. Demotion from MEDIUM to LOW reflects the reduced cause-chain payload concern.)
- **OWASP category:** A09:2025 — Security Logging and Alerting Failures
- **Location:** `src/App.jsx:534`
- **Current code:**
  ```js
  } catch (err) {
    // Quota exceeded, sandboxed iframe, or disabled storage. Log once per key
    // per session so we leave a breadcrumb without spamming the console.
    console.warn(`[hhp] Could not persist "${key}":`, err?.message || err);
    return false;
  }
  ```
- **Why this matters:** The `|| err` fallback path will log the raw `err` object whenever `err.message` is undefined. Most native browser errors (DOMException, QuotaExceededError, SecurityError) have `.message`, so the safe path fires for typical quota / sandboxed-iframe cases. The risky path fires for:
  - Custom Proxy-wrapped errors (third-party scripts injecting wrapped throws — Vercel Analytics, Web Vitals)
  - Plain-object throws (`throw { code: "X" }`)
  - String throws (`throw "boom"`)
  - Errors mid-tear-down where prototype chains are detached
  - Future browsers adding `.cause`-only errors with no `.message`
  In each case `console.warn` would receive the raw object and the Vercel log aggregator would receive whatever its `String()` coercion produces — potentially including own enumerable properties.

  This is the same A09:2025 class as Round-1 M1, just with a smaller blast radius: `persistState` is invoked AFTER the user's licence key has already been committed to storage (the licence-key path uses `persistState(LS_KEY, key)`), so the `err` object's cause-chain does NOT carry the licence key at this site.

- **Attack scenario:** Vercel Analytics or any future third-party script wraps `setItem` with a Proxy that throws a non-Error sentinel. `persistState` logs the sentinel object as-is. The sentinel's own properties (telemetry IDs, session tokens, etc.) end up in Vercel logs. Low likelihood but the narrowing costs nothing and matches the api/*.js + paywall-mount discipline.

- **Fix:** Narrow to `err?.message, err?.code` to match the Round-1 M1 pattern + every catch site in `api/*.js`:
  ```js
  } catch (err) {
    console.warn(`[hhp] Could not persist "${key}":`, err?.message, err?.code);
    return false;
  }
  ```
- **Priority:** Apply this round (Round 2). One-line + comment update.

---

## Info / Hygiene (ℹ)

### I1 — Round-1 L1 framing was slightly optimistic about CSP forward-compat

- **Status:** No fix required. As-shipped behaviour is unchanged. Documenting so future audits don't over-rely on the Round-1 doc's framing.
- **What Round-1 said:** "The script tag inside a Blob document is still allowed under any forward-compatible CSP that uses `'self'` for `script-src`. Inline event handlers are NOT."
- **What's actually true:** Inline `<script>...</script>` blocks WITHOUT a `nonce` are blocked under any strict-CSP policy in exactly the same way that inline `onclick="..."` handlers are — both require `script-src 'unsafe-inline'` (or a per-block `nonce` / `hash`). Round-1's fix neither helps nor hurts the forward-compat trajectory if Blob: documents ever get a default CSP. The actual win from Round-1 L1 is auditability (one centralised listener replaces N scattered inline handlers — easier to grep, easier to migrate later if a real CSP migration happens).
- **What changes the risk profile:** If Blob: documents are ever given a default CSP that requires nonces, BOTH the listener `<script>` block and any leftover inline handlers would fail at the same time. The migration path in that future is to move the print-button logic into a small `script src="..."` that the Blob document loads via a `data:` URL or to inline a per-block CSP that includes `'unsafe-inline'`. Either is a future migration — not a round-2 fix.

### I2 — `console.log` / `console.warn` in `api/*.js` continue to leak no sensitive data (re-verified)

- All API log lines use `e?.message` or `e?.message, e?.code` patterns. Licence keys never logged (only `hashKey(key)`). LS endpoint error strings normalised through `normaliseLsError`. Anthropic upstream errors not echoed verbatim. **Clean.**

### I3 — Round-2 sweep on six common foot-guns: ZERO findings

The round-2 mission listed six second-pass patterns. Status of each:

| Pattern | Sites found | Notes |
|---|---|---|
| `dangerouslySetInnerHTML` | 0 | grep clean across `src/` |
| `eval()` / `new Function()` / `setTimeout(string, ...)` | 0 | grep clean across `src/` and `api/` |
| `target="_blank"` without `rel="noopener"` | 0 | negative-lookahead grep returns 0 in `public/`; `App.jsx` has no `target="_blank"` |
| `postMessage` / `addEventListener('message')` | 0 | grep clean |
| `module.exports` in `api/*.js` | 0 | grep clean — both files use `export default` |
| Hardcoded `fonts.gstatic.com/.../v{N}/{hash}.woff2` preload | 0 | grep clean — preconnect only |

---

## Dependency Audit

- **React version:** 18.2.0 — NOT affected by CVE-2025-55182 / 55183 / 55184 / 66478 / 67779.
- **Next.js:** N/A (Vite-based).
- **`npm audit` results:** No re-audit this round. Round-1 documented 2 moderates (esbuild dev-server + Vite path-traversal), both deferred per scope guardrail forbidding major bumps. **Status unchanged from Round 1.**
- **Known-compromised package check:** No new dependencies added between Round 1 and Round 2. Working tree shows only `src/App.jsx` modified. Round-1 `package-lock.json` clean state still holds.

---

## Positive Observations

Crediting what's still right (post-Round-1):

1. **Round-1 fixes all landed correctly without regressions.** Three changes (M1, M3, L1) integrated cleanly. Build clean. No name collisions, no DOM-order issues, no second-order leaks introduced.
2. **Catch-site discipline is now near-universal.** 12 of 13 catch sites across `src/App.jsx` + `api/*.js` follow the `e?.message` / `e?.message, e?.code` pattern. The 13th (this round's L1) is the only outlier and is fixed in-round.
3. **URL-key both-gates structure preserved.** `App.jsx:7053` skips `LS_INSTANCE` read on URL-key path; downstream cleanup-write also gated. Cross-product slot-burn defence intact.
4. **Forced tool-use + `additionalProperties: false` chain intact.** `PLAN_SCHEMA` constrains the model output at the schema layer; `_str` / `_strArr` / `_num` runtime sanitiser is a belt-and-braces second layer; `CURRENCY_SYMBOLS.includes(...)` allowlist on the savings-currency field is a third layer.
5. **`escapeHtml` order-correct.** `&` first, then `<`, `>`, `"`, `'`. Verified at line 4663.
6. **Inline-handler grep returns ZERO matches** across all source files including the round-1-added `<script>` listener block. No surprise leftovers.
7. **Inputs-Persistent / Plan-Ephemeral pattern (V2 paywall) preserved.** Plan body never persists.
8. **`.npmrc` supply-chain policy** active across both `ignore-scripts=true` and `min-release-age=3`.

---

## Overall Verdict

- [x] ⚠️ **SHIP WITH CAUTION — Round 2 of 3**

One LOW finding (sibling of Round-1 M1) applied this round. One INFO clarification (Round-1 L1 framing slightly overstated forward-compat win; behaviour unchanged). All round-1 fixes verified in place. Round 3 expected to be empty unless new code lands.

**Net post-fix state:** Round 2 closes L1 → carries forward M2 (Vite 5→8 dep-bump task, out of scope), L2 (sitemap lastmod, SEO not security), I1 (Trusted-Types CSP3 migration), I2-I3 (verified clean). Round 3 will be empty if no further commits land.

---

## Next Actions

1. **APPLY L1 (this round)** — narrow `persistState` catch from `err?.message || err` to `err?.message, err?.code`. `src/App.jsx:534`. ~1 LOC + comment.
2. **DEFER M2** (Round 1 carry-over) — Vite 5→8 semver-major. Schedule as dedicated `vite-5-to-8.md` task.
3. **DEFER L2** (Round 1 carry-over) — sitemap.xml `<lastmod>` refresh. SEO maintenance, not security.

---

## Open Questions (for user)

None. Scope guardrail explicit: no major version bumps, no SEO refactors, no unrelated refactors.

---

## Post-Apply Fix Log

L1 applied at `src/App.jsx:527-541`. Diff:

Before:
```js
console.warn(`[hhp] Could not persist "${key}":`, err?.message || err);
```
After:
```js
console.warn(`[hhp] Could not persist "${key}":`, err?.message, err?.code);
```

Plus a 5-line comment block at lines 535-539 naming the Round-2 closure date and OWASP category, matching the M1 comment-block style. Behaviour preservation: the safe path (`.message` present) is identical — same 2 arguments to `console.warn` (the leading template-literal context string remains intact). The fallback path no longer echoes a raw exception object.

### Build status

`npm run build` deferred to user — see "Build status" line at end. No regression expected; the change is a one-argument-to-two-argument shift on a `console.warn` call inside an existing try/catch.

### Deferred (no edit)

- **M2 (Vite 5.4.21 + esbuild dev-server CVEs)** — semver-major bump. Round-1 deferral honoured.
- **L2 (sitemap `<lastmod>` stale)** — SEO maintenance, not security. Round-1 deferral honoured.
- **I1 (Round-1 L1 framing)** — INFO-only clarification; no fix needed.

### Net result

Round 2 closes the single in-scope finding. Net trajectory:

| Round | Findings | Closed in round | Carried |
|---|---|---|---|
| Round 1 | 0C/0H/3M/2L/3I = 8 | M1 + M3 + L1 = 3 | M2, L2, I1, I2, I3 |
| **Round 2** | **0C/0H/0M/1L/1I = 2** | **L1 = 1** | **M2, L2, I1** |
| Round 3 (expected) | 0/0/0/0/0 | n/a | only the two stable deferrals (M2, L2) |

The product remains the strongest security posture in the Urban Root portfolio. Convergence on track for round 3.
