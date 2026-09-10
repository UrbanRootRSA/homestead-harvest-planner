# Code review — the round-3 fix diff (`4ef8be9..d088473`)

**Product:** The Homestead Plan ($39.99, LIVE at thehomesteadplan.com). React 18 + Vite 5 single-file calculator (`src/App.jsx`) with a paid LLM tab (`api/generate.js` → Anthropic) and a LemonSqueezy validator on Vercel + Upstash (`api/validate-key.js`).
**Baseline:** `main` @ `1979753` (docs, out of scope). Reviewed range **`4ef8be9..d088473`** — 918 lines across `api/generate.js`, `src/App.jsx` and six suites. Pre-fix sha `4ef8be9`.
**Scope:** the fix commit line by line, then its blast radius — every caller of a function whose contract changed (`computePlantingDates`, `engineHarvestRows`, `activateKey`, `validateKeyRemote`), both sides of every duality (imperial/metric, free/paid, planting list / plan timeline / yield table / savings / prompt / report), and every sibling site in the file that shares a fixed shape.
**Reviewer contract:** read-only. No product file, test, config or dependency was modified. No live endpoint, LemonSqueezy, Anthropic, Upstash or network call of any kind. Every number below comes from the shipped source, bundled verbatim with esbuild (the `render-drive` technique) into `<scratch>/probes/out/`, or from the suites' own `HHP_APP_SRC` / `HHP_GENERATE_SRC` overrides.
**Timing / model note:** this review ran the evening of **2026-09-09 into 2026-09-10**. Two earlier attempts on this scope were killed by a model rate limit before producing anything; their scratch leftovers were treated as untrusted and every gate below was re-run from scratch. The reviewer model was **Opus** (the Fable quota was exhausted).

---

## Verifications run

| What | Command | Outcome |
|---|---|---|
| Full suite at HEAD | `npm test` (9 suites) | **exit 0**. Completion lines: `bounds + sanitisers: 106/106`, `validate-key limits: 57/57`, `generate licence gate: 63/63`, `plan generation: 48/48`, `analytics redaction: 19/19`, `calc-golden: 300/300`, `render drive: 157/157 checks OK.` Zero `FAIL` rows. Judged by exit code. |
| Production build | `npm run build` | **exit 0**, 33 modules, `dist/assets/index-BoahIqCM.js` 409.85 kB / 116.49 kB gzip — the chunk name `Homestead/CLAUDE.md` records as live. |
| Control: bounds | `HHP_APP_SRC=<pre-fix> node tests/bounds-and-sanitisers.test.mjs` | **exit 1**, 4 R3 rows red (R3-1.1, R3-1.5, R3-1.7, R3-5.p1) |
| Control: calc-golden | `HHP_APP_SRC/HHP_GENERATE_SRC=<pre-fix>` | **exit 1**, 20 R3 rows red (R3-2 ×11, R3-5 ×5, R3-6 ×4) |
| Control: generate licence gate | `HHP_GENERATE_SRC=<pre-fix>` | **exit 1**, 9 R3-9 rows red |
| Control: paywall mount chain | `HHP_APP_SRC=<pre-fix>` | **exit 1**, 13 rows red (R3-7 ×4, shape a ×5, shape T ×4) |
| Control: plan generation | `HHP_APP_SRC=<pre-fix>` | **exit 1**, 5 rows red (R3-5.w1/w2, R3-4.3/4/5) |
| Control: render drive | `HHP_APP_SRC=<pre-fix>` | **exit 1**, 13 rows red (R3-3 ×6, R3-2.r ×7) |
| Shipped-source probes | esbuild bundle of `src/App.jsx` + 5 probe scripts | frost census over 9 zones × 2 hemispheres × 82 crops; the paid savings split; the real `SelfSufficiencyCalculator`, `CategoryBar`, `MiniStat`, `PlanRenderer`, `PlanHarvestChart`, `buildPlanReportHtml` through `react-dom/server`; the real `activateKey` and the real mount effect driven through a stubbed `fetch` seam with storage swapped mid-await |

**No pin is weak.** Every one of the ten fixes has at least one case that goes red on `4ef8be9` and green on `d088473`, measured, not asserted. Pre-fix sources were extracted with `git show 4ef8be9:<path>` into the scratch folder; nothing was stashed, checked out or worktree'd inside the repo.

---

## Executive summary

**Verdict: NEEDS FIXES — 0 CRITICAL / 0 HIGH / 3 MEDIUM / 7 LOW.** Nothing here is worth an emergency deploy, and nothing found is a crash, a data-loss path or a wrong headline number. The commit is a good one: all ten items land, the pins are real, and the two hardest pieces — the third harvest state and the licence slot re-read — are correctly designed rather than patched at the symptom.

The frost work is the strongest part of the diff. `computePlantingDates` now returns a genuine third state instead of a shorter window, and a census of all 1,476 (zone × hemisphere × crop) cells through the shipped function finds **0 inverted windows** where the review measured 12, with the flag firing on exactly the 12 cells it named (sweet potato and ginger, zones 3–7, both hemispheres). Every surface the fix claimed — card badge, Harvest row, timeline row, paid harvest timeline, paid yield card, report harvest table, report yield card — says the same sentence, and I read all seven out of rendered markup. The boundary is right: a window starting **on** the frost date is flagged, one day earlier is truncated at the frost date, and cool-season and perennial crops are never flagged whatever their dates.

Two surfaces the fix did not reach still contradict it, and both are on the page the customer paid $39.99 for. The paid plan's **Estimated annual savings** figure is `computeSavingsRows(baseResults.perCrop)` with no frost gate, so for a zone-3 customer growing sweet potatoes and tomatoes the plan prints "Sweet Potatoes · no harvest before frost" in the yield section and **$89 of savings of which $13.65 (15.4 %) is the sweet potato's** two cards below. And the prompt in `api/generate.js` is never told which crops are frost-blocked, so the model's monthly tasks can still schedule a harvest the engine sections say cannot happen. The third MEDIUM is the licence timeout: the new 25 s client abort is derived in a comment from "2 × 8 s + 9 s of headroom", but `api/validate-key.js` carries **no `maxDuration`** while its sibling `api/generate.js` explicitly sets 300 — so the platform, not the client, is now the shortest fuse on a fresh-device activation, and the orphaned-slot window the fix set out to close is still open.

