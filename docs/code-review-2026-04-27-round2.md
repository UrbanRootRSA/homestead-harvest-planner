# Code review — 2026-04-27 (round 2 of 2, ship-gate)

**Verdict:** SHIP (with two MEDIUM a11y polish items recommended pre-Reddit, neither blocking)
**Baseline:** `580dc93` ("Round-1 audit fixes: 4 HIGH + 9 MEDIUM + 2 LOW closed pre-launch"), tip of `main`. One untracked utility script (`scripts/rasterize-store-avatar.mjs`) ignored.
**Scope:** Verification of round-1 fix closure for all 30 findings + net-new round-2 findings only. Build verified clean (`npm run build` → 387KB main bundle, 33 modules transformed).
**Verifications run:** Static read-through end-to-end, fix-commit diff (`git show 580dc93`), production build, end-to-end trace of every closure path with edge-case inputs, bundle inspection for static-eval / minification side-effects.

**Round-2 totals: 7 findings (0 CRITICAL, 0 HIGH, 2 MEDIUM, 5 LOW).**
**No new HIGH issues. No new SHIP-BLOCKERS.**

---

## Executive summary

The round-1 fix patch (commit `580dc93`) is uniformly correct on the engineering substance. Of the 15 round-1 items that received code changes, 14 are verifiably CLOSED and 1 is PARTIAL (M8 — the paired aria-live region was added but introduces a separate, narrower a11y issue that did not exist in the round-1 audit window). The remaining 15 round-1 findings that round-1 explicitly classified as "no code change required" remain accurate calls — none of them re-opened due to the patch.

The two NEW MEDIUM findings are both minor accessibility polish, not functional regressions:

- **R2-M1** (nested aria-live) — round-1's M8 fix added a `<span aria-live="polite">` inside MiniStat, but two of the three callsite contexts (Self-Sufficiency tab, Soil Calculator tab) wrap their MiniStat row in a parent `<div aria-live="polite">`. The result is screen readers double-announcing on every value change. Cost Savings KPI row is unaffected (no parent live region).
- **R2-M2** (MiniStat over-labels) — when round-1 swapped the group's aria-label from `${label}: ${readable}` to `label`, the visible label `<div>` (line 1318) was not `aria-hidden`. So SRs now hear "Plants to grow, group, Plants to grow, 12 plants" on focus.

Both are 5-minute fixes (one prop change each). Neither breaks the screen reader experience for sighted users; each just adds a redundant announcement.

The remaining round-2 findings are all LOW severity:
- **R2-L1** — same drift pattern as H1 still exists on the custom-mix percentage Field (round-1 fixed price but not pct).
- **R2-L2** — H1's guard is correct only because `Number((x).toFixed(3))` is stable; future precision change to displayPrice would silently break the guard.
- **R2-L3** — `useCountUp` early-return doesn't null `frameRef.current` (cosmetic; idempotent next-cycle cancel handles it).
- **R2-L4** — `updateBed` closes over stale `beds` (pre-existing latent issue, not introduced by round-1, but worth noting).
- **R2-L5** — connect-src wildcard removal needs production smoke test for `lemon.js` internal fetches (round-1 documented but not verified).

**Ship verdict:** SHIP. The four HIGH issues that were the round-1 launch-blockers are CLOSED. R2-M1 and R2-M2 should be addressed before pushing the Reddit/distribution traffic but are not blockers for going live. R2-L1 through R2-L5 are post-launch hygiene.

---

