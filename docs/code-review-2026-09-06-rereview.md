# Code review — re-review of the 2026-09-06 fix wave

**Date:** 2026-09-07
**Verdict:** **SHIP** (merge `fix/audit-2026-09-06` → `main`; 1 MEDIUM and 8 LOWs are follow-ups, none blocking)
**Baseline:** `fix/audit-2026-09-06` @ `75ec332`, two commits over `main` @ `2b46161`. Working tree clean.
**Product class:** React 18 + Vite 5 calculator with a paid LLM tab (Vercel serverless + Anthropic + LemonSqueezy + Upstash)
**Scope:** closure of every finding in `docs/engineering-review-2026-09-06.md` (3H/8M/9L/8 INFO) and `docs/code-review-2026-09-06.md` (2H/6M/7L + 3 known-deferred), plus regressions anywhere in `git diff main..HEAD`. The security lane (`docs/security-review-2026-09-06.md`) is a parallel agent's; where a code fix moved a security property I name it and route it.
**Mode:** READ-ONLY on source. Every harness lives in `node_modules/.cache/hhp-rr/` (gitignored build cache). No product file, test, doc or config was modified. No Anthropic credit was spent — `/api/generate` was stubbed at the wire on a local server.

---

## Verifications run

| What | Result |
|---|---|
| `npm test` (9 suites) | **exit 0** — quarantine 8/8, bounds 91/91, paywall mount chain 142/142 across 29 mounts, validate-key limits 25/25, generate licence gate 42/42, plan generation 26/26, analytics 19/19, calc-golden 259/259, render drive 100/100. Judged by exit code AND the nine completion lines. |
| `npx vite build` (to scratch, not into the repo) | **exit 0** — 33 modules, `index-CZJQzzOA.js`, 405.36 kB / 115.46 kB gzip |
| **Mutation battery, 27 mutants** over the shipped source, each suite re-run with `HHP_APP_SRC` / `HHP_GENERATE_SRC` | **23 KILLED, 4 SURVIVED, 0 failed to apply.** Survivors are all coverage gaps, listed under L-6 below. |
| **Browser drive**, production build served locally + stubbed API, Chrome 25.3 via puppeteer-core | 7 scenarios: tab-switch-mid-generation, triple-click generate, download-the-report, unparseable 200, old-schema body, sparse body, `?key=` landing, deselect-all + reload, poisoned `hhp_soil`, in-tab link + Back, 375 px tap-target census, empty-selection sweep across all 9 tabs |
| **SSR render drive** (esbuild + `react-dom/server`) of the shipped `src/App.jsx` | GrowingPlanTab **with a plan**, PlanRenderer, buildPlanReportHtml, CostSavingsCalculator, SelfSufficiencyCalculator, SoilCalculator, PreservationPlanner, GardenSpaceField — in both unit systems and 4 currencies |
| Independent arithmetic re-derivation | 3 households × capped/uncapped savings; 82-crop precision census; soil settled volume; NCHFP jar counts; frost-date ordering; leap years; southern-hemisphere harvest months |

**The headline result: every one of the 31 findings in the two documents I own is closed, and 17 of them I closed by outcome rather than by reading.** The four surviving mutants and the six new findings below are all residuals — a fix that reached the sites it named and stopped one surface short — not reopened findings.

---

## Executive summary

This is a good fix wave. Both fixers did the thing that usually does not happen: they built the tests *first* against the pre-fix tree and proved the control fails, and the two new suites (`calc-golden`, `render-drive`) are the reason 23 of my 27 mutants died. `render-drive` in particular bundles the real `src/App.jsx` with esbuild and renders the real components — that is why `npm run build` passing now means something it did not mean a day ago.

I drove the two HIGHs to their customer-visible outcome rather than reading them. **H-1 is closed**: in a real Chrome against the production bundle, a generation started on the Growing Plan tab, survived a click to Self-Sufficiency and back, landed, rendered, and cost exactly **one** request at the wire — and three synchronous clicks on Generate still produce one request, because the `planGeneratingRef` guard beats the `disabled` prop that has not re-rendered yet. **H-2 (option b) is closed and is the strongest change in the wave**: the plan's yields, harvest windows and savings total now come from the engine, and I confirmed the *same* number appears on the Growing Plan tab, on the Cost Savings tab, and in the downloaded HTML report — $761 in all three *(figure corrected 2026-09-07, R3-8: the shipped preset at the default goal prints $815.40; the point, one number on three surfaces, stands)* — in the customer's own currency and units, with `$` and `lb` absent from a metric/Rand render of both the screen and the report.

Six new findings. One is MEDIUM and it is the same defect class as the fix that created it: **the Soil tab's H-3 fix moved the bag counts, the subtotals and the estimated cost onto the settled volume and left the 72 px headline volume and the "Volume (cu yd)" stat on the raw one**, so the card now shows two volumes in the same units on different bases, and the biggest number on the page is the one a bulk-soil buyer must not order. The rest are LOW: 97 mobile controls still under the 44 px floor the L-3 fix claimed (the fix reached the four control types the finding named and none of the 82 crop rows or 14 footer links), a true zero now printing as `0.000` on the Preservation tab because the M-2 precision sweep routes 0 through the sub-0.1 branch, a dead first branch in the reordered Cost Savings hero, a one-step 7.6 % drift on the new garden-space field at its metric floor, an inverted direction claim in the new preservation footnote, and four surviving mutants that name four untested consumers.