The seven LOWs are the familiar residual shape: the fix reached the sites it named and stopped one short. The most interesting is a **regression the new pin cannot see**: `magnitudeDecimals` is now read by the Self-Sufficiency hero stat, and `magnitudeDecimals(0)` is 3, so an empty crop selection prints `Garden space (incl. paths) 0.000 sq ft` where the pre-fix code printed `0.0`. The product already has a rule for this — `fmtMassRounded(0)` returns `"0"` (N-3, round 2) — and the R3-3 pin passes because it hunts the substring `0.0 m²`, which `0.000 m²` does not contain.

---

## Per-fix disposition

| Id | Disposition | Evidence |
|---|---|---|
| **R3-1** `ProduceTargetField` metric-floor drift | **HELD** | One `toDisplay` for value and both bounds at `src/App.jsx:1412`; `min={min} max={max}` at `:1439`; the commit guard reads the same expression. Pins R3-1.1/1.5/1.7 red on `4ef8be9`, green at HEAD. Five untouched cycles at the 50 lb floor leave 50 lb. |
| **R3-2** frost-blocked harvest | **INCOMPLETE** — see MED-1 (savings) and LOW-2 (prompt) | Core claim holds: census 1,476 cells → **0 inverted windows** (was 12), flag on exactly 12 cells, `sweet_potato` + `ginger` only. All seven named surfaces read from rendered markup. Boundary correct at `>=`. Two unreached surfaces carry money and prose that contradict it. |
| **R3-3** one precision rule | **HELD**, with LOW-1 | `magnitudeDecimals` at `:521`; `CategoryBar` tooltip `:1267` and legend `:1282` through `fmtAreaValue`; hero stat `:1700`. Rendered: `Herbs 0.023 m²` where the review measured `0.0 m²`. A zero-space category is dropped from the legend before it can print. New defect at a true zero (LOW-1). |
| **R3-4** regenerate quota copy | **HELD** | `:4742` "20 generations per day"; pins R3-4.3/4/5 read the number and the 86 400 s window off `api/generate.js`, so the copy cannot drift from the constant. Red pre-fix. |
| **R3-5** rounding at the display and prompt boundaries | **HELD** | Both Fields round the imperial branch, guards byte-identical; payload `:4648` / `:4770`; prompt `api/generate.js:644`/`:651`; report `:5606`. Nine pins across three suites, seven red pre-fix. |
| **R3-6** garden-space cap | **HELD** | `api/generate.js:479` `GARDEN_SQFT_MAX = 100000`, used at `:499`. Pins assert the two constants equal and that 65,000 reaches the prompt. Red pre-fix (65000 → 50000). |
| **R3-7** paywall form activates bare | **HELD**, with LOW-4 | `:8569` re-reads `LS_KEY` / `LS_INSTANCE` and validates with the stored instance first; transient and pool-full answered as themselves. Driven: one `/validate` carrying the stored instance, zero `/activate`. Red pre-fix. |
| **R3-8** stale figures in the records | **DOC** | `docs/code-review-2026-09-06-rereview.md` corrected in the commit. `calc-golden` SB-3/SB-4 pin 35.9167 % and $815.40 and are green. No code change; nothing to verify beyond the goldens. |
| **R3-9** figures scrubbed from the model's savings note | **HELD**, with LOW-3 | `ENGINE_FIGURE_RE` + `scrubEngineFigures` at `api/generate.js:694-703`, applied at `:743-744`. Nine pins red pre-fix. The completeness gate keys on the `savingsEstimate` block, not the note, so an all-figure note ships empty rather than costing the customer a generation — verified by reading the gate at `:975-981`. Regex has gaps (LOW-3). |
| **shape (a)** slot re-read after every await | **INCOMPLETE** — see MED-2, LOW-4, LOW-5 | `:8336` `slotReplaced` read after the await; `:8200` the `retry_activation` leg guarded. Driven with storage swapped mid-await on every leg. Two residuals: the URL `?key=` leg is outside the guard by construction, and two tabs holding the *same* key both retry bare. |
| **shape (T)** client abort vs server worst path | **INCOMPLETE** — see MED-3 | `VALIDATE_TIMEOUT_MS = 25000` at `:110`, armed at `:889`. Pins hold the arithmetic against `LS_TIMEOUT_MS`. But `api/validate-key.js` sets no `maxDuration`, so the platform ceiling — not the client — is the shortest fuse. |

---

## Findings (most severe first)

### [MEDIUM] MED-1 — the paid plan's savings total still counts a crop the same page says cannot be harvested (CONFIRMED)

**File:** `src/App.jsx:4658-4661` (`engineSavings = computeSavingsRows(baseResults.perCrop, …).totalSavings` — no frost gate), rendered at `:5439` (screen) and `:5770` (report). The frost flag is available two lines above at `:4655`.

**What:** R3-2 taught six surfaces to say "no harvest before frost" and left the seventh — the money — reading the pre-fix basis, so the plan asserts both things at once.

**Why it matters:** the savings figure is the number the $39.99 page is built around, and it is the one a customer checks against their grocery bill. A plan that prints "no harvest before frost" for a crop and then bills that crop's displaced groceries into the headline is the "two numbers for one thing" shape the whole 2026-09-06 wave was raised to remove — and it is now *sharper* than before the fix, because pre-fix the crop was silently absent from the timeline while post-fix the page states the contradiction in words.

**Repro / evidence (driven, `probes/p2.mjs` + `p3.mjs`, the shipped engine and the real `PlanRenderer` / `buildPlanReportHtml` through `react-dom/server`):** zone 3 north, family of 4, Family Basics goal, crops = sweet potato + tomato.
```
engineHarvestRows: [{crop:"Sweet Potatoes", startMonth:null, …, noHarvestBeforeFrost:true},
                    {crop:"Tomatoes (General)", startMonth:"August", …}]
yield card    : "Sweet Potatoes  No harvest before your first fall frost. The plants would be
                 ready after the season ends in your zone."
savings card  : "Estimated annual savings  $ 89"
report        : "Estimated annual savings  $ 89"
savings rows  : Sweet Potatoes annualSavings 13.65 | Tomatoes annualSavings 75.00
              => $13.65 of $88.65 (15.4 %) is money from the crop the plan just wrote off
```
Single-crop census over the 12 flagged cells: zone 3 sweet potato $14 / 18 lb, zone 3–7 ginger $3 / 2 lb, both hemispheres.

**Fix brief (a starting point, not a paste):** `computeSavingsRows` is shared with the Cost Savings tab and must not change basis silently there, so do not gate it inside the function. Either (a) pass the flagged crop ids into the paid tab's `engineSavings` memo and exclude them, then say so in the card's existing caption ("crops that cannot be harvested in your zone are excluded"); or (b) keep the total and add one line under it naming the excluded value. Option (a) changes a customer-visible figure, so it needs a `calc-golden` row beside R3-2.8 pinning the zone-3 total at `$75.00` and an `SB-` style row proving the Cost Savings tab is untouched. Do **not** gate `computeSavingsRows` on `frostDates` — the Cost Savings tab does not have a zone in scope on every path, and a null `frostDates` would silently zero every saving.

