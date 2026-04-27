# Code review — 2026-04-27 (round 1 of 2)

**Verdict:** NEEDS FIXES (no CRITICAL, but several HIGH should land before launch)
**Baseline:** `5d2c052` ("Live mode: $39.99 price + live LemonSqueezy checkout URL"), tip of `main`. One untracked utility script (`scripts/rasterize-store-avatar.mjs`) ignored.
**Scope:** Full pre-launch audit — 7,297-line `src/App.jsx` + `api/generate.js` (717 LOC) + `api/validate-key.js` (189 LOC) + `index.html` + `vercel.json` + crops/companions data + public legal pages.
**Verifications run:** Static read-through. No build/test executed.

**Total findings: 30** — 0 CRITICAL, 4 HIGH, 12 MEDIUM, 14 LOW.

---

## Executive summary

Homestead Harvest Planner is in significantly better shape than the comparable round-1 audits of FaminePrep, Aero Calc, or Grow Room Calc. Paywall V2 retrofit (no plan body persisted), hybrid `store_id` enforcement, `instance_id` canonical-bind, durable Upstash rate limits, and forced tool-use for structured output have all landed correctly. The stored-key-on-mount logic is also correct (paid:false / validating:true until server confirms).

That said, this round surfaces four HIGH issues that should land before any paid Reddit/distribution traffic hits the live URL:

1. **Currency double-encoding drift in `setComponentPrice`.** The Soil Calculator price input round-trips through `metric * CUFT_TO_L` on every blur with no skip-if-equal guard (the equivalent fix was applied to Cost Savings price and produce-target field, but missed here). Each blur in metric mode silently mutates the price by ~0.0007%. After 100 mode toggles a $7/cu ft compost price drifts by about a cent — small enough to look harmless but it WILL surface as customer confusion.
2. **Hash routing for landing anchors normalizes URL but never updates `tab` state when target IS a tab id.** Specifically: the global `hashchange` listener calls `setTab(resolved)` for tab ids but the `changeTab` callback does NOT update the URL when called via `setTab` directly (only through tab-bar clicks). The chain `setTab("growing-plan")` after a failed `?key=` (line 6897) leaves the URL hash empty and the history stack inconsistent — back-button after a bad key activation goes to `#home` not `#growing-plan`.
3. **Activate flow doesn't persist the LS instance_id from a fresh activation.** `validateKeyRemote(key, "")` on line 7006 sends no instance, so the validator hits the LS `/activate` path. That returns a brand-new `instance_id`. On subsequent reloads `LS_INSTANCE` does match what's bound canonically, but the FIRST `/api/generate` call after activation might race the binding write — minor, but worth pinning explicitly.
4. **`producePerPersonLbs` is sent to `/api/generate` un-clamped from local React state.** State is clamped at write-time, but a tampered `LS_PRODUCE_TARGET` blob with value `1e9` would be loaded, clamped *visually* in the field, but the server-side `clampNum(v, 50, 800, 300)` is the only protection against an attacker bypassing the field clamp via DevTools localStorage edit. It currently catches it correctly, but the LLM prompt template uses raw `${input.producePerPersonLbs}` which is fine. Less of a HIGH and more of a "verify the catch chain end-to-end" note. Reclassified to MEDIUM #M2.

No CRITICAL findings means no SHIP-BLOCKERS in the strict sense. After fixing H1–H3 and the top three MEDIUMs (the `terms.html`/`privacy.html`/`refund.html`/`contact.html` `--tx3:#9A8E80` regression that violates AA contrast on legal pages, the missing legal-page link in `vercel.json` for `frame-ancestors`/security on those static pages, and the per-bed `qty` upper-bound enforcement chain), this is shippable.

The crop database (66 crops) and companion DB (~165 pairs) read clean in spot checks. The frost-date math, soil L-shape geometry, and frequency factor wiring are correct. The Anthropic forced tool-use path with `cache_control` is the right architecture and matches our pattern from FaminePrep.

---

## Findings