## Round-1 closure verification

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| H1 | HIGH | Soil component price drift (skip-if-equal guard) | **CLOSED** — guard fires correctly for 3dp metric, raw imperial, integer-from-rounding. Closure over `displayPrice` (not `canonicalCuFt`) is correct for all three formats. |
| H2 | HIGH | Bed dimension drift (8 fields) | **CLOSED** — `commitLen(raw, canonicalFt)` and `commitDepth(raw, canonicalIn)` correctly preserve canonical on no-edit blur and stably commit on edit. All 8 callsites updated. |
| H3 | HIGH | Hash routing inconsistency on bad ?key= | **CLOSED** — guarded `replaceState` only fires when needed; routing `useEffect` doesn't fight the synthetic hash. Trace: paywall mount → replaceState → setTab is well-ordered. |
| H4 | HIGH | Legal pages `--tx3` regression | **CLOSED** — all four files (terms/privacy/refund/contact) at `#7A6E5F`, matches `T.tx3` in App.jsx. Verified via grep. |
| M1 | MEDIUM | producePerPerson clamp chain | **CLOSED** (no-code-change verdict still accurate) — round-1 chose not to add a console.assert; the catch chain (line 6619 client + line 297 server) holds both ends. |
| M2 | MEDIUM | Counter `max` default | **CLOSED** — default 9999, `atMax = safe >= max`. All existing callsites pass explicit max (12, MAX_BEDS_PER_GROUP), so the default is purely a defensive layer. |
| M3 | MEDIUM | MAX_BEDS_PER_GROUP constant | **CLOSED** — module-level const at line 261, referenced at LS sanitizer (line 6661) and Counter UI (line 1812). Single source of truth. |
| M4 | MEDIUM | Field min/max swap | **CLOSED** — `if (min > max) [min, max] = [max, min]` is before any hook (no Rules of Hooks violation), idempotent across renders, doesn't affect useState initialiser. |
| M5 | MEDIUM | useCountUp RAF cancel-before-schedule | **CLOSED** — line 602 cancels prior frame before scheduling new one. Cleanup-on-unmount also cancels (idempotent on already-cancelled handle). See R2-L3 for cosmetic ref-nulling note. |
| M6 | MEDIUM | manualFrost timezone | **CLOSED** (no-code-change verdict still accurate) — no clock-related changes in patch. |
| M7 | MEDIUM | formatDate instanceof guard | **CLOSED** — `if (!(date instanceof Date) || ...)` correctly handles `0`, strings, and other accidental non-Date inputs. All current callsites still pass real Dates. |
| M8 | MEDIUM | MiniStat aria-live region | **PARTIAL** — paired aria-live span added correctly, but introduces R2-M1 (nested live region double-announce) and R2-M2 (over-labelling). The fix is in the right direction; needs one more iteration to land cleanly. |
| M9 | MEDIUM | CompatibilityMatrix caption | **CLOSED** — `<caption style={srOnlyStyle}>` is first child of `<table>`, HTML spec compliant. |
| M10 | MEDIUM | escapeHtml + LLM markdown | **CLOSED** (no-code-change verdict still accurate) — system prompt unchanged. |
| M11 | MEDIUM | Paywall Cancel clear prefill | **CLOSED** — `setKey("")`, `onClearError()`, `onClearPrefill?.()` all called. Re-open shows empty field. Trace verified for both first-attempt and post-error cases. |
| M12 | MEDIUM | validateKeyRemote 15s timeout | **CLOSED** — `AbortController` wired with try/finally `clearTimeout`. Both success and error paths exit through finally. AbortError gets distinct user-facing message. |
| L1 | LOW | LS_KEY round-trip format | **CLOSED** (no-code-change verdict still accurate) — `JSON.parse`/`JSON.stringify` round-trip unchanged. |
| L2 | LOW | clearLS on bad ?key= | **CLOSED** (no-code-change verdict still accurate) — H3's replaceState doesn't change the no-clear-on-bad-key intent. |
| L3 | LOW | Crop database price freshness | **CLOSED** (no-code-change verdict still accurate) — content quality only. |
| L4 | LOW | bedIdCounter session prefix | **CLOSED** — `BED_ID_SESSION = Date.now().toString(36)` confirmed NOT statically evaluated by Vite (bundle still contains literal `Date.now().toString(36)`). Module-level = page-load time = correct. |
| L5 | LOW | noscript on legal pages | **CLOSED** (no-code-change verdict still accurate) — Lighthouse cosmetic. |
| L6 | LOW | vercel.json connect-src wildcard | **CLOSED with caveat** — wildcard removed; static analysis shows no client-side fetch to LS subdomains. Production smoke test recommended (see R2-L5). |
| L7 | LOW | SRI on lemon.js | **CLOSED** (no-code-change verdict still accurate) — CSP is the substitute for SRI on auto-updating CDN scripts. |
| L8 | LOW | Math.PI in circle volume | **CLOSED** (no-code-change verdict still accurate). |
| L9 | LOW | hashchange skipping pushState | **NOT FIXED — INTENTIONAL** (not addressed in this patch; round-1 left it as a UX polish item, no regression seed). |
| L10 | LOW | addWeeks null check | **CLOSED** (no-code-change verdict still accurate). |
| L11 | LOW | LS_HEMISPHERE strict equality | **CLOSED** (no-code-change verdict still accurate). |
| L12 | LOW | autoComplete=off on key input | **CLOSED** (no-code-change verdict still accurate). |
| L13 | LOW | Asparagus sort key | **CLOSED** (no-code-change verdict still accurate) — `lowOf` fallback correct. |
| L14 | LOW | OG image URL spot-check | **CLOSED** (no-code-change verdict still accurate). |

