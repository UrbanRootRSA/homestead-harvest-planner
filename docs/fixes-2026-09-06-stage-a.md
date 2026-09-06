# Fixes — Stage A: the engineering review of 2026-09-06

**Repo / branch:** `Homestead/homestead-harvest-planner`, `fix/audit-2026-09-06` (from `2b46161`)
**Scope:** every finding in `docs/engineering-review-2026-09-06.md` — 3 HIGH, 8 MEDIUM, 9 LOW, plus the INFO items that were free to close.
**Not in scope:** `docs/code-review-2026-09-06.md` and `docs/security-review-2026-09-06.md` (Stage B), except where the same defect is closed here — recorded below.
**Grant's mandate:** "Please fix ALL issues found and verify all your fixes", "make the choices yourself". H-2 was pre-decided as option (b).

## Verification, by exit code

| Command | Result |
|---|---|
| `npm test` (7 suites) | **exit 0** — quarantine 8/8, bounds 59/59, paywall mount chain 131/131, licence gate 24/24, analytics 19/19, **calc-golden 259/259**, **render drive 46/46** |
| `npm run build` | **exit 0** — 33 modules, `dist/assets/index-sojfBi8y.js`, 402.00 kB / 114.47 kB gzipped |
| `node ../../tools/bug-scan.mjs .` | **exit 0** — 0 high, 0 medium, 11 low (all `REACT-INDEX-KEY` on static lists; pre-existing pattern, none introduced) |
| `node --check api/generate.js` | clean |

**Two new suites, both proven non-vacuous against the pre-fix tree** (`HHP_APP_SRC` / `HHP_CROPS_SRC` / `HHP_GENERATE_SRC` point either harness at a saved copy of `2b46161`):

| Suite | Against the tree | Against pre-fix source (control) |
|---|---|---|
| `tests/calc-golden.test.mjs` | 259/259, exit 0 | **72/172, 100 failed**, exit 1 |
| `tests/render-drive.test.mjs` | 46/46, exit 0 | **4/42, 38 failed**, exit 1 |

`calc-golden` pins the arithmetic; `render-drive` bundles the real `src/App.jsx` with esbuild and renders the real components through `react-dom/server`, because `npm run build` proves JSX parses and nothing more.

The goldens reproduce the review's own tables **to the digit** by running the shipped functions over a crop table restored to the review-era constants (four of those constants were themselves findings): `$70.92`, `59.22` months, `47.6 %`, `22 / 397 / 2,955` sq ft, `$1,102.00`, `$5,113.50`, soil bags `45 / 23 / 8` and `$563.04`, snap beans `50` quarts.

---

## Disposition

