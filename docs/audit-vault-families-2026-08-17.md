# The Homestead Plan — targeted audit: the two ARX Vault bug families

**Date:** 2026-08-17. **Baseline:** `main` @ `1c32caf`, working tree clean.
**Product class:** React calculator (paid, LIVE at thehomesteadplan.com) + two serverless routes (`api/validate-key.js`, `api/generate.js`).
**Scope:** Item 1 (data provenance derived from HTTP status rather than payload) and Item 2 (`Number(null)===0` in quantity/ratio guards, plus the coercing global `isFinite(`) from `../../docs/HANDOFF-2026-08-17-fleet-sweeps-from-vault-review.md:19-61`, plus the approved H-2 activation-limit checklist item from `Aero-Calc/repo-clone/docs/audit-vault-families-2026-08-17.md`.
**Audit only — no product file was modified.** Read-only pass; scratch scripts lived in the session scratchpad.

## Verdict per family

| Family | Verdict |
|---|---|
| 1 — provenance from HTTP status | **NOT APPLICABLE, verified.** No external data feed, no provenance tag, no fallback/mock map. `api/generate.js` raises real 4xx/5xx on every upstream failure and the client reads success from the **payload** (`data.ok` + `data.plan`), not from `resp.ok` alone. One residual filed as L-3 (a nine-section plan gated on one section). |
| 2 — `Number(null)===0` / clamp-to-min | **PRESENT AND CONFIRMED** in three helpers (`sanitizeNum`, `clampInt`, the inline `producePerPerson` guard), all measured. **Reachable only through corrupt `localStorage`** — this product has NO file-import path (proved below), which is what separates it from Aero's H-1. |
| H-2 (activation-limit wipes a paid key) | **ALREADY CLOSED ON BOTH LEGS, verified, with a test fixture.** Homestead is ahead of Aero here. Evidence in the "Checked and clean" section. |

**Overall: NEEDS FIXES — 0 CRITICAL / 1 HIGH / 3 MEDIUM / 5 LOW.**

The single HIGH is **not** a Vault-family bug. It surfaced while tracing what the Field commit path does with junk, which the audit brief asked for, and it is the only finding here that needs no corruption, no import and no hand-edited anything: in metric mode the raised-bed **Depth** field caps the user at 48 **cm** because its `max={48}` is written in **inches**. A customer with a 60 cm bed — the commonest European raised-bed depth — is silently snapped to 48 cm and then buys **21.3% too little soil**. Measured, not inferred.

## Verifications run

- `npm run build` → **exit 0** (`✓ built in 785ms`, 33 modules, `dist/assets/index-_Cpmf_dX.js` 394.42 kB / 111.73 kB gzip). No warnings.
- `npm test` → **exit 0**, completion line `paywall mount chain: 81/81 assertions OK across 20 mounts.` (two suites: `tests/load-quarantine.test.mjs` then `tests/paywall-mount-chain.test.mjs`). Green, and it does **not** cover any finding below — proved per finding.
- **Junk battery in Node against verbatim-extracted source.** `clampInt` (`src/App.jsx:352-356`), `sanitizeNum` (`:363-367`), `clampNum` (`api/generate.js:374-378`) and `n()` (`api/generate.js:604-608`) were sliced out of the real files by line range and imported as a data-URL module — not paraphrased. The extracted text is reproduced in each finding.
- **Consequence measurement** ran the real `computeResults` (`src/App.jsx:1053-1108`) and `computeBedVolumeCuFt` (`:1540-1563`) against the real 82-crop `src/data/crops.js` and the real `PRESETS.family_basics`.
- **Prototype-key probe** against the real `CROPS`, `GOAL_MULTIPLIER`, `FREQUENCY_FACTOR`, `ZONE_FROST_DATES`.
- **No browser.** Dev tools were forbidden for this run. Every UI claim below is traced to the exact render line and computed from the real functions; none is inferred from a screenshot.

---

## Item 1 — provenance derived from HTTP status: NOT APPLICABLE (verified)

Homestead has **no price, rate or commodity feed, no provenance tag, and no fallback/mock constant map.** Measured:

- `grep -n "fetch("` in `src/` returns exactly **two** hits, both to our own routes: `src/App.jsx:671` (`"/api/validate-key"`) and `src/App.jsx:4189` (`"/api/generate"`). No third caller.
- `grep -n "XMLHttpRequest\|axios\|EventSource\|new WebSocket\|sendBeacon\|import("` across `src/App.jsx`, `src/main.jsx`, `api/*.js` → **exit 1, zero hits.** No dynamic imports at all.
- `grep -rn "MOCK_\|FALLBACK_\|DEFAULT_PRICES\|isLive\|_source\|provenance\|'live'" src/ api/` → **exit 1, zero hits.** There is nothing that could be mislabelled "live" and no frozen constant map that could masquerade as fresh data.
- `grep -n "JSON.parse" src/App.jsx api/*.js` → two hits: `src/App.jsx:612` (inside `loadState`) and `api/generate.js:703` (the request body). No third parse target.

### The server half — `api/generate.js`, the paid Anthropic report generator

**Total upstream failure can never come back as a 200.** Every failure path raises a real status:

| upstream condition | line | status returned |
|---|---|---|
| Upstash env vars missing (production) | `:696` | 503 |
| licence server unreachable / ambiguous | `:745` | 503 |
| licence definitively invalid | `:726`, `:747` | 401 |
| rate limit | `:714`, `:756` | 429 |
| Anthropic 200 with a non-JSON body | `:822` | 502 |
| Anthropic 401/403 (bad key, exhausted credits) | `:832` | 502 |
| Anthropic 429 / 5xx / 4xx | `:841` | 502 |
| response truncated at `max_tokens` | `:851` | 502 |
| no `submit_growing_plan` tool_use block | `:864` | 502 |
| plan sanitised to nothing | `:869` | 502 |
| Anthropic timeout (`ANTHROPIC_TIMEOUT_MS`) | `:888` | 504 |
| any other throw | `:890` | 500 |

