# Fixes — round 2: the re-reviews of the 2026-09-06 fix wave

**Repo / branch:** `Homestead/homestead-harvest-planner`, `fix/audit-2026-09-06` (round-1 tip `75ec332`)
**Scope:** every finding in `docs/security-review-2026-09-06-rereview.md` (HIGH-1, LOW-1..LOW-4) and `docs/code-review-2026-09-06-rereview.md` (N-1..N-6, L-6), plus the orchestrator's ruling on the routed M-6 prefill trade.
**Grant's mandate:** "fix ALL issues found and verify all your fixes", "make the choices yourself".
**Anthropic credit spent:** none. Every probe stubs `globalThis.fetch`; no live LemonSqueezy or Anthropic call was made.

> The two documents number their LOWs from 1; the work order numbered them from 2.
> Both ids are given in the table so neither reader has to translate.

---

## Verification, by exit code

| Command | Result |
|---|---|
| `npm test` (9 suites) | **exit 0** — quarantine 8/8, bounds 97/97, paywall mount chain 142/142 across 29 mounts, validate-key limits **57/57**, generate licence gate **51/51**, plan generation **41/41**, analytics 19/19, calc-golden **271/271**, render drive **140/140** |
| `npm run build` | **exit 0** — 33 modules, `dist/assets/index-LGDS3Iv7.js`, 406.45 kB / 115.79 kB gzip |
| `tools/security-scan.mjs` | 0 critical, **16** high, 2 medium, 1 info vs `75ec332`'s 0/**14**/2/1 — **delta +2 HIGH, both `[EVAL]` in TEST harnesses** (`bounds-and-sanitisers` 8→9, `plan-generation` 1→2: the two new `new Function` extractors). **No shipped-code delta.** The 2 MEDIUMs are still the two `ORIGIN-STARTSWITH` idiom hits the re-review ruled false positives; the suffix bypass stays closed and is now pinned by `R3-7` and `G-6.9`. |
| Mutation battery, 27 mutants | **before `75ec332`: 23 KILLED, 4 SURVIVED** (M16, M18, M20, M23 — the four the re-review named). **After: 27 KILLED, 0 SURVIVED, 0 failed to apply.** |
| Headless drive, production build at 375×820 | tap-target census over all 9 tabs: **0 controls under 44 px**, 0 horizontal scroll; soil headline and crop rows read below |

Controls (each new case proven non-vacuous against `75ec332`):

| Suite | Against the tree | Against `75ec332` (control) |
|---|---|---|
| `tests/validate-key-limits.test.mjs` (+32) | 57/57, exit 0 | **18 failed**, incl. `H1r-4` the owner answered 429 with LemonSqueezy never consulted |
| `tests/generate-licence-gate.test.mjs` (+9) | 51/51, exit 0 | **5 failed** (localhost reached Anthropic in production; a foreign Origin rescued by a good Referer) |
| `tests/render-drive.test.mjs` (+40) | 140/140, exit 0 | **21 failed**, and the census names **179** controls under the floor |
| `tests/calc-golden.test.mjs` (+12) | 271/271, exit 0 | **4 failed** (`cuYdWithSettling` undefined; `fmtMassRounded(0)` = `"0.000"`) + the garden-field harness bails loudly |
| `tests/bounds-and-sanitisers.test.mjs` (+6) | 97/97, exit 0 | harness bails: `toDisplay` does not exist there (the pre-fix drift is measured separately, below) |
| `tests/plan-generation.test.mjs` (+15) | 41/41, exit 0 | whole block red: `generatePlan` does not exist in the pre-round-1 tree |

Recreate a control tree without touching the working one:

```
mkdir -p node_modules/.cache/hhp-before
git archive 75ec332 | tar -x -C node_modules/.cache/hhp-before   # imports still resolve: node walks up to the repo's node_modules
node <battery> node_modules/.cache/hhp-before                     # "before"
```

> ### DEPLOY GATE — the licence path changed again
> `api/validate-key.js` and `api/generate.js` both changed on the licence and origin path. `vercel.json` was **not** touched this round and **no CSP directive was altered**, but §21 of `Homestead/CLAUDE.md` re-arms on any licence-path change: open thehomesteadplan.com in Chrome with DevTools, click Buy, confirm the LemonSqueezy overlay opens inside ~1.5 s with zero CSP / Trusted-Types console errors and the price reading `$39.99`. That check cannot be run from here — the branch is not deployed and deploys are blocked until the Vercel team leaves Hobby.