One item belongs to the security auditor, not to me, and I flag it because a *code-review* fix moved it: **code-review M-6 deliberately reverses a security property the suite previously asserted.** The old test said "a foreign key from a link must NOT be pre-filled into the customer's own licence input — a phishing key one click from activation is the thing being defended against." M-6's fix now pre-fills exactly that key when the customer's own stored key was wiped as definitively dead in the same mount. The reasoning is sound (the customer has no working licence at that moment, it is prefill-only, never auto-activated, and `LS_INSTANCE` is still not read on the URL path), the new tests assert the new behaviour explicitly, and I judge the residual harm small — but the trade is not named in `docs/fixes-2026-09-06-stage-b.md` and the security auditor should rule on it rather than discover it.

Nothing here blocks the merge. The V2 paywall invariants hold: `paid` still starts false, the plan body is still never persisted (`hhp_plan_v2` after a completed generation contains only `{inputs, generatedAt, cropFingerprint}` — verified in the browser), and the unit-labelling rule survives the H-2 rewrite intact (engine rows carry pounds and convert at the render boundary; `gardenSqFt` still travels as sq ft and `producePerPersonLbs` as lb).

---

## Findings (most severe first)

### [MEDIUM] N-1 — the Soil tab now prints two volumes in the same units on different bases, and the 72 px one is the wrong one (NEW, CONFIRMED)

**File:** `src/App.jsx:2057-2059` (the hero `CountUpNumber` on `results.totalCuFt`), `src/App.jsx:2086-2088` (`MiniStat label="Volume (cu yd)"` on `results.cuYd`), against `:2089` (`Estimated cost (incl. settling)`) and `:2108` (breakdown on `cuftWithSettling`).

**What:** engineering H-3 moved the bag counts, the per-component subtotals, the estimated-cost stat and the Cost Savings prefill onto `cuftWithSettling`. It did not move the two figures that are *not* bags or money: the 72 px "Total soil needed" headline and the "Volume (cu yd)" / "Volume (m³)" stat. Both still read the bare bed volume.

**Rendered evidence** (three 8×4×12 in beds, classic mix, driven through the real `SoilCalculator`):

```
imperial:  Total soil needed  96.0 cu ft        <- 72 px headline, RAW
           3.56 cu yd · or 110.4 cu ft with 15% settling buffer
           Volume (cu yd)  3.56 cu yd           <- stat, RAW
           Estimated cost (incl. settling)  563.04 $   <- stat, SETTLED
           Topsoil 66.2 cu ft incl. settling · 1.5 cu ft bags 45 · Subtotal (incl. settling) $231.84
metric:    Total soil needed  2718.4 L
           2.72 m³ · or 3126.2 L with 15% settling buffer
           Volume (m³)  2.72 m³                 <- 3126.2 L is 3.13 m³
```

**Why it matters:** this is engineering H-3's own reasoning ("what you have to BUY is the settled volume") applied to the bag path and not to the bulk path. Three raised beds is squarely bulk-delivery territory, and the number a customer quotes to a landscape supplier is cubic yards or cubic metres — the one figure for which no settled value exists anywhere on the card. The metric card shows `2.72 m³` and `3126.2 L` side by side, which are 2.72 and 3.13 m³: two numbers for one quantity, unreconciled, on the free tab with the highest traffic. It also re-creates, inside one card, the exact inconsistency H-3 was raised to remove.

**Repro:** open the Soil tab, three 8×4×12 beds, classic mix. Read the headline, the Volume stat, and the breakdown. `96.0` / `3.56 cu yd` against `110.4 cu ft` / 45+23+8 bags.

**Fix (text, do not apply):** give the hero and the stat the same treatment the cost stat got — either move both onto `totalCuFtWithSettling` and relabel (`Total soil to buy (incl. settling)`, `Volume (cu yd, incl. settling)`), or keep the hero raw and add the settled cu yd / m³ to the line below it (`3.56 cu yd raw · 4.09 cu yd incl. settling`). Do not leave one labelled figure per basis with no cu yd settled value on the card. Pin it in `calc-golden` next to H3-2, which already pins `totalCuFtWithSettling = 110.4` but nothing that renders it.

---

### [LOW] N-2 — L-3 closed the four control types it named; 97 controls on every page are still under the 44 px floor (NEW, CONFIRMED)

**File:** the header brand link, `nav` "Blog", the 82 crop-selection `<label>` rows on Self-Sufficiency, the 14 footer nav links, the "Urban Root" credit.

**Measured** with `getBoundingClientRect()` at 375 × 820, `isMobile: true`, on all 9 tabs, taking the clickable `<label>` ancestor for checkbox inputs (so 18 × 18 raw inputs are not miscounted):

| Control | Size | Count | Where |
|---|---|---|---|
| crop-selection row (`<label>`) | **275 × 32** | 82 | Self-Sufficiency |
| footer nav link (`<a>`) | **343 × 24** | 14 | every tab |
| header brand link | 247 × 42 | 1 | every tab |
| header "Blog" | **41** × 45 | 1 | every tab |
| "Urban Root" credit | 64 × **15** | 1 | every tab |

**What is genuinely fixed:** the header unit/currency/hemisphere pills (40 → 44), `PillSelect size="sm"` on phones (40 → 44), both "Reset to defaults" (27 → 44) and the garden-space prefill link. The `render-drive` L3b-1..L3b-5 goldens pin those and pass. The finding as written named exactly those and is closed.

**Why it still matters:** the 82 crop rows at 32 px high are the single most-tapped control in the product on mobile, and `CLAUDE.md` §9 states 44 × 44 as a rule, not as a list. The fix record's disposition line reads "L-3 mobile tap targets at 40 px against the product's 44 px floor — **fixed**", which will read to the next editor as "the floor is met". It is not.

**Repro:** `node node_modules/.cache/hhp-rr/browserdrive5.mjs` (census block), or DevTools device mode at 375 px, Self-Sufficiency tab, inspect any crop row.