---

### [MEDIUM] MED-2 — the URL `?key=` leg writes the licence slot after an await without re-reading it, so a key stored mid-round-trip is overwritten and its activation orphaned (CONFIRMED)

**File:** `src/App.jsx:8277` (`const conflictingKey = loadState(LS_KEY, "")` — read **before** the await), `:8293` (`await attempt(urlKey, "", { skipStoredInstance: true })`), `:8296` (`commitPaid(urlKey, r.instance_id)` → `persistState(LS_KEY …)` + `persistState(LS_INSTANCE …)` at `:8210-8211`).

**What:** sibling shape (a) was applied to the stored-key leg (`:8336`) and to `attempt`'s retry branch (`:8200`) and not to the URL leg, because the slot is *empty at send* there — so nothing looked like it needed a guard. The M-1/N-1 conflict check runs before the round trip and is never re-tested after it, and `commitPaid` overwrites both keys unconditionally.

**Why it matters:** it costs a paying customer one of three LemonSqueezy activation slots, and in the different-key variant it silently replaces their licence — the exact harm the M-1 comment at `:8251-8264` says the guard exists to prevent ("one click on a mailed `?key=<attacker-key>` silently replaces the victim's licence and their pointer to their own activated instance"). Two slots gone means the customer's third real device reads "activation limit reached" and they contact support.

**Repro / evidence (driven, `probes/p4-licence.mjs`, the real mount effect sliced between its banners and run against a stubbed `fetch` that mutates storage on the way into the call):**
```
CASE 1  slot empty; URL ?key=MINE; another tab stores THEIRS + inst-other-tab during the await
        storage after: key="MINE", instance="inst-url-leg"
        the other tab's key survived?      NO - OVERWRITTEN
        its instance pointer survived?     NO - OVERWRITTEN (orphaned activation)

CASE 2  same, but the other tab activates THE SAME key and stores inst-tab2
        storage after: instance="inst-url-leg"   -> inst-tab2 orphaned
        two activations minted for one physical device
```
CASE 2 is the plausible customer path: the purchase email link is slow, they open a second tab and paste the key, both succeed.