---

## Disposition

### Security re-review (`docs/security-review-2026-09-06-rereview.md`)

| Finding | Sev | Confirmed? | Action | Verified by outcome |
|---|---|---|---|---|
| **HIGH-1** the known-good exemption cannot be EARNED, and a junk `instance_id` fills the bucket without minting it | HIGH | **reproduced end to end** on the real handler: 60 junk-instance sprays → bucket 50, marker false, owner answered `429` with `legs=[]`; the owner on a fresh device also 429 | **fixed, two changes** — the mint now also fires on an instance rejection (`api/validate-key.js:625-636`), and the **bound device** passes the gate whatever the bucket says (`:258-277` `isBoundDevice`, gate `:417-431`) | `validate-key-limits` **H1r-1..H1r-13**: the spray never moves the bucket and mints the marker; the owner is served on their bound device AND on a fresh device with no instance; and with the marker absent and the bucket full, only the bound instance gets through (`H1r-10/11` still 429 for a stranger and for a bare key) |
| **LOW-1** (work order LOW-2) the exemption is never revoked | LOW | **reproduced**: one good validate, then 63 `disabled` verdicts → bucket 63, marker still present, 63 LS round-trips spent | **fixed** — `redis.del(licenceOkKey(key))` inside `bumpLicenceBucket` (`api/validate-key.js:236-262`), so it cannot drift from a sixth bump site. Also **narrowed the pool-full mint to our own store** (`:530-545`), which closes the carried-forward half | `validate-key-limits` **R1-1..R1-7**: the first definitive negative deletes the marker, the probes are capped again, LS round-trips stop at 50; a full pool from OUR store still earns the exemption, one from another store earns nothing |
| **LOW-2** (work order LOW-3) `localhost:5173` / `:3000` trusted in production | LOW | **reproduced**: `200` and one LS leg under `VERCEL_ENV=production` | **fixed in BOTH files** — `DEV_ORIGINS` + `allowedOrigins()`, resolved per request (`api/validate-key.js:19-42`, `api/generate.js:27-54`) | `validate-key-limits` **R2-1..R2-5**, `generate-licence-gate` **G-6.1..G-6.3**: 403 in production on the Origin arm and the Referer arm, still 200 in dev/preview |
| **LOW-3** (work order LOW-4) the origin gate is an OR, so a good `Referer` rescues a foreign `Origin` | LOW | **reproduced**: `Origin: https://evil.example` + `Referer: https://thehomesteadplan.com/x` → `200` | **fixed in BOTH files** — when both headers are present both must pass; a lone good header still passes; neither present passes per fleet canon | `validate-key-limits` **R3-1..R3-7**, `generate-licence-gate` **G-6.4..G-6.9** |
| **LOW-4** (work order LOW-5) 415/403/405 return before the per-IP limiter | LOW | confirmed by reading; the re-review says keep the placement | **accepted, recorded** (see "Accepted, with the reason" below) | — |

### Code re-review (`docs/code-review-2026-09-06-rereview.md`)