**Fix:** `minHeight: 44` on the crop-row label and on the footer nav anchors; widen "Blog" to 44. Add a census assertion to `render-drive` that fails on *any* interactive element under 44 rather than on the two selectors the fix touched — otherwise the next sweep repeats this.

**Clean:** no horizontal scroll at 375 px on any of the 9 tabs.

---

### [LOW] N-3 — a true zero now prints as `0.000` on the Preservation tab (NEW REGRESSION, CONFIRMED)

**File:** `src/App.jsx:522-531` (`fmtMassRounded`), consumed at `:6950` (`PreservationCropRow`) and `:6795`.

**What:** `fmtMassRounded` returns `String(Math.round(v))` for `v >= 1` and falls through to `fmtMassValue` below it, which picks 3 decimals for `v < 0.1`. Zero is `< 0.1`.

**Rendered evidence** (real `PreservationPlanner`, tomato + lettuce, family of 4):

```
freshPct = 0    ->  ~90 lb/yr · fresh 0.000 · preserved 90
freshPct = 100  ->  ~90 lb/yr · fresh 90 · preserved 0.000
freshPct = 30   ->  ~90 lb/yr · fresh 27 · preserved 63     (correct)
```

Before the wave both endpoints read `fresh 0` / `preserved 0`.

**Why it matters:** small, but it is on a paid tab, on every crop row, at both endpoints of an ordinary slider, and it is the *inverse* of the rule the fix was applied under ("a displayed zero is a wrong number"). Here the zero is right and the formatting makes it look like a measurement.

**Repro:** Preservation tab, drag "fresh share" to 0 % or 100 %. Or `M.fmtMassRounded(0, false)` → `"0.000"`.

**Fix:** `if (v === 0) return "0";` as the first line of `fmtMassRounded`. Pin it in `render-drive` beside M2b-2.

---

### [LOW] N-4 — the reordered Cost Savings hero has a dead first branch (NEW, CONFIRMED)

**File:** `src/App.jsx:6376-6386`. The reorder is `!totals.hasCrops` → `totalSetup === 0` → `heroBreakEven == null` → the answer.

**What:** `CostSavingsCalculator` returns an early "Pick your crops first / Go to Self-Sufficiency" empty state when the selection is empty, so the hero paragraph is never rendered with `hasCrops === false`. The first rung of the new ladder is unreachable.

**Evidence:** rendered `CostSavingsCalculator` with `computeResults({}, 4, …)`:

```
Pick your crops first  This tab builds on your Self-Sufficiency selection. …  Go to Self-Sufficiency
```

— the string "Add at least one crop in the Self-Sufficiency tab" does not appear in the markup.

**Why it matters:** no customer impact (the empty state is better copy than the branch). It matters because the fix record presents the ordering as the fix, and a reader will believe the first message is reachable. The two rungs that *are* reachable both behave correctly and I drove all of them:

```
crops, no setup   -> "Add your setup costs below to see when your garden pays for itself."   BREAK-EVEN  -
setup, no prices  -> "Set a grocery price on at least one crop below to see when your garden pays for itself."
setup + prices    -> "…pays for itself in 10.8 months."   BREAK-EVEN 10.8 mo
```

No `Infinity` or `NaN` reaches the tab in any of the four states.

**Fix:** delete the dead branch, or note in the comment that the empty state pre-empts it.

---

### [LOW] N-5 — the new garden-space field drifts one step at its metric floor (NEW, CONFIRMED)

**File:** `src/App.jsx:4223-4234` (`GardenSpaceField`) — `min={Math.max(1, Math.round(GARDEN_SQFT_MIN * SQFT_TO_SQM))}` rounds the 0.929 m² floor up to 1 m², above the value the field is displaying.

**What:** with `gardenSqFt = 10` (the canonical minimum) and metric on, the field displays `0.9`. An untouched focus + blur runs `Field.commit`, which clamps `0.9` up to the field's own `min` of `1`, calls `onChange(1)`, and the skip-if-equal guard correctly sees `1 !== 0.9` and converts: `1 / SQFT_TO_SQM = 10.7639 sq ft`.

**Driven, real focus + Tab, five cycles** (`browserdrive4.mjs`):

```
cycle 1: shown=1  stored=10.763910416709722    <- 10 -> 10.7639, +7.64%
cycle 2: shown=1  stored=10.763910416709722
… stable thereafter
mid-range control (37.2 m²): shown=137.2 stored=1476.808…  unchanged across 5 cycles   <- guard works
```

**Why it is only LOW:** it is one step, only at the exact floor, only in metric, and it converges. The skip-if-equal guard the fixer added is genuinely correct everywhere else — the mid-range control proves zero drift over five cycles, which is the blur-recommit canon working.

**Fix:** floor the display bound instead of rounding it — `min={metric ? Number((GARDEN_SQFT_MIN * SQFT_TO_SQM).toFixed(1)) : GARDEN_SQFT_MIN}` — so the displayed value can never sit below the bound that clamps it.

---

### [LOW] N-6 — the new preservation footnote states the error direction backwards for shelled peas (NEW, CONFIRMED)

**File:** `src/App.jsx:6874-6884`, the note added for M-3/L-6.

**What:** the note reads *"Everything else uses NCHFP's whole-tomato baseline of 3 lb per quart … which runs low for dense packs (corn, shelled peas)."* For shelled peas that is inverted on this app's own basis. `peas_shell.yieldPerPlantLbs = [0.08, 0.15]` is *shelled* weight; NCHFP's 4.5 lb/quart figure is *in-pod*. Shelled weight is roughly 38 % of in-pod, so the true shelled figure is ~1.7 lb/quart — the 3 lb baseline runs **high**, and the jar count comes out low, not high.