| Finding | Severity | Confirmed? | Action | Verified by |
|---|---|---|---|---|
| **H-1** savings and headline on the wrong yield basis, surplus counted as money | HIGH | reproduced exactly ($128.91 vs $70.92; 63.3 % vs 47.6 %) | **fixed** — `src/App.jsx:1273` (headline on the conservative basis), `src/App.jsx:1306-1322` (new `computeSavingsRows`, savings capped at household need), copy at `:1589`, `:1610`, `:6479` | calc-golden RA-1..RA-10, RB-1..RB-7, RC-1..RC-7, BD-7..BD-15; render drive H1-1..H1-4 |
| **H-2** every number in the paid plan invented by the model | HIGH | reproduced from the request payload and the tool schema | **fixed, option (b)** — schema and prompt stripped (`api/generate.js:479-560`, `:467`, `:585`, `:596`, `:641`, `:652`); plan sections rendered from the engine (`src/App.jsx:4946-4990`, `:5105-5145`, `:5183-5200`, `:5435`, `:5468-5480`, `:5499`) | calc-golden H2-1..H2-33, RP-1..RP-11; render drive H2-1..H2-12 |
| **H-3** soil bill computed on the un-buffered volume | HIGH | reproduced (39/20/7 bags and $489.60 against a card recommending 110.4 cu ft) | **fixed** — `src/App.jsx:1804-1830` (`cuftWithSettling`, `costWithSettling`, `totalCostWithSettling`), render `:2059`, `:2067`, `:2091`, `:2109`, `:2121`; caller `:6176` | calc-golden H3-1..H3-20, SO-1..SO-6; render drive H3-1..H3-9 |
| **M-1** `PATH_BUFFER = 1.30` fails its own dimensional check | MED | reproduced (0.30/1.30 = 23.1 %, not 30 %) | **fixed** — `src/App.jsx:164-165`, UI copy `:1631` | calc-golden C-9..C-12, RA-3, RB-3, RC-3; render drive M1-1..M1-3 |
| **M-2** five crops spaced 2–4× denser than the SFG chart | MED | reproduced against squarefootgardening.org figures in the review | **fixed** — `src/data/crops.js` peas 0.125, arugula/lettuce/parsnip 0.25 | calc-golden S-1..S-7 |
| **M-3** one crop-blind canning constant across 40 crops | MED | reproduced (snap beans 34 quarts where NCHFP says 50) | **fixed, narrower than the review proposed** — `lbsPerQuart` on green beans and carrots, `SAUCE_QUART_LBS` for the sauce product; corn and shelled peas deliberately left (see Deviations) | calc-golden PR-1..PR-11 |
| **M-4** Full Homestead selects parents *and* variety children | MED | reproduced (350.45 vs 295.45 lb/person/yr) | **fixed** — `src/App.jsx:242` | calc-golden M4-1..M4-4 |
| **M-5** the plan can never say the garden is too small | MED | reproduced (`gardenSqFt` derived from the selection, no other path) | **fixed** — new `GardenSpaceField` `src/App.jsx:4213-4291`, wired `:4463-4470`, `:4693`, `:4705`, sanitiser `:7695` | calc-golden M5-1..M5-6; render drive M5-1..M5-6 |
| **M-6** grocery price defaults stale against BLS | MED | reproduced against the review's FRED figures | **fixed** — potato 0.94, field tomatoes 2.00 (general + determinate), leaf lettuce 3.47; footnote dated `:6479` | calc-golden P-1..P-5 |
| **M-7** zone table is whole-zone 3–11, undated, and treats a hardiness zone as a frost date | MED | confirmed by reading | **fixed in part** — the on-screen note and the provenance comment ship (`src/App.jsx:353-372`, `:2694-2699`); zones 1/2/12/13 **deferred with reason** (see Deviations) | render drive M7-1, M7-2 |
| **M-8** printed harvest window not truncated at first frost | MED | reproduced (zone-3 tomato printed to 30 Oct against a 15 Sep frost) | **fixed** — `harvestEndEffective` `src/App.jsx:693`, read at `:2950`, `:2998`, `:3164` | calc-golden D-6..D-11; render drive M8-1, M8-2 |
| **L-1** 31 of 82 crops print `0.0 m²`; four yield ranges collapse | LOW | reproduced by census over all 82 crops | **fixed** — one `fmtAreaValue` / `fmtMassValue` pair used by both the desktop table and the mobile card (`src/App.jsx:506-515`, used at `:1738`, `:5853`, `:5856`, `:5951`, `:5952`) | calc-golden L1-1..L1-10; render drive L1-1, L1-2 |
| **L-2** three conversion constants truncated below exact | LOW | reproduced | **fixed** — `src/App.jsx:149`, `:153`, `:154` | calc-golden C-5..C-8 |
| **L-3** `0.11` where `1/9` is meant, 12 crops | LOW | reproduced (9.09 per sq ft, not 9) | **fixed** — 10 remaining crops now `1 / 9`; the other two moved to 0.25 under M-2 | calc-golden S-8..S-13 |
| **L-4** yield-unit sanitiser defaults to `lb` on any non-`kg` string | LOW | confirmed by reading | **closed by H-2** — `yieldEstimates` no longer exists on either side of the wire, so the defaulting line is gone | calc-golden H2-14, H2-28 |
| **L-5** Soil tab lacks the FX disclosure Cost Savings carries | LOW | confirmed by reading | **fixed** — `src/App.jsx:2121` | render drive L5-1 |
| **L-6** `PINT_LBS = 1.5` against NCHFP's 1.444 | LOW | reproduced | **fixed** — `src/App.jsx:6526` (`13 / 9`) | calc-golden C-14, PR-2, PR-18 |
| **L-7** timeline divides by a hardcoded 365 | LOW | reproduced | **fixed** — `daysInYear` `src/App.jsx:588`, used at `:2926` | calc-golden L7-1..L7-4 |
| **L-8** reversed or zero-length manual frost dates accepted silently | LOW | reproduced (−245-day growing window) | **fixed** — `src/App.jsx:608`, plus an on-screen reason at `:2722-2731` | calc-golden L8-1..L8-6; render drive L8-1 |
| **L-9** JPY rendered with two decimals | LOW | reproduced | **fixed** — `moneyDecimals` `src/App.jsx:496-497`, used at `:2059`, `:2110` | calc-golden L9-1..L9-9; render drive L9-1, L9-2 |
| **I-1** `caloriesPer100g` is dead data with mixed bases | INFO | confirmed | **fixed in part** — cowpea corrected to the fresh figure with its source; the four dried-herb entries are now flagged in the schema header rather than silently re-based on a number I could not source | reading; the field is referenced nowhere in `src/` or `api/` |
| **I-2** `servingsPerLb` in the spec, on zero crops | INFO | confirmed | **reported, not fixed** — the file is `Homestead/CLAUDE.md`, outside this repo (see Spec deltas) | — |
| **I-3** no calculation goldens exist | INFO | confirmed | **fixed** — `tests/calc-golden.test.mjs` (259 cases) plus `tests/render-drive.test.mjs` (46), both wired into `npm test` | control runs above |
| **I-4** `bags1 / bags1_5 / bags2` are dead and duplicate the render's rule | INFO | confirmed | **fixed** — removed in the H-3 change; the render is the only place a volume becomes bags | calc-golden H3-20 |
| **I-5** spec says garden space comes from Tab 2 or manual; neither existed | INFO | confirmed | **half fixed** — manual entry now exists (M-5); the Soil-total prefill is not wired (see Deviations) | render drive M5-1..M5-3 |
| **I-6** spec says conservative-end for the headline; code used the midpoint | INFO | confirmed | **fixed** — the code now matches the spec (H-1) | calc-golden RB-4 |
| **I-7** custom soil-mix percentages do not normalise | INFO | confirmed | **not changed** — 50/30/30 billing 110 % is disclosed on screen at `src/App.jsx:2008-2011`, and silently renormalising a number the customer typed is worse than showing it back to them | reading |
| **I-8** a zero-crop plan is generated, after the quota slot is spent | INFO | **half NOT A BUG** | the client gate the review asked for **already existed** (`src/App.jsx:4827`, `cropNames.length === 0` disables Generate) and the server already refused — but the refusal sat *after* the per-licence increment. **Fixed** by moving the shape check ahead of the bucket, `api/generate.js:745-752` | reading + `node --check`; the licence-gate suite still passes 24/24 |