The **only** 200 is `:872`, and it is gated one line earlier at `:868` on `!plan || plan.monthlySchedule.length === 0`. So a 200 always carries at least one real month of plan content.

### The client half — `src/App.jsx:4216-4221`

```js
const data = await resp.json().catch(() => ({}));
if (!resp.ok || !data?.ok) {
  setError(data?.error || `The plan generator returned an error (${resp.status}). Please try again.`);
  setGenerating(false);
  return;
}
```

Success is read from **both** the transport (`resp.ok`) **and** the payload (`data.ok`), and the plan body it then consumes (`data.plan`, `:4233`) is the payload too. This is the correct shape — the inverse of the Vault's `refreshPrices`, which set `source:'live'` on any 200-and-parses response.

The licence route is the same story and is if anything stricter: `api/validate-key.js` has **two** explicit verdict-shape gates (`:255` on the pre-check, `:370` on the authoritative leg) that convert a 200 carrying no recognisable verdict into a **502 transient**, and the client's `validateKeyRemote` requires `typeof data.valid === "boolean"` on **every** leg including 200 (`src/App.jsx:688`). Aero's L-1 (a shapeless 200 treated as a definitive verdict, and a JSON-`null` 200 hanging the mount) does not exist here.

**Conclusion: not applicable, verified.** The one residual worth carrying forward is L-3 below — the completeness gate reads one field out of nine, which is the Vault's "two states where three are needed" lesson rather than its defect.

---

## Findings (most severe first)

### [HIGH] H-1 — in metric mode the bed Fields clamp a centimetre/metre value against an inch/foot bound, so a 60 cm bed silently becomes 48 cm and the soil order is 21% short (CONFIRMED)