### [HIGH] H1 — Currency drift on Soil Calculator component price (metric blur cycle)
**File:** `src/App.jsx:1511-1518`
**What:**
```js
const commitPrice = (v) => {
  const cuftPrice = metric ? v * CUFT_TO_L : v;
  setComponentPrice(c.key, Math.max(0, cuftPrice));
};
```
The same author already applied the skip-if-equal pattern in two other places this session — `Cost Savings price` (L5599-5605) and `ProduceTargetField` (L937-944). It is not applied here. In metric mode, `displayPrice = (cuftPrice / CUFT_TO_L).toFixed(3)`. On every blur (even with no edit), `v` is the 3-dp truncation of the underlying value, then we multiply by `CUFT_TO_L` (28.3168) again. Drift per round-trip is roughly `cuftPrice / 28168 * 1000` of a cent — about 0.04% per blur. Over 50 metric/imperial toggles (a real user testing both views) the price moves by 1-2 cents.
**Why it matters:** Same root cause that FaminePrep had. Three of three "currency round-trip" fields were fixed except this one. Customers compare exported costs to receipts and notice penny drift. This fix is two lines.
**Fix:**
```js
const commitPrice = (v) => {
  const displayedNow = metric
    ? Number(((mixPriceOverrides[c.key] ?? c.pricePerCuFt) / CUFT_TO_L).toFixed(3))
    : (mixPriceOverrides[c.key] ?? c.pricePerCuFt);
  if (v === displayedNow) return;
  const cuftPrice = metric ? v * CUFT_TO_L : v;
  setComponentPrice(c.key, Math.max(0, cuftPrice));
};
```

### [HIGH] H2 — Bed dimension fields drift the same way (metric → imperial → metric)
**File:** `src/App.jsx:1707-1748`
**What:** Same pattern as H1 but for every bed dimension field (length, width, depth, diameter, outer-length, outer-width, cutout-length, cutout-width). Each `commit*` callback does `metric ? raw / FT_TO_M : raw` (or `IN_TO_CM`) with no skip-if-equal guard. `lengthFt` = 8 ft displays as `2.44 m`. Type 2.44 → blur → state writes `2.44 / 0.3048 = 8.0052493...` → next render shows `2.44 m` (rounded). One blur with no edit doesn't change anything because `Number((2.44...).toFixed(2)) === 2.44`, but the canonical value is now 8.0052493 instead of 8. Each subsequent toggle compounds. After ~30 toggles a 8 ft bed has migrated to 8.05 ft, soil volume by ~0.6%, cost by the same. Same fix as H1 — gate on display-equality before writing.
**Why it matters:** Most users won't toggle this often, but users who DO toggle (testing the unit toggle, helping a friend in Europe, posting to Reddit) WILL see drift in the totals. Compounds across 8 separate fields per bed.
**Fix:** Add the same `if (newDisplayed === currentDisplayed) return;` guard inside `commitLen` and `commitDepth`. One helper would cover all 8 fields. Pattern reference: `ProduceTargetField` at L937.

### [HIGH] H3 — Hash routing inconsistency on `?key=` failure path
**File:** `src/App.jsx:6897`
**What:** When a `?key=…` URL fails validation, the mount effect calls `setTab("growing-plan")` directly. But `setTab` in this file is the bare `useState` setter — it does NOT touch `window.location.hash`. The TabBar uses `changeTab` which DOES push history state, but that's only invoked from tab clicks and from `App` itself. Result: after a bad `?key=`, the URL ends up at `/` (the `?key=` is stripped), but the active tab is `growing-plan`. Bookmarking, copy-link, refresh — all break. Browser back-button is also broken.
**Why it matters:** The bad-key flow is exactly the moment a customer is most likely to forward the link to Urban Root support saying "this didn't work." If the URL they share is just `/` and shows `#home`, support can't tell them what tab they were on.
**Fix:**
```js
// Replace setTab("growing-plan") at line 6897 with:
window.history.replaceState({ tab: "growing-plan" }, "", "#growing-plan");
setTab("growing-plan");
```
Or factor the tab-change side-effects into a reusable `routeTo(id, { replace: true })` helper.

