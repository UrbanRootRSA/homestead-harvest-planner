# Code review — round 3 re-review of the 2026-09-06 fix wave

**Date:** 2026-09-07
**Verdict: SHIP** (0 CRITICAL / 0 HIGH / 0 MEDIUM / 9 LOW, of which 8 CONFIRMED and 1 PLAUSIBLE; 2 observations; every round-2 fix present at HEAD)
**Baseline:** `main` @ `4ef8be9` (round-2 fix `4f19d6a` plus the `@upstash/redis` 1.38.4 bump; `git diff 4f19d6a..HEAD` touches only `package.json` and the lockfile). Working tree clean before and after this review, apart from this file.
**Product class:** React 18 + Vite 5 calculator with a paid LLM tab (Vercel serverless, Anthropic, LemonSqueezy, Upstash).
**Scope:** `src/App.jsx` (8,803 lines), `api/validate-key.js`, `api/generate.js`, `vercel.json`, `index.html`, the nine suites in `tests/`. Regression pass over every fix recorded in the stage-A, stage-B and round-2 records; blast radius over every sibling site those records name inside this repo; fresh hunt over the whole scope.
**Reviewer contract:** read-only. No product file, test, config or dependency was modified. No live endpoint was called, no licence key was validated against LemonSqueezy, no Anthropic credit was spent. Every harness lives in the gitignored `node_modules/.cache/hhp-r3/` and bundles the shipped `src/App.jsx` verbatim with esbuild (the `render-drive` technique), so every number below comes from the code that ships.

---

## Verifications run

| What | Command | Outcome |
|---|---|---|
| Full suite | `npm test` (9 suites) | **exit 0**; final completion line `render drive: 140/140 checks OK.` Judged by exit code, not by the PASS rows. |
| Production build | `npx vite build --outDir <scratchpad>/hhp-r3/dist` | **exit 0**, 33 modules, `assets/index-LGDS3Iv7.js` 406.45 kB / 115.79 kB gzip. The chunk name is the one `Homestead/CLAUDE.md` records as live, and the bundle carries the `incl. settling` marker. |
| Bug scanner | `node tools/bug-scan.mjs .` | 0 high, 0 medium, 11 low, all `REACT-INDEX-KEY` on static lists, the same 11 stage A left. |
| Shipped-source harness | esbuild bundle of `src/App.jsx` + 6 probe scripts (`probe-a`, `probe-c`, `probe-d`, `probe-e`, `probe-g`, `probe-drift`) | Family-of-4 arithmetic re-derived independently and matched the shipped engine to the cent on three goals; soil bill matched to the cent; 2,520 planting-date rows swept; 3,936 single-crop display cells swept; SSR renders of `CropDatesCard`, `PlantingTimelineChart`, `CategoryBar`, `GardenSpaceField`, `ProduceTargetField`, `buildPlanReportHtml`; the real `Field.commit` driven over the real `ProduceTargetField` bounds for five focus/blur cycles; `sanitiseInput` lifted from `api/generate.js` and run. |
| Git | `git diff 75ec332 HEAD -- src/data/crops.js src/App.jsx` filtered to engine inputs | **no engine constant changed** between the round-1 fix and HEAD (one comment line only). |

Green tests and a green build cleared the arithmetic and the wiring. They did not clear the residuals below, because none of them has a test: the bounds suite drives the garden-space Field and not its sibling, the goldens pin the harvest truncation and not its inversion, and the precision census covers the crop cards and not the category legend.

---

## Executive summary

The wave held. All 31 findings closed in rounds 1 and 2, the 6 code-review residuals (N-1..N-6), the security re-review's HIGH-1 and its three LOWs, and the four untested mutants are all present and correct at HEAD (table below). The engine is self-consistent: for a family of 4 on the Family Basics preset I re-derived the self-sufficiency headline, the savings total, the buffered footprint and the mid-range yield from `crops.js` by hand for all three goals and every figure matched the shipped functions to the last digit; the three-bed soil bill is $563.04 with 45/23/8 bags and 4.09 cu yd on the settled volume, exactly as recorded. The engine-to-renderer seam is closed: `harvestTimeline`, `yieldEstimates`, `savingsEstimate.annualSavings` and `savingsEstimate.currency` have zero hits in `src/` and `api/`, both the server sanitiser and the client `normalisePlan` are build-from-allowlist, and the only model-supplied numbers that reach the page are the succession `plantings` / `intervalWeeks` integers, clamped on both sides and left on purpose.

Nothing new is CRITICAL, HIGH or MEDIUM. The nine LOWs are, once again, the residual shape this wave keeps producing: a fix that reached the site it named and stopped one sibling short. The N-5 metric-floor drift was closed on `GardenSpaceField` and is still live on `ProduceTargetField` (50 lb becomes 50.71 lb on an untouched focus and blur, and typing the floor itself lands on 50.71). The M-8 frost truncation, which clamps the END of a warm crop's harvest window, produces an inverted window when the START is already past first frost: a zone-3 sweet potato prints `Harvest Sep 18 – Sep 15` beside its Frost-risk badge, the timeline draws no harvest bar, and the paid plan drops the crop from its harvest timeline without a word while still promising 42 lb in the yield section. The M-2 precision sweep reached the crop cards and the crop database and not the category legend, which reads `Herbs 0.0 m²` on the default Family Basics selection for every metric customer. The R2-L3 bare-activation fix reached the grace panel and not the paywall form, so a customer with a stored key who pastes it again after a transient outage burns a second activation slot. And the regenerate dialog tells the customer the quota is "20 hourly generations" when the server and the Terms say 20 per rolling 24 hours.

One finding is about the records rather than the code. The round-2 review's "expected customer-visible movement" table, `Homestead/CLAUDE.md` and the workspace handoff all quote 33.7 % and $761 for the family of 4; HEAD prints 35.9 % and $815.40, and `calc-golden` SB-3/SB-4 have pinned exactly those two figures since stage A (`e9cf852`). No engine input changed between the round-1 fix and HEAD, and no Family Basics input combination prints $761, so the code is right and the documents are wrong. Support should be briefed on the figures the customer actually sees.

---

## Regression pass — every fix recorded in stage A, stage B and round 2, at HEAD `4ef8be9`

Every row was read at HEAD; rows marked "driven" were also exercised through the shipped bundle this session.

