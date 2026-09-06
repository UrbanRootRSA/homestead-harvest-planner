# Fixes — Stage B: the code review and the security review of 2026-09-06

**Repo / branch:** `Homestead/homestead-harvest-planner`, `fix/audit-2026-09-06` (stage A tip `e9cf852`)
**Scope:** every finding in `docs/code-review-2026-09-06.md` (2 HIGH, 6 MEDIUM, 7 LOW, 3 known-deferred) and `docs/security-review-2026-09-06.md` (1 HIGH, 2 MEDIUM, 8 LOW, 8 informational), plus the fleet-hygiene batch.
**Grant's mandate:** "Please fix ALL issues found and verify all your fixes", "make the choices yourself".
**Stage A** (`docs/fixes-2026-09-06-stage-a.md`) closed the engineering review, code-review M-3 and the `$NaN` half of code-review M-2. Both confirmed here, not redone.

---

## Verification, by exit code

| Command | Result |
|---|---|
| `npm test` (9 suites) | **exit 0** — quarantine 8/8, bounds 91/91, paywall mount chain 142/142 across 29 mounts, **validate-key limits 25/25**, generate licence gate 42/42, **plan generation 26/26**, analytics 19/19, calc-golden 259/259, render drive 100/100 |
| `npm run build` | **exit 0** — 33 modules, `dist/assets/index-CZJQzzOA.js`, 405.36 kB / 115.46 kB gzipped |
| `npm audit --omit=dev` | **exit 0** — found 0 vulnerabilities |
| `node ../../tools/bug-scan.mjs .` | **exit 0** — 0 high, 0 medium, 11 low (all `REACT-INDEX-KEY` on static lists; the same 11 stage A left, none introduced) |
| `node --check` on both `api/*.js` | clean |

**Two new suites, plus four extended, every behavioural fix proven against pre-fix source.** Controls (a saved copy of `e9cf852` via `HHP_APP_SRC` / `HHP_VALIDATE_SRC` / `HHP_GENERATE_SRC`):

| Suite | Against the tree | Against pre-fix source (control) |
|---|---|---|
| `tests/validate-key-limits.test.mjs` (new) | 25/25, exit 0 | **14 failed**, and H1-4 answers the owner `429 Too many attempts for this licence` — the HIGH, measured |
| `tests/plan-generation.test.mjs` (new) | 26/26, exit 0 | **23 of 26 failed** (`generatePlan` does not exist there: the request lived in the component) |
| `tests/render-drive.test.mjs` (+54 checks) | 100/100, exit 0 | **17 failed** (H-2 message absent, no normaliser, 40 px pills, lb-only note, `0.0` break-even, `~0 kg/yr`, `Marchember` rendered) |
| `tests/generate-licence-gate.test.mjs` (+18) | 42/42, exit 0 | **11 failed** — incl. `401 "re-enter your key"` on two server faults, and a claimable `*.vercel.app` origin **reaching Anthropic** |
| `tests/paywall-mount-chain.test.mjs` (+11) | 142/142, exit 0 | **4 failed** (the false conflict message, no prefill, no `#growing-plan` landing) |
| `tests/bounds-and-sanitisers.test.mjs` (+32) | 91/91, exit 0 | **20 failed** — incl. the audit's own `$960,086.40` and `NaN` soil totals, `50` committed on a cleared field, and the 12-crop preset returning over an empty selection |

Recreate a control copy from git rather than by hand:
```
mkdir -p node_modules/.cache/hhp-prefix
git show e9cf852:api/validate-key.js > node_modules/.cache/hhp-prefix/validate-key.js
HHP_VALIDATE_SRC=$PWD/node_modules/.cache/hhp-prefix/validate-key.js node tests/validate-key-limits.test.mjs
```

> ### DEPLOY GATE — `vercel.json` CHANGED
> `X-XSS-Protection` moved from `1; mode=block` to `0` (security L-3). **No CSP directive was touched**, but any `vercel.json` change re-arms the live-Buy checklist in `Homestead/CLAUDE.md` §21: open thehomesteadplan.com in Chrome with DevTools, click Buy, confirm the LemonSqueezy overlay opens inside ~1.5 s with zero CSP / Trusted-Types console errors and the price reading `$39.99`. `api/validate-key.js` and `api/generate.js` also changed on the licence path, which is the same gate.