### Cross-file closures (recorded for Stage B, not re-litigated here)

- **Code review M-3 — "the model's currency overrides the customer's own selection"**: **closed by H-2.** The model no longer returns a currency, because it no longer returns a savings figure. `normaliseCurrency`, `CURRENCY_SYMBOLS` and `CURRENCY_CODE_TO_SYMBOL` are gone from `api/generate.js`; `src/App.jsx:5190` and the report at `:5499` render `currency`, the customer's own. Pinned by calc-golden H2-18, H2-31, RP-1, RP-2 and render drive H2-1, H2-3.
- **Code review M-2 — the `$NaN` half**: the soil Subtotal was the one money display in the app that skipped the NaN guard. It now runs through `fmtDecimal` (`src/App.jsx:2110`), so a poisoned price prints `-` rather than `$NaN`. **The loader half of that finding is untouched and still Stage B's** — `hhp_soil.mixOverrides` leaf values still reach the computation untyped.

---

## Deviations from the review's suggested fixes, and why

1. **M-3, corn and shelled peas.** The review recommends `lbsPerQuart` for four crops: green beans 2, carrots 2.5, corn 4.5, peas 4.5. I applied two. NCHFP weighs sweet corn **in husk** and shelling peas **in pod**; this app's `yieldPerPlantLbs` for `peas_shell` is 0.08–0.15 lb per plant, which is shelled weight, not pods. Pairing an in-pod purchase weight with a shelled garden yield would over-count jars by roughly 2×, which is the same class of error as the finding. Green beans (whole fresh pods) and carrots (topped roots) weigh the same thing on both sides, so those ship. Sauce is a property of the product, not the crop, so `SAUCE_QUART_LBS = 5` applies to the `sauce` method for any crop — that closes the review's "+70 %, over-counts" case. The pint is derived from the quart at NCHFP's own whole-tomato pint:quart ratio rather than a per-crop pint figure, because the published pint rows for the crops we carry sit within 4 % of that ratio and inventing per-crop pint numbers is exactly what this finding is about. All of this is stated in the code comment at `src/App.jsx:6512-6539` and in the on-screen footnote at `:6780`.
2. **M-7, zones 1, 2, 12 and 13.** Not added. Zones 12–13 are frost-free, which a `{lastSpring, firstFall}` shape cannot express without a new mode, and I had no sourced NOAA freeze-date normals for zones 1–2. Extrapolating the existing ladder would have shipped invented frost dates into a tab where a wrong date kills a crop. Instead the picker now tells anyone outside 3–11 to use manual entry, which is a complete workaround and was already prominent. The limitation and the reason are written into the table's comment (`src/App.jsx:353-372`) so the next person does not "helpfully" fill the gap. **Grant's call if he wants the real rows: it needs sourced normals plus a frost-free mode.**
3. **M-5, the "Use Soil Calculator total" prefill.** The review suggests copying the Cost Savings tab's prefill-button pattern. The garden-space field defaults to, and can be reset to, the derived growing area — but a *soil* total is a volume, not an area, and the Soil tab has no footprint figure to prefill from. Wiring one would mean deriving bed footprints from bed geometry, which is a new calculation, not a fix. Left; noted in I-5.
4. **H-1, the "Estimated yield" stat.** The review's fix (a) changes the self-sufficiency percentage only. I left the yield stat on the midpoint, as `CLAUDE.md` §6 and §7 specify, and labelled it `Estimated yield (mid-range)` so the two numbers on one card cannot read as a contradiction.

