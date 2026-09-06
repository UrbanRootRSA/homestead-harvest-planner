# Engineering verification — The Homestead Plan

**Date:** 2026-09-06
**Repo / tip:** `Homestead/homestead-harvest-planner`, `main` @ `a752d42`, working tree clean (two untracked review docs from today's other passes)
**Scope:** every displayed calculation, constant, unit conversion, statutory-equivalent figure, and boundary in `src/App.jsx`, `src/data/crops.js`, `api/generate.js`
**Mode:** READ-ONLY. No product file, test, or constant was modified. All harness code lives in the session scratchpad.
**Prior passes:** engineering audit 2026-05-18 (recorded in `STATUS.md` prose only), paid-tabs audit 2026-04-17. This is the first engineering-verification document in `docs/`.

---

## Verdict

**NEEDS FIXES**

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 8 |
| LOW | 9 |
| INFO | 8 |

The arithmetic is sound. Every formula I re-derived independently matched the shipped code path exactly — 0 mismatches across 60-plus comparisons covering self-sufficiency on three households, bed volume for all three shapes, the full soil run, all five preservation methods at three fresh/preserve splits, and the cost-savings chain. No NaN, no Infinity, no crash at any boundary I could reach.

What needs fixing is not the algebra. It is **which quantity the algebra is applied to**: a savings number credited on production rather than on displaced purchase, a soil bag count taken from a volume the same card says is 15% too small, a paid AI deliverable whose numbers are invented because the app never sends the model its own crop table, and a path multiplier that fails a dimensional check against the geometry it claims to model.

---

## What I ran

| Command | Result |
|---|---|
| `npm test` (5 suites) | **exit 0**. `load-quarantine: 8/8`, `bounds + sanitisers: 59/59`, `paywall mount chain: 131/131 across 27 mounts`, `generate licence gate: 24/24`, `analytics redaction: 19/19`. 241 assertions. |
| Verbatim extraction harness (`engine.mjs`) | Pulled `computeResults`, `computeBedVolumeCuFt`, `computeSoilResults`, `computePreservationForCrop`, `computePlantingDates`, `getFrostDates`, `splitRange`, all conversion constants, `SOIL_MIXES`, `ZONE_FROST_DATES`, and the sanitisers **byte-for-byte by line range** out of `src/App.jsx` into an importable module. Every number below therefore comes from the shipped code path, not a re-typing of it. `node --check` clean, 49 exports. |
| 11 verification scripts | Self-sufficiency two-way (3 households), soil two-way + boundaries, planting dates across 9 zones × 2 hemispheres, cost savings two-way, preservation two-way (5 methods × 3 splits), metric-precision census across all 82 crops, spacing vs the official SFG chart, path-buffer dimensional check, internal crop-table consistency, sanitiser battery. |

**The suite does not test a calculation.** `bounds-and-sanitisers.test.mjs` calls `computeBedVolumeCuFt` (line 371, bed-bound *ordering*) and `computeResults` (line 596, *does it throw on a malformed crop*), and greps the source at line 638. Not one assertion in the repository pins a numeric result from any compute function. Exit 0 on this suite is a statement about crash-safety and the paywall, not about the numbers.

---

## Constants checked

Direction of every conversion was verified, not just the factor.

### Unit conversions — all correct in factor and direction

| Constant | Value in code | Exact / authoritative | Error | Status |
|---|---|---|---|---|
| `SQFT_TO_SQM` :145 | 0.09290304 | 0.3048² = 0.09290304 (NIST SP 811, international foot) | 0 | **CURRENT — exact** |
| `FT_TO_M` :147 | 0.3048 | 0.3048 exact by definition | 0 | **CURRENT — exact** |
| `IN_TO_CM` :148 | 2.54 | 2.54 exact by definition | 0 | **CURRENT — exact** |
| `CUFT_TO_CUYD` :149 | 1/27 | 1/27 exact | 0 | **CURRENT — exact** |
| `LB_TO_KG` :146 | 0.453592 | 0.45359237 (NIST, international pound) | −8.2e−7 rel | CURRENT (truncated, immaterial) |
| `CUFT_TO_L` :150 | 28.3168 | 0.3048³ × 1000 = 28.316846592 | −1.6e−6 rel | CURRENT (truncated, immaterial) |
| `CUFT_TO_CUM` :151 | 0.0283168 | 0.028316846592 | −1.6e−6 rel | CURRENT (truncated, immaterial) |
| `FREEZER_BAG_CUFT` :6171 | 0.1337 | 231 in³ / 1728 = 0.13368056 (1 US gal exact) | +1.5e−4 rel | CURRENT |

Applied at display only in every path I traced. No mid-calculation conversion. Soil component price converts `$/cu ft ÷ CUFT_TO_L → $/L` for display and `× CUFT_TO_L` on commit — correct direction both ways, with the skip-if-equal guard intact (`:1819-1834`). Preservation `shelfInches × 2.54 / 100 → m` and `freezerCuFt × CUFT_TO_CUM → m³` verified against hand values to 1e−12.

### Agronomic and preservation constants

| Constant | Value in code | Authoritative value | Source (retrieved 2026-09-06) | Status |
|---|---|---|---|---|
| `QUART_LBS` :6175 | 3 lb | 3 lb/qt — 21 lb per canner load of 7 quarts, whole/halved tomatoes | nchfp.uga.edu, *Whole or Halved Tomatoes* | **CURRENT** for whole tomatoes; **WRONG when applied crop-blind** (see M-3) |
| `PINT_LBS` :6174 | 1.5 lb | 1.444 lb/pt — 13 lb per canner load of 9 pints | nchfp.uga.edu, same page | CURRENT-ish; +3.8% high, under-counts pints ~4% |
| — snap/Italian beans | (uses 3) | **2 lb/qt** — 14 lb per 7 quarts | nchfp.uga.edu, *Beans, Snap and Italian* | **WRONG for this crop** |
| — thin tomato sauce | (uses 3) | **5 lb/qt** — 35 lb per 7 quarts | nchfp.uga.edu, *Standard Tomato Sauce* | **WRONG for this crop** |
| `SETTLING_BUFFER` :152 | 1.15 | 10–15% settling is the commonly published allowance; some sources overfill 20% | Illinois Extension / raised-bed guidance | PLAUSIBLE (top of the standard band). Attribution to Cornell / U.Minn not verifiable. |
| `PATH_BUFFER` :156 | 1.30 | Fails dimensional check — see H-3/M-1 | derived | **WRONG for the stated assumption** |
| `DEFAULT_PRODUCE_PER_PERSON_LBS` :162 | 300 lb | ERS 2024 vegetables + pulses = **376 lb/capita** (preliminary, primary weight); loss-adjusted vegetable availability ≈ 359 lb (2022); plate-level ≈ 1.6 cup-eq/day | ers.usda.gov, *Vegetable availability declined in 2024* | PLAUSIBLE. No published ERS series equals exactly 300 or the comment's "≈330"; the code's own comment over-specifies the provenance. 50–800 clamp covers every reasonable region. |
| SFG spacing — carrot, radish (16/sq ft), beet, spinach, bush bean, turnip (9/sq ft) | 0.0625 / 0.11 | 16 and 9 per sq ft respectively | squarefootgardening.org, *Find Square Foot Spacing* | **CURRENT** |
| SFG spacing — peas | 0.0625 = **16**/sq ft | **8** per sq ft | squarefootgardening.org, *Square Foot Spacing for Growing Peas* ("sow these seeds eight per square-foot section") | **WRONG — 2× too dense** |
| SFG spacing — arugula | 0.0625 = **16**/sq ft | **4** per sq ft | squarefootgardening.org spacing chart | **WRONG — 4× too dense** |
| SFG spacing — leaf lettuce, parsnip | 0.11 = **9.09**/sq ft | **4** per sq ft (large, 6-in) | squarefootgardening.org spacing chart | **WRONG — 2.27× too dense** |
| SFG spacing — corn, potato (1/sq ft), chives (4), onion (9), leek (4) | 1 / 0.25 / 0.11 / 0.25 | 4 / 4 / 16 / 16 / 9 per sq ft | same chart | Conservative (1.76×–4× MORE space than SFG). Safe direction; not flagged. |
| `groceryPricePerLb` tomato | $2.50 | **$2.003** (Jul-2026); 6-mo range $1.902–$2.689 | BLS via FRED `APU0000712311` | CURRENT within seasonal band, +25% vs latest |
| `groceryPricePerLb` potato | $1.10 | **$0.942** (Jul-2026); 6-mo range $0.847–$0.942 | BLS via FRED `APU0000712112` | **STALE — 17% to 30% above every observation in the last six months** |
| `groceryPricePerLb` lettuce | $2.75 | **$3.469** (Jul-2026, romaine); 4-mo range $3.195–$4.021 | BLS via FRED `APU0000FL2101` | STALE low (−21%) |
| `groceryPricePerLb` bell pepper | $3.25 | BLS series `APU0000712406` **discontinued March 2020** | FRED | UNVERIFIABLE against BLS |
| `ZONE_FROST_DATES` zones 3–11 | whole zones only | USDA 2023 map: **13 zones, each split a/b**; ~half of US grid cells moved a half-zone warmer vs the 2012 map | ers/USDA + extension coverage of the Nov-2023 release | **INCOMPLETE** (see M-7) |
| `yieldPerPlantLbs` tomato | [8, 12] | 10–15 lb or more per plant | UMD Extension, *Growing Tomatoes in a Home Garden* | CURRENT (conservative by design) |
| `yieldPerPlantLbs` potato | [2, 3] | 5–10 tubers per plant ≈ 2–4 lb | LSU AgCenter, *Expected Vegetable Garden Yields* | CURRENT (conservative by design) |

**Constants checked: 30. Stale or wrong: 8** (potato price, lettuce price, `PATH_BUFFER`, four SFG spacings counted as one class, the crop-blind quart constant, incomplete zone table). Two more are unverifiable against a live authority (`SETTLING_BUFFER` attribution, bell-pepper price).

---

## Numeric test cases — computed two ways

Every "code" column below is the verbatim extracted function from `src/App.jsx`. Every "reference" column is an independent re-derivation written from the CLAUDE.md spec, not from the code.

| Case | Reference result | Code result | Match |
|---|---|---|---|
| Household A (1 person, salad set, fresh_only): plants / raw sq ft / buffered sq ft / yield lb / pct | 43 / 15.43 / 20.059 / 45.525 / 15.175% | identical | **YES (1e−9)** |
| Household B (4, Family Basics, fresh_preserving) | 798 / 213.10 / 277.03 / 573.00 / 47.75% | identical | **YES** |
| Household C (6, all 82 crops, full_year) | 3256 / 2068.60 / 2689.18 / 2986.575 / raw 165.92% | identical | **YES** |
| Bed rect 8×4×12 in | 32.0000 cu ft | 32.0000 | **YES** |
| Bed circle d=4 ft × 10 in | 10.4719755119660 cu ft | 10.4719755119660 | **YES** |
| Bed L-shape (8×6 − 4×3) × 12 in | 36.0000 cu ft | 36.0000 | **YES** |
| L-shape cutout ≥ outer | 0 (refused) | 0 | **YES** |
| Soil, 3 bed groups, classic 60/30/10: total / cu yd / with settling | 178.47198 / 6.610073 / 205.24277 cu ft | identical | **YES** |
| Component split + `ceil(cuft/1.5)` bags + `cuft × price` (9 values) | topsoil 107.083/72/\$374.79, compost 53.542/36/\$374.79, sand 17.847/12/\$160.62 | identical | **YES** |
| Preservation, 5 methods × 3 fresh splits (15 cases) | e.g. 100 lb → 67 pints / 34 quarts; 34 bags / 4.5458 cu ft; 13 batches; 120 in shelf | identical on all 15 | **YES** |
| Cost savings ROI identity `(S−C)/C ≡ S/C − 1` | exact | exact | **YES** |
| `breakEvenMonths × monthlySavings ≡ totalSetup` | 350 | 350 | **YES (1e−9)** |
| Garlic zone 7N: `lastSpring − 20 wk`, then `+36 wk` | 2025-11-02 → 2026-07-12 | 2025-11-02 → 2026-07-12 | **YES** |
| All soil-mix percentage sums | 1.000000000000000 ×4 | 1.000000000000000 | **YES** |

**Mismatches: 0.**

---

## Boundary analysis

| Condition | Result | Acceptable? |
|---|---|---|
| Zero crops selected | space 0, plants 0, yield 0, pct 0, target 1200, no category keys, no NaN | Yes |
| Zero crops → LLM `gardenSqFt` | floors to **50 sq ft**; a plan is still generated for a garden with nothing in it | Tolerable, see I-8 |
| Family size 1 (Counter min) | all-82 weekly full_year → 560 sq ft, 565 plants, raw 193.4% capped to 100% | Yes |
| Family size 12 (Counter max; load path clamps 1–12 at `:7118`) | 5305 sq ft, 6502 plants, raw 164.7% capped to 100% | Yes. **20 people is unreachable** — the Counter caps at 12 and `clampInt` re-imposes it on load. |
| Produce target at min 50 lb | raw 1008%, displayed 100% | Yes (cap holds) |
| Produce target at max 800 lb | 63.0% | Yes |
| Produce target 0 (unreachable via UI) | `householdTarget > 0` guard returns pct 0, no division by zero | Yes |
| Crop with `yieldPerPlantLbs[0] = 0` | `plantsNeeded = 0`, space 0, yield 0 — the `yieldLow > 0` guard holds, no Infinity | Yes |
| Crop with `yieldPerPlantLbs = null` | `Array.isArray` guard → `[0,0]`, no NaN propagation into totals | Yes |
| 0% preservation / 100% preservation | 0 jars / full jars, both exact | Yes |
| `freshPct` negative or >100 | produces `preserved > yield` and `preserved < 0` respectively; **unreachable through the UI** (`FRESH_PCT_MIN/MAX` 0–100) and the `preserved <= 0` early return catches the >100 case | Yes, gated |
| Soil: zero beds, qty 0, depth 0, diameter 0, unknown shape | all return 0 cleanly | Yes |
| Soil: negative bed length | `Math.max(0, …)` → 0 | Yes |
| Soil: 20 bed groups × qty 20 × 100×50×48 in | 8,000,000 cu ft, no overflow | Yes |
| Soil: 0.5 × 0.5 × 4 in bed | 0.0833 cu ft → **1 bag of each component** (ceil of a tiny number) | Correct by intent — bags are indivisible |
| Manual frost mode, empty dates | `null`, generation blocked | Yes |
| Manual frost `2026-02-30` | `null` (round-trip rejection works) | Yes |
| Manual frost, same day both | accepted, zero-day growing window, no warning | See L-8 |
| Manual frost **reversed** (fall 2026-03-01, spring 2026-11-01) | accepted, **−245 day growing window**, no warning | See L-8 |
| Southern hemisphere, all 9 zones | both frost dates shifted +6 months; growing windows 120/225/351 days vs 123/228/350 north (the 1–3 day delta is calendar-correct, not a bug) | Yes |
| Zone 11 (near frost-free) | modelled as last frost 15 Jan, first frost 31 Dec → 350-day window; no warm crop is flagged frost-risky | Reasonable proxy |
| Equator / genuinely frost-free | no "no frost" mode; user must invent dates or pick zone 11 | See M-7 |
| Perennials whose harvest lands 1–2 years out (asparagus, blueberry, rhubarb, raspberry, strawberry) | `dayOfYear` returns 374–773; the chart's `splitRange` suppresses out-of-year segments and renders an edge pill instead. **No overflow, no bar drawn past 100%.** | Yes — verified |
| Warm crop sown before last spring frost | **0 crops in zones 3, 7, 11.** Correct. | Yes |
| Frost-risk badge | fires for 21/28 warm crops in zone 3, 10/28 in zone 4, 1/28 in zones 5–8, 0 in 9–11. Cool and perennial crops are excluded by design (correct agronomy). | Yes |
| Unknown goal / unknown frequency string | `?? 0.7` and `?? 0.5` fallbacks fire, no NaN | Yes |
| `sanitizeNum` / `clampInt` / `importedNumber` battery (9 cases incl. `Infinity`, `1e309`, `'abc'`, `NaN`) | every one returns the fallback or the clamp | Yes |

---

# Findings

## HIGH-1 — Cost Savings and the self-sufficiency headline are computed on a yield the plan was not sized for, and credit surplus the household cannot eat

**CONFIRMED** (traced numerically on three households against an independent derivation).

- **Location:** `src/App.jsx:1166-1167` (`yieldMid`, `expectedYieldLbs`), consumed at `:5881` (`annualSavings`), `:1186-1188` (`selfSufficiencyPct`), `:5898` (`breakEvenMonths`).
- **What the code does:** the plant count is sized on the **conservative-low** yield — `plantsNeeded = ceil(annualNeedLbs / yieldLow)` — and then every reported outcome is computed on the **midpoint** — `expectedYieldLbs = plantsNeeded × (yieldLow + yieldHigh)/2`. Savings are then `expectedYieldLbs × pricePerLb` with no ceiling at what the household actually eats.
- **Two compounding mechanisms:**
  1. **Basis mismatch.** Mean `yieldMid / yieldLow` across all 82 crops = **1.4824**. Every displayed yield is on average 48.2% above the yield the plant count was sized against. Worst: horseradish, rosemary, blueberry at 2.00×; best: `tomato_determinate` at 1.20×.
  2. **Surplus credited as savings.** Nothing caps `annualSavings` at `annualNeedLbs × price`. Produce grown beyond the household's own stated annual consumption displaces no grocery purchase.
- **Customer-visible magnitude (money, on a paid tab):**

| Household | lb produced | lb the household eats | Shipped annual savings | Displaced-purchase savings | Overstatement |
|---|---|---|---|---|---|
| 1 person, salad set, fresh_only | 45.5 | 26.4 | **\$128.91** | \$70.92 | **+\$57.99 (+81.8%)** |
| Family of 4, Family Basics, full_year | 760.1 | 561.0 | **\$1,509.06** | \$1,102.00 | **+\$407.06 (+36.9%)** |
| Family of 6, all 82 crops, full_year | 2,986.6 | 2,102.7 | **\$7,423.68** | \$5,113.50 | **+\$2,310.18 (+45.2%)** |

  The hero "pays for itself in X months" stat inherits the error inverted. At a \$350 setup cost the single-person case reads **32.58 months** when the displaced-purchase figure is **59.22 months** — the payback period is understated by 45%.
- **Free-tier consequence:** the same `expectedYieldLbs` drives the headline self-sufficiency %. Against `CLAUDE.md` §6 ("Yield values use **conservative-end for self-sufficiency display**, midpoint for cost-savings ROI") the shipped code uses the midpoint on both. Gap: +3.8 pp (1 person), **+15.7 pp** (family of 4: 63.3% shipped vs 47.6% per spec), +47.8 pp raw (family of 6).
- **Fix (minimal, for bug-fixer):** two independent changes, both one line.
  1. `:5881` — `const annualSavings = Math.min(r.expectedYieldLbs, r.annualNeedLbs) * pricePerLb;` and change the tab footnote at `:6143` to say savings are capped at what the household would otherwise buy.
  2. Either (a) honour `CLAUDE.md` §6 by adding `expectedYieldConservativeLbs = plantsNeeded * yieldLow` to the `computeResults` return and driving `selfSufficiencyPct` from it, **or** (b) amend `CLAUDE.md` §6 to state that the midpoint is deliberate on both tabs and surface the low–high band beside the KPI. `expectedYieldLow` and `expectedYieldHigh` are already computed at `:1168-1169` and already carried through `perCrop` — nothing new needs deriving. Do not silently leave the spec and the code disagreeing.

---

## HIGH-2 — Every number in the paid Growing Plan is invented by the model; the app never sends it a single figure from its own crop database

**CONFIRMED** (traced the full request payload).

- **Location:** `src/App.jsx:4104` (`cropNames = perCrop.map(r => r.crop.name)`), `:4325-4344` (request body), `api/generate.js:582-604` (`buildUserPrompt`), `:660-698` (sanitiser).
- **The prompt audit the brief asked for — the good news first.** `SYSTEM_PROMPT` (`api/generate.js:455-467`) and `buildUserPrompt` contain **zero hardcoded agronomic figures**. No kcal/day, no spacing table, no yield table, no embedded dates. Every number in the user message is threaded from the customer's own inputs: `familySize`, the zone string, two frost-date strings, `gardenSqFt`, `producePerPersonLbs`, and the currency. There is no stale figure shipping in every paid plan. That risk does not materialise.
- **The defect is the inverse.** Because the model receives only crop **names**, it invents:
  - `yieldEstimates[].plants` — the app already computed `plantsNeeded` for every crop and does not send it.
  - `yieldEstimates[].estimatedYield` — the app already computed `expectedYieldLbs` from `yieldPerPlantLbs` and does not send it.
  - `savingsEstimate.annualSavings` — the Cost Savings tab already computes `totalSavings` from `groceryPricePerLb` and does not send it.
  - `successionPlanting[].intervalWeeks` and `plantings` — `daysToMaturity` and `harvestDurationWeeks` exist per crop and are not sent.
  - `harvestTimeline[].startMonth / peakMonth / endMonth` — `computePlantingDates` produces exact dates from the same zone and frost dates and is not sent.
- **Two engines, one product, no reconciliation.** A customer who buys the \$39.99 plan can read one tomato yield on Tab 5, a different one on Tab 6, and a third savings total on Tab 7 — all for the same selection, all inside the same purchase. The server sanitiser's clamps are far too wide to catch this: `estimatedYield` 0–100,000 lb, `plants` 0–9,999, `annualSavings` 0–\$10,000,000. Nothing realistic is ever rejected.
- **What is done correctly and must be preserved:** `gardenSqFt` is sent un-buffered and labelled `sq ft` (`:4223`, `api/generate.js:592`); `producePerPersonLbs` is always lb; `displayUnits` is a separate output flag; and `yieldEstimates[].unit` is an enum `["lb","kg"]` that travels with the value and is rendered as `{y.unit}` at `:4809` and `:5137`. That is the correct unit-labelling discipline and it holds. The HTML report converts `gardenSqFt × SQFT_TO_SQM` with the matching `m²` label at `:5018`.
- **Fix (for bug-fixer, choose one):**
  - **(a) Anchor the model.** Add a per-crop block to `buildUserPrompt` — `name | plantsNeeded | spacingSqFt | yieldLow–yieldHigh lb/plant | expectedYieldLbs | groceryPricePerLb` — and add to `SYSTEM_PROMPT`: "Use the plant counts and yield figures supplied. Do not substitute your own." Note this invalidates the prompt cache once, by design.
  - **(b) Stop asking the model for numbers.** Drop `yieldEstimates`, `savingsEstimate.annualSavings`, and `harvestTimeline` months from `PLAN_SCHEMA` and render those three sections from `baseResults`, the Cost Savings totals, and `computePlantingDates`. Leave the model the prose: summary, monthly tasks, bed layouts, notes, tips.
  - (b) is cheaper, removes an entire class of divergence permanently, and shortens the tool schema. Grant's call.

---

## HIGH-3 — The soil card recommends a settling-buffered volume and then prints bag counts and a cost for the *un*-buffered one

**CONFIRMED** (traced through the shipped render path).

- **Location:** volume line `src/App.jsx:1898-1904` uses `results.totalCuFtWithSettling`; component volume, bag counts, and cost at `:1938-1975` all use `c.cuft`, which is `totalCuFt × c.pct` from `:1680` — no settling buffer.
- **What the customer reads, in this order, on one card:** "96.0 cu ft · 3.56 cu yd · or **110.4 cu ft with 15% settling buffer**" … then "Topsoil 57.6 cu ft — **39 bags** @1.5 cu ft" … then "Estimated cost **\$489.60**".
- **Magnitude** (three 8×4×12-in beds, classic 60/30/10):

| Component | Raw cu ft | Bags shown @1.5 cu ft | Bags needed to cover the settling volume the same card recommends | Short by |
|---|---|---|---|---|
| Topsoil | 57.6 | **39** | 45 | 6 bags (15%) |
| Compost | 28.8 | **20** | 23 | 3 bags (15%) |
| Coarse sand | 9.6 | **7** | 8 | 1 bag (14%) |

  Cost shown \$489.60; cost of the recommended volume \$563.04. **The customer is \$73.44 and 10 bags short**, on a physical purchase, on the most-used free calculator in the product.
- The mitigating copy at `:1983-1986` ("Bag counts round up, so plan to have a little extra") does not close it. Per-component rounding up at 1.5 cu ft granularity yields on average ~0.75 cu ft of slack per component; the settling buffer needs 8.6 cu ft on the topsoil line alone.
- **Fix:** decide whether the buffer is advisory or operative, then make one number carry the decision. Minimal version — compute bags from the buffered volume and label the row accordingly: at `:1940` use `const cuftOrL = metric ? c.cuft * SETTLING_BUFFER * CUFT_TO_L : c.cuft * SETTLING_BUFFER;` with the row label changed to "bags (incl. settling)", or add a second bag row so both numbers are on screen. Do **not** buffer the cost silently without changing the label beside it.

---

## MEDIUM-1 — `PATH_BUFFER = 1.30` fails the dimensional check against the geometry its own comment describes

**CONFIRMED** (dimensional analysis plus arithmetic).

- **Location:** `src/App.jsx:153-156`, applied at `:1181`.
- **The comment says:** "Multi-bed raised gardens typically lose 25-35% **of footprint** to paths. Cornell … lands at ~30%."
- **The code does:** `totalSpaceWithBuffer = cropArea × 1.30`. That makes paths `0.30 / 1.30 = 23.1%` **of footprint**, not 30%. If paths are *p* of the footprint the multiplier must be `1/(1−p)`: p=25% → 1.3333, p=30% → **1.4286**, p=35% → 1.5385.
- **Independent geometric check** (shared paths between 4 ft beds, so each bed carries half a path on each side):

| Bed | Path | Pitch | Path share of footprint | Correct multiplier |
|---|---|---|---|---|
| 4 ft | 1.5 ft | 5.5 ft | 27.3% | 1.3750 |
| 4 ft | 2 ft | 6 ft | 33.3% | 1.5000 |
| 4 ft | 3 ft | 7 ft | 42.9% | 1.7500 |

  `1.30` corresponds to a **1.2 ft path** between 4 ft beds. Extension guidance for a walkable path is 18–36 in; a wheelbarrow needs 30–36 in.
- **Magnitude — a uniform 9.9% under-allocation of garden footprint:** single-person 20 → 22 sq ft; family of 4 361 → 397 sq ft; family of 6 **2,689 → 2,955 sq ft (266 sq ft short)**.
- The UI copy at `:1508-1511` ("Totals above include 30% extra for paths and margins") accurately describes what the code does, so the *label* is honest. The *assumption* is not.
- **Fix:** `const PATH_BUFFER = 1.43;` with the comment rewritten to state the convention explicitly — "paths are 30% of the footprint, so the multiplier is 1/(1−0.30)" — and the UI copy at `:1509` changed from "30% extra" to "paths are about 30% of the total footprint". Alternatively keep 1.30 and rewrite the comment to claim 23%, but then the Cornell citation no longer supports it.

## MEDIUM-2 — Five crops are spaced 2×–4× denser than the official Square Foot Gardening chart the schema cites

**CONFIRMED** against squarefootgardening.org, retrieved 2026-09-06.

- **Location:** `src/data/crops.js`, `spacingSqFt` on `peas_snap`, `peas_shell`, `arugula`, `lettuce`, `parsnip`.

| Crop | Code | Code plants/sq ft | Official SFG | Ratio |
|---|---|---|---|---|
| `peas_snap`, `peas_shell` | 0.0625 | 16.00 | **8** ("sow these seeds eight per square-foot section") | **2.00× too dense** |
| `arugula` | 0.0625 | 16.00 | **4** (large, 6 in) | **4.00× too dense** |
| `lettuce` (leaf) | 0.11 | 9.09 | **4** (large, 6 in) | **2.27× too dense** |
| `parsnip` | 0.11 | 9.09 | **4** (large, 6 in) | **2.27× too dense** |

- Sixteen crops were checked against the chart. The other eleven either match (carrot, radish 16/sq ft; beet, spinach, bush bean, turnip 9/sq ft) or allocate 1.76×–4× **more** space than SFG (onion, chives, leek, corn, potato) — the safe direction, not flagged.
- **Magnitude:** family of 6, all 82 crops — lettuce short 56.0 sq ft, arugula 11.3, `peas_shell` 9.4, `peas_snap` 5.6, parsnip 2.8. **85.0 sq ft raw / 110.6 sq ft with the path buffer, on a shipped total of 2,689 sq ft = 4.1%.** Aggregate impact is small; the *per-crop* numbers the customer reads on the breakdown card are wrong by 2–4×.
- The prior audit (2026-05-18, in memory) recorded "lettuce 1/9 … match published SFG tables". Against the official chart that claim is wrong; leaf lettuce is in SFG's large/6-inch group.
- **Fix:** `peas_snap` and `peas_shell` `0.0625 → 0.125`; `arugula` `0.0625 → 0.25`; `lettuce` and `parsnip` `0.11 → 0.25`. Note `lettuce` and `peas_*` are in three of the four presets, so bed-area outputs move for most users — ship it with a changelog line, not silently.

## MEDIUM-3 — One crop-blind canning constant across 40 crops; NCHFP's own numbers say it is 32% low for snap beans

**CONFIRMED** against nchfp.uga.edu, retrieved 2026-09-06.

- **Location:** `src/App.jsx:6174-6175`, applied at `:6207-6208` to `can`, `sauce`, and `ferment` for all 40 crops that offer a jar method.

| Crop | NCHFP lb/quart | Code | Quarts for 100 lb: code vs true | Error |
|---|---|---|---|---|
| Tomatoes, whole/halved | 3 (21 lb / 7 qt) | 3 | 34 vs 34 | 0% |
| Snap and Italian beans | **2** (14 lb / 7 qt) | 3 | 34 vs **50** | **−32%, under-counts jars** |
| Thin tomato sauce | **5** (35 lb / 7 qt) | 3 | 34 vs 20 | +70%, over-counts |
| Crushed tomatoes / juice | 2.75 / 3.25 | 3 | — | ±8% |

  `PINT_LBS = 1.5` against NCHFP's 1.444 (13 lb / 9 pints) is a further +3.8%, under-counting pints.
- **Mitigated by honest disclosure.** The footnote at `:6410-6415` names the constant as a whole-tomato baseline and gives the correction direction for dense packs ("sauce, corn, peas … 2 lb/pint and 5 lb/quart") and light packs. That is why this is MEDIUM and not HIGH. But the printed number is still the one the customer acts on at harvest, and for snap beans it is a third low.
- This was raised as MEDIUM-1 on 2026-04-17 with the same recommended fix. The constants moved (1→1.5, 2→3) but the crop-blindness did not.
- **Fix:** add an optional `lbsPerQuart` to the crop schema, default 3 where absent, and read it at `:6207-6208` (`jarsQuart = ceil(preserved / (crop.lbsPerQuart ?? QUART_LBS))`, pint = half). Populate from the NCHFP tables for the four crops where the app already knows the answer (green beans 2, corn 4.5, peas 4.5, carrots 2.5) and leave the rest on the documented default.

## MEDIUM-4 — The "Full Homestead" preset selects parent crops *and* their variety children, stacking demand 18.6%

**CONFIRMED** (summed over the shipped `CROPS` table).

- **Location:** `src/App.jsx:222-227` — `full_homestead.selection = Object.keys(CROPS).reduce(…)` selects all 82.
- Eight crops carry `parentCrop` and their own `avgConsumptionLbsPerPersonYear`: `tomato_cherry` 8, `tomato_paste` 12, `tomato_determinate` 15, `butternut_squash` 3, `acorn_squash` 2, `spaghetti_squash` 2, `pumpkin` 3, `lettuce_head` 10.
- **The consumption model is well-calibrated when varieties are not double-selected:** sum over the 74 non-variety crops = **295.45 lb/person/yr**, against a `DEFAULT_PRODUCE_PER_PERSON_LBS` of **300**. That is a genuinely good result and worth preserving. Selecting all 82 pushes it to **350.45 lb (+18.6%)**.
- Consequence: tomato family 60 lb/person/yr (USDA per-capita tomatoes fresh + processed ≈ 89 lb, so not absurd); **lettuce family 30 lb/person/yr against a USDA per-capita of roughly 23–24 lb**. Plant counts, bed area, soil cost, and savings all inherit the 18.6%.
- **Fix:** exclude `parentCrop` entries from the preset — `Object.keys(CROPS).filter(k => !CROPS[k].parentCrop)` — or, if variety coverage is the point of the preset, drop the parent and keep the children. Either way one line. A UI warning when a parent and its child are both ticked would close the manual-selection path too.

## MEDIUM-5 — The Growing Plan can never tell a customer their garden is too small, because the space it is given is derived from the crops they picked

**CONFIRMED.**

- **Location:** `src/App.jsx:4223` — `gardenSqFt = Math.max(50, Math.round(baseResults.totalSpaceRaw))`. Grepped every reference: there is no manual entry and no path from the Soil Calculator totals.
- `SYSTEM_PROMPT` instructs the model: "If the garden space is too small for the requested crops, recommend which to prioritise and which to defer." The space supplied is **by construction exactly the space the selection needs**, so that instruction is inoperative. A customer with a 200 sq ft yard who picks Full Homestead is told they have 2,069 sq ft and receives a plan for it.
- `CLAUDE.md` §5 claims the input is "Garden space sq ft (from Tab 2 totals or manual)". Neither exists. The Tab 5 form collects sun, soil, water, experience, and goals only.
- Related labelling gap: Tab 1 shows the **buffered** figure labelled "Garden space (incl. paths)" (`:1486`); Tab 5 shows the **un-buffered** figure labelled plain "Garden space:" (`:4437`). Same concept, two numbers 30% apart, only one of them qualified. (Sending the un-buffered figure to the model is itself correct and documented — the issue is the un-annotated label on Tab 5.)
- **Fix:** add a "Garden space available" `Field` to the Tab 5 form, defaulting to the derived figure, with a "Use Soil Calc total" prefill button (the Cost Savings tab already has exactly this pattern at `:5821-5843`). Send the user's number, and change the Tab 5 label to "Growing area needed (excl. paths)" so the two tabs stop reading as contradictions.

## MEDIUM-6 — Grocery price defaults: one is 17–30% above every BLS observation in the last six months

**CONFIRMED** against BLS average-price series via FRED, retrieved 2026-09-06.

| Crop | Code | BLS latest (Jul-2026) | Recent range | Error |
|---|---|---|---|---|
| Potatoes, white | \$1.10 | **\$0.942** | \$0.847–\$0.942 (Feb–Jul 26) | **+17% to +30%, high in every month** |
| Tomatoes, field grown | \$2.50 | \$2.003 | \$1.902–\$2.689 | +25% vs latest, inside the seasonal band |
| Lettuce (romaine) | \$2.75 | \$3.469 | \$3.195–\$4.021 | −21%, low |
| Peppers, sweet | \$3.25 | series discontinued Mar-2020 | — | unverifiable |

- Potato is the third-largest saver in the family-of-4 run (\$192.50 of \$1,509.06). At the BLS price it is \$164.85 — \$27.65 of the overstatement is this one constant.
- Errors run in both directions, the table is explicitly disclosed at `:6143` as "2026 US retail averages", and every price is user-editable with a working override chain (`:5876-5880`). That keeps this MEDIUM rather than HIGH.
- **Fix:** re-base the table against BLS `APU0000*` series where one exists, and add the series retrieval date to the footnote at `:6143` so the next auditor knows when the snapshot was taken. Do not hardcode a live fetch — the disclosure plus a date is enough for a one-time-purchase product.

## MEDIUM-7 — The zone table covers whole zones 3–11 only; the current USDA map has 13 zones with a/b half-zones and moved half the US a half-zone warmer

**CONFIRMED** against the USDA 2023 Plant Hardiness Zone Map release.

- **Location:** `src/App.jsx:357-367`.
- The 2023 map (released Nov-2023, built on 1991–2020 normals from 13,412 stations, replacing the 2012 map's 1976–2005 window) has **13 zones each split into a/b half-zones**, and is about 2.5 °F warmer than its predecessor — roughly half of US grid cells shifted a half-zone. The app's table is whole-zone, 3–11, and carries no date.
- Zones 1, 2, 12, 13 have no entry. A zone-12/13 user (south Florida, Hawaii, Puerto Rico) and a zone-1/2 user (interior Alaska) cannot use the zone picker at all.
- The deeper modelling point: **USDA hardiness zones encode minimum winter temperature, not frost dates.** Two locations in the same zone can differ by six weeks in last-frost date. The code comment at `:353-355` calls these "extension-service midpoints", but nothing on screen tells the customer that the zone-derived dates are a coarse proxy.
- The manual-frost mode is a complete workaround and is prominently offered, which caps this at MEDIUM.
- **Fix (ordered by value):** (1) add a one-line note under the zone picker — "Zone dates are regional midpoints. If you know your local frost dates, enter them for a sharper plan." (2) Extend the table to zones 1–2 and 12–13. (3) Re-derive the nine existing rows against NOAA/NCEI 1991–2020 freeze-date normals and stamp the table with its vintage. Half-zones are a larger change and probably not worth it while manual entry exists.

## MEDIUM-8 — The printed harvest window is not truncated at first frost, only badged

**CONFIRMED.**

- **Location:** `src/App.jsx:606-609` computes `harvestEnd = harvestStart + harvestDurationWeeks` with no reference to `firstFall`; `:612-615` sets `frostRiskAtHarvest` but changes nothing.
- Zone 3, tomato: transplant 2026-05-29, harvest printed as **2026-08-07 → 2026-10-30**, first fall frost **2026-09-15**. The last 45 days of the printed window are after the plant is dead. The badge fires (21 of 28 warm crops in zone 3, 10 of 28 in zone 4) but the dates and the 12-month timeline bar both still show the full run.
- The warm-only rule for the badge is correct agronomy — kale, chard, parsnip and the perennials genuinely do run past first frost — so the *badge* logic is right. It is the *dates* that overstate.
- **Fix:** in `computePlantingDates`, add `out.harvestEndEffective = (crop.season === "warm" && firstFall && out.harvestEnd > firstFall) ? firstFall : out.harvestEnd;` and render that in `CropDatesCard` and the timeline while keeping `harvestEnd` for the badge test. Do not overwrite `harvestEnd` itself — `:613` reads it.

---

## LOW

| # | Finding | Location | Detail |
|---|---|---|---|
| L-1 | **Metric display precision — quantified, per the brief** (the display bug itself is the code reviewer's M-2; these are the numbers) | `:5611-5612`, `:5513`, `:5516` | On the **mobile Crop Database card**, `(spacingSqFt × SQFT_TO_SQM).toFixed(1)` prints **`0.0 m²` for 31 of 82 crops (37.8%)** — every crop at 0.0625, 0.11, or 0.25 sq ft: lettuce, spinach, chard, arugula, bok choy, mustard greens, mizuna, tatsoi, carrot, beet, radish, daikon, onion, turnip, parsnip, rutabaga, both green beans, both peas, cowpea, kohlrabi, garlic, leek, shallot, basil, parsley, cilantro, dill, chives, fennel. The **desktop table** uses `.toFixed(2)` and prints a non-zero value for all 82 — 0 crops affected. Yield in kg at `.toFixed(1)`: **radish prints `0.0–0.0 kg`** (true 0.023–0.045), and three crops collapse their whole range to a single repeated figure — `peas_snap` `0.1–0.1` (true 0.091–0.136), `garlic` `0.1–0.1` (true 0.068–0.113), `cilantro` `0.1–0.1` (true 0.068–0.136). Imperial control: 2 crops (radish, `peas_shell`) collapse the same way at 1 dp, so this is not purely a metric problem. |
| L-2 | Three conversion constants truncated below exact | `:146`, `:150`, `:151` | `LB_TO_KG` 0.453592 vs 0.45359237; `CUFT_TO_L` 28.3168 vs 28.316846592; `CUFT_TO_CUM` 0.0283168 vs 0.028316846592. Max relative error 1.6e−6. Immaterial, but `SQFT_TO_SQM` was raised to exact in the 2026-05-18 pass and these were not — finish the job for consistency. |
| L-3 | `0.11` used where `1/9 = 0.111111…` is meant | `crops.js`, 12 crops | Allocates 1.01% more space per plant than 1/9. Conservative direction. |
| L-4 | Yield-unit sanitiser defaults to `lb` on any non-`kg` string | `api/generate.js:681` | `unit: y?.unit === "kg" ? "kg" : "lb"`. The tool schema's `enum: ["lb","kg"]` makes this near-unreachable, but the failure mode is a kg value printed as lb — a 2.2× overstatement. Prefer defaulting to the request's own `displayUnits` rather than to `lb`. |
| L-5 | Soil Calculator lacks the FX disclosure the Cost Savings tab carries | `:1808` vs `:6019` | Cost Savings states "Currency is a display symbol only; no FX conversion is applied." The Soil tab shows `R910.21` for USD-denominated soil with no equivalent note. Same sentence, one more place. |
| L-6 | `PINT_LBS = 1.5` vs NCHFP 1.444 | `:6174` | +3.8%, under-counts pints. The code comment already records the true value as "~1.4 lb/pt". |
| L-7 | Timeline `totalDays = 365`, not leap-aware | `:2770` | In a leap year a 31-Dec bar is clamped to day 365 instead of 366 — 0.27% short. Cosmetic. |
| L-8 | Reversed or zero-length manual frost dates accepted silently | `:534-551` | `{lastSpring: 2026-11-01, firstFall: 2026-03-01}` yields a **−245-day growing window** and generates dates from it. Same-day entry yields a 0-day window. `parseIsoDate` correctly rejects `2026-02-30`, so the validation hook exists — it just does not check ordering. Add `if (firstFall <= lastSpring) return null;` and reuse the existing "block generation" path at `:4209`. |
| L-9 | JPY rendered with two decimals | `:1929`, `:6131` | `¥910.21`. JPY has no minor unit. |

---

## INFO

| # | Note |
|---|---|
| I-1 | **`caloriesPer100g` is dead data.** Present on all 82 crops (83 hits in `crops.js`), **zero references anywhere in `src/` or `api/`**. It is never displayed, never summed, never sent to the model. Several entries are the wrong basis for a garden crop and would ship wrong the day someone renders them: `cowpea` 336 (USDA mature *dry* seed; fresh immature is ~90 and young pods ~44), and `oregano` 265 / `sage` 315 / `tarragon` 295 / `marjoram` 271 are **dried-herb** values sitting beside fresh-weight yields, while `thyme` 101, `rosemary` 131 and `basil` 23 are fresh. Spot-checked correct against USDA FoodData Central: tomato 18, potato 77, sweet potato 86, corn 86, garlic 149, shelling peas 81. Fix the basis before, not after, anything reads the field. |
| I-2 | `servingsPerLb` appears in the `CLAUDE.md` §6 schema and on **zero** of the 82 crops. Spec drift. |
| I-3 | **No calculation goldens exist.** Five suites, 241 assertions, exit 0 — and not one pins a numeric result from `computeResults`, `computeSoilResults`, `computePreservationForCrop`, or `computePlantingDates`. The two calls that do exist test crash-safety and bed-bound ordering. Every HIGH and MEDIUM above would survive a green run. A `tests/calc-golden.test.mjs` extracting the same line ranges I used and pinning ~40 values would cost an hour and close the gap permanently. |
| I-4 | `bags1 / bags1_5 / bags2` computed in `computeSoilResults:1682-1684` are dead — the component render recomputes `Math.ceil(cuftOrL / size)` at `:1962` so the metric path works. Harmless, but two implementations of one rule is how they drift. |
| I-5 | `CLAUDE.md` §5: "Garden space sq ft (from Tab 2 totals or manual)" — neither path exists. See M-5. |
| I-6 | `CLAUDE.md` §6: "conservative-end for self-sufficiency display" — the code uses the midpoint. See H-1. |
| I-7 | Custom soil-mix percentages do not normalise; 50/30/30 bills 110% of the bed volume. Disclosed on screen at `:1875-1878`. |
| I-8 | Zero crops selected still produces a Growing Plan for a floored 50 sq ft garden. Consider gating the generate button on `cropNames.length > 0` — it also saves a wasted quota slot, since `api/generate.js:786-791` increments the per-licence bucket before the model call. |

---

## What I did NOT verify

- **Did not run the app in a browser.** Every display finding is read from the source render path, not from rendered pixels. The 31-crop `0.0 m²` census is computed from the shipped constants and the shipped `.toFixed` calls, not observed on screen.
- **Did not call `/api/generate` or `/api/validate-key`.** No live plan was generated, no Anthropic credit spent, no licence key used. The Growing Plan finding (H-2) is from the request payload and prompt source, not from an observed model response — I have not measured *how far* a model-invented yield diverges from the app's, only established that nothing constrains it.
- **Did not verify the `SETTLING_BUFFER` or `PATH_BUFFER` attributions to Cornell or U. Minn Extension.** I could not locate the specific cited guidance. `SETTLING_BUFFER = 1.15` sits inside the commonly published 10–20% band; `PATH_BUFFER` is refuted on its own stated terms by dimensional analysis, which does not depend on the citation.
- **Did not verify all 82 crops' yields against extension tables** — spot-checked tomato (UMD) and potato (LSU AgCenter) only, both confirmed conservative as designed. `daysToMaturity` was checked for *internal* consistency against `harvestStartWeeks × 7` (81 of 82 within 0.75×min…1.25×max; the one outlier, strawberry at 280 days vs DTM 90–120, is correct behaviour for an autumn-planted perennial), not against published cultivar data.
- **Did not verify the 230 companion-planting relations** — non-numeric, out of scope for this pass.
- **Did not verify `caloriesPer100g` for all 82 crops** — six spot checks against USDA FoodData Central plus the five basis errors named in I-1. The field is dead code, so the effort was not warranted.
- **Did not check zones 1, 2, 12, 13 frost dates** against NOAA normals, because the table has no entries for them.
- **Did not exercise family sizes above 12** — the Counter caps at 12 and `clampInt(…, 1, 12)` re-imposes it on the localStorage path, so the brief's "20 people" boundary is unreachable through any input surface.

---

## Recommendation

**Blocks ship of any new pricing or marketing claim built on the savings number: HIGH-1.** The Cost Savings hero and the break-even stat are the two figures a customer weighs against the \$39.99, and both are overstated by 37–82% on realistic households. Fix `:5881` first; it is one line and one footnote.

**Blocks nothing but should go in the same wave: HIGH-3.** A customer standing in the aisle with a bag count that is 15% short of what the same card told them they need is a support email and a second trip. Free tier, highest traffic, one-line fix.

**HIGH-2 is a design decision, not a patch.** Option (b) — render the numeric sections from the app's own engine and leave the model the prose — removes a whole divergence class and shortens the tool schema. Grant should pick before anyone writes code.

**MEDIUM-1 through MEDIUM-4 are all one-line constant or preset changes** with quantified magnitudes above; batch them. MEDIUM-5 through MEDIUM-8 need small UI additions and should wait for a scoped session.

**Do all of it behind a new `tests/calc-golden.test.mjs` (I-3).** Every finding in this document survived a green five-suite run. Pin the numbers in the tables above before changing any of them, so the fix is provable and the next regression is caught by the suite rather than by an audit.