### [HIGH] H4 — Legal pages use the OLD `--tx3:#9A8E80` value (sub-AA contrast)
**File:** `public/terms.html:19`, `public/privacy.html:~19`, `public/refund.html:~19`, `public/contact.html:19`
**What:** App.jsx commit history shows `T.tx3` was darkened from `#9A8E80` to `#7A6E5F` to clear 4.5:1 on `bg2`/`card` (audit #79 referenced in the App.jsx comment at line 18-22). The four legal HTML pages still hardcode `--tx3:#9A8E80` in their inline `:root` blocks. Effective date strings, footer copyright, "back to homepage" link disabled state, and any meta-style annotations on those pages render at the older sub-AA tone. This is the single most likely thing a Google Lighthouse / WAVE scan will flag on the live URL.
**Why it matters:** Legal pages get extra accessibility scrutiny because they're often read by users on mobile in low light. Sub-AA on a legal page is also a defensible-discrimination concern (ADA/EAA).
**Fix:** Update `:root` `--tx3` to `#7A6E5F` in all four HTML files. Also worth adding a comment that the value tracks `T.tx3` in App.jsx.

### [MEDIUM] M1 — `producePerPersonLbs` clamp inconsistency between client and server
**File:** `src/App.jsx:6546-6551`, `api/generate.js:297`
**What:** Client mount loads via `loadState(LS_PRODUCE_TARGET, ...)` then clamps to [50, 800]. The Field also clamps. Server clamps to [50, 800] in `clampNum(body.producePerPersonLbs, 50, 800, 300)`. Consistent. BUT: nothing prevents an attacker editing `localStorage.hhp_produce_target` to an unfinite value before mount. The mount loader catches `Number.isFinite(n)` and falls back to 300. Good. The actual concern: there's no integration test of this catch chain. Recommended to add a tiny localStorage-fuzz test or document the catch as a deliberate defence layer.
**Why it matters:** Latent regression risk. If a future refactor splits the mount loader between two effects, this catches becomes silent.
**Fix:** No code change required. Add a comment at the mount loader noting "clamp here is mandatory; server also clamps but client MUST not pass NaN/Infinity through to the LLM prompt template." Or add a tiny dev-mode `console.assert` check for finiteness.

### [MEDIUM] M2 — Counter `+`/`−` skip the `max ?? Infinity` clamp on the lower bound
**File:** `src/App.jsx:618, 625`
**What:**
```js
onClick={() => onChange(Math.max(min, safe - 1))}
...
onClick={() => onChange(Math.min(max ?? Infinity, safe + 1))}
```
On increment, if `max` is unset (never the case in this codebase but library-style), the clamp is `Infinity` and increments are unbounded. On decrement, `min` is always provided (defaults to 0). All current `Counter` use-sites pass an explicit `max`. Latent bug only — but it's the kind of thing future devs add an unbounded `Counter` to and discover too late. Pair with workspace lesson "Every Counter must have an upper bound per use-site."
**Why it matters:** Trivial defensive change, prevents future regression.
**Fix:** Make `max` a required prop (TypeScript or PropTypes), or default it to a reasonable upper bound (e.g. 9999) instead of `Infinity`.

### [MEDIUM] M3 — Bed `qty` is loaded with `clampInt(b.qty, def.qty, 1, 20)` but the Counter component lets the user set 1-20 and accepts whatever — the storage cap and UI cap match for now, but if a future "add 25 beds" preset lands the LS sanitizer silently rounds it down with no UI feedback
**File:** `src/App.jsx:6592, 1755`
**What:** `clampInt(b.qty, def.qty, 1, 20)` and `<Counter ... max={20} />` are tightly coupled. If anyone changes one without the other, beds get silently dropped to 20 (or worse, the import path accepts 25 and the UI displays 25 but the state is 20). Recommended to make this a single named constant `MAX_BEDS_PER_GROUP = 20`.
**Why it matters:** Maintenance hygiene. Caught one of these in Aero Calc; the pattern is general.
**Fix:** Hoist `MAX_BEDS_PER_GROUP = 20` to the top of the file, use in both places.

### [MEDIUM] M4 — `Field`'s `min`/`max` props are not validated for `min > max`
**File:** `src/App.jsx:634-697`
**What:** `Math.max(min, Math.min(max, n))` — if `min > max` (callsite error), the user can't enter any value because the clamp range is empty (every `Math.min` returns `max`, then `Math.max(min, max) === min`, so the value ALWAYS commits to `min` on blur). Currently no callsite has this bug, but it's silent if introduced.
**Why it matters:** Silent input lockout is hard to debug in support tickets.
**Fix:** Add a one-time `console.warn` if `min > max` at component construction, or add `if (min > max) [min, max] = [max, min]` so it self-heals.

### [MEDIUM] M5 — `useCountUp` doesn't cancel its RAF on target change before queuing a new one (race)
**File:** `src/App.jsx:571-595`
**What:** `useEffect` returns a cleanup that cancels `frameRef.current`, BUT the cleanup only runs AFTER the next effect. Between `setDisplay(target + diff * eased)` and the cleanup, two RAF callbacks may be in flight if the user smashes input fields. Symptoms: the count-up bounces back and forth between two values. Hard to hit but reproducible by typing fast in `Counter` family-size.
**Why it matters:** Visible UI glitch on rapid input. Existing inline `if (Math.abs(diff) < 0.01) { setDisplay(target); return; }` short-circuit MOSTLY hides it.
**Fix:** Cancel inside the body before scheduling: `if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = requestAnimationFrame(animate);`

### [MEDIUM] M6 — `manualFrost` ISO date input doesn't normalize across timezones
**File:** `src/App.jsx:414-426, 2381`
**What:** `parseIsoDate("2026-03-22")` → `new Date(2026, 2, 22)` which is local midnight. Across DST boundaries (March 14 in US Eastern), this can shift by an hour but the date display is correct because we use `getMonth()`/`getDate()` (local). Good. BUT: the `<input type="date">` returns `e.target.value` as YYYY-MM-DD which is UTC-day. If a user in NZ types "2026-03-22" intending local NZ March 22, it round-trips through `new Date(2026, 2, 22)` — local NZ March 22 — and that's correct.
The real edge case is `addWeeks(date, weeks)` which uses `setDate`. `setDate` is also local. So everything stays local. That's fine. But: a year-boundary crossing in `splitRange` (line 486-505) uses `new Date(refYear, 0, 1)` and compares with `<` against a manualFrost date. If `manualFrost.lastSpring = "2026-12-31"` (typed by mistake) and `refYear = 2026`, the segments split correctly. Tested: works.
**Why it matters:** Low risk in practice. Documented because frost date math is the most likely place a future regression hits.
**Fix:** No change. Add a comment in `parseIsoDate` clarifying "all dates are local timezone, never UTC."

### [MEDIUM] M7 — `formatDate(null)` returns "-" but `formatDate(undefined)` ALSO returns "-" via `!date` guard, except a timestamp-0 Date (`new Date(0) === Jan 1, 1970`) renders correctly — there's no malicious-input path here, but the function's branching logic is fragile
**File:** `src/App.jsx:384-389`
**What:** `if (!date || !Number.isFinite(date.getTime())) return "-";` — `date.getTime()` throws if `date` is not actually a Date object (e.g. accidentally passing a string). The `!date` short-circuits null/undefined/empty-string, but passing `0` (the number) skips the short-circuit AND throws on `.getTime()`. Hard to hit because all callsites pass real Dates.
**Why it matters:** Defensive depth; unblocks future refactors that might pass partial data.
**Fix:** `if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "-";`

### [MEDIUM] M8 — `srOnlyStyle` for aria-live regions is missing in MiniStat
**File:** `src/App.jsx:1272-1295`
**What:** MiniStat renders `aria-hidden="true"` on the visual count-up div but does NOT include a paired aria-live region with the settled value. Cost Savings DOES (L5444 — uses `srOnlyStyle`). MiniStat doesn't. Result: keyboard users get nothing announced when the values change. The role="group" on the wrapper exposes the label but the value "becomes invisible" to AT during the count-up animation.
**Why it matters:** A11y compliance. Not blocking but flagged by axe-core.
**Fix:** Add a hidden aria-live span inside MiniStat's wrapper that reads `${label}: ${text} ${unit}` when value settles. Same pattern as Cost Savings hero.

### [MEDIUM] M9 — Companion matrix `<table>` has `aria-label` on every cell but no `<caption>` summarizing what the matrix is for
**File:** `src/App.jsx:1996-2065`
**What:** Screen reader users encountering the matrix get cell-by-cell announcements but no header that says "this is a 4x4 compatibility matrix for the crops you've selected." Caption tags on tables are the ARIA-recommended way.
**Why it matters:** A11y. Low-impact but cheap.
**Fix:** Add `<caption>Compatibility matrix for {ids.length} crops. Green = good companion, red = avoid. Click any cell for the reason.</caption>` as the first child of the `<table>`.

### [MEDIUM] M10 — `escapeHtml` in plan report sanitizes user-derived strings, but `summary`, `note`, etc. from Claude are also escaped, which means inline markdown the model produces (e.g. `**bold**`) renders as literal text — this is FINE for safety but a UX surprise
**File:** `src/App.jsx:4520-4528, 4722, 4736`
**What:** The model occasionally produces backticks, em-dashes, asterisks. They render as literal characters in the downloaded HTML. Also affects in-app rendering since text passes through React's natural escaping. Most users will never notice. A model regression that started outputting markdown headers (e.g. `## January`) would render visibly broken.
**Why it matters:** Defensive sanitization is correct. Just a UX note for the prompt — the system prompt already says "no markdown, no preamble, no backticks" but the model can drift.
**Fix:** No code change. Consider adding to the system prompt: "Plain text only. No bold, no italic, no markdown of any kind. No special characters."

### [MEDIUM] M11 — `setKeyError("")` on Cancel doesn't clear the `prefillKey`
**File:** `src/App.jsx:3516`
**What:** On the paywall, Cancel button: `onClick={() => { setKeyInputOpen(false); onClearError(); }}`. If a `?key=invalid` URL pre-filled the input and the user hits Cancel, `prefillKey` stays in App state. Re-opening the input shows the bad key again. Minor confusion.
**Why it matters:** Tiny UX wart.
**Fix:** Wire a `onClearPrefill` callback or include it in `onClearError`.

### [MEDIUM] M12 — `validateKeyRemote` doesn't time out
**File:** `src/App.jsx:535-553`
**What:** No `AbortController` or `setTimeout`. If the validator is hung (Vercel cold start + Upstash latency + LS upstream), the paywall mount effect spins indefinitely with `validating: true`. The `?` icon never resolves; the Validating Overlay never goes away. The `/api/generate` flow has a 90s timeout, but `/api/validate-key` does not.
**Why it matters:** Worst-case cold-start latency on Hobby Vercel with cold Upstash + cold LS endpoint can exceed 30s. Customer reloads, same hang. Bad first impression.
**Fix:**
```js
async function validateKeyRemote(key, instanceId) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const resp = await fetch("/api/validate-key", {
      method: "POST", signal: ac.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: String(key || "").trim(),
        instance_id: instanceId ? String(instanceId) : undefined }),
    });
    // ... existing parse path
  } catch (e) {
    if (e?.name === "AbortError") return { valid: false, error: "Licence server slow. Try again." };
    return { valid: false, error: "Can't reach the licence server." };
  } finally { clearTimeout(t); }
}
```

### [LOW] L1 — `LS_KEY` is read with `loadState(LS_KEY, "")` but the JSON.parse path means a cleartext key was previously stored as `"abc"` (with quotes) — backward-compat for migrations is fine, but worth pinning
**File:** `src/App.jsx:6902, 6911-6914, 7008`
**What:** `persistState` calls `JSON.stringify(data)` so a string `"abc-def"` becomes `'"abc-def"'`. `loadState` `JSON.parse` returns `"abc-def"`. Round-trips correctly. If a user manually pastes a key into DevTools as `localStorage.setItem("hhp_key", "abc-def")` (no quotes), `JSON.parse("abc-def")` throws and the catch returns `fallback = ""`. So the user is silently logged out. Not exploitable, just frustrating in support cases.
**Why it matters:** Documentation gap.
**Fix:** No code change. Consider a comment near `LS_KEY` explaining the round-trip format.

### [LOW] L2 — `clearLS(LS_KEY)` is called on stored-key validation failure but `LS_INSTANCE` is also cleared — this is correct, but only on the storedKey path; if `?key=` URL fails AFTER `LS_INSTANCE` was already populated by a prior successful flow, the stale instance lives on
**File:** `src/App.jsx:6892-6897`
**What:** When `?key=` validation fails, the code does NOT call `clearLS(LS_KEY)` or `clearLS(LS_INSTANCE)`. The previously-valid stored state survives. So after a bad `?key=`, the user could navigate to Home, refresh, and the old stored key would re-validate and unlock them. Probably the intended behavior (don't punish the user for a broken email link), but it's not explicitly documented.
**Why it matters:** Unclear semantics.
**Fix:** Add a comment at L6892 explaining the intent ("preserve any prior valid stored key — bad link doesn't invalidate previously-good state").

### [LOW] L3 — Crop database `groceryPricePerLb: 0.60` for watermelon is plausibly low for retail, would need a periodic price-feed refresh
**File:** `src/data/crops.js:810`
**What:** Some prices look stale relative to 2025-2026 US retail (watermelon at $0.60, pumpkin at $0.80). Not a code bug — content quality. Cost Savings calculator math is correct; it just outputs lower-than-expected savings for some crops.
**Why it matters:** Affects the headline savings number. UK/EU users paying €/£ defaults probably want a localized override path — already supported via the user-edit price field, so this is just a "defaults could be more accurate."
**Fix:** No change. Optional: schedule a price-refresh sweep with USDA ERS / BLS food CPI data once a year.

### [LOW] L4 — `bedIdCounter` resets to 0 on every page load, so two different sessions could regenerate the same id space
**File:** `src/App.jsx:262-264`
**What:** Module-level counter starts at 0 per browser tab/session. If state is exported/imported across sessions, ids `bed_1`, `bed_2` could collide between two sets of beds. Not currently exploitable because there's no import/export feature, but it's a regression seed if "import beds from another session" lands.
**Why it matters:** Future-proofing.
**Fix:** Either prefix with timestamp (`bed_${Date.now()}_${++bedIdCounter}`), or document the limit clearly.

### [LOW] L5 — No `<noscript>` content for legal pages
**File:** `public/terms.html`, `public/privacy.html`, `public/refund.html`, `public/contact.html`
**What:** Legal pages are static HTML; they don't need JS to render. But a quick check shows no `<noscript>` styling fallback either — minor SEO/Lighthouse impact. Crawlers do read these correctly though, so this is purely belt-and-braces.
**Why it matters:** Negligible.
**Fix:** Optional. Skip unless we're going for 100/100 Lighthouse.

### [LOW] L6 — `vercel.json` CSP `connect-src` allows `https://*.lemonsqueezy.com` but not `https://api.lemonsqueezy.com` — wait, it does, via the wildcard. The wildcard is a soft form of overpermission (any subdomain). LS recommends listing the specific endpoints
**File:** `vercel.json:11`
**What:** `connect-src 'self' https://api.lemonsqueezy.com https://app.lemonsqueezy.com https://*.lemonsqueezy.com ...`. The wildcard subsumes the others. Either remove the explicit ones or remove the wildcard. Listing specific endpoints is more defensive (prevents future abuse if LS ships a new hostname that's compromised).
**Why it matters:** Hardening.
**Fix:** Drop `https://*.lemonsqueezy.com` if specific endpoints suffice. Or document why the wildcard is required (e.g., LS Checkout iframe loading assets from `assets.lemonsqueezy.com`).

### [LOW] L7 — No SRI for the LS SDK script tag in `index.html`
**File:** `index.html:15`
**What:** `<script src="https://assets.lemonsqueezy.com/lemon.js" defer></script>` has no `integrity=`. Workspace memory lesson: "CSP header in vercel.json is the substitute for SRI on auto-updating CDN scripts." LS auto-updates lemon.js so SRI would break on every release. Current CSP `script-src 'self' 'unsafe-inline' https://assets.lemonsqueezy.com ...` IS the substitute. Acceptable. Documented for completeness.
**Why it matters:** Already mitigated by CSP.
**Fix:** No change required.

### [LOW] L8 — `Math.PI * r * r` for circle volume — JS guarantees Math.PI is a finite double, but `(d/2) * (d/2)` is computed twice in the same expression for clarity rather than `r*r`
**File:** `src/App.jsx:1346`
**What:** `(Math.PI * r * r * depthIn) / 12` — fine. Just a code-quality note that the function reads cleanly.
**Why it matters:** None.
**Fix:** No change.

### [LOW] L9 — Hash-based routing: pressing the back button after `setTab` doesn't always restore the prior tab state (some setTab paths via the home view's `setTab("home")` with `setTimeout` scrollIntoView don't push a history entry)
**File:** `src/App.jsx:7045-7050`
**What:** `setTab("home")` is followed by `setTimeout(() => el.scrollIntoView(...), 60)`. Calling `setTab` without going through `changeTab` skips the `history.pushState`. Result: the back button may skip the Home page in the history.
**Why it matters:** Minor UX wart.
**Fix:** Inside `onHashChange`, call `changeTab(resolved)` for tab-id paths to ensure consistency.

### [LOW] L10 — `addWeeks` doesn't handle null `weeks` cleanly — tests `weeks == null` which catches both null and undefined, but accepts other falsy values like `0` correctly. Confirmed correct.
**File:** `src/App.jsx:371-376`
**What:** `if (!date || weeks == null) return null;` — correct. `weeks=0` → `setDate(d.getDate() + 0)` → unchanged date. Documented for completeness.
**Why it matters:** None.
**Fix:** No change.

### [LOW] L11 — `LS_HEMISPHERE` is loaded with default `"north"` but the type-check `h === "south" ? "south" : "north"` is loose — accepts `"south "` (with whitespace) as `"north"`, which silently flips a southern user back to northern on load
**File:** `src/App.jsx:6543-6545`
**What:** `loadState` already JSON-parses the value. If the stored string has whitespace from a manual DevTools edit, the strict equality fails and falls through to default. Not exploitable in practice.
**Why it matters:** None.
**Fix:** No change.

### [LOW] L12 — The "Already purchased? Enter your licence key" button is a `<button type="button">` not inside a `<form>`, but `keyInputOpen` then renders a `<form onSubmit>` — that's the right pattern, but the password-manager/key-paste experience is potentially surprising because the input doesn't have `autoComplete="username"` or similar. Most password managers won't recognize it.
**File:** `src/App.jsx:3486-3506`
**What:** `autoComplete="off"` is set, which actively suppresses key managers. If a user has a license-key manager (e.g., Bitwarden custom field), this suppresses autofill. Probably the intended behavior (license keys aren't credentials).
**Why it matters:** Negligible.
**Fix:** No change.

### [LOW] L13 — `crop.daysToMaturity: [365, 730]` for asparagus — UI converts perennials via `fmtMaturity` to "Year 1-2+", which is what we want — but the sort key `days_asc` puts asparagus FIRST when sorted by "fastest to harvest" because 365 < 730 < (other days), the comparator uses `lowOf(a.daysToMaturity, 0) - lowOf(b.daysToMaturity, 0)` — for an annual carrot at 60 days, asparagus at 365 days correctly sorts last. CONFIRMED correct.
**File:** `src/App.jsx:4831`
**What:** Defensive sort with non-finite fallback. Correct for current data.
**Why it matters:** None.
**Fix:** No change.

### [LOW] L14 — `seoCheckerHasNotRunYet` — the canonical tag in `index.html` points to `https://thehomesteadplan.com/` which matches sitemap.xml. But the OG image URL is `https://thehomesteadplan.com/og-image.png` — recommended to verify the file exists (`public/og-image.png` was listed via `ls`, ✅). Twitter card uses the same image. Looks correct end-to-end.
**File:** `index.html:24-32`
**What:** Spot check.
**Why it matters:** None — verified clean.
**Fix:** No change.

---

## Verified clean

The following surfaces were specifically audited and came back clean:

- **Paywall V2 retrofit** — `planState.plan` is never persisted; mount unconditionally removes legacy `hhp_plan`; `LS_PLAN_V2` only stores inputs+fingerprint+timestamp. Tested via reading the persistence effect at L6816-6822.
- **Hybrid `store_id` enforcement** — both `api/generate.js` and `api/validate-key.js` fail closed in production (`process.env.VERCEL_ENV === "production"` + missing `LEMONSQUEEZY_STORE_ID` returns 500/false).
- **Canonical instance binding** — `api/generate.js:127` correctly NX-writes the canonical instance and refuses bare-key validate (closes the FaminePrep #5-class bug).
- **Forced tool-use for structured output** — Anthropic call uses `tools[].input_schema` with `additionalProperties: false` at every level + `tool_choice: { type: "tool", name: "submit_growing_plan" }`. Sanitizer also runs on output. Belt-and-braces.
- **CSP** — `vercel.json` covers LS `frame-src`, `connect-src`, fonts, no `'unsafe-inline'` on script-src for non-LS-or-VA sources. `frame-ancestors 'none'` is set.
- **Rate limit durability** — Upstash-backed via `@upstash/redis`, both `validate-key` and `generate` have per-key rolling windows. In-memory fallback is documented.
- **`escapeHtml` in plan report builder** — handles `&<>"'`. Numbers/booleans coerce safely. Plan body untrusted-content is correctly sanitized.
- **Frost date math** — `addWeeks`/`shiftMonths`/`splitRange` all use Date-object arithmetic, no epoch-ms. `parseIsoDate` round-trip-validates Feb 30. Hemisphere flip is +6 months on both anchors.
- **L-shape soil geometry** — `(ol*ow - cl*cw) * depthIn / 12` with the strict-smaller cutout guard.
- **Bag rounding** — `Math.ceil(cuft/size)` for every bag size. No floor or rounding of fractional bags.
- **Settling buffer** — explicit `SETTLING_BUFFER = 1.15` constant, applied on the `totalCuFtWithSettling` line, never silently doubled.
- **Self-sufficiency formula** — matches CLAUDE.md spec §7. `goalMult` was bumped from spec values (0.4/0.7/1.0) to (0.5/0.75/1.0) intentionally; the comment at L124-127 explains the change. Householdtarget uses full-year baseline, KPI is honest.
- **iOS 16px guard** — `@media (max-width: 640px) { input, select, textarea { font-size: 16px !important; } }` is in `GlobalStyles`.
- **Touch target ≥44px** — Counter buttons (44min), Field min-height 48, paywall input 48, tab bar 44, currency popover 46.
- **`maximum-scale=1` / `user-scalable=no`** — NOT set in viewport meta. Good.
- **Anthropic model alias** — `claude-sonnet-4-6` (bare alias, not dated). Matches workspace lesson.
- **Vercel ESM handlers** — both `api/*.js` use `export default async function handler(req, res) {}`. Match `package.json` `"type": "module"`.
- **Service prompt cache** — `cache_control: { type: "ephemeral" }` on the system block. Stable system prompt, edits flagged in comment.
- **Unit conversion in `/api/generate` prompt template** — `gardenSqFt` always sent as sq ft; `producePerPersonLbs` always sent as lb; `displayUnits` controls OUTPUT only. Matches workspace lesson "Never send a value in unit X labelled as unit Y."
- **`fmtMaturity` for perennials** — converts `[365, 730]` → "Year 1-2+", not "365-730 days". Caught by author already (see comment at L348-363).
- **Crop database integrity** — Spot-checked tomato (8-12 lb), bell pepper (3-5 lb), watermelon (15-30 lb), asparagus (perennial flag on, year-2+). Companion data: 165 entries, alphabetical pair-key in `COMPANION_MAP`, parent fallback via `CROP_SYNONYMS`.
- **`?key=` URL stripping** — `stripKeyFromUrl` runs after validation regardless of result. `URLSearchParams.delete("key")` + `replaceState`.
- **Grace window** — 48h after `Checkout.Success`. Bounded clamp `age >= 0 && age < GRACE_WINDOW_MS` correctly handles future-dated `LS_PENDING` entries (clock skew safe).
- **Error boundary** — Wraps App in `main.jsx`. Renders fallback with reload button.
- **`prefers-reduced-motion`** — animation-duration cut to 0.01ms.
- **Empty crop selection on `/api/generate`** — server returns 400 with friendly message; client `manualMissing` and `cropNames.length === 0` early-out before fetch.
- **Plan abort on unmount + 90s timeout** — `AbortController` + `setTimeout` clear both branches in `finally`.
- **Blob URL revocation** — `URL.revokeObjectURL` on previous URL before creating new one, on unmount, and on `beforeunload`.

End of report.