---

## Disposition

### Code review (`docs/code-review-2026-09-06.md`)

| Finding | Sev | Confirmed? | Action | Verified by outcome |
|---|---|---|---|---|
| **H-1** tab switch mid-generation throws the plan away after the quota slot is spent | HIGH | reproduced (the generation state and the AbortController were inside a conditionally-rendered component; the unmount cleanup aborted the fetch) | **fixed** — request lifted to `App`: `src/App.jsx:8341-8443` (`generatePlan`), tab now renders props `src/App.jsx:4338-4380`, wired `:8640` | `plan-generation` H1-1..H1-5 (the plan lands in App state, one request, licence read from storage, busy flag once each) + H1s-1..H1s-8 source contract + `render-drive` H1r-1..H1r-5; control 23/26 red |
| **H-2** every held licence message is invisible until the customer opens a form they have no reason to open | HIGH | reproduced (the only render site of `keyError` sat inside the collapsed disclosure) | **fixed** — the message renders above the "Already purchased?" affordance, `src/App.jsx:4022-4042`; the in-form copy removed | `render-drive` H2b-1..H2b-12 (full-pool and outage messages present **with no `<form>` in the markup**, `role="alert"`, still exactly once when the form is open); control red |
| **M-1** the purchase-email link lands a paying customer on the marketing page | MED | reproduced | **fixed** — `src/App.jsx:8061-8075`: the URL-key success leg does the `replaceState` + `setTab` the failure leg already did | `paywall-mount-chain` M-1.19/M-1.20, control M-1.21..M-1.23 (a stored-key launch still lands where the customer left off) |
| **M-2** metric `0.0 m²` / `0.0 kg` | MED | **closed in stage A** (engineering L-1, `fmtAreaValue` / `fmtMassValue`) — re-verified here | **verified + swept one site further** (see "Adjacent, fixed") | `render-drive` M2b-1, L1-1, L1-2 |
| **M-3** the model's currency overrides the customer's | MED | **closed in stage A** (the model no longer returns a currency) — re-verified: `normaliseCurrency` = 0 hits in `api/generate.js`, `savingsEstimate.currency` = 0 hits in `src/App.jsx` | **verified, plus belt** — the new client normaliser drops any currency a stale lambda sends | `render-drive` H2-1..H2-3; `plan-generation` M5c-2 |
| **M-4** deselecting every crop cannot be saved | MED | reproduced (an empty object was indistinguishable from an absent key) | **fixed** — `src/App.jsx:7602-7620`: an object sanitises to itself, the preset is the fallback for an ABSENT or non-object key only | `bounds` M-6.1..M-6.7; control shows the 12-crop preset returning |
| **M-5** an off-shape plan body takes the whole app to the ErrorBoundary | MED | reproduced against the NEW schema (old-schema and partial bodies both) | **fixed** — `normalisePlan` at `src/App.jsx:4926-4990`, applied at the one write site `:8412`; an unreadable body becomes a named error, never a boundary | `render-drive` M5b-* (4 off-shape bodies normalise and render), `plan-generation` M5c-1..M5c-3 |
| **M-6** a dead stored key plus a new `?key=` shows a message that is false by the time it is shown | MED | reproduced | **fixed** — the deny leg re-reads storage: `src/App.jsx:8178-8190` (+ `urlKeyConflict` at `:8020`) | `paywall-mount-chain` M-6.1..M-6.6; control red |
| **L-1** "The plan generator returned an error (200)" | LOW | reproduced | **fixed** — `src/App.jsx:8390-8400`: `resp.json().catch(() => null)` distinguishes an unreadable body from a body that said no | `plan-generation` L1b-1..L1b-4 (incl. the 500 controls) |
| **L-2** the monthly schedule is sorted but never filtered on a valid month | LOW | reproduced | **fixed** — `src/App.jsx:5082-5090` (screen) and `:5417-5421` (report), keyed on index+name | `render-drive` L2b-1..L2b-6 (screen **and** the downloaded report); control red |
| **L-3** mobile tap targets at 40 px against the product's 44 px floor | LOW | reproduced | **fixed** — header pill `src/App.jsx:7046`, `PillSelect` `:1087-1094`, both "Reset to defaults" `:6428` / `:6849`, plus the stage-A garden-space link | `render-drive` L3b-1..L3b-5 (matchMedia forced to the phone breakpoint; desktop control unchanged) |
| **L-4** in-tab links bypass the router | LOW | confirmed by reading | **fixed** — `setTab={changeTab}` at `src/App.jsx:8523` | `plan-generation` H1s-9/H1s-10; control red |
| **L-5** the AbortError branch cannot tell an unmount from a timeout | LOW | confirmed (both callers set `signal.aborted`) | **fixed** — `planAbortReasonRef`, `src/App.jsx:8354` + `:8425-8429`; the unmount abort is gone with H-1 | `plan-generation` L5b-1..L5b-3 (an unattributed abort does not claim a timeout; a recorded one does) |
| **L-6** the preservation note is hardcoded in pounds in metric | LOW | reproduced | **fixed** — `src/App.jsx:6868-6885`, figures read off the same constants the calculation uses; container names kept as the products they are | `render-drive` L6b-1..L6b-6 |
| **L-7** break-even reads "0.0 mo" while the copy asks for setup costs | LOW | reproduced | **fixed** — `src/App.jsx:6297-6304`, and the hero copy re-branched by cause `:6376-6386` (see "One fix broke a neighbour") | `render-drive` L7b-1..L7b-3 |
| **known-deferred M-2** `hhp_soil.mixOverrides` leaves untyped | MED | reproduced ($960,086.40 for one bed; `NaN`; 1,280 bags) | **fixed** — `src/App.jsx:7673-7706`, leaves clamped to the editor's own bounds, unknown mix/component keys dropped | `bounds` M-4.1..M-4.19; control reproduces both the six-figure bill and the NaN |
| **known-deferred L-4** clearing a `Field` commits the minimum | LOW | reproduced (produce target 300 → 50; KPI inflated 6×) | **fixed** — `src/App.jsx:1016-1030`: an empty box restores the current value and commits nothing | `bounds` M-5.1..M-5.6 |
| **known-deferred L-3** the plan-completeness gate reads one section of nine | LOW | reproduced (a one-section plan shipped `ok:true`) | **fixed** — `api/generate.js:905-925`: the four sections a model can always produce are required; the three a real plan may legitimately leave empty are not | `generate-licence-gate` G-5.1..G-5.4; control ships the stub as `ok:true` |