| Source | Id | Fix | Status at HEAD | Where |
|---|---|---|---|---|
| Eng | H-1a | headline on the conservative yield | PRESENT, driven (35.92 % = 431 / 1200) | `src/App.jsx:1310-1313` |
| Eng | H-1b | savings capped at household need (`computeSavingsRows`) | PRESENT, driven ($815.40 = Σ min(mid, need) × price) | `:1343-1358` |
| Eng | H-2 | plan numbers from the engine, model keeps prose | PRESENT (0 hits for the removed fields; `engineYieldRows` / `engineHarvestRows`; `currency` + `engineSavings` on screen and in the report) | `api/generate.js:540-624`, `src/App.jsx:5055-5090`, `:5307-5312`, `:5620` |
| Eng | H-3 | soil bags, subtotals, cost on the settled volume; Cost Savings prefill follows | PRESENT, driven (45/23/8, $563.04) | `:1853-1878`, `:2134-2167`, `:6297` |
| Eng | M-1 | `PATH_BUFFER = 1/(1-0.30)`; copy derived from the constant | PRESENT | `:164-165`, `:1675-1676` |
| Eng | M-2 / L-3 | SFG spacings; `1/9` not `0.11` | PRESENT (0 literal `0.11`, 10 × `1 / 9`, peas 0.125, arugula/lettuce/parsnip 0.25) | `src/data/crops.js` |
| Eng | M-3 / L-6 | `lbsPerQuart` on green beans and carrot, `SAUCE_QUART_LBS`, `PINT_LBS = 13/9` | PRESENT | `crops.js:433,580,593`; `src/App.jsx:6668-6683` |
| Eng | M-4 | Full Homestead excludes `parentCrop` children | PRESENT | `:241-245` |
| Eng | M-5 | `GardenSpaceField`, wired to the payload, loader clamp | PRESENT | `:4317-4385`, `:4668`, `:7922-7924` |
| Eng | M-6 | BLS prices, dated footnote | PRESENT (potato 0.94, tomato 2.00, lettuce 3.47) | `crops.js:83,118,269,472`; `src/App.jsx:6622-6624` |
| Eng | M-7 | zone note + provenance comment; zones 1/2/12/13 absent by ruling | PRESENT | `:375-387`, `:2749-2755` |
| Eng | M-8 | `harvestEndEffective` read at all four render sites and by the plan | PRESENT, driven (see LOW-2 for the inversion it leaves) | `:704-710`, `:3006`, `:3053`, `:3220`, `:5076` |
| Eng | L-1 | `fmtAreaValue` / `fmtMassValue` on both crop-database surfaces and the breakdown card | PRESENT | `:506-515`, `:1782`, `:5974-5977`, `:6072-6073` |
| Eng | L-2 | exact conversion constants | PRESENT | `:149-154` |
| Eng | L-5 | FX disclosure on the Soil tab | PRESENT | `:2179-2180` |
| Eng | L-7 | `daysInYear` in the timeline | PRESENT | `:605-607`, `:2982` |
| Eng | L-8 | reversed / same-day manual frost refused with an on-screen reason | PRESENT | `:625`, `:2777-2787` |
| Eng | L-9 | `moneyDecimals` (JPY 0) | PRESENT | `:496-497`, `:2116`, `:2167` |
| Eng | I-8 | zero-crop 400 before the per-licence bucket | PRESENT | `api/generate.js:818-828` |
| Code | H-1 | generation lives in `App` (`generatePlan`, `planGeneratingRef`, no unmount abort) | PRESENT | `src/App.jsx:8423-8508`, `:4414-4428` |
| Code | H-2 | `keyError` renders above the "Already purchased?" disclosure | PRESENT | `:4068-4078` |
| Code | M-1 | `?key=` success lands on `#growing-plan` | PRESENT | `:8153-8156` |
| Code | M-4 | empty selection honoured on load | PRESENT | `:7693-7701` |
| Code | M-5 | `normalisePlan` at the one write site | PRESENT | `:4984-5029`, `:8481` |
| Code | M-6 | deny leg re-reads storage; prefill note names whose key it is | PRESENT | `:8270-8273`, `:3952`, `:4127-4135` |
| Code | L-1 | unreadable 200 distinguished from a body that said no | PRESENT | `:8455-8466` |
| Code | L-2 | month filter before sort, screen and report | PRESENT | `:5145-5147`, `:5475-5477` |
| Code | L-3 / N-2 | 44 px: header pills, small `PillSelect`, both resets, crop rows, footer links, brand, About/Blog | PRESENT | `:7116`, `:1099-1100`, `:6487`, `:6910`, `:1584`, `:7528`, `:7151`, `:7181`, `:7194` |
| Code | L-4 | `setTab={changeTab}` | PRESENT | `:8716` |
| Code | L-5 | `planAbortReasonRef` | PRESENT | `:8411`, `:8441`, `:8494` |
| Code | L-6 | preservation note follows the unit toggle | PRESENT | `:6938-6951` |
| Code | L-7 / N-4 | break-even `Infinity`; three reachable hero rungs, dead rung gone | PRESENT | `:6361-6363`, `:6422-6426` |
| Code | def. M-2 | `mixOverrides` leaves clamped; Subtotal through `fmtDecimal` | PRESENT | `:7768-7794`, `:2167` |
| Code | def. L-4 | cleared Field restores the value | PRESENT | `:1022-1038` |
| Code | def. L-3 | completeness gate on the four always-producible sections | PRESENT | `api/generate.js:941-952` |
| Sec | H-1 | per-licence bucket read at the gate, bumped only on a verdict, exemption marker | PRESENT | `api/validate-key.js:423-430`, bumps `:490,571,637,674,694`, marks `:489,543,636,700` |
| Sec | HIGH-1 (re-review) | mint on an instance rejection; bound device passes the gate | PRESENT | `:636`, `:268-277`, `:424-428` |
| Sec | LOW-1 (re-review) | exemption deleted inside `bumpLicenceBucket`; pool-full mint gated on our store | PRESENT | `:254`, `:540-544` |
| Sec | LOW-2 (re-review) | localhost origins non-production only, both files | PRESENT | `validate-key.js:26-40`, `generate.js:39-52` |
| Sec | LOW-3 (re-review) | origin gate is an if/else; both headers must pass when both present | PRESENT, identical logic in both files | `validate-key.js:131-133`, `generate.js:125-127` |
| Sec | L-1 | preview origins gated on `VERCEL_ENV` | PRESENT | `validate-key.js:122-126`, `generate.js:116-120` |
| Sec | L-2 | `store_id_misconfig` and `validation_exception` transient | PRESENT | `generate.js:392`, `:438` |
| Sec | L-3 | `X-XSS-Protection: 0` | PRESENT | `vercel.json` |
| Sec | L-5 | 415 before the body parse, both routes | PRESENT | `validate-key.js:378-381`, `generate.js:735-738` |
| Sec | L-7 | rightmost `x-forwarded-for` | PRESENT | `validate-key.js:157-161`, `generate.js:151-155` |
| Sec | L-8 | `.npmrc` comment names `npm config ls` | PRESENT | `.npmrc` |
| Sec | I-4 | comment names the one counter-disclosure exception | PRESENT | `validate-key.js:708-713` |
| Code | N-1 | hero and stat on the settled volume, `cuYdWithSettling` | PRESENT, driven (110.4 cu ft, 4.09 cu yd) | `src/App.jsx:1875`, `:2083-2093`, `:2112-2114` |
| Code | N-3 | `fmtMassRounded(0)` → `"0"` | PRESENT | `:530` |
| Code | N-5 | one `toDisplay` for value and bounds on the garden field | PRESENT, driven (10 sq ft holds over five cycles) | `:4329-4332` |
| Code | N-6 | footnote names the pea direction; romaine proxy disclosed | PRESENT | `:6945-6948`; `crops.js:52-58`, `:264-266` |
| Code | L-6 (4 mutants) | M16 render-drive L6-1..5; M18 plan-generation L6-4/5 + L6b; M20 L6-1..3; M23 L6-6..10 | PRESENT in the suites | `tests/render-drive.test.mjs:633-647`, `tests/plan-generation.test.mjs:384-452` |
| Hygiene | upstash 1.38.4 | quarantine honoured, bumped after it opened | PRESENT | `package.json` (`4ef8be9`) |