**File:** `src/App.jsx:1986-1989` (Depth), `:1950-1983` (Length / Width / Diameter / Outer L+W / Cutout L+W). Component `BedEditor` (`:1891`), which receives `metric` at `:1698`. Clamp performed by `Field.commit`, `src/App.jsx:846`.
Taxonomy: **U1** (unit leak — a bound that does not follow the value's unit). Not a Vault family; found on the commit-path trace the brief asked for.

**What.** `BedEditor` converts the *value* for display but leaves the *bounds* as imperial literals:

```jsx
const dDepth = metric ? IN_TO_CM : 1;
const unitDepth = metric ? "cm" : "in";
...
<Field label="Depth" unit={unitDepth}
  value={Number((bed.depthIn * dDepth).toFixed(1))}
  onChange={(v) => onChange({ depthIn: commitDepth(v, bed.depthIn) })}
  min={4} max={48} step={1} />
```

`Field.commit` clamps in whatever unit it was handed (`const clamped = Math.max(min, Math.min(max, n)); onChange(clamped); setRaw(String(clamped));`, `:846-848`). So in metric the label reads **"Depth (cm)"** and the ceiling is **48 cm**, not 48 in.

**Measured — every bed Field, both units:**

| Field | declared min/max | imperial meaning | what a metric user is actually capped at |
|---|---|---|---|
| Length | 0.5 – 100 | 0.5 – 100 ft | 0.5 – 100 m = **1.64 – 328.08 ft** |
| Width | 0.5 – 50 | 0.5 – 50 ft | 0.5 – 50 m = **1.64 – 164.04 ft** |
| Diameter | 0.5 – 50 | 0.5 – 50 ft | 0.5 – 50 m = **1.64 – 164.04 ft** |
| Outer length | 1 – 100 | 1 – 100 ft | 1 – 100 m = **3.28 – 328.08 ft** |
| Outer width | 1 – 50 | 1 – 50 ft | 1 – 50 m = **3.28 – 164.04 ft** |
| Cutout length | 0 – 99 | 0 – 99 ft | 0 – 99 m = **0 – 324.80 ft** |
| Cutout width | 0 – 49 | 0 – 49 ft | 0 – 49 m = **0 – 160.76 ft** |
| **Depth** | **4 – 48** | **4 – 48 in** | **4 – 48 cm = 1.57 – 18.90 in** |

Depth is the harmful one, because it is the only field whose imperial ceiling is *lower* than a realistic metric input. Measured worked cases (`Field.commit` clamps in display units, `commitDepth`/`commitLen` then converts):

| user action, metric mode ON | measured result |
|---|---|
| Depth: types **61** (cm — a standard 24 in raised bed) | field snaps to **48**; stored **18.90 in** (48.0 cm) |
| Depth: types **5** (cm) | accepted; stored **1.97 in** — below the declared 4 **in** floor |
| Length: types **40** (m) | accepted; stored **131.23 ft** — 1.31× the declared 100 ft ceiling |
| Length: types **100** (m, the field's own max) | stored **328.08 ft** — 3.28× the declared ceiling |
| Length: clears the box (commit = `min`) | stored **1.640 ft** (0.5 m); imperial mode stores 0.5 ft |
| Depth, imperial: types **61** (in) | snaps to 48 in — correct, the intended ceiling |

**Why it matters — the money.** Measured on the app's default 8 ft × 4 ft rectangular bed through the real `computeBedVolumeCuFt`:

```
user wants 61 cm (24 in) deep:            64.00 cu ft
what metric mode lets them store (48 cm): 50.39 cu ft
soil under-ordered by                      21.3%
```

The Soil tab's whole job is telling the customer how much soil to buy. 13.6 cu ft short on one bed is roughly nine 1.5 cu ft bags. On a $39.99 tool the mis-order costs more than the product. Nothing on screen contradicts it: the field shows `48`, the label shows `cm`, and the volume, bag counts, settling-buffer line and Cost Savings prefill are all computed from the 18.9 in the app actually stored. The number does visibly snap from 61 to 48, but a user has no way to read that as "your unit's ceiling is written in the other unit" — 48 cm looks like a deliberate product limit.

**Why the fix is not in doubt.** This codebase already knows the pattern and applies it correctly one component away. `ProduceTargetField` (`src/App.jsx:1117-1118`) converts its bounds with its value:

```js
const min = metric ? MIN_PRODUCE_PER_PERSON_LBS * LB_TO_KG : MIN_PRODUCE_PER_PERSON_LBS;
const max = metric ? MAX_PRODUCE_PER_PERSON_LBS * LB_TO_KG : MAX_PRODUCE_PER_PERSON_LBS;
```

and then re-clamps in canonical units after converting back (`:1132`). `BedEditor` does neither. One twin hardened, the sibling left.

**Repro (no build needed, no corruption needed).** Open the Soil tab, switch to metric, type `61` into a bed's Depth box, blur. The box reads `48`. Switch back to imperial: the depth reads `18.9`, not `24`.

**Why `npm test` is green with this live.** Both suites are load/paywall suites; neither renders `BedEditor` nor exercises the metric toggle. `CLAUDE.md`'s own testing checklist has "Soil: metric / imperial toggle 5× without drift on canonical values" — it tests **drift**, which is correctly guarded (`commitLen`/`commitDepth` skip-if-equal, `:1902-1911`), and never tests **bounds**.

**Fix (text only, not applied).** Convert the bounds alongside the value in `BedEditor`, exactly as `ProduceTargetField` does, and keep a canonical re-clamp after conversion so the two can never disagree:

```js
const bMin = (canonMin) => metric ? Number((canonMin * dLen).toFixed(2)) : canonMin;
const bMax = (canonMax) => metric ? Number((canonMax * dLen).toFixed(2)) : canonMax;
// depth uses dDepth
const commitDepth = (raw, canonicalIn) => {
  const displayedNow = Number((canonicalIn * dDepth).toFixed(1));
  if (raw === displayedNow) return canonicalIn;
  const asIn = metric ? raw / IN_TO_CM : raw;
  return Math.max(DEPTH_MIN_IN, Math.min(DEPTH_MAX_IN, asIn));   // canonical re-clamp
};
```
Name the eight canonical bounds as constants (`BED_LENGTH_FT_MIN/MAX`, `BED_DEPTH_IN_MIN/MAX`, …) and use the same constants in `BedEditor` **and** in the `beds` loader at `:7006-7016`, so the two can never drift. Do the same for the two price Fields named in L-5. Do not fix Depth alone — the Length/Width ceilings are wrong in the other direction on the same line of code.

---

### [MEDIUM] M-1 — `sanitizeNum` never reaches its declared default for the five commonest JSON junk values; the field lands on its MINIMUM instead (CONFIRMED)

**File:** `src/App.jsx:363-367` (`sanitizeNum`), consumed at `:7006-7016` (the `hhp_beds` loader).
Taxonomy: **N1** — the Vault's `Number(null)===0`, Aero's H-1 shape.

**What.** Verbatim, as extracted and executed:

```js
const sanitizeNum = (v, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;   // only NaN/Infinity ever reach `fallback`
  return Math.max(min, Math.min(max, n));
};
```

`Number(null)`, `Number('')`, `Number([])`, `Number(false)` and `Number(' ')` are all `0`, all finite, so the `fallback` branch is dead for them and the clamp lifts `0` to `min`.

**Measured junk battery** — every call-site triple in the `beds` loader. `DEF` = the declared default was actually used:

| call site (def, min, max) | null | `''` | `[]` | false | undefined | `'x'` | `'5'` | true | `{}` | `['5']` | `' '` | `'5abc'` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lengthFt(8, 0.5, 100) | **0.5** | **0.5** | **0.5** | **0.5** | DEF | DEF | 5 | 1 | DEF | 5 | **0.5** | DEF |
| widthFt(4, 0.5, 50) | **0.5** | **0.5** | **0.5** | **0.5** | DEF | DEF | 5 | 1 | DEF | 5 | **0.5** | DEF |
| depthIn(12, 4, 48) | **4** | **4** | **4** | **4** | DEF | DEF | 5 | **4** | DEF | 5 | **4** | DEF |
| diameterFt(4, 0.5, 50) | **0.5** | **0.5** | **0.5** | **0.5** | DEF | DEF | 5 | 1 | DEF | 5 | **0.5** | DEF |
| outerLengthFt(8, 1, 100) | **1** | **1** | **1** | **1** | DEF | DEF | 5 | 1 | DEF | 5 | **1** | DEF |
| outerWidthFt(6, 1, 50) | **1** | **1** | **1** | **1** | DEF | DEF | 5 | 1 | DEF | 5 | **1** | DEF |
| cutoutLengthFt(4, 0, 99) | 0 | 0 | 0 | 0 | DEF | DEF | 5 | 1 | DEF | 5 | 0 | DEF |
| cutoutWidthFt(3, 0, 49) | 0 | 0 | 0 | 0 | DEF | DEF | 5 | 1 | DEF | 5 | 0 | DEF |
| qty(1, 1, 20) rounded | DEF | DEF | DEF | DEF | DEF | DEF | 5 | DEF | DEF | 5 | DEF | DEF |

Read the `undefined` column against the `null` column: **a field simply absent from the stored object behaves correctly; the same field written as `null` does not.** That divergence is the bug. `qty` is only safe by coincidence — its `min` and its `def` are both 1.

Two more coercions to note, the `Number()` cousins of the Vault's `isFinite(['500'])` half: `true` is accepted as a real `1` and `['5']` as a real `5`.

**Measured consequence** — one default rect bed through the real `computeBedVolumeCuFt`:

| stored field | value after the loader | bed volume | vs honest |
|---|---|---|---|
| honest 8 ft × 4 ft × 12 in | 8 / 4 / 12 | 32.00 cu ft | — |
| `lengthFt: null` | **0.5** / 4 / 12 | 2.00 cu ft | **6.3%** |
| `widthFt: null` | 8 / **0.5** / 12 | 4.00 cu ft | **12.5%** |
| `depthIn: null` | 8 / 4 / **4** | 10.67 cu ft | **33.3%** |
| all three `null` | 0.5 / 0.5 / 4 | 0.08 cu ft | **0.3%** |
| `lengthFt` ABSENT | 8 / 4 / 12 | 32.00 cu ft | 100% |

The bed editor then shows `0.5` and `4` in the boxes, so a user who looks will see their bed changed. But the volume, bag counts, cost estimate and the Cost Savings "Use Soil Calc total" prefill are all silently 1/12th to 1/3rd of the truth in the meantime.

**Reachability, stated honestly.** This product has **no import path at all** — `grep -n "FileReader\|type=\"file\"\|\.files\|readAsText\|accept=" src/App.jsx` returns **exit 1, zero hits**, and the only `JSON.parse` in `src/` is inside `loadState` (`:612`). The app's own writers cannot produce these values either: `Field.commit` only calls `onChange` with a `Number.isFinite` result or `min` (`:836-848`), and `Counter` only with integers (`:803`, `:810`). So the entry vector is strictly a **hand-edited or third-party write into `localStorage`** — DevTools, an extension, or a future import/restore feature. That is narrower than Aero's (which ships a real Import button), which is why this is MEDIUM here and HIGH there. The consequence class is identical.

`loadState` blunts one edge: a top-level stored `null` returns the caller's fallback (`:613`, `parsed == null ? fallback : parsed`). It does **not** protect nested fields, which is where all nine of these live.

**Why `npm test` is green with this live.** `tests/load-quarantine.test.mjs` covers the *bytes*-level quarantine shipped on 08-17 (an unparseable payload must be copied aside and must not be overwritten on mount). It has no fixture where the payload parses cleanly and carries `null` in a numeric field. This finding lives entirely on the other side of `JSON.parse`.

**Fix (text only).** Port the Vault's helper **pair** — they do different jobs and both are needed (verified present in `Asset-Register/src/App.jsx` at the cited lines this session):
- `importedNumber(v)` — `Asset-Register/src/App.jsx:2107`. Returns `null`, never a coerced `0`, unless the input is a real finite number or a **non-empty** string that parses to one. A boolean, an array or an object never yields a plausible figure. This is the half that separates "junk" from "a real zero".
- `importedNumberIn(v, lo, hi)` — `Asset-Register/src/App.jsx:2120`. Clamps a **real but out-of-range** number into declared bounds. This is what `sanitizeNum`'s clamp already does correctly and should keep doing.

Shape: `sanitizeNum(v, def, min, max)` becomes `const n = importedNumber(v); return n === null ? def : clamp(n, min, max);`. One helper, every call site. Apply it to `clampInt` in the same pass (M-2) rather than patching one caller.

---

### [MEDIUM] M-2 — `familySize` and `producePerPerson` both clamp junk to their minimum, and together they pin the hero self-sufficiency KPI at 100% (CONFIRMED)

**File:** `src/App.jsx:352-356` (`clampInt`) used at `:6967-6968`; the inline guard at `:6959-6963` for `producePerPerson`. Consumed by `computeResults` (`:1053-1108`), whose `householdTarget = producePerPersonLbs * familySize` (`:1091`) is the KPI denominator.
Taxonomy: **N1**, same root as M-1, different helper.

**What.** `clampInt` has **no fallback parameter at all** — its own comment says so (`:349-351`) — so *every* unparseable value lands on `min`, not on the caller's declared default:

```js
const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};
```

Measured, `clampInt(v, 1, 12)` for `familySize` (declared default 4): `null` → 1, `''` → 1, `[]` → 1, `false` → 1, `'x'` → 1, `{}` → 1, `' '` → 1, `'5abc'` → 1, `true` → 1. Only `'5'` and `['5']` give 5. **Every** junk value lands on 1.

`producePerPerson` repeats the pattern inline (declared default 300, min 50). Measured: `null` / `''` / `[]` / `false` / `true` / `' '` / `'5'` / `['5']` → **50**. Only `undefined`, `'x'`, `{}` and `'5abc'` reach 300.

**Measured consequence** — the real `computeResults` against the real `PRESETS.family_basics` (the first-load default selection), goal `fresh_preserving`:

| `hhp_family` | `hhp_produce_target` | familySize used | produce used | household target | total yield | **self-sufficiency % SHOWN** |
|---|---|---|---|---|---|---|
| 4 (honest) | 300 (honest) | 4 | 300 | 1200 lb | 573.0 lb | 47.8% |
| absent | absent | 4 | 300 | 1200 lb | 573.0 lb | 47.8% |
| `''` / `[]` / `false` / `{}` / `' '` | 300 | **1** | 300 | 300 lb | 162.1 lb | 54.0% |
| 4 | `''` / `[]` / `false` / `' '` | 4 | **50** | 200 lb | 573.0 lb | **100.0%** (raw 286.5%) |
| both junk | both junk | **1** | **50** | 50 lb | 162.1 lb | **100.0%** (raw 324.3%) |

The hero KPI — the number the whole free tier exists to produce, capped at 100 by `:1095` — reads **100% self-sufficient** when the honest answer is 47.8%. The same two values also drive `totalPlants` (798 → 203), the total garden area (277.0 → 81.4 sq ft) and therefore `gardenSqFt`, which is what gets **sent to Claude** as the space the plan must fit (`src/App.jsx:4202`). The generated plan is then designed for a garden a third the size.

Both wrong inputs are on screen (the family Counter shows 1, the produce Field shows 50), so a careful user can spot them. Nothing flags the KPI itself.

**Reachability.** Identical to M-1: corrupt `localStorage` only. No import path exists.

**Why `npm test` is green.** Same reason as M-1 — the load suite tests unparseable bytes, not parseable junk.

**Fix.** Give `clampInt` the same `importedNumber` front-end as M-1 and a real fallback parameter, and route the inline `producePerPerson` guard (`:6959-6963`) through the same helper instead of hand-rolling the third copy of this logic. The comment at `:349-351` documents the missing-fallback behaviour as intentional; it should stop being intentional.

---

### [MEDIUM] M-3 — a prototype-named key defeats every `MAP[key]`-truthiness load gate; in `hhp_crops` it produces a crash the Reload button cannot clear (CONFIRMED)

**File:** `src/App.jsx:6985` (`if (CROPS[k] && FREQUENCY_FACTOR[v]) clean[k] = v`), `:6977` (`GOAL_MULTIPLIER[g] ? g : "fresh_preserving"`), `:7079` (`ZONE_FROST_DATES[saved.zone] ? saved.zone : 7`), plus the same shape at `:7056`, `:7057`, `:7084`, `:7091`, `:7133`, `:7202`. Crash lands at `:1066` (`const [yieldLow, yieldHigh] = crop.yieldPerPlantLbs;`).
Taxonomy: **P2** (`pattern_nullish_lookup_prototype_key`).

**What.** `CROPS`, `GOAL_MULTIPLIER`, `FREQUENCY_FACTOR` and `ZONE_FROST_DATES` are plain object literals, so they inherit `Object.prototype`. Every loader gate above is a truthiness read on an **untrusted `localStorage` key**, and `Object.prototype` supplies a truthy value for six well-known names.

**Measured, gate by gate:**

| stored key | `CROPS[k]` truthy? | survives `:6985`? | then `computeResults` does |
|---|---|---|---|
| `"constructor"` | true (`function Object`) | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"toString"` | true | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"valueOf"` | true | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"hasOwnProperty"` | true | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"__proto__"` | true (`Object.prototype`) | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"isPrototypeOf"` | true | **YES** | **THROWS `TypeError: undefined is not iterable`** |
| `"banana"` (ordinary junk) | false | no | filtered, safe |

`JSON.parse` creates `__proto__` as an ordinary own property, so all six are reachable through `loadState`.

**Why the crash is unrecoverable.** `computeResults` is called at **`src/App.jsx:7668`, inside the root `App` component's `useMemo`** (and again at `:1167`). The throw therefore happens during the root render, is caught by the `ErrorBoundary` in `src/main.jsx`, and replaces the **entire application** — free tabs, paywall and all — with "Something went wrong. Reload the page to try again." The boundary's only affordance is `window.location.reload()`, which re-reads the same poisoned key and crashes again. There is no in-app reset. The documented escape is "clear site data", which also deletes `hhp_key` and `hhp_instance` — so recovering from this costs the customer one of their three LemonSqueezy activation slots.

**Softer variants, measured on the same probe:**
- `hhp_goal` = a prototype name → survives `:6977` → `GOAL_MULTIPLIER[goalKey] ?? 0.7` returns a **function** → `totalPlants`, `totalYieldLbs` and `selfSufficiencyPct` all compute to **NaN**. No crash: `fmtInt` (`:370`), `fmtDecimal` (`:374`) and `formatCountUp` (`:985`) all guard on `Number.isFinite` and render `-`. The checklist item "NaN never displayed anywhere" holds; the tab just goes blank of numbers with no explanation.
- `hhp_crops` **values** (the frequency side of the same gate) → same NaN cascade, same `-` rendering.
- `hhp_planting.zone` = a prototype name → survives `:7079` → `ZONE_FROST_DATES[zone]` is a function whose `.lastSpring` is `undefined` (`:460`).
- The companion / planting / preservation / price loaders (`:7056`, `:7084`, `:7133`, `:7202`) let the same keys through without crashing, and render a phantom crop whose `.name` reads `"Object"`, `"toString"`, `"valueOf"` etc.

**Reachability.** Same vector as M-1/M-2: only a hand-edited or third-party `localStorage` write. The app itself writes crop ids drawn from `Object.entries(CROPS)` and preset literals, so it cannot produce one. Ranked MEDIUM on that basis; it is the only member of this family that produces a hard, self-repeating failure rather than a wrong number.

**Fix.** Two changes, both cheap:
1. Make the gates own-property checks: `Object.prototype.hasOwnProperty.call(CROPS, k)`, or build the maps with `Object.create(null)` / `new Map()`. Apply to all nine sites in one pass — `:6977`, `:6985` (both sides), `:7056`, `:7057`, `:7079`, `:7084`, `:7091`, `:7133`, `:7202`.
2. Harden the consumer regardless: `:1066` should be `const [yieldLow, yieldHigh] = Array.isArray(crop.yieldPerPlantLbs) ? crop.yieldPerPlantLbs : [0, 0];`. A render-path destructure of a data-file field is one bad crop entry away from the same crash even without the gate hole.

Consider also giving the `ErrorBoundary` a "reset the planner" button that clears the `hhp_*` keys **except** `hhp_key` / `hhp_instance`, so a poisoned-state crash stops costing an activation slot.

---

### [LOW] L-1 — `api/generate.js n()` returns a hardcoded 0 on the NaN leg, bypassing its own declared minimum (CONFIRMED)

**File:** `api/generate.js:604-608`, consumed at `:630-631` (`plantings`, `intervalWeeks`), `:646-647`, `:661`.

```js
function n(v, min = 0, max = 1e9) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;      // <- ignores `min`
  return Math.max(min, Math.min(max, x));
}
```

Measured on the two call sites whose `min` is not 0:

| call site | null | `''` | `[]` | false | **undefined** | **`'x'`** | `'5'` | true | **`{}`** | `['5']` | `' '` | **`'5abc'`** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `plantings` `n(v,1,12)` | 1 | 1 | 1 | 1 | **0** | **0** | 5 | 1 | **0** | 5 | 1 | **0** |
| `intervalWeeks` `n(v,1,52)` | 1 | 1 | 1 | 1 | **0** | **0** | 5 | 1 | **0** | 5 | 1 | **0** |

A missing or unparseable `plantings` returns `0`, below the declared floor of 1. The succession row survives the filter at `:633` (it only requires `crop`) and renders, identically on screen and in the export:

- `src/App.jsx:4645` — `{s.plantings} plantings · every {s.intervalWeeks} {s.intervalWeeks === 1 ? "week" : "weeks"}`
- `src/App.jsx:4957` — same string in the downloadable HTML

so the customer reads **"0 plantings, every 0 weeks"** in a paid, downloadable report. Note the pluralisation branch tests `=== 1`, so `0` renders "weeks" — correct English, wrong number.

**Reachability: PLAUSIBLE.** The tool schema marks `plantings` and `intervalWeeks` `required` (`api/generate.js:484`), but Anthropic's tool-use does not hard-validate tool input against the schema, and workspace memory already records Sonnet omitting required fields on structured output. To settle it, log any `sanitisePlan` field that took the `!Number.isFinite` branch for one week of live generations.

**Fix.** `if (!Number.isFinite(x)) return min;` — one word. Then decide separately whether a succession row with no usable `plantings` should render at all, or be filtered like the harvest rows are.

---

### [LOW] L-2 — `referenceYear` junk lands on last year, not this year (CONFIRMED)

**File:** `src/App.jsx:7086-7088`.

```js
referenceYear: Number.isFinite(Number(saved.referenceYear))
  ? clampInt(Number(saved.referenceYear), thisYear - 1, thisYear + 2)
  : thisYear,
```

The `Number.isFinite` pre-gate correctly sends `'x'`, `{}` and `'5abc'` to `thisYear`. But `null`, `''`, `[]`, `false` all coerce to a finite `0`, pass the gate, and are then clamped by `clampInt` to `thisYear - 1` — measured **2025**. `true` → 1 → 2025; `'5'` → 5 → 2025; `['5']` → 5 → 2025.

Consequence: the Planting Dates 12-month timeline is anchored to the wrong year, so weekday-dependent and leap-year-dependent date arithmetic is off. Cosmetic in most cases, and the tab does not label the reference year prominently. Same root as M-2 — fixing `clampInt` fixes this.

---

### [LOW] L-3 — the plan-completeness gate reads one section out of nine (PLAUSIBLE)

**File:** `api/generate.js:868`.

```js
const plan = sanitisePlan(toolBlock.input, input.currency);
if (!plan || plan.monthlySchedule.length === 0) {
  return res.status(502).json({ ok: false, error: "The generated plan was incomplete. Please try again." });
}
```

`sanitisePlan` returns `[]` for any of the eight other sections whose array is missing or fully filtered (`:620-666`), and `null` for `savingsEstimate`. A response carrying one valid month and nothing else therefore ships as `ok: true`, and every renderer is gated `plan.X.length > 0` (`:4601`, `:4629`, `:4655`, `:4662`, `:4688`, `:4717`, `:4758`) so the tab renders a Summary, one month, and silence. The customer has spent one of twenty hourly generations and about $0.06 of Anthropic spend on it, and the "Regenerate anyway?" confirm (`:4167-4172`) will treat that stub as a fresh plan.

This is the Vault's three-state lesson rather than its defect: the route answers "complete / incomplete" where "complete / partial / empty" is the real shape. **PLAUSIBLE** — it needs a model response that drops eight required fields at once, which the forced tool-use schema makes unlikely. To settle it, count how many of the nine sections are non-empty and log any generation below, say, six.

**Fix.** Count the populated sections and either 502 below a threshold, or return `ok:true` with a `partial: true` flag the client can surface as "we could only build part of this plan — regenerate at no extra cost".

---

### [LOW] L-4 — clearing a Field commits the MINIMUM, not the previous value or the default (CONFIRMED)

**File:** `src/App.jsx:836-839`.

```js
if (raw.trim() === "") {
  onChange(Number.isFinite(min) ? min : 0);
  setRaw(String(Number.isFinite(min) ? min : 0));
  return;
}
```

Documented and deliberate, but it interacts badly with one specific field. Select-all + delete + blur on **"Annual produce per person"** commits `min` = 50 lb (or 23 kg in metric, which converts back to 50.7 lb). Measured through the real `computeResults`: the household target drops from 1200 lb to 200 lb and the hero self-sufficiency KPI reads **100.0%** (raw 286.5%) for a garden that honestly covers 47.8%.

It is not a wrong number in the strict sense — the field visibly shows 50 and the user is 100% of a 50 lb target — but "I cleared the box" is a far more natural gesture than "I set my household's annual produce need to the lowest value the product allows", and the KPI is the product's headline claim. Same on the bed Depth field, where clearing commits 4 in (or 4 cm, per H-1).

**Fix.** On an empty commit, restore the current canonical value rather than `min`, or restore the declared default where the call site supplies one. If `min` is kept, the KPI card should say what target it is measuring against.

---

### [LOW] L-5 — two more Fields carry unit-mismatched maxima, harmless today (CONFIRMED)

Same defect shape as H-1, without the consequence:
- `src/App.jsx:1766-1769` — soil component price, `min={0} max={999}`, displayed as currency **per litre** in metric and **per cu ft** in imperial. A metric user may enter up to 999/L (≈ 28,270/cu ft); an imperial user is capped at 999/cu ft.
- `src/App.jsx:5959-5971` — Cost Savings grocery price, `min={0} max={500}`, displayed **per kg** in metric and **per lb** in imperial. 500/kg ≈ 227/lb.

Both ceilings sit far above any real price, and the loader independently caps `priceOverrides` at `< 10000` (`:7133`), so no wrong number reaches a customer. They belong in the H-1 fix commit so the pattern is closed once rather than three times.

---

## Blast radius / siblings to check

**Inside Homestead, if M-1/M-2 are fixed:** `sanitizeNum` and `clampInt` are the single funnel for the `beds`, `familySize` and `referenceYear` loaders. That is a **return-contract change** — the helper would start returning the caller's default where it previously returned `min`. Re-audit all 11 call sites (`:6968`, `:7006-7016` ×9, `:7087`) in the same commit, and re-run `tests/load-quarantine.test.mjs`, which asserts on loaded values.

**Inside Homestead, if H-1 is fixed:** the eight bed bounds are duplicated between `BedEditor` (`:1950-1989`) and the loader (`:7006-7016`) and currently **match exactly** in imperial — that symmetry is a genuine asset and must survive the fix. Aero's L-2 (three different ceilings for one quantity) does **not** exist here; do not introduce it.

**Fleet — the same shapes, named concretely:**
- **`Growroom/growroom-calc/`, `Tower-Garden/tower-garden-calc/` (Vertica), `Famine-Prep/crisis-food-prep/`, `MoneyCat/`** — grep each for a `sanitizeNum`/`clampInt`-shaped helper (`Number(v)` + `Number.isFinite` + clamp) and run this exact battery on its call-site triples. The tell is a `min` greater than 0 sitting next to a *different* `def`: that is where junk becomes an extreme legitimate value instead of the default. Aero-Calc's audit already confirmed the same helper there; Homestead and Aero share ancestry on `Field`, so the helper is very likely a common ancestor across the four calculator products.
- **Every product with a metric/imperial toggle** — this is the higher-value sweep and it is **not** in the Vault handoff. Grep each product for a `<Field`/`<NumberInput` whose `value` prop contains a conversion factor (`* FT_TO_M`, `* IN_TO_CM`, `* LB_TO_KG`, `/ CUFT_TO_L`, `* PSI_TO_BAR`, `* GAL_TO_L`) and whose `min`/`max` props are **bare numeric literals**. That combination is H-1 exactly. Aero-Calc, Growroom and Vertica all carry unit toggles and all use the same `Field` lineage. Homestead's own `ProduceTargetField` (`:1114-1142`) is the correct reference implementation to port.
- **Any product whose load gate is `MAP[untrustedKey] ? … : default`** (M-3). This is a plain-object-literal hazard, not a Homestead one. Grep for `[saved.` and `[k]` inside `useState(() => …)` initialisers across the fleet.
- **`ARX-Assets/` and `Property-Portfolio/` (Mortar)** remain the Vault reviewer's named N1 targets and are **not** covered by this document.
- **H-2 needs no fleet action from Homestead's side** — it is already closed here on both legs *and* covered by a test, which makes `Homestead/homestead-harvest-planner/api/validate-key.js:141-151, 258-279, 351-356` plus `tests/paywall-mount-chain.test.mjs:735-742` the best reference implementation in the fleet. Aero-Calc's H-2 fix should be ported **from** this file. HeatLens was flagged unchecked against M-1/N-1/A-1 in the 08-17 paywall audit and is still unchecked.

---

## Checked and clean (do not re-audit)

- **No bare global `isFinite(`** anywhere. `grep -n "[^.a-zA-Z_]isFinite(" src/App.jsx src/data/*.js api/*.js` → **exit 1**. All 38 uses are `Number.isFinite` (35 in `src/App.jsx`, 2 in `api/generate.js`, 1 in `api/validate-key.js` — counts match exactly). The Vault family's second half is absent.
- **Family 1 is absent** — one `fetch` target per route, no third network API, no dynamic import, no mock/fallback map, no provenance tag. Full evidence in the Item 1 section above.
- **H-2 (activation limit deletes a paid licence) is closed on BOTH legs.** The pre-check flags it at `api/validate-key.js:273-279`; the authoritative `/activate` rejection flags it at `:351-356` via `activation_limit_reached: ACTIVATION_LIMIT_RE.test(errStr)`; `normaliseLsError` tests the limit bucket **first** (`:145`) with an explicit comment that LS limit wording can contain "invalid" and would otherwise be swallowed by the `/not found|invalid/i` bucket. The client honours the flag at `src/App.jsx:7413-7429` and keeps **both** `hhp_key` and `hhp_instance`. `validateKeyRemote` passes the flag through unchanged on the 200 leg (`:721`). Test fixture exists: `tests/paywall-mount-chain.test.mjs:735-742` drives an `/activate` HTTP-400 `"License key activation limit reached."` and asserts both `activation_limit_reached === true` (A-1s.7) and that the message reads as a limit rather than "could not be validated" (A-1s.8); `:759` (A-1s.10) pins that a genuinely dead key is still a plain definitive reject. This is the gap Aero-Calc's H-2 named as missing from *its* suite.
- **`api/validate-key.js:271-273` counter coercion is safe.** Measured all ten combinations: `activation_usage` junk (`null`/`''`/`[]`/`false`/`undefined`) never fabricates a limit (the pre-flag stays `false` and the authoritative `/activate` leg catches the real case), and `activation_limit: null` — LemonSqueezy's "unlimited" — is correctly treated as no limit by the `limitPre > 0` guard. No false positives, and every false negative is recovered one HTTP call later.
- **`validateKeyRemote` shape gate** (`src/App.jsx:688`) requires `typeof data.valid === "boolean"` on **every** leg including 200, so a shapeless or `null` 200 body is transient, never definitive, and never throws. Aero's L-1 does not exist here.
- **`LS_PENDING` grace handling** (`:7443-7465`): `Number(loadState(LS_PENDING, 0))` plus `Number.isFinite(pending) && pending > 0` plus the two-sided `age >= 0 && age < GRACE_WINDOW_MS` window rejects every junk value measured (`''`/`[]`/`false` → 0 → skipped; `'x'` → NaN → skipped; `true` → 1 → aged out and cleared). Only a genuinely expired window clears the stamp. No coercion hole.
- **`isStoredNumber`** (`:7122`) is the **correct** shape and its comment names this exact bug class (`"Strict numeric coercion: Number(null) === 0, Number(false) === 0, "" → 0"`). Measured: it rejects all twelve junk values on all three consumers (`priceOverrides` `:7133`, `setupCosts` `:7140`, `freshPct` `:7196`), keeping the declared default in every case. Where the codebase used `typeof v === "number"` it got this right; the three helpers that used `Number(v)` got it wrong.
- **Bed bounds are symmetric between the editor and the loader** (in imperial): Length 0.5–100, Width 0.5–50, Depth 4–48, Diameter 0.5–50, Outer L 1–100, Outer W 1–50, Cutout L 0–99, Cutout W 0–49, qty 1–`MAX_BEDS_PER_GROUP`(20). Every pair matches exactly. Aero's L-2 (three different ceilings for one quantity) is **absent**.
- **`ProduceTargetField`** (`:1114-1142`) converts its bounds with its value **and** re-clamps in canonical lb after converting back. This is the reference implementation H-1 should be fixed against.
- **Drift guards are all present and all skip-if-equal**, as `CLAUDE.md` §7 claims: `ProduceTargetField` `:1126-1133`, soil component price `:1733-1737`, soil component pct `:1749-1756`, Cost Savings price `:5963-5970`, `BedEditor` `commitLen`/`commitDepth` `:1902-1911`. Each compares against the byte-identical `toFixed` rendering of the current canonical value. The blur-recommit drift canon is honoured. H-1 is a **bounds** defect, not a drift defect.
- **On-screen render and HTML export are symmetric.** All nine plan sections appear in both, behind identical `plan.X.length > 0` gates; both filter unknown month names on `startIdx >= 0` (screen `:4812`, export `:4978`, with the reason documented at `:4528-4530`); both read `plan.savingsEstimate.currency || currency`; the export converts garden space for metric (`spaceStr`, `buildPlanReportHtml`) and `escapeHtml` is applied to every model-supplied string. No export-path omission.
- **No currency conversion anywhere.** `CURRENCY_SYMBOLS` (`:134`) is a symbol allowlist with no FX table, so the double-conversion class cannot occur. The load-time allowlist at `:6945-6953` closes the injection variant.
- **`CURRENCY_CODE_TO_SYMBOL`** (`api/generate.js:585`) is a plain object literal read with `[upper]`, but the `.toUpperCase()` on the previous line means no prototype key (`constructor`, `toString`) can ever be the lookup string. Not a P2 site.
- **`parseIsoDate`** (`:474-486`) is correct: regex-gated capture groups, explicit month/day range checks, and a Feb-30 round-trip rejection.
- **Paid render gates are uniform.** All five paid surfaces gate on `activeTab.paid && !validating && paid` (`:7746`, `:7754`, `:7765`, `:7781`) with an explicit validating branch at `:7726` and a locked branch at `:7729`. `paid` starts `false`, `validating` starts `true` (`:7214-7215`), and `paid` is never initialised from `localStorage`.
- **The paywall mount chain** (`:7322-7502`) carries the full 08-17 hardening: URL-key deferral on ANY stored key (N-1), foreign-key refusal (M-1), held-not-committed error messages (M-3), transient-never-wipes (C1), activation-limit-never-wipes (A-1), and the both-edges grace window with only-expiry-clears (L-2/R-1a). Driven by 81 assertions, exit 0.
- **`Field` and `Counter` cannot write junk into state.** `Field.commit` calls `onChange` only with a `Number.isFinite` result or `min` (`:836-848`); `Counter` only with `Math.max`/`Math.min` of an integer (`:803`, `:810`). Every finding in Family 2 is therefore storage-entry-only, not editor-reachable.
- **`loadState` / `quarantineRaw` / `usePersistOnChange`** (`:585-643`) — the 08-17 fleet-sweep work is correct as built: `raw` is declared outside the `try` so the catch can still quarantine the bytes; the quarantine de-duplicates by content before writing; the original key is never deleted; and persistence is per-key ref-guarded on **value**, not on a first-run flag, so StrictMode's double mount cannot spend the guard. The gap this audit found is that quarantine fires on *unparseable bytes* only — M-1, M-2 and M-3 are all payloads that parse cleanly.
- **`npm run build` exit 0; `npm test` exit 0** with every finding above live. Neither gate covers any of them; the specific reason is stated per finding.

## Not this agent's call

- Whether a definitive licence rejection should ever wipe on the **first** refusal, and the LemonSqueezy dashboard's actual activation limit → security-auditor / Grant. The correctness half (the limit verdict must not read as a bad key) is closed, verified above.
- Formula correctness beyond the arithmetic traced here — Cornell path buffer, USDA produce baselines, NCHFP jar weights, `FREEZER_BAG_CUFT` → engineering-verifier.
- Whether a partially-populated plan should be billed against the customer's 20/hour quota (L-3's product half) → Grant.

**Every finding above is reported; none is fixed. No product file was modified in this session.**