### Security review (`docs/security-review-2026-09-06.md`)

| Finding | Sev | Confirmed? | Action | Verified by outcome |
|---|---|---|---|---|
| **H-1** the per-licence bucket is bumped before the verdict, so anyone with a key can lock its owner out | HIGH | reproduced end-to-end: 60 sprays then the owner's own request → `429 Too many attempts for this licence` | **fixed** — `api/validate-key.js:38-67` (rationale + constants), `:161-210` (read/write split), gate `:349-355`, bumps at `:413/:483/:540/:577/:597`, exemption at `:412/:456/:539/:603` | `validate-key-limits` H1-1..H1-14: the owner is served after 60 sprays, **and** an unknown key still trips at #51, **and** 60 LS outages do not fill the bucket |
| **M-1** an unused `LEMONSQUEEZY_API_KEY` in all three environments | MED | confirmed (0 references in the repo) | **not code — owner action** (delete in the Vercel dashboard, then rotate in LemonSqueezy). Nothing in this branch reads it | grep: 0 hits in `api/ src/ tests/ scripts/ vercel.json package.json` |
| **M-2** production-power credentials Development-scoped and dashboard-readable | MED | confirmed for the configuration | **not code — owner action** (re-scope `ANTHROPIC_API_KEY` to Production + Sensitive; drop the legacy `KV_*` set) | — |
| **L-1** the origin allowlist trusts any `homestead-harvest-planner*.vercel.app` in production | LOW | reproduced: in production that origin **reached Anthropic** | **fixed** — `api/generate.js:94-102` and `api/validate-key.js:101-109`, gated on `VERCEL_ENV !== "production"` | `validate-key-limits` L1-1..L1-5, `generate-licence-gate` G-3.1..G-3.4 (preview still works; the apex still generates) |
| **L-2** two server-fault reasons still tell a customer to re-enter a good key | LOW | reproduced (both answered `401 "re-enter your key"`) | **fixed** — `transient: true` at `api/generate.js:361` and `:409` | `generate-licence-gate` G-2.a1..G-2.b3 — the exception leg is forced with a body whose `meta` getter throws, so it is driven, not asserted from source |
| **L-3** `X-XSS-Protection: 1; mode=block` | LOW | confirmed | **fixed** — `vercel.json` → `"0"` | header value grepped; **live-Buy gate re-armed** |
| **L-4** a forged `hhp_pending` unlocks three client-side tabs | LOW | confirmed | **confirmed by design, documented in place** — `src/App.jsx:8153-8166` records why the window exists and what bounds the harm | reading; the paid asset (`/api/generate`) still refuses a bare key |
| **L-5** a `text/plain` body is a preflight-free request shape | LOW | confirmed | **fixed** — 415 before the body parse: `api/validate-key.js:304-312`, `api/generate.js:705-712` | `validate-key-limits` L5-1..L5-6, `generate-licence-gate` G-4.1..G-4.4 (control: text/plain reached Anthropic) |
| **L-6** a revoked licence keeps generating for up to an hour | LOW | confirmed | **priced trade, documented** — `api/generate.js:152-158` names the two Upstash keys to delete for prompt revocation | reading |
| **L-7** `getIp()` falls back to the leftmost `x-forwarded-for` | LOW | confirmed (inert on Vercel) | **fixed** — rightmost entry + corrected comment: `api/generate.js:106-127`, `api/validate-key.js:112-133` | reading; both handlers still bucket on `x-real-ip` in every suite |
| **L-8** the `.npmrc` comment says `min-release-age` is inert | LOW | confirmed | **fixed** — `.npmrc`, and the correction is load-bearing: this quarantine is what blocked `@upstash/redis@1.38.4` today (below) | `npm config ls` → `before = "2026-09-03T22:09:43Z"` |
| **I-1** no CSP reporting | INFO | — | **not done, by instruction** (no CSP report endpoint in this batch) | — |
| **I-3** lemon.js host | INFO | confirmed already canonical | **verified** — `index.html:15` loads `https://assets.lemonsqueezy.com/lemon.js` | grep |
| **I-4** the pool-full message discloses `(limit/limit)` against a comment claiming counters are stripped | INFO | confirmed | **fixed** — the comment now names the one deliberate exception: `api/validate-key.js:604-612` | reading |
| **I-2, I-5..I-8** | INFO | — | no action needed (already closed, or owner checks) | — |

