# Code review — 2026-06-10

**Verdict:** NEEDS FIXES (1 CRITICAL / 2 HIGH before next deploy)
**Fix status (2026-06-10, branch `session-7-blog-about`):** ALL 19 FINDINGS FIXED. `npm run build` clean after every fix group (final 393.21 kB / 111.15 kB gz); SSR probe clean (renderToString 50.6 kB, no crashes). NOT pushed, NOT merged.

| Finding | Status | Commit |
|---|---|---|
| C1 transient de-license + slot burn | FIXED — `validateKeyRemote` gates definitive on HTTP-200 + boolean `valid`; non-200/malformed/network/timeout return `transient:true`; mount wipe only on definitive rejection, transient keeps key + surfaces non-destructive paywall note | `cac97b0` |
| H1 frostDates crash loop | FIXED — `manualMissing` derives from `!frostDates` (catches invalid dates too), derefs optional-chained, fallback UI renders; messages say "blank or invalid" | `64f0ac0` |
| H2 activate-first slot burn | FIXED — non-mutating bare-key `LS_VALIDATE` pre-check + fail-closed store compare BEFORE `LS_ACTIVATE` (FaminePrep pattern); post-activate check kept as defence-in-depth | `e1400c4` |
| M1 fail-open `meta.store_id != null` | FIXED — guard dropped in BOTH api files; missing store_id now rejects; env-var hybrid (warn-and-skip preview/dev) preserved | `e1400c4` |
| M2 Zone 7 article vs app frost dates | FIXED — article re-anchored to Mar 22 / Nov 5 (`ZONE_FROST_DATES[7]`), full calendar recalculated against the app's per-crop offsets, ~32 weeks, hedging strengthened, explicit calculator pointer | `25b3019` |
| M3 tomato table breaks 5 lb/qt rule | FIXED — 4 paste = ~5 qt, 10 paste = ~12 qt, full row ~28 qt; TLDR aligned; 25-qt pantry stated as ~21 paste plants | `25b3019` |
| M4 goal not persisted | FIXED — `LS_GOAL` (`hhp_goal`), persist-on-change + allowlist clamp vs `GOAL_MULTIPLIER` (hemisphere pattern) | `198bd90` |
| M5 CSP `'unsafe-inline'` script-src | FIXED — contact.html IIFE externalized to `/contact-copy.js`, `'unsafe-inline'` dropped from script-src only (style-src kept, no trusted-types). **Live-Buy verification still required before deploy** | `004211a` |
| L1 report missing invalid-month guard | FIXED — report harvest builder mirrors PlanHarvestChart filter + end/peak softening; section hides when no rows survive | `553d799` |
| L2 filename uses today, UTC | FIXED — filename from `generatedAt` (now() fallback), local date parts | `553d799` |
| L3 dead `sanitisePlanShape` | FIXED — ~80 LOC deleted (zero references verified), tombstone comment left, CURRENCY_SYMBOLS comment updated | `553d799` |
| L4 no `stop_reason` check | FIXED — `stop_reason === "max_tokens"` → distinct 502 "try fewer crops"; MAX_TOKENS unchanged | `553d799` |
| L5 102 em dashes | FIXED — all removed across about + 6 blog pages (commas/periods/colons/parens; titles use hyphen separator) | `25b3019` |
| L6 potato 600 cal/lb | FIXED — ~350 cal/lb (77 kcal/100 g cited), 52,000 cal ≈ a month of one person's intake | `25b3019` |
| L7 28 px header links | FIXED — mobile `padding: 14px 6px` + inline-flex centering ⇒ ≥44 px; desktop unchanged | `25b3019` |
| L8 stale favicon rewrite | FIXED — rewrites block removed from vercel.json | `004211a` |
| L9 sitemap hash fragments | FIXED — 7 fragment URLs removed; 12 real pages remain | `25b3019` |
| L10 blog copy nits | FIXED — index card says USD only; tomato areas use per-type spacing (64 / 120 sq ft); about footer links /blog/; © year dropped on the 7 new static pages; sage entry notes the in-app checker scores it neutral | `25b3019` |
| L11 grace-window 401 UX | FIXED — paid-without-key renders "Payment received. One step left" panel (check email / paste key inline via the paywall's activateKey flow); generate() guard prevents the doomed request | `09e24f0` |
**Baseline:** branch `session-7-blog-about` @ `b888bb4` (= live `bcf0a15` + `849ab1e` blog/about/nav/vite + docs commit)
**Scope:** Full tree, with focus on (a) the never-reviewed `849ab1e` blog/about/nav/vite-middleware work, (b) cross-product bug families found in Aero-Calc (2026-06-09) and FaminePrep (2026-06-10) AFTER this product's last convergence audits, (c) regressions since the 2026-05-06/05-18 convergence certs.
**Verifications run:** `npm run build` clean (390.15 kB raw / 110.38 kB gz, 33 modules). SSR probe (`vite build --ssr src/App.jsx` + `renderToString`) renders 50.5 kB of HTML with zero crashes on the default path. Data-file counts executed in node (82 crops / 230 pairings — matches all static-page claims). Blog math tables hand-verified against the calculator formulas.

---

## Executive summary

The core product remains in the hardened state the 2026-05 convergence audits left it in — the calculators, report builder, paywall render gates, prompt-injection defences, and the new vite middleware all came back clean. But two cross-product bug families discovered in sibling products AFTER those audits are live here, and one of them is the worst class we track: **a paying customer on flaky wifi, a rate-limited IP, or a transient LemonSqueezy/Upstash failure gets silently de-licensed at mount** — the stored key and instance are wiped from localStorage, and each re-activation burns one of their 3 LemonSqueezy device slots. Three bad launches and the customer is permanently locked out and emailing support. This is FaminePrep's C1, confirmed line-for-line in Homestead (`validateKeyRemote` never inspects HTTP status; the mount effect wipes on any `valid:false`).

Separately, a **hard crash loop** exists for paid users: opening the Growing Plan tab while Planting Dates is in manual mode with incomplete dates null-derefs `frostDates.lastSpring`, the app-wide ErrorBoundary swallows the whole app, and because both the `#growing-plan` hash and the broken `plantingState` persist, the advertised "Reload" recovery re-crashes forever. The wrong-store activation slot-burn (Homestead is the last unfixed product in the family) and the fail-open `meta.store_id != null` guards in both API files round out the must-fix list.

The new `849ab1e` work is structurally sound — correct canonicals on every page, zero references to the never-owned homesteadharvestplanner.com, sitemap matches files 1:1, the dev-middleware traversal guard holds on Windows and POSIX, no inline scripts or handlers added (CSP tightening remains one contact.html refactor away). The findings against it are content-level: the Zone 7 article contradicts the app's own frost dates by 3+ weeks, the tomato article's quick-reference table breaks its own 5 lb/quart sauce rule, and there are 102 em dashes across the new pages against a standing style rule.

---

## Findings

### [CRITICAL] C1 — Transient validate failures de-license paying customers and burn activation slots

**File:** `src/App.jsx:566-604` (`validateKeyRemote`), `src/App.jsx:7123-7136` (mount wipe), `api/validate-key.js:139-165, 180-182, 246-252` (non-200 responses carry `valid:false` bodies)
**What:** `validateKeyRemote` returns `resp.json()` verbatim without ever checking `resp.ok` / `resp.status`. The server returns `{ valid: false, ... }` bodies for **429 per-IP rate limit** (10/10 min — mount revalidation counts against it), **429 per-licence limit** (50/h shared across all of a customer's devices), **502 "Licence server unreachable"** (LS down or its 8 s timeout fired), **500 server error**, and **403 origin**. Fetch-level network failure and the 15 s AbortError also resolve to `{ valid: false }`. The mount effect (step 2, stored-key path) treats every one of these identically to a definitive rejection: `clearLS(LS_KEY); clearLS(LS_INSTANCE);` — the licence is gone from the device.
**Why it matters:** Reproducible 100% by launching the app offline (airplane, dead spot, captive portal): the paying customer lands on the paywall with no key stored. To recover they must find the licence email and re-paste — and because `LS_INSTANCE` was also wiped, `activateKey(key, "")` triggers a fresh LS **activate**, consuming one of the 3 device slots. Three transient failures → activation limit reached → customer locked out of re-activating entirely. CGNAT/shared-IP users can hit the 10/10 min bucket through no fault of their own. This is FaminePrep's CRITICAL (#C1 family, fixed there in `bc54755`); Homestead has the identical shape plus the slot-burn amplifier.
**Fix:**
1. In `validateKeyRemote`, capture `resp.status`. Only treat the response as **definitive** when `resp.status === 200`. For 429/5xx/403/network/timeout return `{ valid: false, transient: true, error }`.
2. In the mount effect stored-key branch: wipe `LS_KEY`/`LS_INSTANCE` **only when the failure is definitive** (HTTP-200 `valid:false`). On transient failure, keep the stored key (paid stays `false` for the session, or optionally fail-open the render gate — `/api/generate` revalidates server-side anyway, and the static paid tabs ship in the bundle regardless).
3. Optional hardening: have `api/validate-key.js` include `transient: true` on its 429/502/500 bodies so the client doesn't have to infer from status.

### [HIGH] H1 — Growing Plan tab null-derefs `frostDates` → whole-app crash loop for paid users

**File:** `src/App.jsx:3962-3971` (deref), `src/App.jsx:422-438` (`getFrostDates` returns null), `src/main.jsx:6-43` (app-wide ErrorBoundary)
**What:** `getFrostDates(mode, …)` returns `null` when `mode === "manual"` and either frost date is missing or invalid (`parseIsoDate` rejects). `GrowingPlanTab` computes `frostDates` unconditionally and immediately reads `frostDates.lastSpring` (3967) and `frostDates.firstFall` (3970) with **no null guard and no optional chaining**. The `manualMissing` flag (3938) was added to block *generation* in this exact state, but the render crashes before that UI is ever reached. Worse, `manualMissing` only checks string presence — an invalid date like `2026-02-30` passes the flag but still nulls `frostDates`.
**Repro:** Paid user → Planting Dates → switch to "Enter frost dates" (fields start empty; state persists to `hhp_planting` instantly) → click Growing Plan tab → `TypeError: Cannot read properties of null (reading 'lastSpring')`. The ErrorBoundary in main.jsx wraps the **entire app**, so everything dies. The boundary's "Reload" button re-crashes: the URL hash is `#growing-plan` and the broken plantingState is persisted, so mount → validate → render → crash, forever. Recovery requires hand-editing the URL or clearing localStorage.
**Why it matters:** Two clicks put a paying customer into a permanent crash loop on the flagship paid feature. Manual frost mode is the documented path for every non-US customer (UK/EU/AU/ZA — explicitly marketed in the FAQ).
**Fix:** Guard the deref: `const lastSpringFrostStr = frostDates?.lastSpring ? formatDate(...) : "";` (same for `firstFall`), and base `manualMissing` on `!frostDates` in manual mode rather than raw string presence so invalid dates are also caught. Two-line change; also consider a per-tab error boundary as belt-and-braces.

### [HIGH] H2 — Wrong-store licence key burns an activation slot before the store check runs

**File:** `api/validate-key.js:167-176` (activate-first), `api/validate-key.js:224-234` (store check after)
**What:** When the client activates a key (no `instance_id`), the handler calls `LS_ACTIVATE` immediately. LemonSqueezy consumes one of that key's activation slots **on the activate call**. Only afterwards does the handler check `meta.store_id` and reject with "This licence key is for a different product." There is no validate-before-activate pre-check.
**Why it matters:** Urban Root sells five visually similar calculators. A customer pasting their Aero-Calc or FaminePrep key into Homestead by mistake gets the correct rejection — but permanently loses one of that *other* product's 3 device slots per attempt. Three honest mistakes destroy a sibling product's licence. This family was fixed in Vertica, Grow Room, Aero-Calc, and FaminePrep (workspace memory `feedback_paywall_storeid_hardening.md` — "Homestead PENDING"); this audit confirms Homestead is the last unfixed product.
**Fix:** In the no-instance branch, first call `LS_VALIDATE` with the bare key (bare-key validate is free and returns `meta.store_id`). Reject on error/store-mismatch **before** calling `LS_ACTIVATE`. (The hhp `/api/generate` bare-key refusal is its own instance-binding gate and is unaffected.)

### [MEDIUM] M1 — Fail-open `meta.store_id != null` guard in BOTH serverless functions

**File:** `api/validate-key.js:232`, `api/generate.js:271`
**What:** `if (expectedStoreId && meta.store_id != null && String(meta.store_id) !== String(expectedStoreId))` — when LemonSqueezy's response omits `meta.store_id` (API change, partial response, unexpected shape), the check is silently skipped and the key validates. The env-var side is correctly fail-closed in production; the response side is fail-open.
**Why it matters:** Not attacker-forcible today (LS always returns `meta` for real keys), but it's a defence-in-depth weakening and a cross-product policy violation — all four sibling products were converted to fail-closed in the 2026-06 hardening pass. A future LS API change would silently disable the store gate on both endpoints, including the one protecting Anthropic spend.
**Fix:** In production, treat missing `meta.store_id` as a validation failure (mirror the env-var hybrid: warn-and-skip in preview/dev, refuse in prod).

### [MEDIUM] M2 — Zone 7 blog article contradicts the app's own Zone 7 frost dates

**File:** `public/blog/usda-zone-7-vegetable-planting-calendar.html:136, 141, 170, 214` vs `src/App.jsx:303` (`ZONE_FROST_DATES[7]`)
**What:** The article anchors the entire calendar on "last spring frost around **April 15**" / "first fall frost around **October 15**" (~26 frost-free weeks). The calculator ships `7: { lastSpring: Mar 22, firstFall: Nov 5 }` (~32 frost-free weeks) — and prints those dates in the zone picker (`Zone 7: last frost Mar 22, first frost Nov 5`).
**Why it matters:** This article exists to capture "zone 7 planting calendar" search intent and funnel readers into the Planting Dates calculator (it has a CTA box doing exactly that). The reader lands in the app and the product disagrees with the article that brought them by 3+ weeks on the single number the page is about. The 2026-05-18 engineering-verifier signed off the *app* dates; the article was written the same day and never cross-checked. Same class as Vertica M2 (calculator contradicting its own examples).
**Fix:** Align the article to the app (Mar 22 / Nov 5, adjusting the "26 weeks" arithmetic and the April/October week callouts), or soften to "typical published Zone 7 range is late March–mid April; this calendar uses April 15 as the conservative anchor — the in-app calculator uses the median Mar 22" with an explicit pointer. Pick one source of truth.

### [MEDIUM] M3 — Tomato article's quick-reference table breaks its own sauce math

**File:** `public/blog/how-many-tomato-plants-family-of-4.html:194-199 (TLDR), 231 (5 lb/quart rule), 238 (8 paste ≈ 10 qt), 271-279 (quick-ref table)`
**What:** The article establishes 1 quart of sauce ≈ 5 lb of paste tomatoes and demonstrates "8 paste plants × 6 lb = 48 lb → roughly 10 quarts." The quick-reference table then labels **4 paste plants** as "Fresh + 10 qt sauce" (4×6=24 lb → ~5 qt by its own rule) and **10 paste plants** as "Fresh + 25 qt sauce" (10×6=60 lb → ~12 qt). Both rows understate paste plants ~2×. The TLDR repeats the 14-plant/4-paste configuration for "a freezer of sauce." (Secondary nit: the table's bed areas use a flat 4 sq ft/plant while the article's own spacing table gives paste 3 sq ft.)
**Why it matters:** The article's whole pitch — and the brand's — is "the real math." A reader who checks the arithmetic (this audience does) finds the headline table contradicting the body two scrolls up. It also feeds mistrust of the calculator the article funnels into.
**Fix:** Either relabel the rows (4 paste → "~5 qt", 10 paste → "~12 qt") or fix the plant counts (10 qt → 8 paste; 25 qt → 20-21 paste, matching the body's own "sauce yield is the bottleneck" point).

### [MEDIUM] M4 — Self-Sufficiency `goal` is the only calculator input that doesn't persist

**File:** `src/App.jsx:6759` (`useState("fresh_preserving")`, no LS key), persistence block `:7002-7014`
**What:** familySize, crop selection + frequencies, produce target, metric, currency, hemisphere, beds, soil, planting state, and all paid-tab state persist to localStorage. The goal level (0.5× / 0.75× / 1.0× demand multiplier) silently resets to "Fresh + some preserving" on every reload.
**Why it matters:** A user who selects "Full year self-sufficiency," tunes their plan, and returns tomorrow sees every plant count, space figure, and the hero KPI shrink by 25% with no signal why — the inputs they remember setting all look intact. It also desynchronizes the Cost Savings and Preservation paid tabs (both derive from `baseResults`) and the `gardenSqFt` sent to `/api/generate`. This contradicts the product promise that "your data lives in your browser."
**Fix:** Add `LS_GOAL` (`hhp_goal`), persist on change, restore with an allowlist clamp against `GOAL_MULTIPLIER` keys — same pattern as `hemisphere`.

### [MEDIUM] M5 — CSP `script-src` still carries `'unsafe-inline'`; exactly one inline script remains

**File:** `vercel.json:34`, `public/contact.html:213-236`
**What:** Audited every served HTML page: `index.html` has only `application/ld+json` blocks (not executable, not blocked by CSP) plus the external module script; the five new blog pages and about.html have **zero** inline scripts and zero inline event handlers; the report HTML's inline script is a downloaded file, outside the site CSP. The only executable inline script on the whole origin is contact.html's click-to-copy IIFE.
**Why it matters:** `'unsafe-inline'` neutralizes most of the CSP's XSS value — any markup injection anywhere becomes script execution. This was the standing M3 deferral ("nonce-based migration, post-launch hygiene"), but the audit shows nonces are unnecessary: externalize one 24-line script (e.g. `/contact-copy.js` under `script-src 'self'`) and `'unsafe-inline'` can be dropped. FaminePrep shipped exactly this with zero inline scripts. The new blog/about work added no blockers — good.
**Fix:** Move the contact.html script to a same-origin file, drop `'unsafe-inline'` from `script-src`, then run the mandatory Live-Buy verification (lemon.js overlay must still Setup() — keep `'unsafe-inline'` in `style-src`, do NOT add `require-trusted-types-for`, per `feedback_csp_trusted_types_ls.md`).

### [LOW] L1 — Report harvest-timeline builder lacks the invalid-month guard the UI renderer has

**File:** `src/App.jsx:4784-4796` (report) vs `src/App.jsx:4615-4625` (UI, audit #13 fix)
**What:** `PlanHarvestChart` drops rows whose `startMonth` isn't a canonical month (`startIdx >= 0`) and softens `endIdx/peakIdx` of -1. `buildPlanReportHtml`'s `harvestHtml` computes the same indices with no filter: a non-canonical `startMonth` gives `startIdx = -1` → segment `[-1, 11]` → all 12 cells render "on" — a phantom full-year harvest bar in the downloaded report for a row the on-screen UI hid. Only reachable if the schema enum fails (the tool-use schema constrains months), but the UI author considered that worth guarding; the report should match.
**Fix:** Apply the same `startIdx >= 0` filter + `-1` softening before building cells.

### [LOW] L2 — Download filename uses today's date instead of the plan's `generatedAt`

**File:** `src/App.jsx:4157`
**What:** `a.download = \`The-Homestead-Plan-${new Date().toISOString().slice(0, 10)}.html\`` while the report header/title correctly use `generatedAt`. Download a Monday plan on Wednesday and the filename says Wednesday. Same family as FaminePrep's report-date finding. (Also a UTC date — for UTC+2 users near midnight even "today" is off by one.)
**Fix:** Derive the filename date from `generatedAt` (fall back to now), formatted via local date parts.

### [LOW] L3 — `sanitisePlanShape` is dead code (~62 LOC)

**File:** `src/App.jsx:3803-3883`
**What:** Defined "for re-hydrating a cached plan from localStorage" — but the V2 paywall design never restores a plan body, and nothing calls it (grep: definition + one comment reference only). It duplicates the server's `sanitisePlan` and its `_str/_strArr/_num` helpers, inviting drift.
**Fix:** Delete it (and helpers if unused elsewhere), or wire it where a plan body could ever re-enter client state. Keep the anti-regression comment.

### [LOW] L4 — No `stop_reason` check on the Anthropic response; truncated plans can render as complete

**File:** `api/generate.js:41 (MAX_TOKENS 4096), 779-792`
**What:** With forced tool-use, hitting `max_tokens` mid-JSON yields a truncated/partial tool input and `data.stop_reason === "max_tokens"`. The handler checks for the tool block and that `monthlySchedule.length > 0`, but a plan cut off after month 8 (losing preservation/savings/tips) passes both checks and renders as a complete plan. 4096 tokens is adequate for typical plans but tight for 30+ crop selections with 12×12 task grids.
**Fix:** If `data.stop_reason === "max_tokens"`, return 502 with "Plan was too large — try fewer crops" (or retry with a trimmed prompt). Optionally raise MAX_TOKENS toward 6-8k; cost ceiling is bounded by output actually generated.

### [LOW] L5 — 102 em dashes across the new about/blog pages (standing style rule)

**File:** `public/about.html` (9), `blog/companion-planting-for-tomatoes.html` (27), `blog/usda-zone-7-vegetable-planting-calendar.html` (24), `blog/how-many-tomato-plants-family-of-4.html` (16), `blog/how-much-soil-for-4x8-raised-bed.html` (13), `blog/feed-family-from-backyard-garden.html` (12), `blog/index.html` (1)
**What:** Grant's documented style rule (design preferences: "no em dashes, anti-AI-slop") is violated 102 times in the new copy. The articles otherwise avoid the worst LLM tells (no "delve", no triadic flourishes, sourced claims), but the em-dash density is itself the most recognizable tell.
**Fix:** Editorial pass replacing em dashes with periods, commas, or parentheses.

### [LOW] L6 — Feed-family article's potato calorie figure contradicts the product's own database

**File:** `public/blog/feed-family-from-backyard-garden.html:236` vs `src/data/crops.js:435`
**What:** Article: "150 lb at ~600 calories per lb — 90,000 calories per 100 sq ft." The database (and USDA) put potatoes at 77 kcal/100 g ≈ **350 cal/lb**; 150 lb ≈ 52,000 cal ≈ 26 person-days, not 45. The brand's About page promises "every yield you see is traceable."
**Fix:** Correct to ~350 cal/lb and recompute (or switch the example to a crop where 600 holds, e.g. dry beans).

### [LOW] L7 — New header About/Blog links are ~28 px tall on mobile (44 px rule)

**File:** `src/App.jsx:6282-6301` (new in 849ab1e)
**What:** The secondary nav anchors use `fontSize: 13, padding: "6px 2px"` → ≈28 px tap height. Every other interactive element in the app holds the ≥44 px touch-target rule (Counter, pills, tab bar at 40-44+).
**Fix:** `padding: "12px 6px"` or `minHeight: 44` + `display: inline-flex; align-items: center`.

### [LOW] L8 — Stale `/favicon.ico → /favicon.svg` rewrite in vercel.json

**File:** `vercel.json:21`, `public/favicon.ico` (added in `bcf0a15`)
**What:** A real multi-res `favicon.ico` now exists; Vercel serves filesystem matches before rewrites, so the rewrite is dead config. Harmless, but it documents behavior that no longer happens and would silently reactivate (serving an SVG as `image/x-icon`) if the .ico were ever deleted.
**Fix:** Delete the rewrite block.

### [LOW] L9 — Sitemap carries 7 hash-fragment URLs Google ignores (pre-existing)

**File:** `public/sitemap.xml:9-50`
**What:** `/#self-sufficiency`, `/#soil`, `/#features`, etc. Fragments are stripped by crawlers; all seven dedupe to `/`. Not harmful, just noise — and they dilute the signal of the 11 real URLs. Pre-existing; noted because the file was touched in 849ab1e (`lastmod` was added, closing old M3-SEO).
**Fix:** Remove the fragment entries when next editing the sitemap.

### [LOW] L10 — Blog copy nits (consistency bundle)

**File:** `public/blog/index.html:217`, `public/blog/how-much-soil-for-4x8-raised-bed.html`, `public/blog/how-many-tomato-plants-family-of-4.html:239,272-279`, `public/about.html`
**What:** (a) Blog index card promises soil cost "in USD and GBP"; the article is USD-only. (b) Tomato article computes "18 plants, ~72 sq ft" and table areas at a flat 4 sq ft/plant while its own spacing table gives paste 3 sq ft (conservative direction, but internally inconsistent). (c) about.html links to home/contact/legal but not to `/blog/` (blog pages all link to About — asymmetric). (d) Static pages hardcode "© 2026" (app footer is dynamic) — will need a yearly touch. (e) The article lists sage as a tomato companion; the in-app checker has no tomato-sage pairing (renders neutral) — defensible ("blank = neutral") but a reader cross-checking will notice.
**Fix:** One copy pass.

### [LOW] L11 — Grace-window customers get a misleading error from Generate

**File:** `src/App.jsx:7142-7149` (grace sets paid without key), `api/generate.js:670-672`, `src/App.jsx:4068-4099`
**What:** During the 48 h post-checkout grace window the user is `paid` but has no stored key. The Generate button is fully enabled; clicking it always 401s with "Your licence couldn't be verified. Please re-enter your key on the home page" — but they don't have a key to re-enter yet (it's in the email). By-design server behavior (bare-key refusal is the device-cap gate); the client messaging is the gap, minutes after the customer paid $39.99.
**Fix:** When `paid && !loadState(LS_KEY)`, render the Generate area in a "check your email for your licence key, then paste it here" state instead of firing a doomed request.

---

## Priority-check families — explicit verdicts

| # | Family (source product) | Verdict |
|---|---|---|
| 1a | store_id pre-check before activate burns a slot | **FAIL — H2** (no validate-first; Homestead is the last unfixed product) |
| 1b | No fail-OPEN `meta.store_id != null` guard | **FAIL — M1** (present in both API files) |
| 1c | Every gate site checked incl. generate.js | Done — generate.js has the same M1 guard; licence gate + canonical-instance binding otherwise intact (round-3 H1 fix verified still in place: canonical gate runs before cache short-circuit) |
| 2 | C1 transient de-license (FaminePrep CRITICAL) | **FAIL — C1** (wipe on 429/5xx/network/timeout, plus slot-burn amplifier) |
| 3 | /api/generate abuse + extraction | **CLEAN** — no unauthenticated path to Anthropic; all prompt-bound fields clamped server-side (lengths/types/enums + `stripUnsafeChars`); two-tier rate limits (per-licence 20/24h + per-IP 60/h); extraction is `find(tool_use)` only — **no `.map(b=>b.text).join("")` narration-leak path anywhere** |
| 4a | `<select>` missing from 16px iOS CSS | **CLEAN** — `input, select, textarea { font-size: 16px !important }` at ≤640px (App.jsx:7530) |
| 4b | `.filter(Boolean)` column-collapsing parser | **CLEAN** — no markdown/table parsing exists |
| 4c | USD values vs local-currency labels in LLM prompt | **CLEAN** — canonical lb/sq ft inputs + `displayUnits`/`currency` flags (the documented convention); setup-cost UI states "display symbol only, no FX" |
| 5a | Division-by-zero → Infinity/NaN | **CLEAN** — `breakEvenMonths` guarded (`monthlySavings > 0` else Infinity → MiniStat renders "-"), `roiPct` null-guarded, `householdTarget > 0` guarded, `yieldLow > 0` guarded, L-shape guard, `hexToRgba`/`fmt*` NaN-safe |
| 5b | Duplicated report/UI builders drifting | Mostly clean — one asymmetry found (**L1**, report missing the UI's invalid-month guard); all sections present in both |
| 5c | escapeHtml coverage in report HTML | **CLEAN** — every model-originated string escapes; remaining raw interpolations are server-coerced numbers (`plants`, `intervalWeeks`, `annualSavings`) and clamped client values (`familySize`) |
| 5d | Silent Load/Import overwriting state | **N/A-CLEAN** — no import/load feature exists |
| 5e | metric/currency persistence asymmetry | metric + currency both persisted and restored symmetrically; the asymmetry found is `goal` (**M4**) |
| 6 | SSR first-render probe | **PASS** — `renderToString` of the SSR bundle renders the full home view, no TDZ/undefined-identifier crashes on the default path. (The H1 crash is in a non-default render path the probe cannot reach — found statically.) |
| 7 | CSP `'unsafe-inline'` + inline-script census | 1 executable inline script total (contact.html); new pages added zero — tightening is now trivial (**M5**) |
| 8 | New blog/about/nav/vite work | Canonicals all correct; **zero** homesteadharvestplanner.com references repo-wide; sitemap ↔ files 1:1; traversal guard sound (resolve+prefix check; encoded `..` stays literal to fs; backslash variants resolve then fail the prefix; `configureServer` = dev-only, no-op in build/preview); no SPA catch-all rewrite in vercel.json so `/blog/` serves statically in prod; viewport metas correct, no `maximum-scale`; design tokens match `T` exactly incl. `--tx3` `#7A6E5F` on all 6 new+legal pages; fonts-link-before-style order correct everywhere. Content findings: M2, M3, L5, L6, L7, L10 |

---

## Verified clean (don't re-audit without a diff)

- **Paywall render gates:** `paid` never initialized from localStorage; `validating` gate on every paid render branch; `ValidatingOverlay` during validation; plan body never persisted (V2 invariant intact, anti-regression comments in place); grace window clamps negative ages; URL-key path keeps both slot-burn gates (skip-read AND skip-wipe of `LS_INSTANCE`, `4f862e1` pattern verified).
- **api/generate.js:** origin allowlist (no preview deploys), POST-only, licence gate with canonical-instance NX binding running *before* the cache short-circuit (round-3 H1 fix intact), two-tier rate limits, 8 s LS / 75 s Anthropic AbortControllers, prompt-cache contains only the static system prompt, forced tool-use with `additionalProperties:false` at every level, response sanitiser with month/currency/number coercion, no upstream-error verbatim leaks, narrow `e?.message, e?.code` logging.
- **Calculators:** soil volume/bag/settling math correct in both unit systems (blog tables independently re-verified: all 21 table cells correct); drift guards present at all five documented commit sites; `computeResults` formula matches spec (goal on demand, full-year denominator); planting-date math DST-safe; perennial handling consistent.
- **State loaders:** every localStorage field type-checked, clamped, allowlisted (currency allowlist, zone key check, crop-id checks, qty `MAX_BEDS_PER_GROUP` clamp, fingerprint shape regex).
- **Data files:** 82 crops / 230 pairings — match the static-page claims and the landing stats (which derive live).
- **SEO:** canonical on every page → thehomesteadplan.com; og/twitter absolute URLs; valid Article/Blog/AboutPage JSON-LD; robots.txt `Disallow: /api/` + sitemap directive; new pages all `index,follow`.
- **Mobile:** 16px input/select/textarea override, 44px targets everywhere except the new header links (L7), tab strip scroll-not-wrap, no `maximum-scale`, range-slider 28px thumb.
- **Build/SSR:** `npm run build` clean (390.15 kB / 110.38 kB gz, 33 modules); SSR probe clean; no TEST OVERRIDE / FIXME markers; no console secret leaks.

---

## Suggested fix order

1. **C1** (de-license) — client `validateKeyRemote` status check + conditional wipe. Highest customer-harm-per-day.
2. **H1** (crash loop) — two-line optional-chaining guard + `manualMissing` derive from `!frostDates`.
3. **H2 + M1** (one PR: validate-before-activate + fail-closed store_id in both files) — completes the cross-product hardening family.
4. **M5** (contact.html script externalize + drop `'unsafe-inline'`) — then the mandatory Live-Buy check.
5. **M2/M3/L5/L6/L10** — one content/copy pass over the blog before it gets indexed (it shipped to `main`-bound branch but isn't live yet; cheapest moment to fix is now).
6. **M4, L1-L4, L7-L9, L11** — batched hygiene PR.