---

## Spec deltas owed to `Homestead/CLAUDE.md`

That file is one directory above this repo, so this branch does not touch it. Apply these when the fixes land, or the spec and the code disagree again:

- §5 "Garden space sq ft (from Tab 2 totals or manual)" → "Garden space sq ft — entered on Tab 5, defaulting to the growing area the crop selection needs. There is no Soil-tab prefill."
- §5 output list items 5, 6 and 8 → mark harvest timeline, yield estimates and the savings figure as **rendered by the app**, not returned by the model.
- §6 crop schema → add `lbsPerQuart` (optional), delete `servingsPerLb` (on zero crops — finding I-2), and note that `caloriesPer100g` is unread and carries mixed bases.
- §7 `PATH_BUFFER = 1.30 // multi-bed walkway overhead (Cornell)` → `PATH_SHARE_OF_FOOTPRINT = 0.30; PATH_BUFFER = 1/(1 − 0.30) = 1.4286`.
- §7 self-sufficiency block → `self_sufficiency_pct = min(100, total_yield_CONSERVATIVE_lbs / household_target × 100)`.
- §7 Cost Savings block → `annual_savings = min(annual_yield_lbs, annual_consumption_lbs) × grocery_price_per_lb`.
- §7 Soil block → `bags_X = ceil(component_cuft × SETTLING_BUFFER / X)` and `cost = component_cuft × SETTLING_BUFFER × pricePerCuFt`.
- §8 schema list → drop `harvestTimeline` and `yieldEstimates`; `savingsEstimate` is `{ topSavers, note }`.
- §8 system prompt block → replace the "Match currency" line with the two lines now in `SYSTEM_PROMPT`.
- §21 testing checklist → add the two new suites.

---

## Per-fix detail: before → after

### H-1a — the free headline is reported on the basis the plants were sized on

`src/App.jsx:1273`

```js
// before
const rawSelfSufficiencyPct = householdTarget > 0
  ? (totalYieldLbs / householdTarget) * 100 : 0;
// after
const rawSelfSufficiencyPct = householdTarget > 0
  ? (totalYieldConservativeLbs / householdTarget) * 100 : 0;
```

`totalYieldConservativeLbs` (`:1228`, `:1257`) sums the `expectedYieldLow` the function already computed per crop; `totalYieldLbs` still ships for the yield stat and for Cost Savings. Family of four, Family Basics, full year: **63.3 % → 47.6 %**.

### H-1b — savings are displaced purchase, not production

`src/App.jsx:1306-1322`, a new top-level pure `computeSavingsRows(perCrop, priceOverrides)`.

```js
// before (inline in CostSavingsCalculator's useMemo)
const annualSavings = r.expectedYieldLbs * pricePerLb;
// after
const displacedLbs = Math.min(r.expectedYieldLbs, r.annualNeedLbs);
const surplusLbs   = Math.max(0, r.expectedYieldLbs - r.annualNeedLbs);
const annualSavings = displacedLbs * pricePerLb;
```

Lifted to module scope because the Growing Plan now renders the same total (H-2); two implementations of one rule is how they drift. One person, salad garden: **$128.91 → $70.92**, break-even at $350 **32.58 → 59.22 months**.

### H-2 — the plan's numbers come from this app

`api/generate.js`: `harvestTimeline` and `yieldEstimates` removed from `PLAN_SCHEMA` and from `sanitisePlan`; `savingsEstimate` reduced to `{ topSavers, note }`; `normaliseCurrency` and its two symbol tables deleted; `SYSTEM_PROMPT` and `buildUserPrompt` now tell the model the app prints the figures.