### Fleet hygiene

| Item | Action |
|---|---|
| `@upstash/redis` ≥ 1.38.4 | **1.37.0 → 1.38.3** (`package.json`, lockfile). **1.38.4 is blocked by this repo's own supply-chain quarantine**: it was published 2026-09-04 11:00 UTC and `.npmrc`'s `min-release-age=3` resolves `before = 2026-09-03T22:09Z`, so npm answers `ETARGET ... with a date before 2026/09/04`. I did not override the control for a freshness bump with no advisory. **After 2026-09-07 11:00 UTC:** `npm i @upstash/redis@^1.38.4`. `npm audit --omit=dev` = 0 either way. |
| lemon.js on `assets.lemonsqueezy.com` | already correct here — confirmed, no change |
| HSTS `preload` | already `max-age=63072000; includeSubDomains; preload` — confirmed, no change |
| CSP report endpoint | not added, per instruction |

---

## Per-fix detail: before → after

### Code H-1 — the request outlives the tab

`src/App.jsx`. `generating`, `error`, `longRun`, `loadingIdx` and the AbortController moved from `GrowingPlanTab` into `App`; the tab now assembles the payload and hands it over.

```jsx
// before (inside GrowingPlanTab)
useEffect(() => { … return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); … }; }, []);
const resp = await fetch("/api/generate", { … signal: ac.signal, … });
// after (App owns it; the tab keeps only its blob-URL cleanup)
await onGeneratePlan({ payload: { … }, fingerprintInput, fallbackFingerprint: currentFingerprint });
```

A tab change is now free: `planState` has always lived in `App`, and the resolver writes into it. `planGeneratingRef` keeps the one-at-a-time guard that `disabled={generating}` used to provide alone. Reassurance copy corrected to what is now true: *"You can look at the other tabs; just don't close or reload this page."*

### Code H-2 — the message renders where a customer will read it

