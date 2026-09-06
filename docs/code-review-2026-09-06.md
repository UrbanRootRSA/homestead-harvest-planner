# Code review — 2026-09-06

**Verdict: NEEDS FIXES** (0 CRITICAL / 2 HIGH / 6 MEDIUM / 7 LOW new; 3 known-deferred re-confirmed live)
**Baseline:** `a752d42` on `main`, working tree clean (one untracked sibling doc from the concurrent security review).
**Product class:** React calculator + paywalled LLM report generator (paywall state machine, generate flow, unit toggles, localStorage persistence).
**Scope:** full-suite audit of the whole product, not a diff review. Paywall state machine end to end, `/api/generate` flow end to end, all eight tabs' arithmetic and unit handling, every localStorage read, mobile at 375, the print/download path.
**Reviewer contract:** read-only. Nothing in this repo was modified. No live `/api/*` endpoint was called, no licence key was validated against LemonSqueezy, no Anthropic credit was spent.

---

## Verifications run

| What | Command | Outcome |
|---|---|---|
| Build | `npx vite build --outDir <scratchpad>/homestead-dist` | **exit 0**, 33 modules, `index-DCoWnl4s.js` 395.70 kB / 112.28 kB gz |
| Test suite | `npm test` (5 suites) | **exit 0**, completion line `analytics redaction: 19/19 checks OK.` |
| Licence-gate suite alone | `node tests/generate-licence-gate.test.mjs` | **exit 0**, `generate licence gate: 24/24 assertions OK.` |
| Driven UI | headless Chrome 25.5.0 (puppeteer-core from `Shift-Fit/node_modules`) against the built bundle on a local stub server, one **fresh browser context per scenario** (paywall drives contaminate each other otherwise) | 16 batteries, ~60 scenarios; results inline below |
| Stub coverage | `/api/validate-key`: 200-valid, 200-invalid, 200-activation-limit, 500, network-reset, hang. `/api/generate`: good, partial body, old-documented-shape, malformed JSON on 200, 500 with body, 500 empty body, 429, network-reset, hang, 6 s delay | — |
| Viewports | 1280 and 375, every tab, free and paid | — |
| Report path | blob intercepted, written to disk, re-opened as a standalone `file://` document | valid, 9/9 sections, no overflow, print button live |

Green build and green tests cleared **none** of the findings below. Every suite is a source-string / mount-chain harness; nothing in the repo renders `GrowingPlanTab`, `PlanRenderer`, `PaywallOverlay`, `CropDatabaseTab` or `SoilCalculator`, so the two HIGHs and five of the six MEDIUMs sit on surfaces that have no test coverage at all.

---

## Executive summary

The engine is sound. I traced the self-sufficiency arithmetic end to end against `crops.js` (tomato: 25 lb/person × 4 × 0.75 goal × 1.0 frequency = 75 lb → `ceil(75/8)` = 10 plants → 40.0 sq ft → midpoint yield 100 lb/yr) and the screen matched to the digit. The soil volumes, bag round-ups, settling buffer, currency threading, cost-savings ROI guards, preservation container maths, frost-date shifts and the hemisphere flip all check out. The metric/imperial drift guards — this product is the origin of that canon — still hold: five focus+blur cycles on every bed Field in metric mode left `lengthFt: 8, widthFt: 4, depthIn: 12` byte-identical, and the produce-target field skipped the write entirely on all six cycles. No horizontal scroll at 375 on any of the nine routes. No paid content flashes during validation. The `Checkout.Success` → 48-hour-grace path, which `CLAUDE.md` still lists as never exercised, **works**: I drove it with `lemon.js` blocked and a stubbed SDK, and the pending stamp is written, the paywall is replaced, and it survives a reload.

The two HIGHs are both about a paying customer being left with nothing and no explanation. **H-1:** the Growing Plan tab is conditionally rendered, so clicking any other tab while a plan is generating unmounts it, the cleanup effect aborts the fetch, and the customer comes back to a bare "Generate my growing plan" button — no plan, no error, no hint. The server has already spent one of their 20 generations per 24 hours and ~$0.06 of Anthropic credit, because the per-licence rate limit is incremented before the model call. I drove it: one `/api/generate` call fired, `hasPlan:false`, `alert:""`. The on-screen copy says "Please don't close the tab" and says nothing about leaving it, and the tab bar stays fully enabled. **H-2:** the whole 2026-08-17/18 fix chain that computes the right licence message (transient outage, full device pool, foreign key) writes it into `keyError` — and `keyError` has exactly one render site, inside a form that is collapsed unless a `?key=` prefill exists. Two of the three producers never set a prefill. So the customer whose three devices are used up, or whose licence server is briefly unreachable, sees a bare "$39.99 / Get full access" sales page. The remedy text the fix authors wrote — "Deactivate an old device in your LemonSqueezy account" — is one un-prompted click away and nobody will click it.