No fix regressed and none is partial.

---

## Findings (most severe first — all LOW)

### [LOW] R3-1 — `ProduceTargetField` drifts at its metric floor: the N-5 class, on the sibling the fix did not reach (CONFIRMED)

**File:** `src/App.jsx:1366-1368` (value at one decimal, bounds unrounded), `:1392` (`min={Math.round(min)} max={Math.round(max)}`), `:1376-1383` (commit).

**Defect:** the displayed value is `Number((value * LB_TO_KG).toFixed(1))` but the bound handed to `Field` is `Math.round(MIN_PRODUCE_PER_PERSON_LBS * LB_TO_KG)`, so at the floor the box shows 22.7 kg against a minimum of 23 kg, and `Field.commit` clamps the untouched value up before the skip-if-equal guard can see it as unchanged. Round 2 closed exactly this on `GardenSpaceField` (N-5, "a bound and the value it bounds must be the same expression") and did not sweep the one other Field that converts its bounds the same way.

**Failure scenario:** a metric customer at the 50 lb floor (or one who types 20, 22.7 or 23 kg, meaning "the minimum") focuses the Annual-produce field and tabs away. The stored target becomes 50.706 lb (+1.41 %), the headline percentage falls by the same share, and the box now shows 23.0.

**Evidence (driven, `probe-drift.mjs`, real `Field.commit` over the real `ProduceTargetField` locals lifted from the source):**
```
metric floor 50 lb      stored after 5 cycles: 50.70632030252184 | shown: 22.7(min 23), 23(min 23), ... | drift: 1.413%
metric ceiling 800 lb   stored: 800    | metric mid 300 lb  stored: 300    | imperial floor 50 lb  stored: 50
typed 20 kg  -> stored 50.70632030252184 lb   (floor is 50 lb = 22.680 kg)
typed 22.7 kg -> stored 50.70632030252184 lb
control: GardenSpaceField metric floor after 5 cycles: 10   (the round-2 fix holds)
```
It is one step and it converges, which is why it is LOW; the ceiling does not drift (362.9 displayed, 363 bound).

**Fix:** the same shape as N-5: one `toDisplay = (lbs) => metric ? Number((lbs * LB_TO_KG).toFixed(1)) : lbs` for the value and both bounds, and drop the `Math.round` in the JSX. Add a `bounds` case beside N-5.1 that drives this field at 50 lb.

---

### [LOW] R3-2 — the M-8 frost truncation inverts the harvest window when harvest starts after first frost; the paid plan then drops the crop silently while still listing its yield (CONFIRMED)

**File:** `src/App.jsx:700-710` (`harvestEndEffective = frostRiskAtHarvest ? firstFall : harvestEnd`, no check that `harvestStart <= firstFall`), `:3215-3223` (`CropDatesCard` prints start – end), `:3053-3055` (timeline; `splitRange` returns nothing for `end < start`), `:5075-5077` (`engineHarvestRows` skips the row with `continue`), `:5232-5259` (yield section still lists the crop).

**Defect:** clamping the END of an interval to a boundary without checking the START produces an end-before-start interval. Two warm crops have `transplant + harvestStartWeeks` past the first fall frost in the colder zones: sweet potato in zone 3 and ginger in zones 3–7 (both hemispheres).

**Failure scenario:** a zone-3 customer adds sweet potatoes on Planting Dates. The card prints `Sweet Potatoes  Frost risk  Transplant out Jun 5  Harvest Sep 18 – Sep 15`; the timeline row draws the growing bar and no harvest bar. On the paid Growing Plan the harvest timeline omits sweet potato with no note, while "Estimated yields" three cards below reads `14 plants · ~42 lb`. Two paid sections disagree about whether there is a harvest at all.

**Evidence (driven, `probe-c.mjs`, 2,520 rows = 9 zones × 2 hemispheres × 82 crops × sow overrides):**
```
inverted windows 12   by zone {north-z3:2, north-z4:1, north-z5:1, north-z6:1, north-z7:1, south-…same}
distinct crops 2: sweet_potato, ginger
  z3 sweet_potato  printed Sep 18 - Sep 15 | raw end Oct 9 | badge true
  z3 ginger        printed Jan 8, 2027 - Sep 15 | raw end Feb 5, 2027 | badge true
CropDatesCard text: Sweet Potatoes Frost risk Transplant out Jun 5 Harvest Sep 18 – Sep 15
timeline harvest bars drawn for that row: 0 | grow bars: 1
engineHarvestRows for that crop: []
engineYieldRows (still in the plan): [{"crop":"Sweet Potatoes","plants":14,"yieldLbs":42,...}]
```
None of the ten default Planting-Dates crops is affected in any zone, which keeps this LOW.

**Fix:** in `computePlantingDates`, when `crop.season === "warm" && harvestStart > firstFall`, set `harvestEndEffective = null` and a new flag (`noHarvestBeforeFrost: true`); have `CropDatesCard` print "No harvest before first frost in this zone" instead of a range, and have `PlanRenderer` / the report either list the crop in the harvest section with that note or drop it from the yield section too. Pin it in `calc-golden` beside D-6..D-11 with the zone-3 sweet potato.

---

### [LOW] R3-3 — the category legend prints `Herbs 0.0 m²` on the default selection in metric: the M-2 class at the one site the precision sweep did not reach (CONFIRMED)

**File:** `src/App.jsx:1233` (tooltip) and `:1247` (legend), both `(e.space * conv).toFixed(1)`; the hero stat at `:1651-1653` (`decimals={1}`) has the same shape for tiny selections.