**15 of 15 fix-patched findings: 14 verifiably CLOSED, 1 PARTIAL (M8 → see R2-M1, R2-M2).**
**15 of 15 no-code-change findings: all verdicts still accurate post-patch.**

---

## NEW round-2 findings

### [MEDIUM] R2-M1 — Nested aria-live regions cause double SR announcements
**File:** `src/App.jsx:1194` (Self-Sufficiency results), `src/App.jsx:1601` (Soil Calculator results), and `src/App.jsx:1329` (MiniStat).
**What:** Round-1 M8 added a `<span aria-live="polite">` inside `MiniStat` to announce settled values. But two of the three pages that render MiniStats already wrap their results section in a parent `<div ... aria-live="polite">`:

- Line 1194: `<div style={{ marginTop: 40 }} aria-live="polite">` wraps three MiniStats (Plants to grow / Garden space / Estimated yield).
- Line 1601: `<div style={{ marginTop: 40 }} aria-live="polite">` wraps three MiniStats (Number of beds / Volume / Estimated cost).

When a MiniStat value changes, both the inner `<span aria-live="polite">` (line 1329) and the outer `<div aria-live="polite">` will announce the change. Different screen readers handle nested live regions differently — VoiceOver tends to announce both, NVDA usually announces the inner first then the outer, JAWS often announces only the outermost. Net effect: every count-up settles with a duplicate or stuttered announcement.

The Cost Savings KPI row (line 5545-5557) is unaffected — its parent `<div>` has no aria-live, so MiniStat's inner live region is the only one. The four MiniStats there announce cleanly.

**Why it matters:** A11y polish, not a blocker. SR users hearing "Plants to grow, 12 plants ... Plants to grow, 12 plants" on every input change is annoying but not exclusionary. Tests on real SR software would confirm exactly how it behaves on each platform.
**Fix:**
```jsx
// Option A (recommended): drop the outer aria-live, rely on each MiniStat's own
{/* line 1194 */}
- <div style={{ marginTop: 40 }} aria-live="polite">
+ <div style={{ marginTop: 40 }}>

{/* line 1601 — same change */}
- <div style={{ marginTop: 40 }} aria-live="polite">
+ <div style={{ marginTop: 40 }}>
```
This works because the outer wrappers contain ONLY MiniStats and static eyebrow text — there's no announcement-worthy content that lives outside MiniStat. Option B (drop the inner aria-live, rely on outer) loses the "settled value" semantic that round-1 specifically added. Option A is cleaner.

### [MEDIUM] R2-M2 — MiniStat over-labels (group + visible div + live region)
**File:** `src/App.jsx:1313-1319`
**What:** Round-1 M8 swapped `aria-label` from `${label}: ${readable}` to just `label`, and added a paired aria-live span. But the visible label `<div>` (line 1317-1319) was not given `aria-hidden="true"`. Result on focus:

```
[group, "Number of beds"]            ← from <div role="group" aria-label="Number of beds">
"Number of beds"                     ← from the visible <div>{label}</div>
"Number of beds: 2 beds"             ← from <span aria-live="polite">
```

Three references to the same label. SR users hear "Number of beds, group, Number of beds, 2 beds." Not broken — just redundant.

**Why it matters:** A11y polish. Same severity tier as R2-M1. Same screen-reader audiences.
**Fix:** Either:
```jsx
// Option A (recommended): aria-hide the visible label, keep the group's accessible name on aria-label
- <div style={{ fontSize: 12, color: T.tx3, ... }}>
+ <div aria-hidden="true" style={{ fontSize: 12, color: T.tx3, ... }}>
    {label}
  </div>

// Option B: drop the group's aria-label, let the visible div be the accessible name via aria-labelledby
```
Option A is one-line and consistent with the visible aria-hidden pattern already used at line 1320.