The MEDIUMs cluster around the same theme: the product knows the right answer and then does not show it, or shows a different one. The purchase-email `?key=` link lands the newly-paid customer on the marketing Home tab with the pricing tile still on screen (the spec's own checklist says it should land on `#growing-plan`). In metric, 31 of the 82 crops print `Space: 0.0 m²` — a real 0.0058 m² rounded to one decimal — so a Rand/Euro/metric customer reads "no space needed" for carrots, onions, garlic and every herb. The model's currency echo overrides the customer's own currency selection on the savings headline, on screen and in the downloaded report (driven: user picked `R`, model returned `€`, screen read `€ 612`). Deselecting every crop is silently undone by the next reload, which restores the 12-crop Family Basics preset and with it every downstream paid number. And any plan body that is not exactly the current shape — including the shape `CLAUDE.md` §8 still documents — takes the **whole app** into the ErrorBoundary, not just the tab.

None of this is a paywall bypass. I looked specifically: `paid` starts `false`, `validating` starts `true`, all five paid surfaces gate on `activeTab.paid && !validating && paid`, the plan body is never persisted, and the server re-checks the licence on every generate call with a canonical instance binding. There is no way to reach the paid growing plan without a valid licence or a live grace stamp.

---

## Findings (most severe first)

### [HIGH] H-1 — leaving the Growing Plan tab mid-generation silently throws away the plan, after the quota slot is already spent (NEW, CONFIRMED)

**File:** `src/App.jsx:4079-4098` (unmount cleanup aborts the in-flight fetch), `src/App.jsx:7938-7952` (`{… tab === "growing-plan" && <GrowingPlanTab …>}` — conditional render, so a tab change unmounts), `src/App.jsx:4368-4380` (the AbortError branch), `api/generate.js:786-791` (per-licence rate limit incremented **before** the Anthropic call).

**What:** `generating`, `error` and the fetch controller all live inside `GrowingPlanTab`. Switching tabs unmounts the component; the cleanup effect calls `abortControllerRef.current.abort()`. The server keeps running, completes the Anthropic call, and returns a plan nobody receives. On return the component remounts with `generating:false`, `error:""`, `plan:null`.

**Why it matters:** the customer paid $39.99 for exactly this deliverable. They get silence. Then they click Generate again, spending a second of the 20 generations allowed per 24 hours and a second ~$0.06 of Anthropic credit. A customer who does this a handful of times while waiting can exhaust their daily quota without ever seeing a plan. The reassurance copy at `src/App.jsx:4592-4595` says "Please don't close the tab" — it does not say "don't leave this tab", and every nav tab remains clickable throughout.

**Repro / evidence (executed):** built bundle, stubbed `/api/generate` with a 6 s delay, paid session seeded.
1. Click **Generate my growing plan**. At +900 ms the button reads `Reading your inputs...`, `disabled:true`, reassurance line visible.
2. Click **Crop Database**, wait 600 ms, click **Growing Plan**.
3. Wait 8 s (well past the stub's 6 s response).
Result: `{"label":"Generate my growing plan","disabled":false,"reassurance":false,"hasPlan":false,"alert":"","errorBoundary":false}` and `api/generate calls made: 1`.

**Fix shape:** lift the generation to `App`, next to `planState`, so it outlives the tab. Minimum viable version: keep `abortControllerRef` and the promise in a ref that is **not** cleared on unmount, drop the abort from the unmount cleanup (keep it on the 90 s timeout and on `beforeunload`), and have the resolver write into `setPlanState` — which already lives in `App` and already survives the tab switch. Belt and braces: disable the tab bar (or show a "generating — don't navigate away" state) while `generating` is true, and change the reassurance copy from "don't close the tab" to "don't close or leave this tab".

**Blast radius:** the same shape exists anywhere a long-running paid fetch lives inside a conditionally-rendered tab. Check FaminePrep and HeatLens report generation before shipping this fix elsewhere.

---

### [HIGH] H-2 — every held licence message is invisible until the customer clicks a link they have no reason to click (NEW, CONFIRMED)

**File:** `src/App.jsx:3717` (`const [keyInputOpen, setKeyInputOpen] = useState(Boolean(prefillKey));`), `src/App.jsx:3877-3883` (the **only** render site of `keyError`, inside the `keyInputOpen` branch). Producers that set `keyError` with **no** prefill: `:7566` (transient licence-server failure), `:7583` (activation limit reached), `:7515` (a different licence is already stored — prefill deliberately withheld for security, correctly).

**What:** the 2026-08-17 M-3 / A-1 and 2026-08-18 L-1 fixes compute an accurate, remedy-bearing message and commit it at the deny leg. `PaywallOverlay` renders it only inside the collapsed "Already purchased? Enter your licence key" form. Only the invalid-`?key=` path sets `prefillKey`, so only that path auto-opens the form.

**Why it matters:** the two states that most need explaining are the two that are silent.
- **Full device pool** (a fourth device, or Safari ITP evicting `localStorage` after seven days, or clearing browser data): the customer's key is intact and correctly kept, but they see a pure sales page asking for another $39.99. The message that names the fix — "Deactivate an old device in your LemonSqueezy account, or contact support" — never renders.
- **Licence server unreachable** (LS blip, Upstash blip, offline launch): same bare sales page. The message that says "It's still saved on this device — reload to try again" never renders, so the customer's rational next move is to re-paste, which costs an activation slot, or to ask for a refund.

**Repro / evidence (executed):** fresh context, `hhp_key` + `hhp_instance` seeded, `/api/validate-key` stubbed.
- Stub = HTTP 500 (transient). Before any click: `{"hasLicenceServerMsg":false,"keyFormOpen":false,"alreadyPurchasedBtn":true}`. After clicking "Already purchased?": `alertText: "We couldn't reach the licence server to verify your saved key. It's still saved on this device - reload to try again."`
- Stub = 200 `{valid:false, activation_limit_reached:true}`. Before: `{"hasLimitMsg":false}`. After the click: `alertText: "This licence key has reached its device activation limit."`
- Control (invalid `?key=`, which does set a prefill): `keyFormOpen:true` on arrival and the message is visible immediately — so the render path itself works, it is only the gate that is wrong.

**Fix shape:** one line at `src/App.jsx:3717` — `useState(Boolean(prefillKey || keyError))` plus a `useEffect` mirroring the existing prefill effect at `:3722-3727` so a later-arriving `keyError` opens it too. Better: hoist the error block out of the form so it renders above the "Already purchased?" affordance whenever `keyError` is non-empty; a customer told "your licence is fine, the server is down" should not have to open a licence-entry form to read it.

---

### [MEDIUM] M-1 — the purchase-email link lands a paying customer on the marketing page, still selling them the product (NEW, CONFIRMED)

**File:** `src/App.jsx:7450-7463` — `commitPaid` sets `paid`/`validating` and clears the error, but sets neither the tab nor the hash. Compare the failure leg at `:7635-7641`, which does `replaceState({tab:"growing-plan"}, "", "#growing-plan")` + `setTab("growing-plan")`.

**What:** `?key=VALID` unlocks correctly and strips the key from the URL, then leaves the app on the Home tab at `/` with no hash.

**Why it matters:** the LemonSqueezy confirmation modal and the receipt email both link to `thehomesteadplan.com?key=…`. The customer's first post-purchase impression is the hero, the comparison table and the pricing tile reading **$39.99 / Get full access** — the thing they just bought. Nothing says the unlock worked. `CLAUDE.md` §21's own checklist says the expected behaviour is "unlocks all paid tabs, **URL stripped to `#growing-plan`**", so this is code diverging from the spec, not a spec gap.

**Repro / evidence (executed):** `GET /?key=GOOD-KEY-0001`, stub returns valid. Result: `{"href":"http://localhost:4701/","hash":"","h1":"Know exactly what to grow","selectedTab":"Home","showsPricingCta":true,"shows3999":true}`. Clicking Growing Plan afterwards does work — `{"hash":"#growing-plan","hasPlanForm":true,"generateBtn":"Generate my growing plan"}` — so the unlock is real, only unannounced.

**Fix shape:** in the URL-key success branch (`:7529-7532`), after `commitPaid`, do what the failure branch already does: `history.replaceState({tab:"growing-plan"}, "", "#growing-plan")` then `setTab("growing-plan")`. Guard it on "a `?key=` was actually consumed" so a normal stored-key launch still lands wherever the customer left off.

---

### [MEDIUM] M-2 — in metric, 31 of 82 crops report `Space: 0.0 m²` and 4 report a yield floor of `0.0 kg` (NEW, CONFIRMED)

**File:** `src/App.jsx:5611` (crop-database card, space **and** yield, both `.toFixed(1)`), `src/App.jsx:5516` (crop-database desktop table, yield `.toFixed(1)`), `src/App.jsx:1616` (Self-Sufficiency per-crop breakdown card, space `.toFixed(1)`).

**What:** the conversion is correct; the display precision is not. Arugula's 0.1 sq ft is 0.0093 m²; one decimal renders `0.0`. Carrots' 0.1 lb/plant is 0.045 kg; one decimal renders `0.0`.

**Why it matters:** a displayed zero is a wrong number, not a rounding nicety. A metric customer planning a bed reads "Carrots — Space: 0.0 m²" and "Yield: 0.0–0.1 kg" and concludes carrots are free of space and produce nothing. The imperial customer, on identical data, reads "0.1 sq ft" and "0.1–0.2 lb". The affected set is not marginal: **31 of 82 crops** — every leafy green, every root crop except potato and sweet potato, all four alliums, every herb, both bean types, both peas, kohlrabi, fennel.

**Repro / evidence (executed):**
- Crop database, 375 px, imperial: `Arugula | … | Space: 0.1 sq ft | Yield: 0.1–0.2 lb`. Metric, same row: `Arugula | … | Space: 0.0 m² | Yield: 0.0–0.1 kg`.
- Crop database table, 1280 px, metric: `Arugula … 0.01 <space, 2dp — fine> 0.0–0.1 <yield, 1dp — wrong>`.
- Self-Sufficiency breakdown, metric: `Basil | 2plants | Space | 0.0 m² | Yield | ~1 kg/yr`; imperial: `Space | 0.5 sq ft`.
- Enumeration against `src/data/crops.js`: `(spacingSqFt * 0.09290304).toFixed(1) === "0.0"` for 31 crops; `(yieldPerPlantLbs[0] * 0.453592).toFixed(1) === "0.0"` for Arugula, Carrots, Radishes, Shelling Peas.

**Fix shape:** magnitude-aware precision at the three sites — e.g. a shared `fmtSmall(v) => v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3)`. The table's space cell already uses two decimals and is the right model. Do **not** just bump every display to three decimals; potatoes at `4.900 m²` reads worse than `4.9 m²`.

---

### [MEDIUM] M-3 — the model's currency overrides the customer's own currency selection, on screen and in the downloaded report (NEW, CONFIRMED)

**File:** `src/App.jsx:4859` (`{plan.savingsEstimate.currency || currency}`), `src/App.jsx:5161` (same expression in `buildPlanReportHtml`), `api/generate.js:619-626` (`normaliseCurrency` falls back to the requested currency only when the returned string is unrecognised — a recognised-but-different symbol passes straight through).

**What:** the user message tells the model which currency to use, but the returned value is trusted over the user's setting. Any of the five allow-listed symbols the model returns wins.

**Why it matters:** this is the workspace's cardinal unit rule — a value in one unit labelled as another. The savings headline is the single number the Growing Plan sells itself on, and it is the number the customer takes to their household budget. If the model answers in `$` while the customer selected `R`, the figure is off by roughly 18×, and it is off the same way in the downloadable, printable report they keep.

**Repro / evidence (executed):** `hhp_currency` set to `"R"`; stub returns `savingsEstimate.currency = "€"`. Screen: `Estimated annual savings | € | 612`. The user's stored preference is unchanged (`"R"`).

**Fix shape:** render `currency` and ignore the model's echo (the model's number is already produced *for* the requested currency, so the symbol carries no information). If you want a belt-and-braces server gate, in `sanitisePlan` force `currency: currencyFallback` rather than `normaliseCurrency(raw…, currencyFallback)`.

---

### [MEDIUM] M-4 — deselecting every crop cannot be saved; the next reload restores the 12-crop preset and every derived paid number with it (NEW, CONFIRMED)

**File:** `src/App.jsx:7132-7140` — the loader builds `clean`, then `if (Object.keys(clean).length > 0) return clean; return { ...PRESETS.family_basics.selection };`. An intentionally empty selection is indistinguishable from an absent key.

**What:** `hhp_crops` is correctly persisted as `{}`, and correctly discarded on load.

**Why it matters:** it is not just a checkbox reset. `baseResults` feeds Cost Savings, the Preservation Planner and the `gardenSqFt` figure sent to `/api/generate`. A customer who narrows to a deliberate short list by clearing everything and re-picking, then reloads mid-session, silently gets twelve crops back — different plant counts, different area, different savings, a different plan. There is also a window where storage and UI disagree: `hhp_crops` still reads `{}` while twelve boxes are ticked, until the next edit rewrites it.

**Repro / evidence (executed):** fresh context, defaults (12 checked). Untick all 12 → `{"stored":"{}","checked":0}`. `page.reload()` → `{"stored":"{}","checked":12}`.

**Fix shape:** distinguish absent from empty: keep the preset fallback only when `saved` is `null`/not an object; when `saved` is a valid object that sanitises to `{}`, return `{}`. The empty state is already handled downstream — `NoCropsBanner` exists for exactly this.

---

### [MEDIUM] M-5 — a plan body that is not exactly the current shape takes the whole app to the ErrorBoundary (NEW, CONFIRMED)

**File:** `src/App.jsx:4362-4367` (the client stores `data.plan` with **zero** shape validation), then `:4709` `plan.monthlySchedule.slice()`, `:4732` `plan.bedLayouts.length`, `:4832` `p.preservationMethods.map`, `:4864` `plan.savingsEstimate.annualSavings.toLocaleString()`, and the report mirrors at `:5020`, `:5071`, `:5152`, `:5161`.

**What:** every array access on the plan is unguarded. `sanitisePlan` on the server fills all nine keys today, so this is not reachable through the current pair of deploys — but the client has no defence if it ever receives anything else, and the comment at `:4046-4052` records that the client-side mirror was deliberately removed.

**Why it matters:** the failure mode is not a broken section, it is `Something went wrong / Reload` over the entire application — free calculators included. The plan schema **has** changed: `CLAUDE.md` §8 still documents `yieldEstimates[].estimatedLbs` and `preservationGuide[].{fresh,can,freeze,jarsNeeded}`, while the shipped schema is `estimatedYield`/`unit` and `freshShare`/`preservationMethods`. A Vercel rollout window where a warm old lambda answers a new bundle (or the reverse) reproduces this exactly.

**Repro / evidence (executed):**
- `{ok:true, plan:{summary:"Partial."}}` → `errorBoundary: true`.
- The old documented shape (`estimatedLbs`, `fresh`/`can`/`freeze`/`jarsNeeded`) → `errorBoundary: true`.
- Control: current shape → all nine sections render, `errorBoundary: false`.

**Fix shape:** either restore a thin client-side normaliser at the `setPlanState` call (arrays default to `[]`, `savingsEstimate` defaults to `null`, strings to `""`), or make each render site defensive (`Array.isArray(plan.monthlySchedule) ? … : []`). Prefer the normaliser: one place, and it also protects `buildPlanReportHtml`, which has the same eight derefs.

---

### [MEDIUM] M-6 — a dead stored key plus a new `?key=` link produces a message that is false by the time it is shown, and the new key is discarded (NEW, CONFIRMED)

**File:** `src/App.jsx:7512-7519` (URL leg refuses because *a* key is stored, strips the key from the URL, deliberately sets no prefill), `:7592-7596` (the stored leg then wipes that key as definitively rejected), `:7633-7637` (the held message is committed at the deny leg).

**What:** the two legs disagree across time. The refusal is computed while the old key exists; the message is displayed after it has been deleted.

**Why it matters:** this is the "I bought it again / my key was reissued" path. The customer is told "A different licence is already stored on this device. Clear it before activating a new one" — and there is nothing to clear, and no UI to clear it with. Their new key has been stripped from the URL and not prefilled, so recovery means going back to the email and pasting by hand. On a $39.99 product this reads as the product refusing a key it just accepted money for.

**Repro / evidence (executed):** seed `hhp_key = "MINE-1111"`, stub `/api/validate-key` = 200 `{valid:false}`; load `/?key=OTHER-2222`. Result: `hhp_key` is `null` (wiped) and the message, once the collapsed form is opened, reads `A different licence is already stored on this device. Clear it before activating a new one.`

**Fix shape:** at the deny leg, re-read `loadState(LS_KEY, "")`. If it is now empty, the conflict no longer exists: drop `urlKeyError`, set `prefillKey = urlKey`, and let the customer activate with one click. (Keeping the security property intact: the URL key is still never auto-activated, only prefilled — which is exactly what the invalid-`?key=` path already does.)

---

### [LOW] L-1 — "The plan generator returned an error (200)" (NEW, CONFIRMED)

**File:** `src/App.jsx:4347-4351`. `resp.json().catch(() => ({}))` collapses an unparseable 200 into `{}`, then the message interpolates `resp.status`.
**Repro:** stub returns HTTP 200 with body `{not json at all` → on-screen alert: `The plan generator returned an error (200). Please try again.`
**Fix:** branch on `resp.ok` — when the status is 2xx but the body did not parse, say "The plan generator sent a response we couldn't read. Please try again."

### [LOW] L-2 — the month-by-month schedule is sorted but never filtered on a valid month (NEW, CONFIRMED)

**File:** `src/App.jsx:4709-4712` (screen) and `:5020` (report). The doc-comment on `monthIndex` at `:4661-4665` states the rule this code breaks: *"Callers that build timelines or sort rows MUST filter on `>= 0` rather than coerce silently."* `PlanHarvestChart` (`:4943`) and the report's harvest builder (`:5108`) both obey it; the monthly schedule in both surfaces does not. `key={m.month}` also collides when the model emits two entries for one month.
**Repro:** stub plan with `["March", "March", "Marchember"]` → renders `Marchember | C | March | A | March | B` — the unknown month sorts to `-1` and leads the schedule. No crash, no console warning in a production build.
**Fix:** `.filter((m) => monthIndex(m.month) >= 0)` before `.sort(...)` at both sites, and key on the index rather than the name.

### [LOW] L-3 — mobile tap targets sit at 40 px against the product's own 44 px floor (NEW, CONFIRMED)

**File:** `src/App.jsx:6579-6583` (header pill `minHeight: 40`), `src/App.jsx:983-990` (`PillSelect` padding `10px 18px` / `8px 14px` → 40 px computed), `src/App.jsx:6386-6393` ("Reset to defaults", 106×27).
**Repro:** measured at 375 px on every tab. `N. Hem.` 79×40, `S. Hem.` 76×40, `Imperial` 79×40, `Metric` 68×40, frequency pills (`Rarely`/`Sometimes`, 82 crops' worth) 71×40 and 104×40, bed-shape pills 95×40, preservation-method pills 128×40, `Reset to defaults` 106×27.
**Why it is only LOW:** 40 px is a 4 px shortfall, not an unusable control, and `Counter`, `Field` and the tab bar are all correctly ≥44. But `CLAUDE.md` §9 states the rule and these are the most-tapped controls in the product.
**Fix:** `minHeight: 44` on the header pill style and on `PillSelect`'s option style at ≤640 px; give the two reset buttons `minHeight: 44`.

### [LOW] L-4 — in-tab links bypass the router, so the URL hash desyncs from the rendered tab (NEW, CONFIRMED)

**File:** `src/App.jsx:7946` passes `setTab={setTab}` — the raw state setter — to `GrowingPlanTab`, where it is used at `:4602` and `:4615`. Every other consumer gets `changeTab` (`:7837`, `:7840`), which also pushes history and scrolls to top.
**Repro:** on `#growing-plan` with manual frost mode unset, click the "Planting Dates" link in the blocking message → `{"hash":"#growing-plan","onTab":"planting-dates"}`. A reload or a copied link then returns the customer to the Growing Plan tab, not the one they were reading; browser Back skips the intermediate view.
**Fix:** pass `changeTab`.

### [LOW] L-5 — the AbortError branch cannot tell an unmount from a timeout (NEW, CONFIRMED)

**File:** `src/App.jsx:4371-4376`. `if (!ac.signal.aborted) return;` is documented as "unmount, component is gone", but both the unmount cleanup (`:4090`) and the 90 s timer (`:4315`) call `ac.abort()`, so `signal.aborted` is `true` on both paths and the guard can never fire. The unmount case therefore falls through to `setError(...)` + `setGenerating(false)` on a dead component (a React 18 no-op).
**Why it matters:** no user-visible effect on its own, but it is the mechanism behind H-1's total silence, and the comment will mislead the next editor. Fix it in the same commit as H-1.
**Fix:** track the two reasons explicitly (`const abortReason = useRef(null)`), or delete the dead branch once H-1 moves the request out of the component.

### [LOW] L-6 — the preservation methodology note is hardcoded in pounds even in metric mode (NEW, CONFIRMED)

**File:** `src/App.jsx:6412-6417`. In metric the surrounding totals read kg while the note reads "~1.5 lb fresh per pint jar, ~3 lb per quart, ~3 lb per gallon freezer bag, 8 lb per dehydrator batch … 2 lb/pint and 5 lb/quart".
**Why it is only LOW:** these are NCHFP source constants and jar/bag sizes are US products, so citing them in lb is defensible. It is still the only place in the app where a unit ignores the toggle.
**Fix:** convert the numbers with the toggle and keep the container names ("pint jar", "gallon freezer bag") as the proper nouns they are.

### [LOW] L-7 — break-even reads "0.0 mo" while the copy directly above says setup costs are missing (NEW, CONFIRMED)

**File:** `src/App.jsx:5981-5984` (`MiniStat "Break-even"`) against the hero copy at `:5951-5954`.
**Repro:** all five setup costs at 0 → hero says "Add your setup costs below to see when your garden pays for itself"; the KPI beside it says `BREAK-EVEN 0.0mo`. `FIRST-YEAR ROI` correctly shows `-`.
**Fix:** treat `totalSetup === 0` the same way ROI does — pass `NaN` so `formatCountUp` renders `-`.

---

## Known-deferred, re-confirmed live on `a752d42`

| Id | Source | Status now |
|---|---|---|
| **M-2** — `hhp_soil.mixOverrides` leaf values reach the soil computation untyped | `docs/audit-sweep-families-2026-08-18.md` | **Still open, and it prints.** New surface evidence: with `mixOverrides.prices.classic_60_30_10.topsoil = "banana"`, the Soil tab renders a literal **`$NaN`** in the Topsoil *Subtotal* (`src/App.jsx:1974` — `{currency}{c.cost.toFixed(2)}` is the one money display in the app that skips the `fmtDecimal`/`MiniStat` NaN guard), while the hero *Estimated cost* correctly degrades to `-`. On the Cost Savings tab the "Use Soil Calculator total" button vanishes entirely, because it is gated on `soilCostEstimate > 0` and `NaN > 0` is false. Fix the loader **and** route `c.cost` through `fmtDecimal` in the same commit. |
| **L-4** — clearing a `Field` commits the minimum, not the previous value | `docs/audit-vault-families-2026-08-17.md` | Still open. `src/App.jsx:924-928`. Unchanged by today's code. |
| **L-3** — the plan-completeness gate reads one section out of nine | `docs/audit-vault-families-2026-08-17.md` | Still open. `api/generate.js:895` — `if (!plan \|\| plan.monthlySchedule.length === 0)`. A plan with a schedule and eight empty arrays still bills the customer a quota slot. |

**Closed since 2026-08-18, verified:** H-1 (LS edge status → `LS_VERDICT_STATUSES`, both handlers, `a752d42`/`800f1a2`/`076c524` — `tests/generate-licence-gate.test.mjs` exit 0, 24/24); M-1 (analytics `beforeSend` redaction, `ee53c3a` — `tests/analytics-redaction.test.mjs` 19/19); L-1 (pool-full no longer triggers a fresh activation, `025cd38`); L-2 (same-millisecond quarantine collision, `ef4486b`).

---

## Blast radius / siblings to check

- **H-1 is a product-family shape, not a Homestead one.** Any product whose long-running paid request lives inside a conditionally-rendered tab loses the result on a tab switch. Grep each for a `useEffect(() => … return () => abortControllerRef.current?.abort(), [])` inside a component that the parent renders behind `tab === "…" &&`. Named targets: **FaminePrep** (`crisis-food-prep`, report generation), **HeatLens** (`Crypto-Heatmap`, Market Read generation), **Aero-Calc** if its report path is async. The tell is `generating` state declared inside the tab component rather than in `App`.
- **H-2 generalises to every paywall in the fleet.** The question to ask of each: *"is there any state where the mount effect computes a licence message and the overlay renders nothing?"* Grep for the single render site of the error state and check whether it sits inside a collapsed disclosure. **Aero-Calc, Growroom, Vertica, FaminePrep, HeatLens, Mortar** all share the `PaywallOverlay` + "Already purchased?" lineage. Homestead's `:3877` is the reference for where the bug lives.
- **M-2 (metric display zeros) is the other side of the drift canon.** Homestead's *conversion* is exact and its *precision* is not. Grep every sibling with a metric toggle for `* SQFT_TO_SQM).toFixed(1)`, `* LB_TO_KG).toFixed(1)`, `* GAL_TO_L).toFixed(0)` and check the smallest value in that product's data set. **Growroom** (per-plant footprints), **Vertica** (per-site volumes) and **Aero-Calc** (nozzle flows) all carry small quantities.
- **M-3 (LLM currency echo) applies to every product that lets a model return a currency.** FaminePrep's report and HeatLens's Market Read are the candidates: check whether the rendered symbol comes from the model or from the user's own setting.
- **M-5 (unguarded model output on the client) is a fleet question too.** Any product where the server sanitises and the client trusts is one deploy-skew window from a whole-app ErrorBoundary. FaminePrep's report renderer is the closest analogue.
- **Inside Homestead:** if M-4 is fixed, re-audit the four consumers of `baseResults` (`CostSavingsCalculator :5799`, `PreservationPlanner :6225`, `GrowingPlanTab :4053`, the Self-Sufficiency hero) — all four already have empty-state branches, so the fix should be inert, but the empty-selection path has never been exercised through a reload before.
- **`CLAUDE.md` §8 is stale** and is now load-bearing for M-5: it documents `estimatedLbs` and `{fresh, can, freeze, jarsNeeded}`, which is not what `api/generate.js` produces. Correct the spec in the same batch, or the next editor will "fix" the renderer to match the doc.

---

## Verified clean (audited this session — do not re-audit without a diff)

- **Self-sufficiency arithmetic.** Traced end to end against `src/data/crops.js`: tomatoes 25 × 4 × 0.75 × 1.0 = 75 lb → `ceil(75/8)` = **10 plants** → `10 × 4` = **40.0 sq ft** → midpoint `(8+12)/2` × 10 = **~100 lb/yr**. Screen matched exactly. Goal multiplier applied to per-crop demand only, never to the household target (`:1185`), so the KPI stays honest across goal changes. `householdTarget > 0` guards the division; `selfSufficiencyPct` capped at 100.
- **Soil arithmetic and both unit systems.** 8 ft × 4 ft × 12 in → 32.0 cu ft, 1.19 cu yd, 36.8 cu ft with the 1.15 settling buffer. Metric: 906.1 L across the component breakdown (543.7 + 271.8 + 90.6), 0.91 m³. Cost identical in both modes (163.20) because price is canonical per cu ft. Bag counts round **up** in both systems (topsoil 543.7 L → 14/11/8 bags at 40/50/75 L). Invalid L-shape (cutout ≥ outer) yields 0 and shows the warning. Bed quantity caps at `MAX_BEDS_PER_GROUP` = 20. Family size counter clamps to 1–12.
- **The metric/imperial drift canon holds.** Five metric→imperial→metric toggle cycles with no edits: no write at all. Five focus+blur cycles over **every** bed `Field` in metric: `hhp_beds` ends at `lengthFt:8, widthFt:4, depthIn:12` — byte-identical to the start. Six focus+blur cycles on the produce-target field in metric: `hhp_produce_target` never written once, i.e. the skip-if-equal guard fired every time. All five documented guard sites (`:1226-1233`, `:1826-1834`, `:1846-1852`, `:1902-1911`, `:5963-5970`) compare against the byte-identical `toFixed` rendering of the current canonical value.
- **No paid-content flash during validation.** With a 2.5 s licence server, eight samples across the window: `paidContent:false` throughout, `Verifying your access… / One second.` shown, and paid content appears only after `validating` clears. `paid` starts `false`, `validating` starts `true` (`:7368-7369`), all five paid surfaces gate on `activeTab.paid && !validating && paid`.
- **`Checkout.Success` → 48-hour grace path works** (previously listed in `CLAUDE.md` as never exercised). With `lemon.js` blocked and the SDK stubbed: the handler is installed, firing `Checkout.Success` writes `hhp_pending`, replaces the paywall with the plan form and the "Payment received. One step left: your licence key." panel, closes the LS overlay, and the unlock survives a reload.
- **Paywall mount chain, ten scenarios driven.** No key → paywall. Valid `?key=` → paid, key stripped, `hhp_key` + `hhp_instance` stored. Invalid `?key=` → paywall, error, prefill, hash forced to `#growing-plan`. Stored key + HTTP 500 → **key and instance kept** (transient never wipes). Stored key + definitive `valid:false` → both wiped, silent. Stored key + `activation_limit_reached` → **key and instance kept**. Grace stamp within 48 h → paid. Grace stamp aged out → not paid, stamp cleared. `?key=` with a *valid* different key already stored → the stored key wins and unlocks; the URL key is stripped and never activated (no slot burned). Network reset mid-validate → treated transient, key kept. Exactly **one** `/api/validate-key` call per page load.
- **Generate failure legs.** HTTP 500 with a body → the server's message. HTTP 500 with an empty body → `(500)` fallback message. HTTP 429 → the fair-use message. Connection reset → "Couldn't reach the plan generator." In every case `generating` resets, the button re-enables, and no plan state is written.
- **Double-submit is not reachable by a human.** Native double-click (`clickCount:2`), two clicks 60 ms apart, two clicks 150 ms apart, and three `Enter` presses 30 ms apart each produced **exactly one** `/api/generate` call — React's `disabled={generating}` lands in time. Only three synthetic `.click()` calls inside one task get through, which no user can produce.
- **Regenerate confirm.** Dismissing the `confirm()` fires zero requests and leaves the existing plan intact.
- **HTML report.** Blob captured and re-opened as a standalone `file://` document: valid, all nine sections in order, `<h1>` correct, no horizontal overflow at 900 px, `Save as PDF` button wired via `addEventListener` (no inline handler). Metric garden space converted (`19.8 m²` vs `213 sq ft`). Filename dated from `generatedAt`, not today. `escapeHtml` on every model string. Screen and report agree section for section and figure for figure.
- **Layout at 375 px:** zero horizontal overflow on all nine routes, free and paid. No text input below 16 px on any route (the sub-16 px elements found at 1280 are checkboxes and a range slider, neither of which triggers iOS zoom).
- **Zero-crop, zero-cost and extreme states:** no `NaN`, no `Infinity`, no ErrorBoundary anywhere with no crops selected, with all setup costs at 0, at `freshPct` 0 and 100, or with an invalid manual frost date (which correctly blocks generation and disables the button).
- **Crop database:** search, sort, category filters and the no-match empty state all behave; `Showing 0 of 82 crops` + "No crops match those filters."
- **Date maths:** hemisphere flip is a clean +6 months on both frost dates (zone 7 north `Mar 22` / `Nov 5` → south `Sep 22` / `May 5, 2027`), and `formatDate` correctly annotates the cross-year date. `parseIsoDate` rejects `2026-02-30` via the round-trip check.
- **Currency is symbol-only and says so** (`src/App.jsx:6019`, plus the tooltip at `:5996`). No FX table exists anywhere, so the double-conversion class cannot occur.
- **No paywall bypass found.** The plan body is never persisted (`hhp_plan_v2` carries `{inputs, generatedAt, cropFingerprint}` only, and legacy `hhp_plan` is unconditionally removed at `:7304`); `/api/generate` re-validates the licence on every call behind a canonical instance binding; the client `paid` flag is a render gate only.

---

## Not this agent's call

- **Agronomy and source constants** → `engineering-verifier`. The inventory below is scoped for exactly that hand-off; nothing in it is asserted correct here beyond internal arithmetic consistency.
- **Origin allowlists, rate-limit bucket design, CSP, prompt injection, secrets** → the concurrent `security-auditor` pass (`docs/security-review-2026-09-06.md`).
- **Whether a failed generation (Anthropic 429/5xx, `max_tokens` truncation) should still spend one of the customer's 20 daily plans** — `api/generate.js:786-791` increments the per-licence bucket before the model call, so today it does. That is a product/pricing decision, not a defect. Grant's call.

---

## Formula inventory (for a scoped `engineering-verifier` pass — none of this is verified here)

No engineering-verification document exists in `docs/`. The 2026-05-18 verifier run is recorded only in `STATUS.md` prose. Every displayed computation, with its file and line:

**Constants**
| Constant | Value | Line |
|---|---|---|
| `SQFT_TO_SQM` | 0.09290304 | `src/App.jsx:145` |
| `LB_TO_KG` | 0.453592 | `:146` |
| `FT_TO_M` / `IN_TO_CM` | 0.3048 / 2.54 | `:147-148` |
| `CUFT_TO_CUYD` / `CUFT_TO_L` / `CUFT_TO_CUM` | 1/27 / 28.3168 / 0.0283168 | `:149-151` |
| `SETTLING_BUFFER` | 1.15 | `:152` |
| `PATH_BUFFER` | 1.30 (Cornell) | `:156` |
| `DEFAULT/MIN/MAX_PRODUCE_PER_PERSON_LBS` | 300 / 50 / 800 (USDA ERS) | `:162-164` |
| `GOAL_MULTIPLIER` | 0.5 / 0.75 / 1.0 | `:173-177` |
| `FREQUENCY_FACTOR` | 0.25 / 0.5 / 1.0 / 1.5 | `:184-189` |
| `BAG_SIZES_CUFT` / `BAG_SIZES_L` | [1, 1.5, 2] / [40, 50, 75] | `:307-308` |
| `SOIL_MIXES` component ratios + default `$/cu ft` | classic 60/30/10, Mel's 1:1:1, economy 40/40/20 | `:258-303` |
| `ZONE_FROST_DATES` (zones 3–11) | z7 = `{5/15…}` … `{1/15, 12/31}`; **zone 11 is modelled as having a last frost (Jan 15) and a first frost (Dec 31)** | `:357-367` |
| `FREEZER_BAG_LBS` / `FREEZER_BAG_CUFT` | 3 lb / 0.1337 cu ft (1 US gal) | `:6170-6171` |
| `DEHYDRATOR_LBS_PER_BATCH` | 8 | `:6172` |
| `ROOT_CELLAR_LBS_PER_INCH` | 5/6 (≈6 in of shelf per 5 lb) | `:6173` |
| `PINT_LBS` / `QUART_LBS` | 1.5 / 3 (NCHFP whole-tomato) | `:6174-6175` |
| Per-crop `avgConsumptionLbsPerPersonYear`, `yieldPerPlantLbs[low,high]`, `spacingSqFt`, `groceryPricePerLb`, `caloriesPer100g`, `startIndoorsWeeks`, `transplantWeeks`, `directSowWeeks`, `harvestStartWeeks`, `harvestDurationWeeks`, `daysToMaturity`, `sunHours`, `difficulty`, `servingsPerLb` — 82 crops | — | `src/data/crops.js` |
| 230 pairwise companion relations + `parentCrop` inheritance | — | `src/data/companions.js` |

**Self-Sufficiency** (`computeResults`, `:1144-1206`)
- `annualNeedLbs = avgConsumptionLbsPerPersonYear × familySize × goalMult × freqMult` — `:1156`
- `plantsNeeded = ceil(annualNeedLbs / yieldLow)` (conservative end) — `:1162`
- `spaceSqFt = plantsNeeded × spacingSqFt` — `:1163`
- `yieldMid = (yieldLow + yieldHigh) / 2`; `expectedYieldLbs = plantsNeeded × yieldMid` — `:1166-1167`
- `totalSpaceWithBuffer = Σ spaceSqFt × PATH_BUFFER` — `:1181`
- `householdTarget = producePerPersonLbs × familySize` (no goal multiplier, by design) — `:1185`
- `selfSufficiencyPct = min(100, totalYieldLbs / householdTarget × 100)` — `:1186-1188`
- `gardenSqFt` sent to the LLM = `max(50, round(totalSpaceRaw))` — un-buffered — `:4223`

**Soil** (`computeBedVolumeCuFt` `:1634-1657`, `computeSoilResults` `:1659-1699`)
- rect `(l × w × depthIn) / 12`; circle `(π × (d/2)² × depthIn) / 12`; L-shape `((ol×ow) − (cl×cw)) × depthIn / 12` with `ol>cl && ow>cw` guard — `:1637-1655`
- `totalCuFt = Σ(perBed × qty)`; `cuYd = /27`; `withSettling = × 1.15` — `:1673-1693`
- `component_cuft = totalCuFt × pct`; `bags = ceil(cuft / size)`; `cost = cuft × pricePerCuFt` — `:1679-1687`
- metric display: `× CUFT_TO_L` (L), `× CUFT_TO_CUM` (m³) — `:1768-1771`, `:1927`

**Planting dates** (`:503-622`)
- `addWeeks(d, n) = setDate(getDate() + n×7)`; `shiftMonths(d, n) = setMonth(getMonth() + n)`; hemisphere south = +6 months on both frost dates — `:506-516`, `:544-548`
- `startIndoors/transplant/directSow = addWeeks(lastSpring, crop.<X>Weeks)` — `:585-587`
- anchor priority: user override → crop default → transplant → direct sow → indoors — `:589-603`
- `harvestStart = addWeeks(anchor, harvestStartWeeks)`; `harvestEnd = addWeeks(harvestStart, harvestDurationWeeks)` — `:606-609`
- frost-risk badge: `season === "warm" && harvestEnd > firstFall` — `:613`
- timeline geometry: `dayOfYear(d) = (d − Jan1)/86400000`, `leftPct = leftDay/365 × 100`, `widthPct = widthDays/365 × 100` (365 fixed, not leap-aware) — `:528-531`, `:2770-2789`

**Cost savings** (`:5799-5905`)
- `pricePerLb` = user override → `crop.groceryPricePerLb` → 0 — `:5876-5880`
- `annualSavings = expectedYieldLbs × pricePerLb` (midpoint yield) — `:5881`
- `totalSetup = Σ setupCosts`; `monthlySavings = totalSavings / 12` — `:5894-5897`
- `breakEvenMonths = monthlySavings > 0 ? totalSetup / monthlySavings : Infinity` — `:5898`
- `roiPct = totalSetup > 0 && totalSavings > 0 ? (totalSavings − totalSetup)/totalSetup × 100 : null` — `:5899-5901`
- perennial caveat gate: any selected crop with `season === "perennial"` — `:5911`
- soil prefill mirrors `computeSoilResults(beds, effectiveMix).totalCost` — `:5821-5843`

**Preservation** (`computePreservationForCrop` `:6186-6222`, totals `:6265-6288`)
- `fresh = yieldLbs × freshPct/100`; `preserved = yieldLbs − fresh` — `:6187-6188`
- can/sauce/ferment: `jarsPint = ceil(preserved / 1.5)`, `jarsQuart = ceil(preserved / 3)` — `:6207-6208`
- freeze: `bags = ceil(preserved / 3)`; `cuFt = bags × 0.1337` — `:6211-6212`
- dehydrate: `batches = ceil(preserved / 8)` — `:6215`
- root cellar: `shelfInches = ceil(preserved / (5/6))` — `:6218`
- `unstorablePreserved` = the preserve share of `preservation:["fresh"]` crops — `:6193`
- metric: `shelfMeters = shelfInches × 2.54 / 100`; `freezerCuM = freezerCuFt × 0.0283168` — `:6287-6288`
- totals sum per-crop **ceilings**, not the ceiling of the sum (deliberate: jars and bags are indivisible per crop) — `:6265-6284`

**Crop database derived columns** (`:5301-5345`, `:5510-5520`, `:5605-5615`)
- `yieldMid = (low + high)/2` for the "Highest yield" sort — `:5327-5329`
- display: `spacingSqFt × areaConv`, `yieldPerPlantLbs[0..1] × massConv` — see M-2 for the precision defect

**Server-side plan sanitiser** (`api/generate.js:641-698`) — clamps and rounds every model-returned number: `successionPlanting.plantings` 1–12, `intervalWeeks` 1–52, `yieldEstimates.plants` 0–9999, `estimatedYield` 0–100000 rounded to 1 dp, `savingsEstimate.annualSavings` 0–1e7 rounded to integer.

---

*Every finding above is reported; none is fixed. No product file was modified in this session.*