**Measured** through the shipped `computePreservationForCrop` (100 lb preserved):

```
tomato/can            lbsPerQuart=3    -> 34 quarts, 70 pints
tomato/sauce          lbsPerQuart=5    -> 20 quarts   (SAUCE_QUART_LBS, correct)
green_beans_bush/can  lbsPerQuart=2    -> 50 quarts   (matches NCHFP, the finding's own number)
carrot/can            lbsPerQuart=2.5  -> 40 quarts
peas_shell/can        lbsPerQuart=3    -> 34 quarts   (a shelled-basis figure would be ~59)
```

**Why it is only LOW:** the fixer's decision to *not* apply NCHFP's in-pod figure to a shelled-weight yield is the right call and is documented in the code and in the deviation log — pairing them would have been the same class of error as the finding. What ships wrong is one clause of the footnote, and a residual ~43 % jar undercount for two crops that was already there.

**Fix:** correct the clause to name the direction per crop, and route the shelled-pea and sweet-corn quart figures to `engineering-verifier` with the basis question stated explicitly ("what is the shelled/kernel weight per quart, on the same basis as `yieldPerPlantLbs`?").

---

### [LOW] L-6 — four mutants survived: four consumers nothing tests (NEW, CONFIRMED)

23 of 27 mutants died. The four survivors each name a real coverage gap, and in every case the *helper* is pinned while its *call site* is not.

| Mutant | What it changed | Why nothing caught it |
|---|---|---|
| **M16** | `PlantingTimelineChart` `totalDays = daysInYear(referenceYear)` → `365` | `calc-golden` L7-1..L7-4 test `daysInYear(2024/2026/2100/2000)` directly. Nothing renders the timeline and measures a bar. Live effect if it regressed: 0.27 % bar drift in a leap year. |
| **M18** | the request payload's `gardenSqFt` → `derivedGardenSqFt` (i.e. the customer's stated space silently ignored) | **This is engineering M-5's entire purpose.** The field, its persistence, its clamp and its "too small" banner are all tested; the wire is not. I closed it by driving the browser instead: typing 120 with the field selected produced `gardenSqFt=120` at the wire, persisted `120`, and the banner *"Your selection needs about 241 sq ft, more than the space you have"*. |
| **M20** | `if (planGeneratingRef.current) return;` deleted | `plan-generation` H1-* runs one call at a time. I closed it by driving: three synchronous clicks on Generate → **1** request at the wire (the `disabled` prop has not re-rendered at that point, so the ref is what stops calls 2 and 3). |
| **M23** | `planAbortReasonRef.current = "timeout"` deleted | `plan-generation` L5b-3 sets the ref itself rather than driving the 90 s timer. Live effect if it regressed: a timeout would read "The plan request was cancelled" instead of "took too long to respond". |