### [LOW] R2-L1 — Custom soil mix percentage drift (same pattern as H1, not fixed)
**File:** `src/App.jsx:1572-1576, 1492-1500`
**What:** When the soil mix is set to "Custom", each component shows a `Field` for percentage:
```js
<Field label="Share of mix" unit="%"
  value={pctValue}
  onChange={(v) => setComponentPct(c.key, v / 100)}
  min={0} max={100} step={1} />
```
`pctValue = Number(((mixPctOverrides[c.key] ?? c.pct) * 100).toFixed(1))`. The `setComponentPct` writes `v / 100` directly with NO skip-if-equal guard. Same drift pattern as the H1 price field had before fix:

- Suppose `c.pct = 0.3333333`. `pctValue = Number((33.33333).toFixed(1)) = 33.3`.
- User blurs without editing. `setComponentPct(c.key, 33.3 / 100) = setComponentPct(c.key, 0.333)`.
- Drift: 0.3333333 → 0.333. Tiny (~0.1%), but per-blur compounding.

Lower severity than H1 because:
1. Only triggered in custom-mix mode (most users won't enable).
2. Default mixes (Standard / Mel's Mix) display percentages as static text, not in a Field.
3. The mix-pct does not feed into a money field — only into volume calculation, which is itself rounded to 0.1 cu ft.

**Why it matters:** Consistency. If H1 was worth fixing, R2-L1 is worth fixing the same way to prevent customer-facing surprise.
**Fix:** Apply the same skip-if-equal guard:
```js
const onPctChange = (v) => {
  if (v === pctValue) return;
  setComponentPct(c.key, v / 100);
};
```

### [LOW] R2-L2 — H1's guard is implicitly coupled to displayPrice's `.toFixed(3)` precision
**File:** `src/App.jsx:1549-1559`
**What:** H1's commitPrice guard is:
```js
const displayPrice = metric
  ? Number((canonicalCuFt / CUFT_TO_L).toFixed(3))
  : canonicalCuFt;
const commitPrice = (v) => {
  if (v === displayPrice) return;
  ...
};
```
The guard works because `Number((x).toFixed(3))` is a stable representation that round-trips through `String(value)` → `Number(value)` in `Field`'s commit path. If a future maintainer changes `.toFixed(3)` to `.toFixed(2)`, OR if `Field` ever truncates the displayed string differently, the guard becomes too strict (no-edit blur could fail equality and still write).

This is not a current bug. It's a maintenance fragility note. The same pattern is present in `commitLen` and `commitDepth` (BedEditor) but those use `.toFixed(2)` and `.toFixed(1)` consistently with their `Number((x * dLen).toFixed(2))` display values, so they're robust to step changes.

**Why it matters:** Low. Document the invariant so future-you doesn't break it.
**Fix:** Add a comment:
```js
// displayPrice precision (.toFixed(3)) MUST match the Field's display
// rendering. The commitPrice guard relies on Number(x.toFixed(3)) being
// stable through Field's String(value) → Number(value) round-trip.
```

### [LOW] R2-L3 — useCountUp early-return doesn't null frameRef.current
**File:** `src/App.jsx:602-605`
**What:**
```js
if (frameRef.current) cancelAnimationFrame(frameRef.current);
const start = Number.isFinite(display) ? display : 0;
const diff = target - start;
if (Math.abs(diff) < 0.01) { setDisplay(target); return; }
```
The early-return at line 605 (small diff) doesn't reset `frameRef.current = null`. The cancellation at line 602 is sufficient on the next effect run (cancelAnimationFrame on a stale handle is a no-op), but the ref still holds a "live looking" handle until then. Cosmetic.

**Why it matters:** None functionally. Just code-quality.
**Fix:**
```js
if (Math.abs(diff) < 0.01) {
  setDisplay(target);
  frameRef.current = null;
  return;
}
```

### [LOW] R2-L4 — `updateBed` closes over stale `beds` (pre-existing, not introduced by round-1)
**File:** `src/App.jsx:1481`
**What:** `const updateBed = (id, patch) => setBeds(beds.map((b) => (b.id === id ? { ...b, ...patch } : b)));`

If two field commits fire on the same bed in rapid succession (e.g. Tab key from Length to Width while React is between renders), both calls capture the same `beds` reference and the second overwrites the first patch.

Round-1 H2's `commitLen(raw, canonicalFt)` doesn't change this behaviour — it produces a deterministic value per call, but two adjacent updateBed calls in the same closure would still race.

In practice: blur-then-tab-blur events are sequential (the first `setBeds` schedules a re-render before the second fires), and React batches state updates within a single tick. So both `setBeds` calls see the same `beds` snapshot. The second call's `beds.map(...)` operates on the pre-first-update snapshot. **The first patch is lost.**

This is a real pre-existing bug, not introduced by round-1. Trigger requires unusually fast tab navigation between bed Fields. I have not observed it in normal user flows but it's the kind of bug that surfaces in support tickets six months in.

**Why it matters:** Latent. Report so it can be addressed when convenient.
**Fix:** Use functional updater:
```js
const updateBed = (id, patch) => setBeds((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
```

### [LOW] R2-L5 — vercel.json connect-src wildcard removal needs production smoke test
**File:** `vercel.json:11`
**What:** Round-1 L6 dropped `https://*.lemonsqueezy.com` from connect-src. Static analysis confirms no direct client-side fetch to LS subdomains. The risk is `lemon.js` (loaded as `<script>`) making internal XHR/fetch back to `assets.lemonsqueezy.com` for analytics, additional bundles, or telemetry. Most embed scripts use postMessage cross-frame and don't need connect-src for that. But there's no guarantee LS doesn't ship a release that does.

**Why it matters:** A live checkout flow that worked yesterday could silently break tomorrow if LS ships an SDK update that fetches an additional asset. Worst case: payment completes (the iframe uses `frame-src`), but the SDK's success-event callback fails because it tried to fetch a config from `assets.lemonsqueezy.com` and got CSP-blocked.
**Fix:** Either:
- (a) Smoke-test on production with browser DevTools open. Run a checkout to completion, watch the Console + Network tabs for any CSP violations, especially `Content Security Policy: ... refused to connect to https://*.lemonsqueezy.com/...`. If clean, leave as is. Document the production date.
- (b) Restore the wildcard until SDK behaviour is confirmed: `https://*.lemonsqueezy.com` back in connect-src.

I'd recommend (a) — the hardening is real and worth keeping if testable. But this should happen before the Reddit announcement window.

---

## Verified clean (round 2 specific)

The following surfaces were specifically re-verified in round 2 against the round-1 fix-patch:

- **H1 numeric format coverage** — guard works for 3dp metric (12.346), raw imperial (7.554321), integer-from-rounding. Confirmed via mental trace for all three.
- **H2 corruption recovery** — if LS contains `lengthFt: 8.0052493` (corrupt from a pre-fix session), no-edit blur returns canonical untouched (preserves precision); edit-blur correctly re-anchors to display value.
- **H3 routing order** — paywall mount effect's async closure runs AFTER the routing useEffect's mount-time hash read; the synthetic `replaceState` doesn't fire `hashchange`; routing useEffect's onPop handler is dormant until user-initiated navigation.
- **H4 colour match** — all four legal HTML files at `#7A6E5F`, identical to `T.tx3` in App.jsx.
- **M2 atMax simplification** — every Counter callsite passes explicit `max` (12 for family size, MAX_BEDS_PER_GROUP for bed qty); the new default 9999 is dormant defensive code.
- **M3 single source** — grep for `MAX_BEDS_PER_GROUP` returns exactly the constant declaration + 2 references (Counter + LS sanitizer).
- **M4 swap idempotence** — `if (min > max)` is before any hook (Rules of Hooks compliant), runs every render but only swaps when needed; useState initialiser uses `value`, not min/max.
- **M5 cancel-before-schedule** — handles rapid input correctly; cleanup-on-unmount cancels any in-flight frame; double-cancel is idempotent.
- **M7 instanceof** — all 14 callsites of `formatDate` pass real Date objects; the guard catches future refactor errors only.
- **M9 caption first-child** — HTML spec compliant; SR-only via srOnlyStyle.
- **M11 cancel re-open trace** — first-attempt cancel + re-open shows empty field; post-error cancel + re-open shows empty field; idempotent on already-empty parent prefill.
- **M12 abort cleanup** — `clearTimeout(timer)` runs in finally for both 200/400 success and abort/network error paths.
- **L4 Vite static-eval** — bundle confirmed contains literal `Date.now().toString(36)`, NOT a build-time-evaluated string.
- **L6 client-side LS fetch sweep** — only `/api/*` fetches in client code; no direct hits to `*.lemonsqueezy.com`.
- **Build sanity** — `npm run build` produces 387KB main bundle, 33 modules transformed, no errors or warnings.
- **No new TODOs/FIXMEs** introduced by the patch (one pre-existing `XXXX-XXXX...` placeholder text in license-key input).

---

End of round 2.