```jsx
// before: the ONLY render site, inside the collapsed form
{keyInputOpen ? (<form …>{keyError && <div id="hhp-key-error" role="alert">{keyError}</div>}…</form>) : <button>Already purchased?…</button>}
// after: above the disclosure, whatever its state
{keyError && <div id="hhp-key-error" role="alert" style={{…}}>{keyError}</div>}
{!keyInputOpen ? <button>Already purchased?…</button> : <form …>…</form>}
```

The input keeps its `aria-describedby` pointer at the same id.

### Security H-1 — the bucket a stranger can fill no longer decides who is served

```js
// before: bumped on every request, before LemonSqueezy is asked
if (!(await rateLimitOK(`lk:${hashKey(key)}`, RL_LICENCE_MAX, RL_LICENCE_WINDOW_SEC))) return res.status(429)…
// after: read here, written only where LS has stated a verdict
const licenceKnownGood = await licenceIsKnownGood(key);           // hhp:vk:ok:<sha>
if (!licenceKnownGood && (await licenceBucketExceeded(key))) return res.status(429)…
…
if (preLimit) await markLicenceKnownGood(key); else await bumpLicenceBucket(key);   // at each verdict leg
```

Two properties, both measured: a key LemonSqueezy has confirmed is real can never be rate-limited out of its owner's hands, and a key nobody has ever validated is still capped at 50/h (first 429 at request #51). The bucket is renamed `lkbad:` so no in-progress lockout survives the deploy. A transient LS failure is not a verdict and does not count.

### Code M-5 — one shape gate, at the boundary

```js
// before: whatever the server sent went straight into state
setPlanState((prev) => ({ ...prev, plan: data.plan, … }));
// after
const plan = normalisePlan(data.plan);
if (!plan) { setPlanError("The plan generator sent a plan we couldn't read. Please try again."); return; }
setPlanState((prev) => ({ ...prev, plan, … }));
```

`normalisePlan` coerces every section of the CURRENT schema (arrays default to `[]`, strings to `""`, `savingsEstimate` to `null`, `plantings`/`intervalWeeks` through the shared `clampInt`), and returns `null` when there is nothing to show. It protects `buildPlanReportHtml` too, which had the same eight unguarded derefs.

### Deferred M-2 — the soil overrides meet the editor's own bounds

```js
// before: shape only
prices: migrateBucket(rawOverrides.prices),
// after
prices: cleanBucket(migrateBucket(rawOverrides.prices), 0, SOIL_PRICE_MAX_PER_CUFT),
pcts:   cleanBucket(migrateBucket(rawOverrides.pcts), 0, 1),
```

A leaf that is not a number is DROPPED, not defaulted to zero, so the consumers' `?? c.pricePerCuFt` still does its job. Measured on one 8×4×12 bed: `99999` billed **$960,086.40** before, `$163.20`-scale after; `"banana"` printed **NaN** before, the honest total after.

---

## One fix broke a neighbour, and how it was caught

`L-7` sends `breakEvenMonths` to `Infinity` when setup costs are zero. The hero paragraph three lines down branched on `heroBreakEven == null` FIRST, so with the fix in place a customer with crops and no setup costs read *"Add at least one crop in the Self-Sufficiency tab"* — advice for a state they were not in. The render golden caught it on the first run (`L7b-2`). The branches are now ordered by cause (`src/App.jsx:6376-6386`): no crops → no setup costs → no grocery prices → the answer. The third message is new; before this pass that state printed the no-crops message too.

## Adjacent, fixed (same defect class as a named finding)

**The `~0 kg/yr` line.** Code review M-2's rule is "a displayed zero is a wrong number", and its blast-radius note asks for a sweep of the smallest values in the data set. Stage A fixed the space and per-plant-yield prints; the ANNUAL-yield line still used `toFixed(0)`, and **23 of 82 crops printed `~0 kg/yr` in metric** at fresh-only + rarely for a family of four, where imperial printed `~1 lb/yr` off the identical 0.75 lb. One helper (`fmtMassRounded`, `src/App.jsx:522-531`) now serves the four sites that print an annual weight — the Self-Sufficiency breakdown card, the Cost Savings row, the Preservation row and the unstorable-harvest warning. Whole units above 1 lb/kg (so the card does not get noisier), the real fraction below it. Pinned by `render-drive` M2b-2..M2b-5.