**Defect:** stage A replaced the fixed one-decimal print with `fmtAreaValue` on the crop-database table, the crop-database card and the per-crop breakdown card. `CategoryBar` kept `toFixed(1)`, so a category whose total is under 0.05 m² prints as zero while the card directly below it prints the same crop at three decimals.

**Failure scenario:** a metric customer opens Self-Sufficiency for the first time (Family Basics, family of 4, default goal). The legend reads `… Legumes 0.6 m² Brassicas 1.1 m² Herbs 0.0 m²`; the Basil card beside it reads `Space 0.023 m²`.

**Evidence (driven, `probe-d.mjs`, real `CategoryBar` through `react-dom/server`):**
```
Family Basics / 4 / default, metric legend: Leafy greens 5.0 m² Root vegetables 8.4 m² Fruiting 7.2 m² Legumes 0.6 m² Brassicas 1.1 m² Herbs 0.0 m²
Salad Garden / 1 person / fresh-only, metric legend: Leafy greens 0.9 m² Fruiting 0.9 m² Herbs 0.0 m²   (herb = 0.361 sq ft)
preset sweep (3 presets × 4 sizes × 3 goals): legend rows printing 0.0 m²: 20
single-crop cells (82 × 4 × 3 × 4): legend 0.0 m² in 427 of 3,936; hero "Garden space" stat 0.0 m² in 270 (all sub-0.5 sq ft single-herb selections)
```

**Fix:** `fmtAreaValue(e.space, metric)` at both `CategoryBar` sites; for the hero stat, either route it through the same helper or accept it (it needs a single herb at "rarely" for one person to print zero). Add a `render-drive` case beside M2b-1 that renders `CategoryBar` for the default selection in metric and asserts no `0.0 m²`.

---

### [LOW] R3-4 — the regenerate dialog says "20 hourly generations"; the server and the Terms say 20 per rolling 24 hours (CONFIRMED)

**File:** `src/App.jsx:4652` (`"… This will use one of your 20 hourly generations."`) and the comment at `:4647`; `api/generate.js:66-67` (`RL_LICENCE_MAX = 20`, `RL_LICENCE_WINDOW_SEC = 86400`), `:826` ("fair-use limit of 20 plans in 24 hours"); `public/terms.html:118` ("20 plan generations per rolling 24-hour period").

**Defect:** the one dialog a customer reads before spending a quota slot understates the cost of the slot by a factor of 24.

**Failure scenario:** a customer with a fresh plan clicks Regenerate to try a different sun setting, reads "hourly", regenerates several times, and hits `429 … 20 plans in 24 hours` with no warning that the allowance was daily.

**Evidence:** `grep -n "hourly\|24 hours" src/App.jsx api/generate.js public/terms.html` — the three sources disagree; the server constant is the fact.

**Fix:** "… one of your 20 generations per day." Consider reading the number from one shared constant if the client ever gets one.

---

### [LOW] R3-5 — a garden space or produce target entered in metric prints as a raw float once the customer switches to imperial, in the input box, the report and the prompt (CONFIRMED)

**File:** `src/App.jsx:4329` (`toDisplay` has no rounding on the imperial branch), `:1366` (`displayValue = metric ? … : value`), `:5471` (report `spaceStr` = `${gardenSqFt} sq ft`), `api/generate.js:636` (prompt line `Garden space: ${input.gardenSqFt} sq ft`).

**Defect:** a value committed in metric is stored as `v / SQFT_TO_SQM` (or `v / LB_TO_KG`) with full float precision; the imperial display prints the canonical unrounded, unlike `BedEditor`, which rounds in both modes.

**Failure scenario:** a customer types 37.2 m² on the Growing Plan tab, later flips the header toggle to Imperial. The field reads `400.41746750160166`, the downloaded report's meta line reads `Garden space: 400.41746750160166 sq ft`, and the model is told the same. The produce field does the same (25 kg → `55.11556554621939`).

**Evidence (driven, `probe-e.mjs`, SSR of the real components and the real report builder):**
```
GardenSpaceField input value, imperial, canonical set from 37.2 m2: 400.41746750160166
ProduceTargetField input value, imperial, canonical set from 25 kg: 55.11556554621939
report meta line: 400.41746750160166 sq ft
client sends gardenSqFt 400.41746750160166 -> server prompt gets 400.41746750160166
```

**Fix:** round on the imperial branch too (`Number(sqft.toFixed(1))`, `Number(lbs.toFixed(1))`), keeping the skip-if-equal guard byte-identical to the new display expression; round `spaceStr` in the report and `gardenSqFt` in the payload to one decimal. This is the "Round all displayed numbers" rule in the workspace `CLAUDE.md`.

---

### [LOW] R3-6 — the client accepts a garden space up to 100,000 sq ft; the server silently clamps it to 50,000 before the prompt (CONFIRMED)

**File:** `src/App.jsx:4316` (`GARDEN_SQFT_MAX = 100000`), `:7922-7924` (loader clamp to the same), `api/generate.js:491` (`clampNum(body.gardenSqFt, 1, 50000, 200)`).

**Defect:** two bounds for one field. The M-5 field, its persistence and its "too small" banner all honour 100,000; the prompt never sees more than 50,000.

**Failure scenario:** a customer with 1.5 acres enters 65,000 sq ft. The tab shows 65,000, the report's meta line shows 65,000, and the plan the model wrote was for 50,000.

**Evidence (driven, `probe-e.mjs`, `sanitiseInput` lifted from `api/generate.js`):** `60000 -> 50000`, `100000 -> 50000`, `50000 -> 50000`, `10 -> 10`.

**Fix:** align the two (raise the server to `GARDEN_SQFT_MAX`, or lower the client to 50,000 and say so on the field). Pin the pair in `plan-generation` beside L6b.

---

### [LOW] R3-7 — the paywall form always activates bare: pasting a key that is already stored on this device burns a second activation slot (the R2-L3 class, on the sibling site) (CONFIRMED by code path)

**File:** `src/App.jsx:8371-8392` (`activateKey` → `validateKeyRemote(key, "")` at `:8379`, no read of `LS_KEY` / `LS_INSTANCE`); server `api/validate-key.js:434-448` (no `instance_id` → the fresh-device branch) and `:577` (`LS_ACTIVATE` mints a new instance). The grace panel's `saveGraceKey` at `:4459-4489` already re-reads the stored key and validates with the stored instance first (R2-L3, 2026-06-10); the paywall form does not.

**Defect:** the paywall form has no "is this key already mine" check, so a re-paste of the customer's own key from the same device is a fresh `/activate`.