**Fix brief:** after the await and before `commitPaid`, re-read `loadState(LS_KEY, "")`. If it is now non-empty and different from `urlKey`, do not commit — hold the M-1 conflict message and let the stored key have its turn at step 2. If it equals `urlKey`, unlock the session but leave `LS_INSTANCE` alone (the other tab's pointer is the live one). **Careful:** the previous round's lesson on a sibling product was that a prescription of this shape, applied without a control, refused every *fresh* activation — so the case that must stay green is "slot empty at send and still empty after the await → commit normally", and the new pin belongs beside `paywall-mount-chain` a.1 with an `onFetch` that leaves storage untouched.

---

### [MEDIUM] MED-3 — the new 25 s client abort is budgeted against the handler's code path, but `api/validate-key.js` declares no `maxDuration`, so the platform is now the shortest fuse (CONFIRMED code fact / PLAUSIBLE platform number)

**File:** `src/App.jsx:100-110` (the comment deriving 25 s as "2 × 8 s + 9 s of headroom"), `api/validate-key.js` — **no `export const config`** anywhere in the file, against `api/generate.js:25` `export const config = { maxDuration: 300 }`.

**What:** shape T correctly identified that the client was shorter than the server and lengthened the client. It did not ask what the *platform* allows the server. `api/validate-key.js` spends up to 2 × `LS_TIMEOUT_MS` (8 000 ms, `:85`) on two sequential LemonSqueezy legs (pre-check `:448`, activate `:577`) plus up to five Upstash round trips plus a cold start — a worst path over 17 s — inside a function whose duration is left at the platform default. Its sibling handler sets 300 explicitly, which is the tell that the default is lower; Vercel documents 10 s for Hobby and 15 s for Pro on Node functions, and the workspace `CLAUDE.md` records this team as still **Hobby**.

**Why it matters:** the fix's stated purpose was to stop the client giving up inside the activate leg, "LemonSqueezy mint[ing] the instance, the answer reach[ing] nobody, and the customer's retry mint[ing] another — an orphaned activation slot". If the platform kills the function at ~10 s that sequence happens anyway, one layer down, and the extra 10 s of client patience buys nothing. The customer waits, sees the transient message, retries, and burns a slot.

**Repro / evidence:** `grep -n "maxDuration" api/*.js` returns two hits, both in `generate.js`. The client side of the failure is safe — I read `validateKeyRemote` end to end and a platform 504 with a non-JSON body fails the `typeof data.valid !== "boolean"` shape check at `:906-909` and returns `transient: true`, so **no wipe** — but the orphaned mint is server-side and invisible to it. To settle the platform number: add `export const config = { maxDuration: 30 }` and confirm in the Vercel function log that a forced-slow request now runs past 10 s, or read the current default off the project settings.

**Fix brief:** give `api/validate-key.js` an explicit `maxDuration` that exceeds its own worst path (30 s is comfortable and still well inside the plan cap), then keep `VALIDATE_TIMEOUT_MS` above it. Better still, pin the relationship the way `paywall-mount-chain` T.4 already pins the client against `LS_TIMEOUT_MS`: add a case asserting that `api/validate-key.js` declares a `maxDuration` and that `VALIDATE_TIMEOUT_MS >= maxDuration`, so neither number can move alone. Note the ordering: the platform ceiling must be raised **before** anyone relies on the 25 s client budget.

---

### [LOW] LOW-1 — the Self-Sufficiency hero prints `Garden space (incl. paths) 0.000 sq ft` at a true zero; new in this diff, and the R3-3 pin cannot see it (CONFIRMED)

**File:** `src/App.jsx:1698-1700` (`decimals={magnitudeDecimals(results.totalSpaceSqft * areaConv)}`), rule at `:521-523` (`v < 0.1 ? 3 : …`).

**What:** pre-fix the stat was `decimals={1}`, so an empty selection read `0.0`. `magnitudeDecimals(0)` is 3, so it now reads `0.000`. The product already has the opposite rule for exactly this case — `fmtMassRounded(0)` returns `"0"` (N-3, round 2, `:530`) — so the new rule contradicts a rule the previous round shipped.

**Why it matters:** it is the first number on the free tab, and three decimals of nothing reads like a broken calculator rather than an empty one. It is small, but it is a regression the commit introduced, and the pin written to guard the site passes anyway: `R3-3.5` asserts the stat "never reads `0.0 m²`", and `0.000 m²` does not contain that substring.

**Repro / evidence (driven, `probes/p3.mjs`, the real `SelfSufficiencyCalculator` through `react-dom/server`, empty selection, family of 4):**
```
imperial: "Plants to grow 0 plants   Garden space (incl. paths) 0.000 sq ft"
metric  : "Plants to grow 0 plants   Garden space (incl. paths) 0.000 m²"
magnitudeDecimals(0) = 3
```
The legend is clean here: `CategoryBar` drops a zero-space category before it can print (driven with a forced `{herbs: 0}` map — only the non-zero row renders).

**Fix brief:** `magnitudeDecimals(v)` should return 0 (or 1) for `v === 0`, which fixes the hero and every future caller in one place, and it leaves `fmtAreaValue(0)`'s existing `"0.000"` behaviour to a separate decision (that one predates this diff, so changing it moves round-2 goldens). Re-write the R3-3.5 pin to assert the rendered digit count rather than the absence of a substring.

---

### [LOW] LOW-2 — the prompt never learns which crops are frost-blocked, so the model's prose can schedule a harvest the engine sections deny (PLAUSIBLE)

**File:** `api/generate.js:641-655` (`buildUserPrompt` — sends `zone`, both frost dates and `Selected crops`, and nothing about harvestability); `grep -n noHarvestBeforeFrost api/generate.js` returns **zero hits**.

**What:** R3-2 made six *engine-rendered* surfaces agree. The model writes `summary`, `tips` and `monthlySchedule.tasks` from a prompt that cannot distinguish a crop that harvests from one that cannot, while being told to "Anchor every monthly task to the frost dates above".

**Why it matters:** a monthly task reading "October — lift and cure your sweet potatoes" sits on the same paid page as a yield card reading "no harvest before your first fall frost". The recorded ruling that model prose is not scrubbed covers *figures*; it does not cover prose contradicting an engine verdict.

**Repro that would settle it:** generate one plan with zone 3 and sweet potato or ginger selected, then grep `monthlySchedule.tasks`, `summary` and `tips` for the crop name next to a harvest verb. No live Anthropic call was made in this review.

**Fix brief:** one prompt line listing the frost-blocked crops with an instruction not to schedule a harvest for them (the client already computes the set; it can travel in the payload beside `crops`, sanitised as a string array). Cheaper alternative if the payload should not grow: derive it server-side is not possible — the server has no crop table — so the payload is the route.

---

### [LOW] LOW-3 — `ENGINE_FIGURE_RE` misses four figure shapes and deletes legitimate advice in a fifth (CONFIRMED)

**File:** `api/generate.js:694` (the regex), `:695-703` (`scrubEngineFigures`).

**What:** the scrub drops the sentence carrying a currency symbol, a bare `R`, or a number followed by one of `lbs|pounds|kg|kilograms|plants|dollars|euros|rand`. Four common ways to state money are not in that set, and two ordinary growing sentences are.

**Repro / evidence (driven, `probes/p5-scrub.mjs`, the shipped regex and function lifted verbatim from `api/generate.js`):**
```
STRIPPED  "$900"  "$1,234"  "700 pounds sterling"  "20 kg grow bags"  "12 plants"
PASSED    "save you roughly 900 a year"          <- bare number
PASSED    "about 900 USD across the season"      <- currency CODE, not symbol
PASSED    "savings near 900 EUR a year"
PASSED    "cut roughly 30% off your grocery bill"
PASSED    "save about nine hundred dollars"      <- spelled amount
PASSED    "By 2027 your beds will be productive" <- a year (correctly left alone)
```
The two STRIPPED rows at the end are false positives: "Grow potatoes in 20 kg grow bags to save space" and "Space your 12 plants a foot apart" are advice, not engine figures, and both are silently deleted from the note.

**Why it matters:** low, both ways. A second money figure beside the engine's total is what R3-9 exists to stop, and `900 USD` still gets through; and a customer occasionally loses a useful sentence. Neither is visible to the customer as an error.

**Fix brief:** add `usd|eur|gbp|zar` (and the bare-number-near-a-money-word case) to the alternation; leave the year alone as it is now. For the false positives, narrow rather than widen: the sentences worth dropping are the ones that state a *total*, so anchoring on `save|saving|savings|worth|value` within the same sentence would keep "20 kg grow bags" and still drop "you should save roughly 900". Both directions belong in `generate-licence-gate` beside R3-9.6.

---

### [LOW] LOW-4 — the two re-activation legs guard on the KEY they validated but not on the INSTANCE they sent, so two tabs on one licence mint two activations (CONFIRMED)

**File:** `src/App.jsx:8200` (`if (r1?.retry_activation && !skip && loadState(LS_KEY, "") === key)` → `clearLS(LS_INSTANCE)` then a bare re-validate), and the R3-7 fall-through at `:8569-8600` (a definitive rejection of the stored instance falls through to `validateKeyRemote(key, "")` with no re-read).

**What:** the new guard asks "does the slot still hold the key I validated". It does not ask "does the slot still hold the *instance* I sent". Two tabs on the same licence with a stale instance both pass the guard, both delete the pointer, and both activate bare.

**Repro / evidence (driven, `probes/p4-licence.mjs`):**
```
CASE 3  slot = MINE + inst-stale; server answers retry_activation; another tab stores
        inst-tab2-fresh during the await
        calls: [{key:MINE, instance_id:"inst-stale"}, {key:MINE}]   <- second call bare
        storage after: instance="inst-third"
        tab-2 instance survived? NO - deleted, then replaced (a third slot minted)

CASE 7  the same on the R3-7 paywall-form path: pre-check rejected, fall-through activates
        bare, tab-2's fresh instance overwritten by inst-third
```

**Why it matters:** it needs the instance to be genuinely stale (deactivated from the LemonSqueezy dashboard) plus two tabs, so it is rare — but the cost is the same activation slot, and this is the specific residual a sibling product's review found in the same week.

**Fix brief:** capture the instance sent before the await and compare it after: `const sent = existingInstance; … if (loadState(LS_INSTANCE, "") !== sent) return r1;` — if another writer has already replaced the pointer, that writer's activation is the live one and this leg has nothing to clean up. Apply at both sites. Pin with an `onFetch` that swaps only the instance, not the key, so the existing a.6 case (which swaps the key) keeps its meaning.

---

### [LOW] LOW-5 — the slot-replaced early return skips the one thing the normal success path still owed: clearing the grace marker (CONFIRMED)

**File:** `src/App.jsx:8330-8340` (the `r?.valid && slotReplaced` branch calls `setKeyError` / `setPrefillKey` / `setPaid` / `setValidating` and returns) against `commitPaid` at `:8206-8218`, which also calls `clearLS(LS_PENDING)`.

**What:** I walked the guarded return specifically to see what it drops on the way out. The answer is short and worth recording: **only `clearLS(LS_PENDING)`**. It correctly skips both `persistState` calls (that is the fix), and it correctly does not move the tab (a stored-key launch is not meant to).

**Repro / evidence (driven, `probes/p4-licence.mjs` CASE 5):** seed `key=MINE, instance=inst-mine, pending=<now>`; a newer key lands mid-await; verdict valid.
```
storage after: key="THEIRS", instance="inst-new", pending="1789056034384"
paid: true | validating: false
hhp_pending cleared? NO - stale grace marker left behind
```

**Why it matters:** barely. The marker is bounded at 48 h and only ever unlocks a customer who is already unlocked. It is here so the next reviewer does not have to re-derive what the early return skips.

**Fix brief:** `clearLS(LS_PENDING)` before the return, or restructure so the branch calls a `commitSessionOnly()` helper that shares everything with `commitPaid` except the two `persistState` calls.

---

### [LOW] LOW-6 — the new "No harvest before frost" badge is drawn on top of a growing bar that runs to the row's right edge (CONFIRMED)

**File:** `src/App.jsx:3167-3178` (`position:"absolute", right:8` inside the row, with an opaque `T.errorBg`).

**Repro / evidence (driven, `probes/p6-timeline.mjs`, the real `PlantingTimelineChart` at 1280 and 375):** zone 3 north, ginger. Its harvest starts 8 Jan 2027, so the growing bar spans the whole reference year and the widest bar reaches **99.7 %** of the track. The badge sits at `right: 8px` over it. Sweet potato in the same zone is fine (bar ends at Sep, badge clear); zone 7 ginger reaches 87.1 %; zone 11 is not flagged at all.

**Why it matters:** cosmetic, on the free tab. The badge is legible (opaque background); the growing bar looks truncated by a red pill.

**Fix brief:** put the badge after the bars in flow rather than absolutely, or shrink the bar track when the flag is set. If it stays absolute, `right: 8` needs the row to reserve that width.

---

### [LOW] LOW-7 — a generation the server itself refuses still spends one of the customer's 20 a day (CONFIRMED by code path; PRE-EXISTING, not a regression)

**File:** `api/generate.js:852` (the per-licence bucket is bumped) against `:873` (the Anthropic call), `:979-981` (the 502 "incomplete plan" return) and `:996-999` (the 504 timeout return).

**What:** the counter is bumped before the work it meters. A model timeout or an incomplete plan returns an error and the slot is gone. In scope here only because R3-4 rewrote the copy that tells the customer what a slot costs and R3-9 added a new way for the response to come back thin.

**Why it matters:** a customer who hits two 502s has 18 generations left and was told nothing. The completeness gate's own comment at `:963-966` already acknowledges the charge ("billed against the customer's 20-a-day").

**Fix brief:** decrement on the definitive-failure returns, or move the bump to just before the 200. Decrementing is the smaller change but is not atomic with the bump; a `redis.decr` on the same key is good enough at this volume. Either way it needs a `generate-licence-gate` row asserting the bucket after a forced 502.

---

## Observations (not defects)

- **O-1 spec drift.** `Homestead/CLAUDE.md` §8 "Client wrapper" still documents `validateKeyRemote` as a **15 s** `AbortController`. The commit moved it to 25 s and named the constant. The spec is the declared source of truth for this product, so one line needs correcting; `§8` also has no `maxDuration` line for `api/validate-key.js` at all, which is why MED-3 has no paper trail either way. (§7's drift-guard line numbers are stale too, but line numbers in that doc always are.)
- **O-2 the `noHarvestBeforeFrost` row shape is narrower than a normal harvest row.** `engineHarvestRows` pushes `{crop, startMonth:null, endMonth:null, peakMonth:null, noHarvestBeforeFrost:true}` and omits nothing else — normal rows carry exactly the same four keys plus no extras — so no consumer can read an undefined field. Deliberate and correct; recorded so the next reviewer does not re-derive it.
- **O-3 `producePerPersonLbs` enters the fingerprint unrounded while the payload rounds it.** Harmless (canonical values move in 0.1 kg steps, so no sub-display-step change exists), but it is the one place R3-5's rounding was not applied symmetrically.

---

## Recorded items, re-scored

- **"The free Self-Sufficiency tab is zone-agnostic and still counts a frost-blocked crop's yield."** Re-scored: the blast radius of that decision now reaches a **paid** surface. `engineSavings` on the Growing Plan and in the downloaded report is computed from the same `baseResults.perCrop`, so the paid plan states the crop is unharvestable and bills its groceries anyway (MED-1). The free-tab headline remains Grant's ruling; the paid savings card is a separate surface and is a defect.
- **"`render-drive` M2b-1 keeps a substring needle `'0.0 m²'` that would false-fail on `10.0 m²`."** Re-scored: the same needle style was used for the *new* R3-3 pins, and there it does not false-fail — it false-**passes**. `R3-3.5` asserts the hero stat never reads `0.0 m²` and is satisfied by the `0.000 m²` that LOW-1 reports. Digit-bound both, not just M2b-1.

Everything else on the recorded list was checked and is unchanged: zones 1/2/12/13 absent by ruling; the M-6 `?key=` prefill copy present at `:4127-4135`; prose outside the savings card unscrubbed; SB-3/SB-4 green at 35.9167 % / $815.40.

---

## Siblings to check

| Shape | Where to look | What to grep |
|---|---|---|
| **A gate marks a row unavailable and a money total still sums it** (MED-1) | **Vertica**, **Grow Room**, **FaminePrep** | find every total that sums a per-row array, then ask which per-row flags the renderer honours. Vertica already had the twin (flow reported to towers that receive none); check its BOM and payback totals against the operating-point verdict. |
| **A leg that writes the licence slot after an await because the slot was empty at send** (MED-2) | **Aero**, **Grow Room**, **Vertica**, **HeatLens**, **Mortar**, **FaminePrep** (already flagged there) | in each paywall, the `?key=` branch: is the conflict check before the `await` the only check? Look for `commitPaid`/`persistState(LS_KEY` reached without a post-await `loadState`. |
| **A validator function with no `maxDuration` while its sibling sets one** (MED-3) | all six other paid products | `grep -n "maxDuration" api/*.js` — a repo with a hit in `generate.js` and none in `validate-key.js` has this. Then compare the client abort constant against 2 × the LS timeout. |
| **A re-activation guard keyed on the KEY but not the INSTANCE** (LOW-4) | every product with a `retry_activation` branch | `grep -n "retry_activation" -A4 src/*.jsx` and check what is compared after the await. |
| **`magnitudeDecimals`-style rule applied to a true zero** (LOW-1) | **Grow Room**, **Vertica**, **Aero** | any `decimals={…(v)}` or `toFixed(v < x ? 3 : 1)`. Feed it 0. |
| **Pins that hunt a substring with a unit suffix** (LOW-1, re-scored) | all seven suites | `grep -n "'0\.0 " tests/` and any `includes('0.0` — replace with a digit-count assertion. |
| **A counter bumped before the work it meters** (LOW-7) | **FaminePrep** (already flagged), **HeatLens** | the rate-limit bump relative to the upstream call and the error returns. |

---

## Verified clean (do not re-audit unless the code changes)

- **The frost third state itself.** Census over 9 zones × 2 hemispheres × 82 crops through the shipped `computePlantingDates`: **0 inverted windows** (12 pre-fix), flag on exactly 12 cells, `sweet_potato` and `ginger` only. Boundary correct: a window starting **on** the frost date is flagged, one day earlier is truncated at the frost date, two days earlier gives a 2-day window. Cool-season and perennial crops are never flagged (pin R3-2.7, and zone 7 sweet potato / zone 11 ginger driven as controls). `harvestEndEffective` is `null` on the flag, so nothing downstream can draw a bar by accident.
- **All six engine-rendered no-harvest surfaces**, read out of rendered markup: card badge, card Harvest row ("None before first frost (would start Sep 18)"), timeline row, paid harvest timeline, paid yield card, report harvest table and report yield card. `PlanHarvestChart` still renders when *every* row is flagged (it no longer returns null). `PlanRenderer` and `buildPlanReportHtml` both key their `noHarvestCrops` set on `r.crop`, and `engineYieldRows` / `engineHarvestRows` both source that from `r.crop.name` — the set can never silently miss.
- **R3-1 / R3-5 drift, first-hand A/B** (`probes/p7b-drift.mjs`, the real `Field` element's own value and bounds, five untouched focus/blur cycles). Pre-fix: metric floor 50 → 50.70632030252184 (**+1.4126 %**) with the box jumping 22.7 → 23 against `min 23`; imperial box showing `55.11556554621939` and `400.41746750160166`. At HEAD: **0.0000 % on all seven cases**, box 22.7 against `min 22.7`, imperial `55.1` and `400.4`. Ceiling, mid-range and imperial-floor controls unmoved in both revisions.
- **Cousin (c) is genuinely absent.** `grep "Math.round(min|Math.round(max|min={Math|max={Math"` → **0 hits**. Both `toDisplay` sites (`:1412`, `:4409`) are one expression for the value and both bounds, and the commit guard reads the same expression. `BedEditor`'s eight fields commit against `Number((canonical * conv).toFixed(1))`, matching their display in both modes.
- **`validateKeyRemote`'s verdict taxonomy** (`:881-950`), read end to end: the malformed-body shape check runs **before** the 400 branch, so a platform 400 or a 504 HTML body stays `transient` and can never wipe; the round-2 rule that our own 400 is definitive holds; every non-200 is transient; `AbortError` is transient. `opts.skipStoredInstance` forces `instance_id` to `undefined` regardless of the caller.
- **`api/validate-key.js` is untouched by this diff** (`git diff --stat 4ef8be9..d088473 -- api/validate-key.js` is empty). The round-2 rails are present: the earnable exemption (`:242`, `:335`, `:633`) and the bound-device pass at the gate (`:417-422`).
- **shape (a) on the stored-key leg works.** Driven: a definitive rejection of the old key while a new key lands mid-await leaves `key="THEIRS", instance="inst-new"` intact and holds "A licence was saved in another tab while this one was loading. Reload to use it."
- **R3-7 works.** Driven: a re-paste of the stored key sends **one** `/validate` carrying `inst-mine` and **zero** bare activations.
- **The R3-9 completeness interaction.** `sanitisePlan` can leave `savingsEstimate.note` empty; the gate at `:975-981` requires the `savingsEstimate` *block*, not the note, so an all-figure note ships as an empty note rather than costing the customer a 502. Both render sites guard on truthiness (`:5458` note, `:5445` topSavers), so an empty scrub leaves no dangling "Top savers:" label.
- **R3-6 pair.** `api/generate.js` `GARDEN_SQFT_MAX = 100000` and the clamp reads the constant; 65 000 reaches the prompt unclamped.
- **`api/generate.js` has no model failover and no shared retry deadline** — one `MODEL`, one `ANTHROPIC_TIMEOUT_MS = 75000` inside a declared 300 s slot. The sibling product's "fallback armed with no budget left" shape is **N/A** here.
- **The fingerprint is not destabilised by R3-5.** `gardenSqFt` enters the fingerprint already rounded, and canonical produce values are discrete 0.1 kg steps, so no sub-display-step change can mark a plan spuriously stale. (`producePerPersonLbs` enters unrounded while the payload rounds it — an inconsistency with no behavioural consequence.)
- **`isMobile` is in scope** at the new `PlantingTimelineChart` badge (`:3026`), which the build alone would not have caught.

---

## Recommendation

**Fix MED-1, MED-2 and MED-3 before the next deploy; batch the seven LOWs behind them.** None of the three needs an emergency push on its own, but MED-1 is a self-contradicting money figure on the page customers pay for, MED-2 is a reproducible activation-slot burn on the leg every purchase email uses, and MED-3 means the shape-T fix does not yet do what its own comment claims. LOW-1 is the cheapest of the rest and is a regression this commit introduced, so it belongs in the same pass.

*Every finding above is reported; none is fixed. No product file, test or config was modified. Harness: `C:\Users\User\AppData\Local\Temp\review-r3-2026-09-09\homestead\probes\` (outside the repo).*


---

## Outcomes (fix round, 2026-09-10)

**Mandate:** Grant, "fix all please" — every finding ends fixed at root cause or refuted with evidence. Nothing was committed, pushed or deployed; the tree is left dirty for the main session.

**Gates at the end of the round** (judged by exit code, not by the printed counts): `npm test` **exit 0** over 9 suites — `load-quarantine 8`, `bounds + sanitisers 106`, `paywall mount chain 204 across 43 mounts`, `validate-key limits 57`, `generate licence gate 89`, `plan generation 52`, `analytics redaction 19`, `calc-golden 345`, `render drive 176`. `npm run build` **exit 0**, 33 modules, `dist/assets/index-XT_oDFDi.js` 410.57 kB / 116.74 kB gzip, and that bundle carries `Crops with no harvest before your first fall frost are left out` (×2: screen and report) and `A licence was saved in another tab while this one was verifying`. `tools/bug-scan.mjs` 0 high / 0 medium / 11 low, the same 11 pre-existing `key={i}` sites as before the round (counted in both revisions: 11 → 11). `tools/security-scan.mjs` unchanged: 0 critical, the 18 highs are the suites' own `new Function` harnesses and the 2 mediums are the pre-existing `startsWith` referer comparison in both handlers.

**Controls.** Pre-fix sources were extracted with `git show 1979753:<path>` into `<scratch>/pre/` (nothing stashed, checked out or worktree'd), and the suites were re-run against them through `HHP_APP_SRC`, `HHP_GENERATE_SRC` and a new `HHP_VALIDATE_SRC`:

| Control run | Exit | Red rows |
|---|---|---|
| `HHP_APP_SRC=<pre> HHP_VALIDATE_SRC=<pre> node tests/paywall-mount-chain.test.mjs` | 1 | MED-2.1/2.2/2.3/2.5, LOW-4.1/4.2/4.6/4.7/4.8, LOW-5.1, T.7/T.8/T.9 |
| `HHP_APP_SRC=<pre> node tests/render-drive.test.mjs` | 1 | LOW-1.r1–r5, MED-1.r2/r3/r5/r7, LOW-6.4/6.5/6.6 |
| `HHP_GENERATE_SRC=<pre> node tests/generate-licence-gate.test.mjs` | 1 | LOW-2.g2/g3, LOW-3.g1–g7, LOW-7.1–7.5/7.8/7.9 |
| `HHP_APP_SRC=<pre> HHP_GENERATE_SRC=<pre> node tests/calc-golden.test.mjs` | 1 | LOW-1.1 plus the LOW-2 / LOW-3 blocks (the new declarations do not exist there) |
| `HHP_APP_SRC=<pre> node tests/plan-generation.test.mjs` | 1 | LOW-2.w1/w2 |

### Disposition

| Id | Severity | Confirmed? | Action | Fix | Pin | Red → green |
|---|---|---|---|---|---|---|
| **MED-1** | MEDIUM | reproduced through the real renderer | **fixed** | `src/App.jsx:4694-4715` — `frostBlockedCrops` (read off `engineHarvest`, by crop NAME, the same key both renderers already build their no-harvest sets on) filters `baseResults.perCrop` before `computeSavingsRows`. `computeSavingsRows` itself is untouched, so the zone-agnostic Cost Savings tab does not move. Caption at `:5505-5515` and report caption at `:5841` name the exclusion when there is one, and say "the same figure as your Cost Savings tab" when there is not | `render-drive` MED-1.r1–r7 (the real `GrowingPlanTab`, its memo chain and `buildPlanReportHtml`), `calc-golden` MED-1.1–MED-1.9 | zone 3 north, family of 4, sweet potato + tomato: screen and report **$177 → $150**, the sweet potato's $27.30 gone; zone 7 control unmoved at $177; MED-1.r2/r3/r5/r7 red pre-fix |
| **MED-2** | MEDIUM | reproduced with storage swapped mid-await | **fixed** | `src/App.jsx:8400-8450` — after the await and before any write, the URL leg re-reads `LS_KEY`. **Empty** takes the verdict as before (the case that must stay green); **same key** unlocks the session and writes nothing, so the other tab's pointer is not orphaned; **different key** holds the M-1 refusal and lets step 2 have its turn. The refusal string is now one `CONFLICT_MSG` const (`:8323`) so `shape.3` still counts one copy | `paywall-mount-chain` MED-2.1–2.12, with MED-2.c1–c5 as the fresh-activation and M-1 controls | pre-fix: `hhp_key` overwritten to the URL key and `hhp_instance` to `inst-url-leg` (the other tab's activation orphaned), one call only; post-fix: `KEY_THEIRS`/`inst-other-tab` survive and step 2 validates them carrying their own instance |
| **MED-3** | MEDIUM | confirmed by source (no `maxDuration` anywhere in the file) | **fixed** | `api/validate-key.js:20-38` (`export const config` at `:38`) — `export const config = { maxDuration: 25 }`, with the arithmetic written next to it; `src/App.jsx:106-127` — `VALIDATE_TIMEOUT_MS` 25 000 → **30 000**. The chain is now declared longest-first: client 30 s > function ceiling 25 s > handler worst path ≈ 21.3 s (2 × `LS_TIMEOUT_MS` 8 s of sequential LemonSqueezy legs + ~4.3 s for one degraded Upstash call at the client's default 5 retries of `exp(i)·50 ms` + ~1 s cold start) | `paywall-mount-chain` T.7–T.10 (all three numbers read from source, so none can move alone) plus the existing T.4 | pre-fix `maxDuration=NaN` → T.7/T.8/T.9 red; post-fix 25 s / 30 000 ms green |
| **LOW-1** | LOW | reproduced through the real component | **fixed** | `src/App.jsx:538-562` — `magnitudeDecimals(0)` is now `0` (the N-3 rule `fmtMassRounded` already shipped), and `fmtAreaValue` / `fmtMassValue` state their 3-decimal zero degrade instead of inheriting it, so `L1-10` (a non-numeric input) and `N3-5` (a true zero) keep their meanings | `render-drive` LOW-1.r1–r5 and the re-written digit-bound `R3-3.5`; `calc-golden` LOW-1.1–LOW-1.8 | pre-fix `Garden space (incl. paths): 0.000 sq ft` / `0.000 m²`; post-fix `0 sq ft` / `0 m²`. The old R3-3.5 substring needle is gone: it now reads the printed digits |
| **LOW-2** | LOW | confirmed (zero `frostBlockedCrops` hits in the prompt path) | **fixed** | `src/App.jsx:4818-4827` (`frostBlockedCrops` at `:4827`) sends `frostBlockedCrops` in the payload (derived, so deliberately NOT in the fingerprint); `api/generate.js:536-544` sanitises it like every other string array and narrows it to crops this request selected; `:675-684` and the closing instruction add one context line and one rule — never schedule a harvest, a preservation batch or a saving for a crop listed as unharvestable | `generate-licence-gate` LOW-2.g1–g6 (the prompt the handler actually sent), `calc-golden` LOW-2.1–2.7, `plan-generation` LOW-2.w1–w4 | pre-fix the prompt carried no such line (LOW-2.g2/g3 red) and the payload no such field (LOW-2.w1/w2 red) |
| **LOW-3** | LOW | reproduced in both directions | **fixed** | `api/generate.js:742-767` — one regex became three named shapes plus `hasEngineFigure`, used by the note scrub and the top-saver filter. `MONEY_FIGURE_RE` adds currency codes and currency words (so "900 USD", "900 EUR", "nine hundred dollars" and "700 pounds sterling" go); `CLAIMED_SAVING_RE` catches a bare figure claimed as a saving, claim word first, figure not a measurement or a duration; `YIELD_FIGURE_RE` only fires on a partitive, rated or clause-final quantity, so "20 kg grow bags" and "12 plants a foot apart" survive | `generate-licence-gate` LOW-3.g1–g10 (driven through the handler), `calc-golden` LOW-3.1–LOW-3.19 + s1/s2 | pre-fix: the four money shapes reached the card AND both advice sentences were deleted (the control prints the note reduced to "Rotate the beds."); post-fix both directions correct, and R3-9's own cases still hold |
| **LOW-4** | LOW | reproduced with the instance swapped mid-await | **fixed** | `src/App.jsx:8270-8288` — the mount `attempt` compares the instance it SENT, and when the pointer has changed it judges the licence on the pointer that is now stored instead of deleting it and minting bare. `:8722-8731` — the paywall form's fall-through refuses to mint and tells the customer to reload, because that leg owes an answer now and their other tab is already unlocked | `paywall-mount-chain` LOW-4.1–4.8, controls LOW-4.c1/c2 | pre-fix: the mount leg's second call was bare and the fresh pointer became `inst-bare`; the form leg minted `inst-third` over `inst-tab2-fresh`. Post-fix: one call carrying `inst-tab2-fresh` (mount) and one call with a reload message (form) |
| **LOW-5** | LOW | reproduced | **fixed** | `src/App.jsx:8293-8317` (`commitSessionOnly` at `:8300`) — `commitSessionOnly()` holds everything a valid verdict owes the UI, `clearLS(LS_PENDING)` included; `commitPaid` is that plus the two `persistState` calls, and the slot-replaced return (`:8476`) and the MED-2 same-key leg both call it | `paywall-mount-chain` LOW-5.1–5.3, control LOW-5.c1 | pre-fix `hhp_pending` survived the unlock; post-fix it is cleared, and the newer key and pointer are still untouched |
| **LOW-6** | LOW | reproduced, geometry measured | **fixed** | `src/App.jsx:3193-3216` — the badge left the bar track and became its next flex sibling (`flexShrink: 0`), so the `flex: 1` track gives up the width instead of being painted over | `render-drive` LOW-6.1–6.7, which slices the track element by matching tags and asks which element contains the badge | zone-3 ginger's rightmost bar reaches **99.7 %** of the track in both revisions (the overlap condition is real); pre-fix the badge is inside that element with `position:absolute;…right:8px`, post-fix it is outside it |
| **LOW-7** | LOW | confirmed by driving the handler and reading the bucket | **fixed** | `api/generate.js:178-206` `refundLicenceSlot` (never below zero, TTL untouched) and `:934-937` `refundAndFail`, used by every definitive-failure return after the bump: the two Anthropic-error 502s, the auth 502, the no-tool-block 502, the incomplete-plan 502, the 504 timeout and the 500. The bump stays where it is — moving it under the model call would let any number of requests pass the gate at once. A `max_tokens` truncation deliberately does NOT refund (`:1023`): it is the one refusal the customer's own selection reproduces on demand, its copy says what to change, and refunding it would let one licence spend Anthropic credit in a loop the bucket never counts | `generate-licence-gate` LOW-7.1–7.10, including "a plan that ships is charged one slot", "two shipped plans and one outage leave the count at two", "never below zero" and "a refusal before the bump leaves no count at all". The suite's Upstash emulator gained `decr`, without which the handler's own try/catch would have swallowed the refund and every row would have passed vacuously | pre-fix the bucket read 1 after each refused generation; post-fix 0, and 1 for the truncation case |

### Notes for the next reviewer

- **`SB-3` / `SB-4` did not move.** Family Basics carries no frost-blocked crop in any zone, so MED-1 cannot touch it: the family-of-4 figures are still **35.9167 %** and **$815.40**, pinned by `SB-3`/`SB-4` and re-proved on screen by `MED-1.r6` ($815 in zone 3) and by `MED-1.7`–`MED-1.9`. The paid number that moved is the review's own case: a zone-3 sweet-potato customer.
- **The free tabs are unchanged by design.** The Self-Sufficiency headline and the Cost Savings tab stay zone-agnostic (Grant's ruling is still open); the paid card now says in words why it is lower.
- **`PLAN_SCHEMA` is untouched.** No numeric field was re-added; `frostBlockedCrops` travels INTO the prompt, never out of the model.
- **O-1 (spec drift) is now larger, and is not fixed here.** `Homestead/CLAUDE.md` §8 "Client wrapper" still documents a 15 s `AbortController`; the constant is 30 s, and §8 still has no `maxDuration` line for `api/validate-key.js`. Both need one line each, plus §7's savings section noting the paid exclusion. Left to the main session because that file is outside this repo.
- **The live Buy gate is OWED before deploy.** This round touched the paywall mount chain, the client abort budget, the validator's function config and the generate rate bucket. Nothing here was verified against the live site, LemonSqueezy, Anthropic or Upstash — the fix round was run with no network calls, by instruction. `vercel.json` was not touched, so CSP is unchanged.
- **Adjacent, reported not fixed.** (1) `new Redis({ url, token })` in both handlers takes the client's default retry policy — 5 attempts with `exp(i)·50 ms` backoff, ~4.3 s of sleeping per dead call — which is why the MED-3 ceiling had to leave 4 s of slack; `retry: { retries: 1 }` would bound it, and it is the only unbounded term in that arithmetic. (2) The Preservation Planner plans jars from a frost-blocked crop's yield, the same shape as MED-1 on a free, zone-agnostic tab. (3) The per-IP generate bucket is deliberately not refunded by LOW-7: it meters an address, not an entitlement.
- **Reconciling the MED-1 figures.** The review measured $88.65 with $13.65 from the sweet potato; that is this selection at frequency **sometimes**. My drive and the new goldens use **weekly**, which is exactly 2x it: $177.30 total, $27.30 from the sweet potato, $150.00 after the exclusion. Same defect, same ratio, one frequency apart.