`src/App.jsx`: `engineYieldRows` and `engineHarvestRows` (`:4946-4990`) build the two sections from `computeResults` and `computePlantingDates`; `computeSavingsRows` supplies the total. `PlanRenderer` and `buildPlanReportHtml` take them as props.

```jsx
// before
{y.plants} plants · ~{fmtDecimal(y.estimatedYield, 1)} {y.unit}
<span>{plan.savingsEstimate.currency || currency}</span>
<span>{plan.savingsEstimate.annualSavings.toLocaleString()}</span>
// after
{fmtInt(y.plants)} plants · ~{fmtMassValue(y.yieldLbs, metric)} {metric ? "kg" : "lb"}
<span>{currency}</span>
<span>{fmtInt(Math.round(engineSavings))}</span>
```

The unit-labelling discipline the review praised is preserved: engine rows carry **pounds**, converted at the render boundary with the matching label; `gardenSqFt` still goes to the model as sq ft and `producePerPersonLbs` as lb; `displayUnits` remains an output-only flag. Peak month is the midpoint of the harvest window, stated as such on screen.

### H-3 — the soil card bills what it recommends

`src/App.jsx:1804-1830`

```js
// before
return { ...c, cuft, bags1: Math.ceil(cuft / 1), bags1_5: …, bags2: …,
         cost: cuft * (c.pricePerCuFt || 0) };
// after
const cuftWithSettling = cuft * SETTLING_BUFFER;
return { ...c, cuft, cuftWithSettling,
         cost: cuft * (c.pricePerCuFt || 0),
         costWithSettling: cuftWithSettling * (c.pricePerCuFt || 0) };
```

The breakdown renders `cuftWithSettling`, the bag rows and the subtotal derive from it, the label says "incl. settling" on every one, and the hero MiniStat reads `totalCostWithSettling`. Three 8×4×12 beds, classic mix: **39/20/7 bags and $489.60 → 45/23/8 bags and $563.04**. The Cost Savings "Use Soil Calculator total" button followed the same total (`:6176`) — otherwise its own label would have been false.

### M-1 — the path multiplier

```js
// before
const PATH_BUFFER = 1.30;                       // "~30% of footprint"
// after
const PATH_SHARE_OF_FOOTPRINT = 0.30;
const PATH_BUFFER = 1 / (1 - PATH_SHARE_OF_FOOTPRINT);   // 1.4286
```

UI copy moved from "include 30% extra for paths" to "allow for paths and margins at about 30% of the total footprint", derived from the same constant. Footprints: 20 → 22, 361 → 397, 2,689 → 2,955 sq ft.

### M-8 — the printed harvest window

```js
// added after the frost-risk badge test, which still reads harvestEnd
out.harvestEndEffective = out.frostRiskAtHarvest ? firstFall : out.harvestEnd;
```

`CropDatesCard`, the timeline bars and the edge pills read `harvestEndEffective`; the badge still reads `harvestEnd`. Zone-3 tomato: printed window **7 Aug – 30 Oct → 7 Aug – 15 Sep**, badge unchanged.

### L-1 — one formatter for area, one for mass

```js
function fmtAreaValue(sqft, metric) {
  const v = (Number.isFinite(sqft) ? sqft : 0) * (metric ? SQFT_TO_SQM : 1);
  return v.toFixed(v < 0.1 ? 3 : v < 1 ? 2 : 1);
}
```

Used by the desktop table and the mobile card, so they cannot disagree again. Census over all 82 crops in both unit systems: **0 zero prints, 0 collapsed ranges** (was 31 crops at `0.0 m²`, radish at `0.0–0.0 kg`, three ranges collapsed).

---

## Adjacent things left, on purpose

- **`bug-scan` LOWs (11).** All `REACT-INDEX-KEY` on static lists, including the ones inside the plan sections. Pre-existing pattern; the engine-driven yield rows I added follow the same convention the file already uses. Worth a pass, not worth mixing into this one.
- **Cost Savings does not yet name the surplus on screen.** `computeSavingsRows` returns `totalSurplusLbs` and the tab footnote explains the cap in words, but no figure is displayed. A one-line stat would close the loop; it is new UI, so it waits.
- **The Cost Savings row still shows the capped per-crop figure without a per-row caption.** The tab-level footnote covers it.
- **`successionPlanting` still comes from the model** (`plantings`, `intervalWeeks`). H-2's decision named three sections; succession is a genuine agronomic judgement and this app has no succession engine, so anchoring it would mean building one. Flagged, not fixed.
- **The whole of the code review and the security review.** Stage B.