**Failure scenario:** mount validation hits a transient outage; the H-2 message reads "We couldn't reach the licence server … reload to try again." The customer opens "Already purchased?" and pastes the same key instead. The outage has cleared; the server pre-check passes; `/activate` mints `browser-xxxx` #2 for the same physical device and the client overwrites `hhp_instance`. The old instance stays counted against the 3-device pool. Do it once more on a second device and the third real device reads "activation limit reached" and is told to contact support.

**Evidence:** code path above; no branch between `activateKey` and the fetch consults storage, and the server's only non-mutating path requires an `instance_id`.

**Fix:** in `activateKey`, if `loadState(LS_KEY, "") === key` and `LS_INSTANCE` is stored, call `validateKeyRemote(key, storedInstance)` first (the `saveGraceKey` shape) and fall through to the bare activate only on a definitive rejection or `retry_activation`. Add a mount-chain-style case: stored key + instance, paywall form re-paste of the same key → one `/validate` call carrying the instance, zero `/activate`.

---

### [LOW] R3-8 — the records quote 33.7 % and $761 for the family of 4; HEAD prints 35.9 % and $815.40, and the goldens have pinned those two figures since stage A (CONFIRMED)

**File:** `docs/code-review-2026-09-06-rereview.md:315-316` (the "expected customer-visible movement" table), `Homestead/CLAUDE.md:366` and `:419`, the workspace handoff `docs/HANDOFF-2026-09-07-paid-products-fix-wave-SHIPPED.md` (same figures); against `tests/calc-golden.test.mjs:450-451` (`SB-3 B self-sufficiency = 35.9167%`, `SB-4 B savings = $815.40`, pinned in `e9cf852`).

**Defect:** the round-2 reviewer's re-derivation used a basis that does not correspond to the shipped preset and default goal, and the pair was copied into the spec and the handoff as "the numbers a customer now sees." They are not.

**Failure scenario:** a customer writes in about their headline; support quotes 33.7 % / $761 from the spec; the customer's screen says 35.9 % / $815.

**Evidence (driven, `probe-a.mjs` + `probe-g.mjs`):** independent re-derivation from `crops.js` for Family Basics × 4 people × 300 lb: `fresh_preserving` 35.92 % / $815.40 / 344.8 sq ft; `full_year` 47.60 % / $1,087.20; `fresh_only` 24.37 % / $543.60 — every figure identical to the shipped functions. A sweep of goal × family size (3–5) × target (250–350) finds no Family Basics combination printing $761 (the only 33.7 % hit is 3 people at a 330 lb target, with $611.55). `git diff 75ec332 HEAD` shows no engine constant changed.

**Fix:** correct the three documents to 35.9 % and $815 (the old midpoint figures were 47.8 % and $815 → the H-1 movement for this case is the headline 47.8 % → 35.9 %; the cap changes the savings for this preset by $0 because no crop over-produces its need at "fresh + some preserving" except basil by 0.2 lb). Nothing in the code needs to move.

---

### [LOW] R3-9 — the model's prose sits directly under the engine's savings figure with nothing but the prompt keeping a second number out of it (PLAUSIBLE)