**Fix:** add four cases — a rendered timeline bar position in a leap year; an assertion on the payload object `generatePlan` hands to `fetch` (M18 is the one that matters, because it is the finding's own purpose); two overlapping `generatePlan` calls asserting one `fetch`; and a fake-timer drive of the 90 s abort.

---

## Routed elsewhere, not mine to rule on

### [for security-auditor] code-review M-6 reverses a previously-asserted security property

`tests/paywall-mount-chain.test.mjs` previously asserted, in the revoked-stored-key case:

```
M-1.8  'the foreign key is NOT pre-filled into the licence input'
       // a phishing key one click from activation is the thing being defended against
```

That case was replaced by a transient-outage variant (which keeps the assertion, correctly) and the revoked case now asserts the opposite:

```
M-6.3  'the key from the purchase email is offered for one click'   r.prefillKey === KEY_THEIRS
```

Reachable path: attacker mails `thehomesteadplan.com/?key=<attacker key>`; the victim's own stored key is definitively rejected during the same mount (refund, reissue, corruption); the attacker's key is then pre-filled into the victim's licence box. Mitigations that hold: prefill only (M-6.4 asserts no validator call fires for it), `LS_INSTANCE` is still not read on the URL-key path, and the victim has no working licence at that moment so the marginal loss is small. `instance_name` is never sent by the client, so nothing identifying reaches the attacker's LemonSqueezy dashboard. **The trade is not recorded in `docs/fixes-2026-09-06-stage-b.md`; the security auditor should rule on it rather than find it.**

### [for engineering-verifier]

- `lettuce` (`Lettuce (Leaf)`) took `groceryPricePerLb 2.75 → 3.47` from **`APU0000FL2101`, romaine**, per the code comment. The engineering review specified "leaf lettuce 3.47", so the fixer applied it as written — but romaine and leaf lettuce are different series. Confirm the basis, or re-source a leaf-lettuce figure.
- `peas_shell` and `corn` quart weights, per N-6.
- The five SFG spacing changes and the ten `0.11 → 1/9` roundings were applied exactly as specified (15 changes total, verified against `git show main:src/data/crops.js`); the *agronomy* is the review's, already sourced to squarefootgardening.org.

---

## Closure table — engineering review (`docs/engineering-review-2026-09-06.md`)

| Id | Claim | Verdict | How I settled it |
|---|---|---|---|
| **H-1** | savings on the wrong yield basis; surplus counted as money | **CLOSED, CONFIRMED** | headline now on `totalYieldConservativeLbs`; cap is `min(expectedYieldLbs, annualNeedLbs)`. Three households re-derived: 1p salad $143.87→**$96.53**; 4p basics $1062.99→**$761.04**, self-suff 44.9%→**33.7%** *(corrected 2026-09-07, R3-8: the shipped Family Basics preset at the default goal prints **35.9 %** and **$815.40**, pinned by calc-golden SB-3/SB-4)*; 4p full homestead $3098.11→**$1996.54**, 102.3%→**72.0%**. Mutants M2, M3 killed by `golden` + `render`. |
| **H-2** | every number in the paid plan invented by the model | **CLOSED, CONFIRMED (option b)** | `harvestTimeline`/`yieldEstimates` gone from `PLAN_SCHEMA`, `sanitisePlan`, the prompt and `src/`: **0 hits** outside comments. Rendered the real `GrowingPlanTab` **with a plan**: yields/harvest/savings all engine-sourced, identical on screen, in the report, and on the Cost Savings tab ($761 in all three; *figure corrected 2026-09-07, R3-8: $815.40 for the shipped preset at the default goal*). Metric/Rand render contains no `$` and no ` lb` on either surface. Mutants M6 (rename), M13 (report), M22 (screen) all killed. |
| **H-3** | soil bill on the un-buffered volume | **CLOSED for bags/cost/prefill; PARTIAL** | 39/20/7 bags @ $489.60 → **45/23/8 @ $563.04**, "incl. settling" on every label, Cost Savings prefill follows `totalCostWithSettling`, dead `bags1/1_5/2` fields gone (verified `none` on the returned component). **The 72 px volume headline and the Volume stat are still raw → N-1.** Mutant M4 killed. |
| **M-1** | `PATH_BUFFER = 1.30` fails its own dimensional check | **CLOSED, CONFIRMED** | `PATH_BUFFER = 1/(1-0.30) = 1.4285714…`; path share back-computes to **30.0 %**; copy derived from the same constant ("about 30% of the total footprint"). Mutant M1 killed. |
| **M-2** | five crops 2–4× denser than the SFG chart | **CLOSED, CONFIRMED** | peas_snap/peas_shell 0.0625→0.125, arugula 0.0625→0.25, lettuce/parsnip 0.11→0.25. Diffed against `main`: 15 spacing changes, no others. |
| **M-3** | one crop-blind canning constant across 40 crops | **CLOSED, PARTIAL by documented deviation** | `lbsPerQuart` on green_beans_bush/pole (2) and carrot (2.5); `SAUCE_QUART_LBS = 5`. Snap beans **50 quarts**, matching NCHFP. Corn + shelled peas deliberately left with a basis rationale → the note's direction claim is N-6. Mutant M12 killed. |
| **M-4** | Full Homestead stacks parents + variety children | **CLOSED, CONFIRMED** | preset = **74** of 82 crops, 0 with `parentCrop`; summed demand **295.45 lb/person/yr** (was 350.45), matching `DEFAULT_PRODUCE_PER_PERSON_LBS`. |
| **M-5** | the plan can never say the garden is too small | **CLOSED, CONFIRMED (driven)** | Typed 120 into the new field in a real browser: field commits 120, `hhp_plan_v2.inputs.gardenSqFt = 120`, survives reload, **wire carries `gardenSqFt: 120`**, banner reads "Your selection needs about 241 sq ft, more than the space you have". Prefill link resets to `null` and the field returns to 241. Nothing tests the wire → L-6/M18. |
| **M-6** | grocery price defaults stale against BLS | **CLOSED, CONFIRMED** (basis question on lettuce routed above) | potato 1.10→0.94, tomato + determinate 2.50→2.00, lettuce 2.75→3.47, footnote re-dated to "BLS average retail (series retrieved July 2026)". |
| **M-7** | zone table whole-zone 3–11, undated, zone≠frost date | **CLOSED IN PART, deferral reasoned** | On-screen note and provenance comment ship and render. Zones 1/2/12/13 not added — no sourced NOAA normals, and 12/13 are frost-free, which `{lastSpring, firstFall}` cannot express. Picker directs those users to manual entry. **Grant's call if he wants the rows.** |
| **M-8** | printed harvest window not truncated at first frost | **CLOSED, CONFIRMED** | zone-3 tomato: raw end Fri 30 Oct → printed end **Tue 15 Sep**, badge unchanged (`true`). Zone-3 kale (cool season) untouched at 16 Oct. `harvestEnd` remains the badge's input; `harvestEndEffective` is read at all 4 render sites and by `engineHarvestRows`. Mutant M5 killed. |
| **L-1** | 31 of 82 crops print `0.0 m²`; ranges collapse | **CLOSED, CONFIRMED** | Census over all 82 crops, both unit systems, both surfaces: **0 zero prints, 0 collapsed ranges** (metric and imperial). |
| **L-2** | three conversion constants truncated | **CLOSED, CONFIRMED** | `LB_TO_KG 0.45359237`, `CUFT_TO_L 28.316846592`, `CUFT_TO_CUM 0.028316846592`. |
| **L-3** | `0.11` where `1/9` is meant | **CLOSED, CONFIRMED** | zero `0.11` literals remain in `crops.js`; 10 crops at `1/9`, the other two moved to 0.25 under M-2. |
| **L-4** | yield-unit sanitiser defaults to `lb` | **CLOSED BY H-2** | `yieldEstimates` no longer exists on either side of the wire. |
| **L-5** | Soil tab lacks the FX disclosure | **CLOSED, CONFIRMED** | "Prices are a display symbol only; no currency conversion is applied." renders on the Soil tab. |
| **L-6** | `PINT_LBS = 1.5` vs NCHFP 1.444 | **CLOSED, CONFIRMED** | `PINT_LBS = 13/9`; pint derived from quart at NCHFP's own ratio. |
| **L-7** | timeline divides by a hardcoded 365 | **CLOSED (helper), consumer untested** | `daysInYear`: 2024→366, 2025→365, 2026→365, 2100→365, 2000→366. Mutant M16 survived → L-6 above. |
| **L-8** | reversed / zero-length manual frost dates accepted | **CLOSED, CONFIRMED** | `{11-01, 03-01}` → `null`; same-day → `null`; good pair → `manual`. On-screen reason renders. Mutant M17 killed. |
| **L-9** | JPY rendered with two decimals | **CLOSED, CONFIRMED** | `moneyDecimals`: ¥→0, $/R/€→2. Mutant M14 killed. |
| **I-1** | `caloriesPer100g` dead with mixed bases | **PARTIAL, as recorded** | cowpea 336→90 with source; four dried-herb entries flagged in the schema header, not silently re-based. Field still read nowhere. |
| **I-2** | `servingsPerLb` in the spec, on zero crops | **NOT FIXED — owed to `Homestead/CLAUDE.md`** | Outside this repo. Listed in the stage-A spec deltas. |
| **I-3** | no calculation goldens | **CLOSED** | `calc-golden` 259 + `render-drive` 100, both wired into `npm test`, both proven non-vacuous by my own 27-mutant battery. |
| **I-4** | dead `bags1/1_5/2` | **CLOSED, CONFIRMED** | `Object.keys(components[0]).filter(k => k.startsWith('bags'))` → **none**. |
| **I-5** | spec: garden space from Tab 2 or manual | **HALF, reasoned** | Manual entry ships; the Soil-total prefill is a volume, not an area — correctly not wired. |
| **I-6** | spec: conservative end for the headline | **CLOSED** | code now matches `CLAUDE.md` §6. |
| **I-7** | custom soil percentages do not normalise | **NOT CHANGED, disclosed on screen** | Correct call — silently renormalising a typed number is worse. |
| **I-8** | zero-crop plan spends a quota slot | **CLOSED** | `sanitiseInput` + `crops.length === 0` → 400 now runs **before** the per-licence bucket (`api/generate.js:789-793`). Client gate already existed. |

## Closure table — code review (`docs/code-review-2026-09-06.md`)

| Id | Claim | Verdict | How I settled it |
|---|---|---|---|
| **H-1** | tab switch mid-generation throws the plan away after the quota is spent | **CLOSED, CONFIRMED (browser-driven)** | Production bundle, real Chrome, stubbed 4 s `/api/generate`. Start → in-flight copy shows and says "You can look at the other tabs" → click Self-Sufficiency (hash `#self-sufficiency`) → return → **still in flight** → plan lands and renders. **1 request at the wire.** Reload afterwards: plan body absent, `hhp_plan_v2` holds only `{inputs, generatedAt, cropFingerprint}`. Mutant M7 (rename `generatePlan`) killed by `plan`. |
| **H-2** | every held licence message invisible until the customer opens a form | **CLOSED, CONFIRMED** | `keyError` renders above the "Already purchased?" affordance with `role="alert"`, `id="hhp-key-error"` kept for `aria-describedby`. Mutant M8 (delete the outer render) killed by `render`. |
| **M-1** | purchase link lands a paying customer on the marketing page | **CLOSED, CONFIRMED (driven)** | `/?key=ABCD-…` → URL becomes `/#growing-plan`, paid tab on screen, `$39.99` absent, key stored. Control holds: a stored-key launch on `#soil` stays on `#soil` (M-1.21..23). |
| **M-2** | metric `0.0 m²` / `0.0 kg` | **CLOSED, CONFIRMED** | see engineering L-1. Swept one site further to the annual-yield line. **New LOW N-3** on the true zero. |
| **M-3** | the model's currency overrides the customer's | **CLOSED, CONFIRMED** | `normaliseCurrency` and both symbol tables deleted from `api/generate.js`; `savingsEstimate.currency` has 0 hits in `src/`. Rendered metric/Rand: screen and report both `R`, no `$` anywhere. An old-schema body carrying `currency: "EUR", annualSavings: 612` was refused outright and **612 never reached the DOM**. |
| **M-4** | deselecting every crop cannot be saved | **CLOSED, CONFIRMED (driven)** | Unticked all 12 in the browser → `hhp_crops = {}` → reload → still `{}`, 0 boxes checked, empty-state copy on screen. **Blast radius the review asked for, swept:** all 9 tabs with an empty selection — no `NaN`, no `Infinity`, no `undefined`, no ErrorBoundary, no page error. Mutant M11 killed by `bounds`. |
| **M-5** | an off-shape plan body takes the whole app to the ErrorBoundary | **CLOSED, CONFIRMED (driven)** | Old-schema body → *"The plan generator sent a plan we couldn't read. Please try again."*, no boundary. `{}` and `[]` refused; a **legitimately sparse** container-garden plan (summary + one month + empty arrays) renders normally — the gate does not over-refuse. Succession clamped at the boundary: `plantings 9999→12`, `intervalWeeks -4→1`, missing→1. Mutant M9 killed by `render` + `plan`. |
| **M-6** | a dead stored key + a new `?key=` shows a false message | **CLOSED, CONFIRMED** | Deny leg re-reads storage; `urlKeyConflict` carries the key. Property change routed to security-auditor above. |
| **L-1** | "The plan generator returned an error (200)" | **CLOSED, CONFIRMED (driven)** | Unparseable 200 → *"The plan generator sent a response we couldn't read."*; the string `error (200)` never appears. |
| **L-2** | monthly schedule sorted but never filtered | **CLOSED, CONFIRMED (driven)** | A body containing `Marchember` renders it on neither the screen nor the report; January still leads. Mutant M21 (report filter) killed by `render`. |
| **L-3** | mobile tap targets at 40 px | **CLOSED as written** | The four named control types are 44 px. **97 others are not → N-2.** Mutant M10 killed by `render`. |
| **L-4** | in-tab links bypass the router | **CLOSED, CONFIRMED (driven)** | Manual-frost-unset blocking message → click "Planting Dates" → hash becomes `#planting-dates`, heading "Planting Date Calculator"; **Back returns to `#growing-plan`**. Mutant M19 killed by `plan`. |
| **L-5** | AbortError cannot tell unmount from timeout | **CLOSED (consumer untested)** | `planAbortReasonRef` records the reason; the unmount abort is gone with H-1. Mutant M23 survived → L-6. |
| **L-6** | preservation note hardcoded in pounds | **CLOSED, CONFIRMED** | Metric note reads 1.4 kg/quart, 0.66 kg/pint, 3.6 kg/dehydrator batch; no pound weight survives; container names kept as products. Direction clause is N-6. |
| **L-7** | break-even "0.0 mo" beside "add your setup costs" | **CLOSED, CONFIRMED** | `BREAK-EVEN  -` with no setup; `10.8 mo` with setup. Branch ordering fixed; first rung dead → N-4. |
| **deferred M-2** | `hhp_soil.mixOverrides` leaves untyped | **CLOSED, CONFIRMED (driven)** | Seeded `{topsoil:"banana", compost:99999, sand:-5}` → **no `NaN` anywhere on the page**, prices render 3.5 (default restored) / 999 (clamped to `SOIL_PRICE_MAX_PER_CUFT`) / 0, bag counts sane, the `$960,086.40`-class bill is gone. Mutant M24 killed by `bounds`. |
| **deferred L-4** | clearing a `Field` commits the minimum | **CLOSED, CONFIRMED (driven)** | Ctrl-A + Backspace + Tab on the garden-space field → value **restored to 120**, store unchanged. Mutant M25 killed by `bounds`. |
| **deferred L-3** | plan-completeness gate reads 1 section of 9 | **CLOSED** | `api/generate.js:905-925` requires summary + monthlySchedule + tips + savingsEstimate; the three legitimately-empty sections are not required. Mutant M26 killed by `gate`. |

---

## Regression hunt — what I looked for and did not find

- **Stale closures in the lifted request.** `generatePlan` is `useCallback(…, [])` and closes over nothing but setters and refs; `payload`, `fingerprintInput` and `fallbackFingerprint` all arrive as arguments captured at click time. Changing crops mid-generation therefore lands a plan whose `cropFingerprint` is the *old* input set, which makes `fingerprintStale` fire correctly — the right behaviour, verified by reading the capture points.
- **A second generate while one is in flight.** 3 synchronous clicks → 1 request (driven).
- **StrictMode.** `main.jsx` wraps in `StrictMode`, but the generation is click-driven, not effect-driven, so double-invoke cannot double it. Production build: 1 `/api/validate-key` per load, 1 per reload.
- **"Plan body never persists".** `planPersisted` memo is `{inputs, generatedAt, cropFingerprint}` only; verified in `localStorage` after a completed generation.
- **`normalisePlan` over-refusing.** It returns `null` only when summary *and* monthlySchedule are both empty — which the server-side required-sections gate already forbids. A sparse-but-valid plan renders (driven).
- **Old schema fields lingering.** `harvestTimeline` / `yieldEstimates` / `savingsEstimate.annualSavings` / `savingsEstimate.currency`: 0 hits in `src/App.jsx`, 0 in `api/*.js` outside explanatory comments.
- **`computeSavingsRows` inputs.** `annualNeedLbs` exists on every `perCrop` row (`:1281`); no `NaN` path. Empty selection: `perCrop 0`, savings 0, surplus 0, no `Infinity`.
- **`engineHarvestRows` and the hemisphere.** Southern zone 7: tomato **December → March, peak January**; garlic January; kale November → February. 4 of 4 rows produced, none dropped. Year-wrapping windows are split into two segments in both the chart and the report.
- **`jarQuartLbs` call sites.** Exactly one production call site (`:6716`) and it passes `r.crop`; the `crop = null` default is never exercised in the app.
- **`PillSelect`'s new `useMediaQuery`.** Unconditional, at the top of the body, no early return above it — hook order safe. It does add one `matchMedia` listener per instance (up to ~82 on Self-Sufficiency); measurable only as a micro-cost, no correctness impact.
- **Tests loosened?** Three assertions removed, all replaced: `M-1.7/1.8/1.10` moved to a transient-outage variant that keeps the no-prefill assertion, with the revoked case covered by the new `M-6.1..M-6.6`; `G-1.w2`'s regex widened from `setError(` to `set(?:Plan)?Error(` to track the H-1 rename, testing the same rule. No suite was weakened. The `paywall-mount-chain` fixture gained `content-type: application/json` because the handler now demands it — a fixture that was under-specifying the real client.
- **Brace extraction fails loudly on a rename.** Renaming `computeSavingsRows` killed `golden` + `render`; renaming `generatePlan` killed `plan`. The extractors do not silently pass on a missing declaration.
- **Config.** `vercel.json` only `X-XSS-Protection: 1; mode=block → 0`; CSP untouched. `.npmrc` comment corrected. `@upstash/redis ^1.34.3 → ^1.38.3` (1.38.4 blocked by this repo's own 72 h quarantine — one command after 2026-09-07 11:00 UTC).

---

## Expected customer-visible movement (not defects — brief support if anyone writes in)

> **Correction, 2026-09-07 (round 3, R3-8).** The first two rows of this table, and the
> figures quoted at three places above ("$761 in all three", "$761.04", "33.7%"), were
> re-derived on a basis that is not the shipped preset at the default goal. What HEAD
> prints for Family Basics, 4 people, 300 lb, "fresh + some preserving" is **35.9 %** and
> **$815.40**, and `tests/calc-golden.test.mjs` SB-3 / SB-4 have pinned exactly those two
> figures since stage A (`e9cf852`). No Family Basics input combination prints $761. Support
> should quote 35.9 % and $815. The rows below are corrected; the three prose mentions are
> left as written and flagged inline so the record of what was measured stays intact.

For an existing customer on the 12-crop Family Basics preset, family of 4, the wave changes numbers they may have written down:

| Figure | Before | After | Cause |
|---|---|---|---|
| Self-sufficiency headline | 47.8 % | **35.9 %** | H-1, conservative basis |
| Annual grocery savings | $815.40 (uncapped basis) | **$815.40** | H-1, cap at household need (no crop in this preset over-produces its need at the default goal, so the cap moves this case by $0) |
| Garden space (incl. paths) | ~277 sq ft | **324.6 sq ft** | M-1 path multiplier + M-2 SFG spacings |
| Soil bill, three 8×4×12 beds | $489.60, 39/20/7 bags | **$563.04, 45/23/8 bags** | H-3 settling |
| Snap-bean canning quarts (100 lb) | 34 | **50** | M-3 |
| Zone-3 tomato harvest window | to 30 Oct | **to 15 Sep** | M-8 |

All six are corrections. The savings and self-sufficiency drops are large enough to notice; the on-screen copy now explains both.

---

## Blast radius / siblings to check

The original review's sibling list still stands and none of it has been actioned — carry it forward:

- **H-1 (request inside a conditionally-rendered tab)** — grep each sibling for `generating` state declared *inside* a tab component the parent renders behind `tab === "…" &&`, with a `useEffect(() => … return () => abortControllerRef.current?.abort(), [])`. Named targets: **FaminePrep** (report generation), **HeatLens** (Market Read), **Aero-Calc** if its report path is async. Homestead's `generatePlan` in `App` at `src/App.jsx:8341` is now the reference implementation, including the `planGeneratingRef` one-at-a-time guard and the `planAbortReasonRef`.
- **H-2 (a licence message with one render site inside a collapsed disclosure)** — **Aero-Calc, Growroom, Vertica, FaminePrep, HeatLens, Mortar** all share the `PaywallOverlay` + "Already purchased?" lineage. Ask: is there any state where the mount effect computes a message and the overlay renders nothing?
- **N-1 (a settled/buffered quantity applied to bags and money but not to the headline volume)** — any sibling with a "buy this much material" card: **Growroom** (nutrient/media volumes), **Vertica** (reservoir volumes), **Mortar** (material take-offs). The tell is two figures in the same unit family on one card with only one of them labelled.
- **N-2 (a 44 px sweep that reaches only the controls a finding named)** — every sibling. The durable fix is a census assertion, not a list of selectors.
- **M-2 (metric display zeros)** — **Growroom** per-plant footprints, **Vertica** per-site volumes, **Aero-Calc** nozzle flows. Grep `* SQFT_TO_SQM).toFixed(1)`, `* LB_TO_KG).toFixed(1)`, `* GAL_TO_L).toFixed(0)` and evaluate against each product's *smallest* datum. Then check the N-3 inverse: does the new formatter turn a true zero into `0.000`?
- **M-3 (a model echoing a currency)** — FaminePrep's report, HeatLens's Market Read.
- **M-5 (server sanitises, client trusts)** — FaminePrep's report renderer is the closest analogue; one deploy-skew window from a whole-app ErrorBoundary.
- **`Homestead/CLAUDE.md` is stale and now load-bearing** — §8 still documents `harvestTimeline`, `yieldEstimates` and the old `preservationGuide` shape, which is precisely what `normalisePlan` now refuses. §5, §6, §7, §12 and §21 deltas are itemised at the end of both fix records. Apply them with the merge or the next editor will "fix" the renderer to match the doc.

---

## Verified clean this session (do not re-audit without a diff)

The paid Growing Plan end to end (screen + downloaded report, imperial/$ and metric/R); the engine→plan wiring in `GrowingPlanTab` (`engineYields`, `engineHarvest`, `engineSavings` reach both surfaces); one savings number across three surfaces; `normalisePlan` over 8 body shapes; the H-1 request lifecycle including tab switch, double click, reload and blob download; `?key=` activation and landing; deselect-all persistence and the empty-selection sweep across all 9 tabs; the poisoned-`mixOverrides` render; the `Field` clear path; the garden-space field's commit, clamp, persistence, prefill-reset and drift; the 82-crop precision census in both unit systems on both crop-database surfaces; frost-date ordering, leap years, zone-3 truncation, southern-hemisphere harvest months; the four Cost Savings hero branches and both break-even states; 375 px horizontal scroll on all 9 tabs; and the absence of `NaN`/`Infinity`/`undefined` on every tab in the empty-selection state.

Not covered here and still owed to the parallel agent: the whole security lane (`docs/security-review-2026-09-06.md` H-1/M-1/M-2/L-1..L-8), including the split `lkbad:`/`hhp:vk:ok:` bucket rewrite in `api/validate-key.js`, the `VERCEL_ENV`-gated origin allowlist, the rightmost-`x-forwarded-for` change and the 415 content-type gates.

---

## Recommendation

**Merge and deploy.** Fix **N-1** in the next pass — it is one card and one label, and it is the only finding a customer can spend money on. **N-2** and the four **L-6** test gaps are the next session's batch; **N-3, N-4, N-5, N-6** are cosmetic or comment-level and can ride any later commit. Route the M-6 prefill trade to the security auditor before the deploy is announced, and apply the `Homestead/CLAUDE.md` spec deltas in the same push, because §8 now contradicts a shipping guard.