---

## Adjacent things left, on purpose

- **The two security MEDIUMs are dashboard actions, not code** (M-1 delete + rotate `LEMONSQUEEZY_API_KEY`; M-2 re-scope `ANTHROPIC_API_KEY` to Production + Sensitive and drop the legacy `KV_*` set). Nothing in this branch reads either variable, so they cannot be closed from here.
- **`@upstash/redis@1.38.4`** — 13 hours short of this repo's own 72-hour quarantine at the time of the run. One command after 2026-09-07 11:00 UTC.
- **`bug-scan` LOWs (11)** — all `REACT-INDEX-KEY` on static lists, the pattern the file already uses. Unchanged from stage A.
- **Spec deltas owed to `Homestead/CLAUDE.md`** (that file is outside this repo, so this branch does not touch it): §8 still documents `harvestTimeline`, `yieldEstimates` and the old `preservationGuide` shape — stale since stage A and now load-bearing for M-5; §12 should record the `hhp_pending` grace window as a deliberate, bounded client-side unlock (security L-4); §21's testing checklist should list the two new suites and the `?key=` landing behaviour; §8's rate-limit line should describe the split validate-key bucket.
- **A key that is real but from another LemonSqueezy store gets an exemption marker** if LS reports its pool full, because that leg runs before the store gate (both are audited orders I did not reorder). It grants no access and costs nothing but a per-IP-bounded LS round-trip; noted in the code.

---

*Every finding above has a row. Nothing was fixed on faith: each behavioural change is pinned by a case that fails against `e9cf852`.*

---

## 2026-09-07 — the M-6 prefill trade, named (orchestrator ruling)

The code re-review (`docs/code-review-2026-09-06-rereview.md`, "Routed elsewhere")
was right that this record did not name a trade it should have named. Recording
it now, with the ruling that followed.

**What M-6 changed.** Before the fix, a `?key=` link whose key was rejected set
`prefillKey`, and the old suite asserted the opposite for the case where the
customer's OWN stored key had just been wiped as definitively dead:

```
M-1.8  'the foreign key is NOT pre-filled into the licence input'
       // a phishing key one click from activation is the thing being defended against
```

M-6 replaced that case. The revoked-stored-key mount now pre-fills the key from
the link (`M-6.3`), and the no-prefill assertion moved to a transient-outage
variant, where it still holds (`M-1.7/1.8/1.10`).

**The reachable path.** An attacker mails `thehomesteadplan.com/?key=<their key>`;
the victim's own stored key is definitively rejected during that same mount
(refund, reissue, corruption); the attacker's key is then sitting in the
victim's licence box.

**The ruling (2026-09-07): the prefill STAYS.** Three things bound it, and one
was missing.

1. It is prefill only. Nothing validates the key until the customer presses
   Activate — `M-6.4` asserts no validator call fires for it.
2. `LS_INSTANCE` is still not read on the URL-key path, and the wipe gate is
   still skipped there, so the phishing link cannot burn the legitimate
   instance slot (`feedback_url_key_instance_trust.md`).
3. At that moment the customer holds no working licence, so the marginal loss
   from activating a stranger's key is one of THAT key's activation slots, not
   access to anything of the customer's. `instance_name` is never sent, so
   nothing identifying reaches the attacker's LemonSqueezy dashboard.
4. **What was missing, and is now fixed:** the box did not say whose key it
   was. A prefilled licence field reads as "your licence", and the product had
   no sentence anywhere saying otherwise.

**What shipped with the ruling** (`src/App.jsx`, `PaywallOverlay`): while the
box still holds the key the link supplied, the form carries

> This key came from the link you opened, not from a licence saved on this
> device. If you activate it, this device is registered to that key and uses
> one of its three activations.

It is `aria-describedby`-wired to the input beside the error message, and it
disappears the moment the customer types over the value, because from then on
it is their own key. Pinned by `render-drive` `M6-1..M6-7`, including the
negative control that a customer who opens the form themselves is never told
about a link. `M-6.1..M-6.6` and the transient-outage no-prefill assertion are
untouched and still pass.

**What would change the ruling.** If the client ever auto-validates a prefilled
key, or if the URL-key path ever reads `LS_INSTANCE`, the trade is off and the
prefill has to go with it.