| Finding | Sev | Confirmed? | Action | Verified by outcome |
|---|---|---|---|---|
| **N-1** the Soil tab prints two volumes in the same units on different bases, and the 72 px one is the wrong one | MED | **reproduced** in the rendered card: headline `96.0 cu ft` / stat `3.56 cu yd` against a `110.4 cu ft` bill | **fixed** — hero and stat both moved onto the settled volume and both relabelled; the raw bed volume stays on the line beneath, named, in both units. `computeSoilResults` gained `cuYdWithSettling` (`src/App.jsx:1868-1875`), the card at `:1952-1961` / `:2083-2095` / `:2112-2115` | `calc-golden` **N1-1..N1-3**; `render-drive` **N1-1..N1-11** (both unit systems); **headless at 375**: `TOTAL SOIL TO BUY (INCL. SETTLING) | 36.8 cu ft | 1.36 cu yd for a bulk order · your beds measure 32.0 cu ft (1.19 cu yd) before the 15% settling buffer`, stat `Volume (cu yd, incl. settling): 1.36 cu yd` |
| **N-2** 97 controls still under the 44 px floor | LOW | **reproduced**: 82 crop rows at 275×32, 14 footer links at 343×24, brand link 247×42, "Blog" 41 px wide | **fixed** — crop row `minHeight: isMobile ? 44 : 32` (`:1576-1584`), footer `linkStyle` (`:7521-7530`), brand link (`:7143-7152`), About/Blog `minWidth` (`:7166-7200`). **Plus a census**, not a selector list | `render-drive` **N2-0..N2-5** walks every interactive element in 8 rendered surfaces and fails on any that does not DECLARE 44 px (179 named on the pre-fix source); **headless at 375**: 0 under 44 on all 9 tabs, and tapping a row still toggles it (12 → 11 checked). Desktop control: rows still 32 px |
| **N-3** a true zero prints as `0.000` | LOW | **reproduced**: `fmtMassRounded(0, false)` → `"0.000"`, on every Preservation row at both ends of the slider | **fixed** — `if (v === 0) return "0";` (`src/App.jsx:522-537`). `fmtMassValue` / `fmtAreaValue` deliberately keep their 3-decimal degrade: there a zero means "not a number", and `calc-golden` L1-10 pins it | `calc-golden` **N3-1..N3-5**; `render-drive` **N3-1..N3-3** on the real `PreservationPlanner` at 0 % and 100 % |
| **N-4** dead `!hasCrops` rung on the Cost Savings hero | LOW | **reproduced**: the tab returns its own empty state above, so the branch is unreachable | **fixed** — rung deleted, three states remain (`src/App.jsx:6404-6417`) | `render-drive` **N4-1..N4-4**: the empty state renders, the dead sentence is absent, and both reachable rungs plus the answer still render |
| **N-5** the garden-space field drifts at its metric floor | LOW | **reproduced**: 5 cycles at the floor, `10 → 10.7639 sq ft` (+7.64 %), and the mirror at the ceiling `100000 → 99996.73` | **fixed** — one `toDisplay()` expression now produces the value AND both bounds (`src/App.jsx:4319-4338`) | `bounds` **N-5.1..N-5.6** drives the REAL `Field.commit` over the REAL bounds for 5 cycles at floor, ceiling and mid-range: no movement, and typing outside the range still clamps. `calc-golden` **N5-1..N5-4** pins bound == displayed value, and that the JSX passes those two |
| **N-6** the preservation footnote states the error direction backwards | LOW | confirmed against this app's own basis (`peas_shell.yieldPerPlantLbs` is shelled weight; NCHFP weighs peas in the pod) | **fixed** — the "runs low for dense packs" clause is gone; peas are named with the direction the arithmetic gives (**the jar count reads low**) and corn is named as in-husk, without inventing a direction for a basis nobody has settled (`src/App.jsx:6916-6926`). Lettuce keeps 3.47 and the **romaine proxy is now disclosed** in three places (`src/data/crops.js:52-58` header, the `lettuce` entry, and the Cost Savings footnote) | `render-drive` **N6-1..N6-4** |
| **L-6** four surviving mutants: four untested consumers | LOW | reproduced: the battery re-run against `75ec332` survives exactly M16, M18, M20, M23 | **fixed** — four cases, each written against its mutant | **M16** `render-drive` L6-1..L6-5 (the rendered bar's `left:%` derived from the shipped `daysInYear`/`dayOfYear`/`splitRange`, leap vs common); **M18** `plan-generation` L6-4/L6-5 (the wire) + L6b-1..L6b-5 (the payload literal lifted and evaluated with stated 120 against derived 241); **M20** L6-1..L6-3 (three calls in one tick → one request); **M23** L6-6..L6-10 (a fake clock fires the real 90 s timer). Battery after: **27/27 killed** |
| **M-6** (routed) the prefill of a foreign key after a revoked stored key | — | ruled by the orchestrator | **prefill STAYS; the copy beside it now says whose key it is** (`src/App.jsx:3952`, `:4127-4136`), and the trade is written into `docs/fixes-2026-09-06-stage-b.md` with a dated note | `render-drive` **M6-1..M6-7**, including the negative control. `M-6.1..M-6.6` and the transient-outage no-prefill assertion are untouched and still pass |

---

## Per-fix detail: before → after

### HIGH-1 — the exemption is earnable, and the bound device is a backstop

Measured on the real handler with an in-memory Upstash emulator (real INCR/GET/SET/DEL/EXPIRE, base64 wire), before and after:

```
                                         75ec332            after
60 junk-instance sprays -> bucket        50                 never incremented
   ... -> known-good marker              false              true
OWNER, own bound instance                429  legs=[]       200  legs=["validate"]
OWNER, fresh device, no instance         429  legs=[]       200  legs=["validate","activate"]
bucket full + NO marker, bound device    429  legs=[]       200  legs=["validate"]
   ... same bucket, another instance      429                429   (the cap holds)
   ... same bucket, no instance at all    429                429   (the cap holds)
UNKNOWN key, 60 probes                   first 429 at #51   first 429 at #51
```

Two lines carry it. First, an instance rejection proves the KEY exists:

```js
// api/validate-key.js:636  (was: if (ACTIVATION_LIMIT_RE.test(errStr)) ... else bump)
if (ACTIVATION_LIMIT_RE.test(errStr) || looksLikeStaleInstance) await markLicenceKnownGood(key);
else await bumpLicenceBucket(key);
```

`looksLikeStaleInstance` was already computed one line above and is `Boolean(instanceId) && /instance/i.test(errStr)`. An unknown key answers `license_key not found`, with no instance wording, so the Phase-2 L6 probe cap is untouched — pinned by `H1r-7` (first 429 at #51 with a junk `instance_id` in every request).

Second, the gate consults the canonical binding `/api/generate` owns:

```js
// api/validate-key.js:423
if (!licenceKnownGood
    && (await licenceBucketExceeded(key))
    && !(await isBoundDevice(key, instanceId))) { ... 429 ... }
```

The Redis read is inside the third conjunct on purpose: it only happens once the bucket has already denied, so the happy path costs no extra round-trip. The failure bucket is **not** keyed on `(licence, instance)` — that shape would let any caller mint a fresh sub-bucket by rotating the instance id, which is the per-licence cap removed rather than fixed.

### LOW-1 — the exemption dies with the licence

`bumpLicenceBucket` is called from five legs and every one of them is a definitive negative (not found, expired, disabled, not active, wrong store), so the delete lives inside the bump rather than at five call sites:

```js
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, RL_LICENCE_WINDOW_SEC);
    await redis.del(licenceOkKey(key));          // <- new
```

The carried-forward half — a real key from ANOTHER LemonSqueezy store whose pool is full, marked known-good because that leg returns before the store gate — is closed by reading the `meta.store_id` LemonSqueezy already handed us, in the same body, rather than by reordering a customer-facing message:

```js
const preStoreIdEarly = process.env.LEMONSQUEEZY_STORE_ID;
const preMetaEarly = (preCheck.json && preCheck.json.meta) || {};
if (!preStoreIdEarly || String(preMetaEarly.store_id) === String(preStoreIdEarly)) {
  await markLicenceKnownGood(key);
}
```

### LOW-2 / LOW-3 — the origin gate

`ALLOWED_ORIGINS` is now production-only; `DEV_ORIGINS` joins it through `allowedOrigins()`, which is called **per request** because `VERCEL_ENV` is a per-invocation signal and the suites flip it case by case. `isAllowedOrigin` became an if/else over three shapes instead of an OR over two headers:

```js
if (origin && referer) return originAllowed && refererAllowed;
if (origin) return originAllowed;
if (referer) return refererAllowed;
return true;   // neither header: fleet canon, see below
```

The origin matrix, measured on the real handlers under `VERCEL_ENV=production`:

| Request shape | 75ec332 | after |
|---|---|---|
| `Origin: http://localhost:5173` | 200, 1 LS leg | **403**, 0 legs |
| `Origin: http://localhost:3000` | 200 | **403** |
| `Referer: http://localhost:5173/` | 200 | **403** |
| `Origin: evil` + `Referer: good` | 200, 1 LS leg | **403**, 0 legs |
| `Origin: good` + `Referer: evil` | 200 | **403** |
| `Origin: good` + `Referer: good` (the real client) | 200 | 200 |
| lone good `Origin` | 200 | 200 |
| lone good `Referer` | 200 | 200 |
| `Referer: https://thehomesteadplan.com.evil.example/x` | 403 | 403 |
| neither header | 403 | **200** — see below |
| dev/preview localhost | 200 | 200 |

**The one row that WIDENS, deliberately.** A request carrying neither `Origin` nor `Referer` now passes. That is the fleet canon
(`feedback_origin_allowlist_headerless_get.md`, sweep 2026-08-21, after Cycle-Tracker 403'd its own frontend): an origin allowlist
can only ever gate a real cross-site BROWSER call, and those always carry the header, while a scripted caller types whatever
`Origin` it likes. Both endpoints here are POST-only behind a licence gate, a store gate, a canonical instance binding and two rate
limits, and no response carries `Access-Control-Allow-Origin`, so the row costs nothing a forged header did not already cost. It is
called out here because the re-review's proof standard for an allowlist change is "zero rows widened", and this is the exception,
taken knowingly. Pinned by `R3-6` and `G-6.8` so it stays a decision rather than a drift.

### N-1 — one card, one basis per figure

```
before (three 8x4x12 beds, imperial)      after
Total soil needed                          Total soil to buy (incl. settling)
96.0 cu ft                                 110.4 cu ft
3.56 cu yd · or 110.4 cu ft with 15% ...   4.09 cu yd for a bulk order · your beds measure
Volume (cu yd)      3.56 cu yd                96.0 cu ft (3.56 cu yd) before the 15% settling buffer
Estimated cost (incl. settling) $563.04    Volume (cu yd, incl. settling)  4.09 cu yd
                                           Estimated cost (incl. settling) $563.04
metric: 2718.4 L beside 2.72 m3 and        metric: 3126.2 L, 3.13 m3, and the beds' own
        3126.2 L, unreconciled                     2718.4 L (2.72 m3) named as such
```

`cuYdWithSettling` is derived in `computeSoilResults` from the same buffer as everything else, so no reader can compute a second answer.

### N-5 — a bound and the value it bounds must be the same expression

```
75ec332, metric, canonical 10 sq ft:
  cycle 1: shown=0.9  min=1  stored=10                  <- the box opens BELOW its own floor
  cycle 2: shown=1    min=1  stored=10.763910416709722  <- +7.64%, from a focus and a blur
  ... stable thereafter
  ceiling: shown=9290.3 max=9290 -> stored 99996.73     <- the mirror, -3.3 sq ft
after:
  five cycles at the floor    -> 10          (unchanged)
  five cycles at the ceiling  -> 100000      (unchanged)
  five cycles mid-range       -> unchanged   (the guard that already worked, still works)
  typing 0.1                  -> 10          (the floor still clamps)
  typing 999999               -> 99999.96    (the ceiling still clamps, within the 0.1 m2 the box can show)
```

---

## The mutation battery

The re-review's battery lives in its own scratch directory, so this is a **reconstruction**: 27 mutants over the same surfaces, with the four it named as survivors reproduced from its own descriptions. It reproduces the reported result exactly — **23 killed / 4 survived on `75ec332`, and the survivors are M16, M18, M20 and M23** — which is what makes the "after" number mean something.

| Mutant | The edit | before | after |
|---|---|---|---|
| M16 | `totalDays = daysInYear(referenceYear)` → `365` | SURVIVED | KILLED (`render-drive`) |
| M18 | payload `gardenSqFt` → `derivedGardenSqFt` | SURVIVED | KILLED (`plan-generation`) |
| M20 | delete `if (planGeneratingRef.current) return;` | SURVIVED | KILLED (`plan-generation`) |
| M23 | delete `planAbortReasonRef.current = "timeout"` | SURVIVED | KILLED (`plan-generation`) |
| M1..M15, M17, M19, M21, M22, M24..M27 (23 more) | PATH_BUFFER, savings basis, savings cap, soil bags, frost truncation, two renames, the paywall message render, the client plan gate, the 44 px pill, the crop-selection loader, the report's yield column, `changeTab`, the report month filter, the mixOverrides sanitiser, the cleared Field, the completeness gate, the `VERCEL_ENV` origin branch, the pre-verdict bucket bump | KILLED | KILLED |

**27 KILLED, 0 SURVIVED, 0 failed to apply.** A mutant that fails to apply is reported as `NOT APPLIED` and never counted as killed — the anchors are matched exactly once or the run says so.

---

## Headless drive, production build, 375 × 820

```
== TAP-TARGET CENSUS ==
home              controls=  48  under 44px: 0   h-scroll: none
self-sufficiency  controls= 258  under 44px: 0   h-scroll: none
soil              controls=  57  under 44px: 0   h-scroll: none
companion         controls= 126  under 44px: 0   h-scroll: none
planting-dates    controls= 127  under 44px: 0   h-scroll: none
growing-plan      controls=  34  under 44px: 0   h-scroll: none
crops             controls=  34  under 44px: 0   h-scroll: none
cost-savings      controls=  34  under 44px: 0   h-scroll: none
preservation      controls=  34  under 44px: 0   h-scroll: none

== SOIL CARD ==
TOTAL SOIL TO BUY (INCL. SETTLING) | 36.8 cu ft | 1.36 cu yd for a bulk order ·
your beds measure 32.0 cu ft (1.19 cu yd) before the 15% settling buffer
Volume (cu yd, incl. settling): 1.36 cu yd     Estimated cost (incl. settling): 187.68 $
"Total soil needed" on the page: false     bare "Volume (cu yd)" label: false

== CROP ROWS ==       82 rows, 44-44 px tall, 275 px wide; tapping one still toggles it (12 -> 11 checked)
== DESKTOP (1280) ==  crop row 32 px — the floor is a phone rule, not a redesign
```

Two exemptions are applied by the census, both named in the code: a checkbox wrapped by a label that itself clears the floor (the label is the target), and the "Urban Root" credit, which is a link inside a sentence (WCAG 2.5.8 inline exception).

The one page error in the drive is the harness, not the app: the local static server has no `/_vercel/insights/script.js`, so it answers with `index.html` and the browser reports `Unexpected token '<'`. Vercel serves that file in production. No failed requests otherwise.

---

## Accepted, with the reason

- **LOW-4 (work order LOW-5): 415 / 403 / 405 return before the per-IP limiter.** Kept as it is, on the re-review's own reasoning: spending a Redis round-trip to meter a request you can reject from headers alone is the worse trade. Each unmetered rejection costs one Vercel invocation and nothing else — no Redis, no LemonSqueezy, no Anthropic. Recorded here so the next auditor finds a decision rather than a gap.
- **The `?key=` prefill (M-6).** Kept, with new copy beside the box. The trade, the reachable path and what would reverse the ruling are in `docs/fixes-2026-09-06-stage-b.md` under the dated 2026-09-07 note.
- **A full-pool key whose activation-limit ERROR arrives with no `meta`** (`api/validate-key.js:486-489`) still earns the exemption without a store check, because that response carries no store id to check. It grants no access, and the per-IP bucket still bounds it. The pool-full leg that DOES carry `meta` is now gated.
- **The SSR census measures the DECLARED box**, not a computed one: no layout engine, so it cannot see a flex stretch or an inherited font. Unknown is treated as FAIL, and the pixel census at 375 px is the browser drive above. Both are needed; neither replaces the other.

## Left, on purpose

- **`corn` and `peas_shell` quart weights** still route to `engineering-verifier` with the basis question stated ("what is the shelled/kernel weight per quart, on the same basis as `yieldPerPlantLbs`?"). This round fixed the FOOTNOTE's direction claim, not the constants; inventing a per-crop figure is the error the finding was raised about.
- **`npm i @upstash/redis@^1.38.4`** — the quarantine has passed, but a version bump is not this batch and would re-open the supply-chain check.
- **Spec deltas owed to `Homestead/CLAUDE.md`** (outside this repo): §8's plan schema, §12's grace window, §21's checklist and the split validate-key bucket, plus — new this round — the `hhp:instance:` read in `api/validate-key.js`, which makes that key load-bearing for TWO handlers.
- **`bug-scan` LOWs (11)** — all `REACT-INDEX-KEY` on static lists. Unchanged.
- **The live-Buy checklist** cannot be run from an undeployed branch. It is the deploy gate above.

---

*Every row above was reproduced before it was fixed, and every fix is pinned by a case that fails against `75ec332`. Nothing was committed or pushed.*