**File:** `api/generate.js:528` (the only guard: "Do not state any of them"), `:713-716` (`savingsEstimate.note` ≤ 600 chars, `topSavers`), `src/App.jsx:5331-5335` (the note renders inside the savings card, beneath the engine's total) and `:5623` (report).

**Defect:** H-2 removed every numeric field a model could fill, which closes the structured seam completely. The prose fields (`note`, `summary`, `tips`, `monthlySchedule.tasks`) are unconstrained, and a model that writes "you should save roughly $900 a year" in `savingsEstimate.note` puts a second figure in the same card as the engine's $815, which is the "two numbers for one thing" shape the wave was raised to remove. No client or server check inspects the prose.

**Repro that would settle it:** generate ten plans on the paid tab (this review made no live calls) and grep `savingsEstimate.note`, `summary` and `tips` for `\$\d`, `\d+ (lb|kg)` and `\d+ plants`. Anthropic's tool-use models follow a negative instruction most of the time, not always.

**Fix (if it fires):** a cheap belt on the server: if `savingsEstimate.note` matches a currency amount or a `\d+ (lb|kg|plants)` phrase, drop the sentence containing it (or blank the note), and log it so the prompt can be tightened. Not worth building before the repro shows a hit.

---

## Observations (not defects)

- **O-1 — grace window plus a transient `?key=`.** A customer who paid minutes ago, has `hhp_pending`, and opens the email link during a licence-server blip is unlocked by the grace window with the key stripped from the URL and not offered in the grace panel's paste box (`src/App.jsx:8138-8161` then `:8248-8252`). `tests/paywall-mount-chain.test.mjs` M-3.5 asserts exactly this ("the stale prefill is closed too"), so it is a ruling, not a gap; the panel copy sends them back to the email link, which retries. If it ever gets a second look: prefill the grace panel's box (never the paywall's) and never auto-validate.
- **O-2 — zone 11 in the southern hemisphere labels "last frost Jul 15, first frost Jul 1"** (`src/App.jsx:2938-2944`, `formatDate` without a reference year): the first frost is 1 July of the following year (a 351-day window), and without the year suffix the option reads inverted. Cosmetic; add the year when the two dates straddle it.
- **O-3 — the 401 copy from `/api/generate` says "re-enter your key on the home page"** while a `paid` session has no key-entry UI until reload; it is only reachable when a key is disabled between mount and generate. Pre-existing, unchanged, LOW at most.

---

## Still open from round 2 (recorded and deliberately left; not new findings)

| Item | Source | Status at HEAD |
|---|---|---|
| Corn and shelled-pea quart weights (basis question) | round-2 "Left, on purpose"; standing ruling | Open, routed to engineering-verifier; not a defect |
| `bug-scan` 11 × `REACT-INDEX-KEY` on static lists | stage A / B / round 2 | Still exactly 11 |
| 415 / 403 / 405 return before the per-IP limiter | security re-review LOW-4, accepted | Unchanged, accepted |
| The `?key=` prefill after a revoked stored key | M-6 ruling 2026-09-07 | Kept, with the "whose key" copy (`:4127-4135`) |
| A full-pool key whose activation-limit error carries no `meta` still earns the exemption | round-2 "Accepted" | Unchanged, accepted |
| `successionPlanting` `plantings` / `intervalWeeks` still model-supplied | stage A "left on purpose" | Unchanged; clamped both sides |
| Cost Savings does not print the surplus figure it computes (`totalSurplusLbs`) | stage A "left on purpose" | Unchanged |
| `LEMONSQUEEZY_API_KEY` rotation in LemonSqueezy | security M-1 owner action | Not verifiable from here |
| `@upstash/redis` 1.38.4 | round 2 hygiene | **Closed** at `4ef8be9` |
| Spec deltas to `Homestead/CLAUDE.md` | stage A / B / round 2 | Applied 2026-09-07, except the figures in R3-8 |
| Live-Buy checklist after the licence-path deploy | round-2 deploy gate | Recorded PASS in `Homestead/CLAUDE.md`; not re-run here (no live calls) |
| Zones 1, 2, 12, 13 | standing ruling | Absent on purpose |

---

## Blast radius / siblings to check

Inside this repo every sibling site the round-2 records name was walked: the four consumers of `baseResults` (Growing Plan, Cost Savings, Preservation, the Self-Sufficiency hero), the four `fmtMassRounded` sites, the four `harvestEndEffective` readers plus `engineHarvestRows`, the two consumers of `totalCostWithSettling`, the two handlers that now read `hhp:instance:`, and the mirrored origin / 415 / transient logic in both API files. The residuals above are the sites those walks found.

For the sibling products (carried forward from rounds 1 and 2, with this round's additions):

- **R3-1 (a bound rounded separately from the value it bounds)** — grep every converted Field in **Aero-Calc, Growroom, Vertica, FaminePrep** for `Math.round(min)` / `Math.round(max)` beside a `toFixed(n)` display. The fix shape is one `toDisplay` for both.
- **R3-2 (clamping the END of a window at a boundary the START may already be past)** — any product with a season, frost or deadline truncation. Sweep for `start > boundary` after the clamp, not just `end > boundary` before it.
- **R3-3 (a legend or tooltip still on `toFixed(1)` after a precision sweep)** — **Growroom** per-plant footprints, **Vertica** per-site volumes, **Aero-Calc** nozzle flows: grep `toFixed(1)` on converted values in chart legends and tooltips, not just in cards.
- **R3-7 (a paywall form that activates bare while a key is stored)** — **Aero-Calc, Growroom, Vertica, FaminePrep, HeatLens, Mortar** share the `PaywallOverlay` lineage; ask whether the form's `activateKey` consults `LS_KEY` / `LS_INSTANCE` before `/activate`.
- **R3-4 (client copy naming a quota the server does not enforce)** — grep each product's confirm / alert strings for "hourly", "per hour", "20" against its `RL_LICENCE_WINDOW_SEC`.
- **R3-8 (a review's "customer-visible movement" table copied into the spec without a golden)** — before quoting a figure in a handoff, take it from the suite that pins it.
- Rounds 1–2's list still stands: H-1 (a paid request inside a conditionally-rendered tab), H-2 (a licence message with one render site inside a collapsed disclosure), N-1 (a buffered quantity on bags and money but not the headline), N-2 (a 44 px sweep that reaches only named controls), M-3 (a model echoing a currency), M-5 (server sanitises, client trusts).

---

## Verified clean this session (do not re-audit without a diff)

- **Every round-1 and round-2 fix is present at HEAD** (table above); none regressed, none partial.
- **The family-of-4 arithmetic** on all three goals (headline, savings, footprint, mid-range yield) re-derived independently from `crops.js` and matched the shipped engine to the digit; `calc-golden` SB-3/SB-4 pin the same two figures.
- **The soil bill**: 96 → 110.4 cu ft settled, 4.09 cu yd, 45/23/8 bags, $563.04; the Cost Savings prefill reads the same total.
- **The engine-to-renderer seam**: 0 hits for `harvestTimeline`, `yieldEstimates`, `annualSavings`, `savingsEstimate.currency`, `normaliseCurrency` in `src/` and `api/`; `sanitisePlan` and `normalisePlan` are build-from-allowlist; `PlanRenderer` and `buildPlanReportHtml` print `currency` and `engineSavings`; `additionalProperties: false` at every schema level.
- **The paywall mount chain, read end to end**: `paid` starts `false`, `validating` starts `true`; the URL-key leg persists the key before `setPaid(true)` (so `GrowingPlanTab` never mounts with `licenceKeyMissing` for a URL-validated customer); `LS_INSTANCE` is neither read nor wiped on the URL path; the grace window is bounded at both edges and only an expired stamp is cleared; `Checkout.Success` writes the stamp and unlocks; a transient failure never wipes; a definitive `valid:false` is the only wipe; a 400 never grants (`validateKeyRemote` returns `valid:false` without `transient`).
- **`/api/validate-key` gate order and bucket discipline**: read-only gate, bumps only on definitive negatives, marks on valid / pool-full (our store) / instance rejection, exemption deleted inside the bump, bound device passes; the 415 gate, the if/else origin gate and the rightmost-XFF fallback are byte-identical in logic across both API files.
- **`/api/generate`**: shape check and zero-crop 400 before the per-licence bucket; `gardenSqFt` travels as sq ft and `producePerPersonLbs` as lb with `displayUnits` as a separate flag; the completeness gate requires the four always-producible sections.
- **Loaders**: every localStorage read clamps / coerces / allowlists (family size, goal, selection, beds, soil overrides, companion, planting incl. `referenceYear` and `sowMethodChoice`, crop-db, cost savings, plan inputs incl. `gardenSqFt`, preservation `freshPct`); there is no JSON import surface in this product.
- **Drift guards** on `BedEditor` (all eight fields), the soil price and percentage fields, the Cost Savings price field and `GardenSpaceField`: value and bounds share one expression; five untouched cycles move nothing (garden field driven this session; the others verified by expression and by the bounds suite).
- **Headers**: `vercel.json` CSP unchanged from round 2 (no `'unsafe-inline'` in `script-src`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS with `preload` (no submission, per ruling), `X-XSS-Protection: 0`; `index.html` viewport has no `maximum-scale` / `user-scalable=no`; `lemon.js` loads from `assets.lemonsqueezy.com`.
- **Build**: exit 0, chunk name matches the live deploy recorded in `Homestead/CLAUDE.md`, `incl. settling` marker present.

---

## Recommendation

**Ship as is.** Nothing here is worth a deploy on its own. Batch R3-1 through R3-7 into the next hygiene pass (each is a few lines and each needs one pinned case; R3-1, R3-3 and R3-7 are the ones that touch what a customer reads or pays for); correct the three documents for R3-8 today so support quotes the right figures; run the R3-9 repro the next time a real plan is generated for any other reason.

*Every finding above is reported; none is fixed. No product file was modified. Harness: `node_modules/.cache/hhp-r3/` (gitignored).*

---

## Outcomes (fix round, 2026-09-07)

**Branch:** `fix/rereview-3-2026-09-07` off `main` @ `4ef8be9`. Grant: "please fix all".
**Anthropic credit spent:** none. No live endpoint was called. Every reproduction runs the shipped source through the suites' own extractors and esbuild bundles, with `fetch` stubbed.
**Verdict by exit code:** `npm test` **exit 0** (9 suites; last line `render drive: 157/157 checks OK.`; suites now 8 / 106 / 169 across 34 mounts / 57 / 63 / 48 / 19 / 300 / 157). `npm run build` **exit 0**; the chunk carries `No harvest before frost`, `generations per day` and the 25000 ms constant. `tools/bug-scan.mjs` 0 high / 0 medium / 11 low (the same 11 `REACT-INDEX-KEY` rows). `tools/security-scan.mjs` 0 critical / 18 high / 2 medium / 1 info against round 2's 16 high: the two new rows are `[EVAL]` on the two new `new Function` lifters in `tests/bounds-and-sanitisers` and `tests/calc-golden`; no shipped-code delta, and the 2 mediums are still the `ORIGIN-STARTSWITH` false positives.
**Control (fail direction):** every new case was run against `git show main:src/App.jsx` / `main:api/generate.js` copies through `HHP_APP_SRC` / `HHP_GENERATE_SRC`. Red there, green on the tree: bounds 4 rows (R3-1.1, R3-1.5, R3-1.7, R3-5.p1), plan-generation 5 (R3-5.w1/w2, R3-4.3/4/5), paywall mount chain 13 (R3-7.1/8/9/10, a.1/3/5/6/7, T.2/3/4/6), calc-golden 21 R3 rows plus 5 missing-declaration rows, generate licence gate 9 (R3-9.2 to R3-9.7), render drive 13 (R3-3.1 to 3.6, R3-2.r1/r2/r3/r4/r8/r9/r11).

| Id | Outcome | Change (file:line, fixed tree) | Pinned by | Verified by |
|---|---|---|---|---|
| R3-1 | **FIXED** | `src/App.jsx:1412` one `toDisplay` for value and both bounds; `:1439` `min={min} max={max}` (was `Math.round(min)` / `Math.round(max)`). The commit guard reads the same `toDisplay`. | `bounds` R3-1.1 to R3-1.7 (the real `Field.commit` over the lifted closure AND the lifted JSX props, so the harness measures both revisions) | five cycles at the metric floor: pre-fix stored 50.706 lb, now 50; typing 20 kg lands at 50.04 lb (within one display step); ceiling, mid-range and imperial controls unchanged |
| R3-2 | **FIXED** | `computePlantingDates` `:738` new third state `noHarvestBeforeFrost` (warm crop, `harvestStart >= firstFall`) with `harvestEndEffective = null`; readers gated on the flag: timeline edge `:3056`, timeline row label `:3175` ("No harvest before frost", "No harvest" on phones), card badge `:3236` and Harvest row `:3288` ("None before first frost (would start Sep 18)"), `engineHarvestRows` `:5177` keeps the row with null months and the flag, `PlanRenderer` `:5206` / `:5362` yield card reads the flag ("14 plants · no harvest before frost"), `PlanHarvestChart` `:5557` prints the reason across the month cells, report harvest row `:5715` and yield card the same | `calc-golden` R3-2.1 to R3-2.16 (engine, `engineHarvestRows`, the report, and a 9 zones x 2 hemispheres x 82 crops sweep: 0 inverted cells, the flag on exactly the 12 cells the review counted, sweet potato and ginger only); `render-drive` R3-2.r1 to r11 (card, timeline row with a harvest-colour count, paid plan, chart) | the reviewer's own `probe-c` rerun against the fixed source: `rows checked 2520 | inverted windows 0` (was 12) |
| R3-3 | **FIXED** | `:521` `magnitudeDecimals` is the one rule; `fmtAreaValue` / `fmtMassValue` read it; `CategoryBar` tooltip `:1267` and legend `:1282` go through `fmtAreaValue`; the hero "Garden space (incl. paths)" stat `:1700` takes its decimals from the same rule | `render-drive` R3-3.1 to R3-3.6 (Family Basics metric legend, the imperial control, and the one-herb hero case) | rendered census over all 3,936 single-crop cells through the real `CategoryBar`: **0** legend rows print a bare `0.0 m²` (the one substring hit is corn's real `10.0 m²`); the 330 hero cells the review's rule flagged: **0** still render `0.0 m²`. The reviewer's `probe-d` census counts with its own `toFixed(1)`, so its 427 / 270 / 20 do not move; its rendered lines now read `Herbs 0.046 m²` and `Herbs 0.034 m²` |
| R3-4 | **FIXED** | `:4742` "This will use one of your 20 generations per day." (was "20 hourly generations"); the comment above it names `RL_LICENCE_MAX` / `RL_LICENCE_WINDOW_SEC` | `plan-generation` R3-4.1 to R3-4.5 (the number and the period are read off `api/generate.js`, so the copy cannot drift from the constant) | pre-fix control fails R3-4.3/4/5; the bundle carries the new string |
| R3-5 | **FIXED** | display boundary: `:1412` (produce) and `:4409` (garden) round the imperial branch too, the guard reads the same expression, the stored value is never rounded; prompt boundary: the tab's `gardenSqFt` `:4648` and the payload's `producePerPersonLbs` `:4770` at one decimal, and `api/generate.js:644` / `:651` round in the prompt itself; report `:5606` `spaceStr` at one decimal | `bounds` R3-5.p1/p2; `calc-golden` R3-5.1 to R3-5.8 (box, report meta line, prompt); `plan-generation` R3-5.w1/w2 (the lifted payload literal) | 37.2 m² stored as 400.41746750160166 now shows 400.4, travels as 400.4, prints `Garden space: 400.4 sq ft` in the prompt and the report; an untouched blur on it writes nothing. Reviewer's `probe-e` rerun: `400.4 / 55.1 / 400.4 sq ft` |
| R3-6 | **FIXED** | `api/generate.js:479` `GARDEN_SQFT_MAX = 100000`, `:499` `clampNum(body.gardenSqFt, 1, GARDEN_SQFT_MAX, 200)` (was a literal 50000). One value on both sides; the client's `GARDEN_SQFT_MAX` is unchanged | `calc-golden` R3-6.1 to R3-6.5 (server constant equals client constant; 65,000 and the ceiling reach the prompt unclamped; above the ceiling still clamps; the server floor is at or below the client floor) | pre-fix control: 65000 -> 50000. With one bound the report's meta line and the prompt carry the same figure by construction |
| R3-7 | **FIXED** | `:8569` `activateKey` re-reads storage first: when the pasted key equals the stored key and an instance is stored, `validateKeyRemote(key, storedInstance)` runs first (non-mutating); valid unlocks, transient and pool-full are answered as themselves, only a definitive rejection or `retry_activation` falls through to the bare activation (the `saveGraceKey` shape, R2-L3) | `paywall-mount-chain` R3-7.1 to R3-7.12 (the real `activateKey` lifted and driven: one call carrying `inst-mine`, zero bare calls; outage and pool-full fire no activation; stale instance falls through to exactly one; a different key and a clean device still activate bare) | pre-fix control: the re-paste was one bare call (R3-7.1 red) |
| R3-8 | **FIXED (document)** | `docs/code-review-2026-09-06-rereview.md`: the two table rows (`:315-316`) now read 47.8 % -> **35.9 %** and $815.40 -> **$815.40** with the reason the cap moves this case by $0; a dated correction note above the table; the three prose mentions (`:31`, `:237`, `:238`) flagged inline and left as the record of what was measured | `calc-golden` SB-3 / SB-4 already pin 35.9167 % and $815.40 (since `e9cf852`) | `git diff 75ec332 HEAD` on engine inputs is unchanged (the review's own check); SB-3 / SB-4 green. `Homestead/CLAUDE.md` and the workspace handoff are outside this repo and are the main session's to correct |
| R3-9 | **CONFIRMED and FIXED** (was PLAUSIBLE) | reproduced with stubs, no live call: the pre-fix handler passed a note carrying `$1,234` and `42 lb` through untouched (control R3-9.2 / 9.3 red), and a scratch SSR of the real `PlanRenderer` prints that note directly under the engine's total (`engine total on the card: true / model note reaches the card: true true / total before note: true`). Fix at the server response boundary: `api/generate.js:694-703` `ENGINE_FIGURE_RE` + `scrubEngineFigures` drop the SENTENCE carrying a currency amount, a weight or a plant count and log it; `:743-744` `sanitisePlan` applies it to `savingsEstimate.note` and drops a `topSavers` entry that carries a figure. The note may end up empty; the completeness gate keys on the block, so the plan still ships | `generate-licence-gate` R3-9.1 to R3-9.9 (dollar, lb, kg, plant count, rand, spelled-out currency; an all-figure note ships empty; a clean note is byte-identical; month tasks and tips are untouched) | the client is unchanged on purpose: the server owns the boundary, the same way it owns the numbers |

### Sibling shapes (fleet round-3 list)

| Shape | Result | Evidence |
|---|---|---|
| (a) mount effect wipes the key slot after an await without re-reading it | **PRESENT, FIXED** | `src/App.jsx:8336` `slotReplaced = loadState(LS_KEY, "") !== storedKey` read AFTER the await: a valid verdict on the old key still unlocks the session but no longer writes the old key over the newer one; a definitive rejection no longer wipes a slot it does not own and holds "A licence was saved in another tab while this one was loading. Reload to use it."; `:8200` the `retry_activation` leg inside `attempt` wipes `LS_INSTANCE` and retries bare only while the slot still holds the key it validated. Pinned by `paywall-mount-chain` a.1 to a.7 (an `onFetch` hook swaps storage during the await) with a.c1 / a.c2 controls (no swap: revoked still wipes, stale still retries). Pre-fix control: a.1/3/5/6/7 red |
| (b) paywall form activates bare while a key is stored | covered by **R3-7** | above |
| (c) another converted `Field` with `Math.round(min)` beside a `toFixed` display | **ABSENT after R3-1** | `grep -n "Math.round(min)\|Math.round(max)\|min={Math.round\|max={Math.round" src/App.jsx` matched only `:1392` (pre-fix `ProduceTargetField`), now gone. The other converted displays are the eight `BedEditor` fields (`:2264-2300`, `toFixed(2)` / `toFixed(1)` in BOTH modes against `bLen` / `bDepth` bounds that the bounds suite already drives) and `GardenSpaceField` (N-5) |
| (d) third-state copy at a `!x` gate reached the card but not a sibling surface | **ABSENT** | `grep -n "{!\w[A-Za-z0-9_.?]* &&" src/App.jsx` finds four gates: `!frostDates` (`:2890`) and `!licenceKeyMissing` (three sites). `frostDates` is null for two causes (manual mode with a missing or reversed date; zone mode with an unknown zone), but the zone loader (`:7827` `hasKey(ZONE_FROST_DATES, saved.zone) ? saved.zone : 7`) closes the second, and the manual hint names which date is missing. `licenceKeyMissing` is a two-state boolean computed at mount. The only three-state gate in the product was R3-2's, now rendered on every surface |
| client abort vs validator worst path | **CLIENT WAS SHORTER, FIXED** | client `validateKeyRemote` aborted at **15,000 ms**; server `api/validate-key.js` `LS_TIMEOUT_MS` **8,000 ms** with two sequential legs on a fresh-device activation (`:448` pre-check validate, `:577` activate) = **16,000 ms** plus five Upstash round trips and a cold start, and no `maxDuration` config on that file. Now `src/App.jsx:110` `VALIDATE_TIMEOUT_MS = 25000` (2 x 8 s + 9 s headroom), `:889` arms the abort with it. Pinned by `paywall-mount-chain` T.1 to T.6: both constants read off both files, `client >= 2 x server + 4000`, and a fetch that settles only through its `AbortSignal` returns the transient branch with the constant as the armed delay. Pre-fix control: T.2/3/4/6 red |

### Left, on purpose

- **The free Self-Sufficiency tab still counts a flagged crop's yield** (it is zone-agnostic by design; the planting-date tabs and the paid plan now agree with each other). Wiring frost into the free headline is a product decision, not this round's fix.
- **Prose outside the savings card** (`summary`, `tips`, `monthlySchedule.tasks`) is not scrubbed. Only the note sits under the engine's total; a task that says "plant 12 basil plants" is the model doing its job.
- **The report's `spaceStr` rounds in the builder as well as at the tab**, so the meta line is safe whatever a future caller passes.
- **`tests/render-drive` M2b-1 keeps its substring needle `'0.0 m²'`**; it passed and it is not this round's, but a preset that ever prints `10.0 m²` on that card would false-fail it. Digit-bound it when it is next touched (R3-3.1 is written that way).
- **Deploy gate re-armed:** `src/App.jsx` changed on the licence path (`activateKey`, the mount effect, the abort budget) and `api/generate.js` on the response path. `vercel.json` and the CSP are untouched. §21 of `Homestead/CLAUDE.md` still applies before the next deploy: open thehomesteadplan.com with DevTools, click Buy, LemonSqueezy overlay inside ~1.5 s with zero CSP / Trusted-Types errors at $39.99. Not runnable from an undeployed branch, and no live call was made here.
- **Nothing committed, nothing pushed.** Files touched: `src/App.jsx`, `api/generate.js`, six suites under `tests/`, `docs/code-review-2026-09-06-rereview.md`, and this file.
