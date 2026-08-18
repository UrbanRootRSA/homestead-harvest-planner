# The Homestead Plan — fleet-sweep audit: six named cross-product bug families

**Date:** 2026-08-18. **Baseline:** `main` @ `249b8b0` (today's merged fleet-fix state), working tree clean except the untracked `docs/audit-vault-families-2026-08-17.md`.
**Product class:** React calculator (paid, LIVE at thehomesteadplan.com) + two serverless routes (`api/validate-key.js`, `api/generate.js`).
**Scope:** the six families named in the sweep brief, plus the coordinator's mid-task addendum (per-leg `activation_limit_reached` coverage, from a Growroom finding).
**Audit only. No product file was modified.** Scratch scripts lived in the session scratchpad under the `hhp2-` prefix.

Findings already filed in `docs/audit-vault-families-2026-08-17.md` are **cross-referenced, not refiled**.

---

## Verdict per family

| # | Family | Verdict |
|---|---|---|
| 1 | 429-with-error-body → definitive wipe | **PRESENT — CONFIRMED end-to-end.** Six wipe paths across three LS call legs. Finding **H-1** below. |
| 2 | `?key=` analytics leak | **PRESENT — CONFIRMED.** No `beforeSend`, auto-track on, and the strip sits behind a network `await`. Measured 1.25 s exposure window on the live site. Finding **M-1**. |
| 3 | Field clear-guard / append bug | **ABSENT — verified by gesture.** One `Field` component, `value={raw}` (local draft), `onChange` sets unconditionally. Zero `if (v === "") return;` shapes. Clear-then-type REPLACES. L-4 (clear commits `min`) is unchanged and improved in metric by today's H-1 fix. |
| 4 | `safe*`-helper range gap | **PRESENT — CONFIRMED.** `hhp_soil.mixOverrides` leaf values get **no type check and no range re-clamp** — the one numeric localStorage surface the 08-17 M-1/M-2 fix did not route through a sanitiser. Finding **M-2**. |
| 5 | Prototype-key MAP gates | **ALREADY-FIXED — verified.** All 9 loader gates are `hasKey`, and the consumer destructure is hardened too. No remaining reachable `MAP[untrustedKey]` truthiness gate on a localStorage- or import-fed key. Residual idioms filed as **L-3**. |
| 6 | Quarantine stamp collision | **PRESENT but near-unreachable — CONFIRMED possible.** Needs same key + different bytes + same millisecond. Finding **L-2**. |
| + | **Addendum:** per-leg `activation_limit_reached` coverage | **3 of 4 legs behave correctly; 1 gap.** Homestead does **not** have Growroom's URL-key bug. `saveGraceKey` is the gap. Finding **L-1**. |

**Overall: NEEDS FIXES — 0 CRITICAL / 1 HIGH / 2 MEDIUM / 3 LOW.**

The single HIGH is the reason to act today: an LemonSqueezy edge 429 or 403 that happens to carry a JSON `error` field is converted by our own route into a definitive `valid:false`, and the client answers that by **silently deleting a paying customer's licence key and instance pointer**. HeatLens shipped the fix for exactly this shape today (`Crypto-Heatmap/api/validate-key.js`, commit `f977e59`). Homestead has the same two guard sites and neither carries the short-circuit.

---

## Verifications run

- `npm test` → **exit 0**. Three suites, completion lines: `loadState quarantine + mount-skip probe` (15 persisted keys), `bounds + sanitisers: 59/59 assertions OK.`, `paywall mount chain: 88/88 assertions OK across 23 mounts.`
- `npm run build` → **exit 0**. `33 modules transformed`, `dist/assets/index-DxUeRrwu.js` 395.03 kB / 112.04 kB gzip, `built in 1.15s`. Bundle name matches the live deploy recorded in `../../docs/HANDOFF-2026-08-18-vault-families-fleet-fix.md:12`.
- **Neither gate covers any finding below.** The specific reason is stated per finding.
- **Real-handler drive (family 1).** `api/validate-key.js` imported and executed with a stubbed `global.fetch`, twelve LS response shapes across all three call legs. Then a second pass wired that same real handler behind the real `src/App.jsx` mount chain (declarations + the mount effect sliced out of the shipped source with the same extractor `tests/paywall-mount-chain.test.mjs` uses). Nothing hand-copied.
- **Live browser drive (family 2).** Headless Chrome against `https://thehomesteadplan.com/?key=<throwaway>`, capturing the `window.location.search` timeline and all network traffic. A junk key is a definitive LS "not found", so nothing was stored and no activation slot moved. The shipped `/_vercel/insights/script.js` was then fetched and read directly.
- **Consequence measurement (family 4).** The real `SOIL_MIXES`, `computeBedVolumeCuFt` and `computeSoilResults` sliced from source and run against the app's own default 8 ft × 4 ft × 12 in bed.
- **Gesture replay (family 3).** The real `Field.commit` body sliced by anchor text and driven through clear → type → blur.
- **Collision probe (family 6).** `quarantineRaw` sliced from source, driven with a frozen clock.

---

## Findings (most severe first)

### [HIGH] H-1 — an LS 429 or 403 carrying a JSON `error` body becomes a definitive `valid:false`, and the client silently deletes the customer's licence (CONFIRMED)

**File:** `api/validate-key.js:230` (pre-check leg) and `api/validate-key.js:338` (authoritative leg). Client wipe lands at `src/App.jsx:7565-7566`.
**Taxonomy:** C1 (transient reported as definitive). Reference fix: `Crypto-Heatmap/api/validate-key.js:281-293` and `:411-420`, commit `f977e59`, 2026-08-18.

**What.** Both guards are written as "non-200 **without** a recognised business-error body is an upstream anomaly":

```js
// :230  pre-check leg
if (preCheck.status !== 200 && !(preCheck.json && preCheck.json.error)) {
  return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
}
// :338  authoritative leg (covers both LS_VALIDATE-with-instance and LS_ACTIVATE)
if (ls.status !== 200 && !js.error) {
  return res.status(502).json({ valid: false, error: "Licence server unreachable. Try again." });
}
```

The `!error` conjunct is the hole. A throttle or WAF refusal that serialises **any** `error` string skips the 502 and falls into the definitive bail below it, which returns HTTP **200** `{valid:false}`. `normaliseLsError` maps an unrecognised string to the catch-all `"This licence key could not be validated."`, so nothing downstream can tell it apart from a revoked key.

**Measured — the real handler, twelve LS response shapes.** `WIPES` is computed from the client's own rule (`src/App.jsx:769-802`: HTTP 200 + boolean `valid` = definitive; everything else transient) and then proven separately below.

| case | LS status | LS body | handler HTTP | `valid` | limit flag | verdict | wipes? |
|---|---|---|---|---|---|---|---|
| A1 pre-check | 429 | `{error:"Too many requests…"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| A2 pre-check | 403 | `{error:"Forbidden"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| A3 pre-check | 503 | `{error:"…"}` | 502 | false | — | transient | no |
| A4 pre-check | 429 | `{}` | 502 | false | — | transient | no |
| A5 pre-check | 404 | `{error:"license_key not found"}` | 200 | false | false | DEFINITIVE | yes *(correct)* |
| A6 pre-check | 429 | `{error:"…activation limit reached."}` | 200 | false | **true** | DEFINITIVE | no *(correct)* |
| B1 validate (stored instance) | 429 | `{error:"Too many requests…"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| B2 validate (stored instance) | 403 | `{error:"Forbidden"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| B3 validate (stored instance) | 429 | `{}` | 502 | false | — | transient | no |
| C1 `/activate` | 429 | `{error:"Too many requests…"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| C2 `/activate` | 403 | `{error:"Forbidden"}` | **200** | false | false | **DEFINITIVE** | **YES** |
| C3 `/activate` | 200 | success | 200 | true | — | DEFINITIVE | no *(correct)* |

**Measured end-to-end — real handler behind the real mount chain**, seeded with a stored, valid, paid licence (`hhp_key` + `hhp_instance`):

| upstream condition | `hhp_key` | `hhp_instance` | `paid` | message shown to the customer |
|---|---|---|---|---|
| **LS 429 + `{error:"Too many requests"}`** | **DELETED** | **DELETED** | false | **(silent)** |
| **LS 403 + `{error:"Forbidden"}`** | **DELETED** | **DELETED** | false | **(silent)** |
| LS 429, no error body *(control)* | KEPT | KEPT | false | "We couldn't reach the licence server to verify your saved key. It's still saved on this device - reload to try again." |
| LS 503 + `{error}` *(control)* | KEPT | KEPT | false | same transient sentence |
| LS 404 "not found" *(control, should wipe)* | DELETED | DELETED | false | (silent) |
| LS 200 active *(control)* | KEPT | KEPT | **true** | (silent) |

**Why it matters — the money.** The wipe branch at `src/App.jsx:7561-7567` is deliberately silent ("User sees paywall, not an error - they didn't just try to enter it"). So the customer opens a `$39.99` product they own, is dropped to the free tier with **no explanation at all**, and their stored instance pointer is gone. Their natural recovery is to paste the key from their purchase email, which is a fresh **bare-key activation** and consumes one of their three LemonSqueezy slots. Three such events and the licence is exhausted. This is the precise harm class the R2-H1, C1, SEC-4 and A-1 hardening arcs were all built to prevent; this is the one shape that walks through all of them.

**Reachability, stated honestly.** The code path is **CONFIRMED** — measured above, end to end, against the shipped source. What I could not observe is LemonSqueezy's edge actually emitting a 429/403 that carries a JSON `error` field; that half is **PLAUSIBLE**. Three things argue it is real enough to fix now:
1. The guard's own comment (`:221-229`) names "LS-edge 429/403 WAF challenge" as the exact scenario it exists for. It covered that scenario only while the body omitted `error`.
2. Vercel serverless functions share egress IPs across all Urban Root products, which is the documented reason the guard was written (`:334-337`: "fleet-wide if LS rate-limits a shared Vercel egress IP during mount revalidations").
3. HeatLens closed exactly this today and its commit comment records it as measured.

To settle the upstream half definitively: log `preCheck.status` and `JSON.stringify(preCheck.json).slice(0,200)` for every non-200 for one week, and read whether any 429/403 carries `error`.

**Why `npm test` is green with this live.** `tests/paywall-mount-chain.test.mjs` drives the **client** with canned `/api/validate-key` responses; it never runs `api/validate-key.js`. Its 429 fixture (`RATE_LIMITED`) is our own endpoint's 429, which the client already treats as transient — the case that passes. No fixture exists where LS returns a non-200 with an error body, because no test drives the server at all.

**Fix (text only, not applied).** Port HeatLens's shape: short-circuit on **status**, above the `.error` test, at both sites.

```js
// api/validate-key.js, immediately BEFORE the :230 guard
if (preCheck.status === 429) {
  return res.status(502).json({ valid: false, error: "Licence server busy. Try again in a minute." });
}
if (preCheck.status === 403) {
  return res.status(502).json({ valid: false, error: "Licence server temporarily unavailable. Try again shortly." });
}
// api/validate-key.js, immediately BEFORE the :338 guard
if (ls.status === 429) { /* same 502 */ }
if (ls.status === 403) { /* same 502 */ }
```

An HTTP 429 is a throttle and an HTTP 403 is an edge refusal; neither is ever a statement about a licence. LemonSqueezy states verdicts on 200 and business errors on 200/404. Keep the existing `!error` guard underneath for the other non-200s. Then add a server-side fixture to the suite: this finding exists because the suite stops at the route boundary.

---

### [MEDIUM] M-1 — the licence key in `?key=` reaches the Vercel Analytics pageview beacon, because the URL strip sits behind a network round-trip and no `beforeSend` redacts it (CONFIRMED)

**File:** `src/main.jsx:50` (`<Analytics/>`, no props), `src/App.jsx:7506-7508` (strip is after `await attempt(...)`), `src/App.jsx:7443-7451` (`stripKeyFromUrl`).
**Taxonomy:** credential-in-telemetry. Same shape as Vertica M-3.

**What.** Three facts, each measured:

1. **No redaction is registered.** `src/main.jsx:50` is `React.createElement(Analytics, null)` — no `beforeSend`. In `@vercel/analytics@1.6.1` the React component only registers a hook when `props.beforeSend` exists (`dist/react/index.mjs`), and the shipped tracker defaults it to identity (`let a = e => e`). Vercel's own documented recipe for stripping sensitive query parameters is exactly this prop.
2. **Auto-track is on and the tracked URL keeps the query string.** `disableAutoTrack` is only set when a `route` prop is passed; none is. The shipped `/_vercel/insights/script.js` (fetched live, 200, so Web Analytics is enabled on the project) builds its URL with:

   ```js
   function e(e){let t=location.href;if(e){let n=new URL(t);if(n.pathname!==e)return n.pathname=e,n.search="",n.href}return t}
   ```

   `search=""` is applied **only** on the `route`-supplied branch. With no route, it returns `location.href` **verbatim**. The pageview payload is then `{o: <that URL>, sv, sdkn, sdkv, ts, …}` POSTed with `keepalive:true`.
3. **The key is still in the URL when the script runs.** Measured on the live site:

| moment | in-page time | `window.location.search` |
|---|---|---|
| navigation | 0 ms | `?key=<KEY>` |
| `POST /api/validate-key` | 676 ms | `?key=<KEY>` |
| `GET /_vercel/insights/script.js` (200) | 677 ms | `?key=<KEY>` |
| **`stripKeyFromUrl()` lands** | **1614 ms** | *(empty)* |

  **Exposure window ≈ 1.25 s**, entirely because the strip on this leg is written *after* the `await`:

```js
const r = await attempt(urlKey, "", { skipStoredInstance: true });   // :7506  full network round-trip
if (cancelled) return;
stripKeyFromUrl();                                                    // :7508  only now
```

The sibling branch one block up (`:7493-7494`, a conflicting stored key) strips **synchronously**, before any await. So the product already knows the right ordering and applies it on the branch that matters least — the leaking branch is the one a first-time customer takes straight from the purchase email.

**Why it matters.** The licence key is the paid credential (3 activations, never expires). It lands in Vercel Web Analytics as a distinct page entry, readable by anyone with project access and retained on Vercel's schedule. It is not a wrong number and it does not break access, which is why this is MEDIUM rather than HIGH — but it is a paid credential written into telemetry, and it is one prop to close.

**Note on the probe:** my headless run captured the script load but no beacon, because the shipped tracker self-suppresses under automation (`navigator.webdriver || navigator.userAgent.includes("Headless")`). That is why the finding is grounded in the script's own source rather than an observed POST. To watch the POST directly, load `thehomesteadplan.com/?key=TEST` in a normal Chrome window with DevTools → Network filtered to `insights`, and read the request payload's `o` field.

**Why `npm test` is green.** No suite renders `src/main.jsx` or exercises analytics.

**Fix (text only).** Two independent changes; do both.
1. Redact at the sink — `src/main.jsx`:
   ```js
   React.createElement(Analytics, {
     beforeSend: (event) => {
       try {
         const u = new URL(event.url);
         if (!u.searchParams.has("key")) return event;
         u.searchParams.delete("key");
         return { ...event, url: u.toString() };
       } catch { return event; }
     },
   })
   ```
2. Close the window at the source — hoist `stripKeyFromUrl()` in `src/App.jsx` to run **before** `await attempt(...)`, matching the `:7494` sibling. The key is already captured in the `urlKey` local at `:7466`, so nothing downstream needs it in the URL.

Whether a licence key in analytics needs a retention/notification response is **not this agent's call** → security-auditor / Grant.

---

### [MEDIUM] M-2 — `hhp_soil.mixOverrides` leaf values reach the soil computation with no type check and no range re-clamp, the only numeric localStorage surface the 08-17 sanitiser fix did not cover (CONFIRMED)

**File:** loader `src/App.jsx:7152-7177` (`migrateBucket`, `rawOverrides`); consumers `src/App.jsx:1708`, `:1719` (Soil tab) and `:5806-5807` (Cost Savings "Use Soil Calc total").
**Taxonomy:** N1/U1 hybrid — the family-4 shape: a value that passes a *structural* check but never re-meets the editor's declared range.

**What.** The loader validates the *shape* and nothing else:

```js
const rawOverrides = (saved?.mixOverrides && typeof saved.mixOverrides === "object")
  ? saved.mixOverrides : null;
const overrides = rawOverrides ? {
  prices: migrateBucket(rawOverrides.prices),
  pcts:   migrateBucket(rawOverrides.pcts),
} : null;
```

`migrateBucket` only asks `typeof obj === "object"`. No leaf value is coerced, type-checked or clamped. The consumers then read them with `??`, which catches `null`/`undefined` and nothing else:

```js
pct: mixPctOverrides[c.key] ?? c.pct,                    // :1708
pricePerCuFt: mixPriceOverrides[c.key] ?? c.pricePerCuFt // :1719
```

Meanwhile the **editor** for these same two values does clamp, and correctly: price commits through `Math.max(0, Math.min(SOIL_PRICE_MAX_PER_CUFT /* 999 */, cuftPrice))` at `:1823` (with the H-1 canonical re-clamp), and the pct Field declares `min={0} max={100}` at `:1844`. So the editor's ceiling is 999 and the loader's ceiling is infinity. That gap is the finding.

**Measured — real `computeSoilResults` on the app's default 8 ft × 4 ft × 12 in bed.** Honest baseline: 32.00 cu ft, `$163.20` (Classic 60/30/10).

| stored `mixOverrides.prices.classic_60_30_10.compost` | total cost shown | vs honest |
|---|---|---|
| *(absent — control)* | `$163.20` | 100% |
| `null` | `$163.20` | 100% *(`??` catches it)* |
| `"banana"` | **NaN** | — |
| `true` | `$105.60` | 65% |
| `[]` | `$96.00` | 59% |
| `"12"` | `$211.20` | 129% |
| **`99999`** *(editor max is 999)* | **`$960,086.40`** | **588,288%** |
| **`-50`** *(editor min is 0)* | **`-$384.00`** | **−235%** |

| stored `mixOverrides.pcts.custom.a` (Custom mix; honest `$160.00`, component 16.00 cu ft, 11 bags) | component cu ft | bags @1.5 | total cost |
|---|---|---|---|
| *(absent — control)* | 16.00 | 11 | `$160.00` |
| `"banana"` | **NaN** | **NaN** | **NaN** |
| `true` | 32.00 | 22 | `$240.00` |
| **`60`** *(a percent written as a whole number instead of a fraction)* | **1920.00** | **1280** | **`$9,680.00`** |
| `5` | 160.00 | 107 | `$880.00` |
| **`-1`** | **−32.00** | **−21** | **−`$80.00`** |

The `60` row is the one to look at hardest: the app stores pct as a **fraction** (`setComponentPct(c.key, v / 100)` at `:1842`), so any writer that stores a percentage lands a 100× error. That renders as **1280 bags of soil** on the tab whose entire job is telling the customer how much soil to buy.

**Reachability, stated honestly.** Identical to the 08-17 M-1/M-2/M-3 findings: **corrupt or hand-edited `localStorage` only**. This product still has no file-import path (the 08-17 audit proved it and nothing added one today), and the app's own writers cannot produce these values — `Field.commit` only calls `onChange` with a `Number.isFinite` result or `min`, and `commitPrice` re-clamps. Ranked MEDIUM on that basis, the same rank its siblings carry.

**Why it is worth fixing anyway.** Every *other* numeric localStorage field in the product now goes through a sanitiser: `beds` through `sanitizeNum` with named bounds (`:7135-7145`), `familySize` and `referenceYear` through `clampInt` (`:7095`, `:7219`), `producePerPerson` through `sanitizeNum` (`:7082`), `priceOverrides`/`setupCosts`/`freshPct` through `isStoredNumber` with explicit ranges (`:7264`, `:7271`, `:7327`). `mixOverrides` is the single hole left in an otherwise closed surface, and it produces the largest error magnitude of the whole family.

**Why `npm test` is green.** `tests/bounds-and-sanitisers.test.mjs` (59 assertions) covers `importedNumber`, `sanitizeNum`, `clampInt` and the bed bounds. It has no fixture for `hhp_soil`, because `mixOverrides` never calls any of those helpers.

**Fix (text only).** Sanitise the leaves in `migrateBucket`, reusing the helper that already exists, and with the same constants the editor uses:

```js
const cleanBucket = (obj, lo, hi) => {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = importedNumber(v);           // src/App.jsx:397 — junk becomes null, never a coerced 0
    if (n !== null) out[k] = Math.max(lo, Math.min(hi, n));
  }
  return out;
};
// prices: cleanBucket(bucket, 0, SOIL_PRICE_MAX_PER_CUFT)
// pcts:   cleanBucket(bucket, SOIL_PCT_MIN_FRACTION /* 0 */, SOIL_PCT_MAX_FRACTION /* 1 */)
```

Drop a value rather than defaulting it — an absent override correctly falls back to the mix's own `c.pct` / `c.pricePerCuFt` through the existing `??`. Name the two pct bounds as constants and use them in the Field at `:1844` too, so the editor and the loader cannot drift the way the bed bounds did before H-1. Note this is a **return-contract change** for `migrateBucket`: re-check both consumers (`:1697-1698` and `:5800-5801`) in the same commit.

---

### [LOW] L-1 — `saveGraceKey` has no `activation_limit_reached` branch, so a pool-full stored key is mislabelled "definitively rejected" and re-activated bare (CONFIRMED, bounded)

**File:** `src/App.jsx:4131-4137`. Raised by the coordinator's addendum; full per-leg table in the next section.

**What.** The leg branches on `valid` and `transient` only:

```js
if (r?.valid) { … return; }
if (r?.transient) { setGraceError(…); return; }
// Stored key definitively rejected - fall through to a fresh
// activation of the key the user just pasted.
```

A pool-full verdict is `valid:false`, `transient` falsy, `activation_limit_reached:true`. It has no branch, so it takes the fall-through comment's word for it and fires `onActivateKey(graceKey)` → `validateKeyRemote(key, "")` → a **fresh bare-key activation**. The stored key is not "definitively rejected"; it is fine and the pool is full.

**Why it is LOW and not HIGH.** Three things bound it, all verified:
- This leg **never wipes**. `saveGraceKey` calls no `clearLS` on `LS_KEY`/`LS_INSTANCE`.
- **No slot is burned.** The server's A-1 pre-check (`api/validate-key.js:284-290`) catches `usagePre >= limitPre` and returns before `LS_ACTIVATE` is ever called.
- **The final copy is correct.** The redundant call returns the server's own pool-full sentence, which reaches `setGraceError` verbatim at `:4145`.
- The empty-key variant is unreachable: the Save button is `disabled={graceSaving || graceKey.trim().length < 8}` (`:4518`).

So the customer sees the right message; the cost is one wasted LemonSqueezy round-trip and a code comment that asserts something untrue.

**Fix (text only).** Insert the branch above the fall-through, matching the shape at `:7544`:

```js
if (r?.activation_limit_reached) {
  setGraceError(r?.error || "This licence key has reached its device activation limit. Deactivate an old device in your LemonSqueezy account, or contact support.");
  return;
}
```

---

### [LOW] L-2 — two quarantine copies of the same key written in the same millisecond collide, and the first payload is lost (CONFIRMED possible, near-unreachable)

**File:** `src/App.jsx:679-685` (`quarantineRaw`). Reference fix: Mortar.

**What.** The stamp is millisecond-resolution and there is no step-past-taken-keys:

```js
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
localStorage.setItem(`${LS_CORRUPT_PREFIX}${key}.${stamp}`, raw);
```

**Measured** (prefix `hhp.corrupt.`, stamp shape `2026-08-18T15-43-58-380Z`):

| scenario | result |
|---|---|
| two **different** keys, same millisecond | 2 copies kept — the key name disambiguates. No collision. |
| **same** key, **same** bytes, twice (the reload case) | 1 copy — `findQuarantinedCopy` de-duplicates on content first (`:680`). |
| **same** key, **different** bytes, clock frozen to one millisecond | **1 copy: the first payload is overwritten and unrecoverable.** |

**Reachability: near-unreachable, and I am saying so explicitly.** The collision needs one localStorage key to hold two *different* unparseable payloads inside a single millisecond. Each key is read once per mount from its `useState` initialiser; a second read of the same key returns the same bytes and is de-duplicated by content. Producing different bytes for one key within one millisecond requires a third-party writer racing the mount. I found no in-app path that does this.

**Fix (text only).** Three lines, matching Mortar:

```js
let candidate = `${LS_CORRUPT_PREFIX}${key}.${stamp}`;
let n = 1;
while (localStorage.getItem(candidate) !== null) candidate = `${LS_CORRUPT_PREFIX}${key}.${stamp}.${n++}`;
localStorage.setItem(candidate, raw);
```

The workspace ledger (`../../docs/HANDOFF-2026-08-18-vault-families-fleet-fix.md:105`, item 11) already tracks this as owed in seven other quarantine ports: Growroom, Shift-Fit, Vertica, Aero, Lexeme, ARX Invoice, and the Atlas. Homestead is an eighth. It is cheap enough to do fleet-wide in one pass, and it is not urgent in any of them.

---

### [LOW] L-3 — residual prototype-key idioms survive the M-3 fix; all are contained today, one is a latent trap (CONFIRMED contained)

**File:** `src/App.jsx:7055-7056` (`HASH_ALIASES` / `resolveHash`), plus seven `CROPS[…]` truthiness reads at `:2149`, `:2290`, `:2381`, `:2397`, `:2413`, `:2451`, `:2517`.

**What.** The M-3 fix gated all **nine** loader sites with `hasKey` and additionally hardened the consumer. Verified below. What it did not do is remove the *idiom* from places that are gated upstream:

- **`HASH_ALIASES` is an empty object literal read with the URL hash**: `const resolveHash = (h) => HASH_ALIASES[h] || h;`. `resolveHash("constructor")` returns the `Object` **constructor function**, not the string. Every consumer then gates on `VALID_TABS.includes(resolved)` (`:7728`, `:7732-7734`, `:7741`, `:7763`), and a function is never in that array, so it falls to the safe branch every time. **No consequence today.** The trap is the comment directly above it inviting a future editor to "add them back here as `{ "old-id": "new-id" }`" — the moment a real alias lands, the hole is live and URL-fed, which is a cheaper vector than localStorage.
- **Seven `CROPS[k]` truthiness reads** on the render path. Each key reaches them only through a loader that now `hasKey`-gates it, and the `computeResults` destructure is hardened, so a prototype name that somehow arrived would render a phantom crop named `"Object"` rather than crash.

**Fix (text only).** `const resolveHash = (h) => (hasKey(HASH_ALIASES, h) ? HASH_ALIASES[h] : h);` — one line, and it makes the invitation in the comment safe to accept. The seven `CROPS[k]` reads can stay; note them so a future reviewer does not re-flag them.

---

## Addendum — per-leg `activation_limit_reached` coverage (coordinator's request)

Every leg in the client that can receive a validator verdict, with what it does when the verdict is pool-full. Legs 1 and 2 were **driven** through the real mount chain; legs 3 and 4 are read directly, since they live in component bodies rather than the mount effect.

| # | Leg | file:line | flag branch? | pool-full behaviour | verdict |
|---|---|---|---|---|---|
| 1 | Stored-key boot | `src/App.jsx:7522-7567` | **YES** (`:7544`) | key **KEPT**, instance KEPT, `paid:false`, message = the server's pool-full sentence | **COVERED** |
| 2 | URL `?key=` mount | `src/App.jsx:7506-7515` | no | nothing stored to lose (the N-1 guard at `:7492-7493` means this leg runs only with empty storage); `urlKeyError = r?.error` passes the server's **pool-full sentence through verbatim**; key prefilled | **CORRECT — not Growroom's bug** |
| 3 | Grace-panel re-validate (`saveGraceKey`) | `src/App.jsx:4131-4137` | **no** | falls through the "definitively rejected" comment into a fresh bare-key activation; no wipe, no slot burned (server A-1 pre-check stops it), correct copy arrives one round-trip late | **GAP → L-1** |
| 4 | Manual activation (`activateKey`) | `src/App.jsx:7716` | no | returns `{ok:false, error: r?.error || <generic>}` — passes the server's pool-full sentence through verbatim; never wipes | **CORRECT** |

**Measured, legs 1 and 2** (real mount chain, pool-full verdict; the transient rows are controls):

| leg | `hhp_key` after | `paid` | message |
|---|---|---|---|
| L1 stored-key boot, pool full | **KEPT** | false | "This licence key has reached its device activation limit (3/3). Deactivate an old device…" |
| L2 URL `?key=`, pool full | n/a — storage empty by construction | false | "This licence key has reached its device activation limit (3/3). Deactivate an old device…" |
| L1 control, transient | KEPT | false | "We couldn't reach the licence server to verify your saved key. It's still saved on this device - reload to try again." |
| L2 control, transient | n/a | false | "Licence server unreachable. Try again." |

**Why Homestead escaped Growroom's bug.** Growroom's URL-key leg had a transient/definitive split whose `else` swallowed the flag, producing the "reload" sentence about a saved key the device does not have. Homestead's URL-key leg has **no split at all** — it assigns `r?.error` unconditionally — so the server's pool-full sentence reaches the user intact. The absence of the branch is what saved it. That is luck, not design, and it is worth noting: if anyone later adds a transient/definitive split to leg 2 for better copy, they must add the flag branch in the same commit or they will reintroduce Growroom's exact bug.

---

## Blast radius / siblings to check

- **H-1 is a fleet finding, not a Homestead one.** The `!error` conjunct is copied across the product line. HeatLens is fixed (`f977e59`). Grep every sibling for `status !== 200 && !` in `api/validate-key.js` and check both guard sites: **Aero-Calc, Growroom, Vertica, FaminePrep, MoneyCat, Mortar**. The tell is a `.error`-conditioned 502 with no status-first short-circuit above it. Homestead's own `api/generate.js` licence gate should be checked in the same pass — it consumes the same LS responses (`:745`, `:726`, `:747`).
- **M-1 is a fleet finding too.** Grep every product's entry file for `<Analytics` and check for a `beforeSend`; then check whether that product's `?key=` strip sits before or after its validation `await`. Vertica's M-3 is the same shape and is the reference. Any product whose purchase email links to `?key=` is affected.
- **M-2's shape generalises.** The tell is a nested localStorage object whose *shape* is validated but whose *leaves* are not, consumed with `??`. Grep siblings for `migrateBucket`-like shape-only validators and for `[c.key] ??` / `[f.key] ??` consumption. Homestead's own `isStoredNumber` call sites (`:7264`, `:7271`, `:7327`) are the correct in-repo reference — they type-check **and** range-check.
- **L-2 is already on the ledger** for seven other products (handoff item 11). Add Homestead.
- **Inside Homestead, if M-2 is fixed:** `migrateBucket`'s return contract changes. Re-audit `:1697-1698` (Soil tab) and `:5800-5801` (Cost Savings prefill) in the same commit — the second one drives the "Use Soil Calc total" button, which is gated on `soilCostEstimate > 0` and today silently does nothing when the value is NaN.
- **Two things the 08-17 audit named that are still open and are not in this sweep's scope:** H-1 of that document is now fixed (verified below), but its M-1/M-2/M-3 fixes were verified here only where they intersect these six families.

---

## Checked and clean (do not re-audit)

- **Family 3 is absent, verified by gesture.** There is exactly **one** numeric input component (`Field`, `src/App.jsx:900-967`) behind all 13 numeric input sites. Its input is `value={raw}` / `onChange={(e) => setRaw(e.target.value)}` — bound to a **local draft string**, set unconditionally. A repo-wide grep for the dangerous shape (`v === ""`, `value === ""`, `.trim() === ""` followed by a bare `return`) returns exactly two hits, neither of which is an `onChange`: `:400` inside `importedNumber` (a pure helper) and `:917` inside `commit` (blur/Enter), which **calls both setters before returning**. Replayed gesture on the real commit body: start `"400"` → select-all+Delete → `""` → type `"450"` → `"450"` → blur → commits **450**. Replaced, not appended. Growroom's `c48dee1` regression cannot occur in this codebase.
- **The 13 Field sites and their clear-behaviour**, for the L-4 cross-reference. Six land on a non-zero minimum on clear+blur: Annual produce per person (`:1223`, min 50), Bed Length/Width/Diameter (`:2058`/`:2062`/`:2069`, min 0.5), Bed Outer length/width (`:2076`/`:2080`, min 1), Bed Depth (`:2094`, min 4). Seven land on 0: Cutout length/width, Soil share-of-mix %, Soil price, Setup cost, Grocery price. **L-4 is unchanged by today's commits** and is already filed in `audit-vault-families-2026-08-17.md`; today's H-1 fix *improved* its metric behaviour, because the bounds are now converted (`bLen`/`bDepth`, `:1997-1998`), so clearing Depth in metric commits 10.2 cm (= 4 in) rather than the old 4 cm.
- **08-17 H-1 is genuinely fixed.** All eight bed Fields now take converted bounds from named constants (`BED_LENGTH_FT_MIN` … `BED_DEPTH_IN_MAX`, `:320-335`) via `bLen`/`bDepth`, and the loader at `:7135-7145` uses the **same constants**, so editor and loader cannot drift. The canonical re-clamp after conversion is present in `commitLen`/`commitDepth`.
- **Family 5 is fixed on both halves, verified.** Nine `hasKey(` call sites (`:7104`, `:7112` ×2, `:7185`, `:7186`, `:7208`, `:7213`, `:7222`, `:7264`, `:7333`) — count matches the fix commit `bbe464f`. Measured against the real `CROPS`, `GOAL_MULTIPLIER` and `ZONE_FROST_DATES`: all six prototype names (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`, `isPrototypeOf`) are truthy under the **old** `MAP[k]` gate and **false** under the shipped `hasKey` gate, while real keys (`tomato`, `fresh_preserving`, zone `7`) stay true under both. The consumer half is in too: `:1150` is `Array.isArray(crop.yieldPerPlantLbs) ? crop.yieldPerPlantLbs : [0, 0]`, so the unrecoverable ErrorBoundary crash the 08-17 audit measured is closed twice over.
- **`hasKey` uses `Object.prototype.hasOwnProperty.call`, not `Object.hasOwn`** (`:448`), with the reason stated: `Object.hasOwn` is ES2022 and Vite's es2020 target transpiles syntax but never polyfills a library method. Correct call.
- **Our own endpoint's 429s are correctly transient.** `validateKeyRemote` (`src/App.jsx:790-801`) returns `transient:true` for every `resp.status !== 200`, and the shape gate at `:769` requires a boolean `valid` even on a 200. The only definitive-wipe path into the client is the server converting an LS failure into an HTTP 200 — which is exactly and only H-1.
- **`api/validate-key.js` controls all behave correctly** (measured, table in H-1): LS ≥ 500 → 502 transient; LS non-200 with an empty body → 502 transient (R2-H1 holds); LS 404 "license_key not found" → definitive (correct); LS 429 carrying activation-limit wording → flagged, key kept (A-1 holds, and `normaliseLsError` correctly tests the limit bucket first at `:145`); LS 200 active → paid.
- **`sanitizeNum` / `clampInt` / `importedNumber` are correct as rebuilt.** `importedNumber` (`:397-403`) admits only a finite number or a non-empty string that parses to one — `null`, `""`, `[]`, `false`, `true`, `{}`, `" "` all become `null` and reach the caller's declared **default**, not the minimum. `clampInt` now has a real 4-argument `(v, fallback, min, max)` signature and both call sites pass it. Covered by `tests/bounds-and-sanitisers.test.mjs`, 59/59.
- **Quarantine content de-duplication works** (`findQuarantinedCopy`, `:666-674`): a reload re-reading the same unparseable bytes writes no second copy, so the storage-quota amplifier the 08-17 fix was written to prevent stays prevented.
- **`usePersistOnChange` still guards on VALUE, not a first-run flag**, with one ref per key (`:717-724`) — StrictMode's double mount cannot spend the guard, and the mount pass cannot overwrite an unreadable key with a default.
- **CSP is consistent with the analytics finding, not a mitigation for it.** `vercel.json` allows `https://va.vercel-scripts.com` in `script-src` and both `https://vitals.vercel-insights.com` and `https://va.vercel-scripts.com` in `connect-src`. Analytics is intended and live; nothing in the CSP filters the payload.
- **`Referrer-Policy: strict-origin-when-cross-origin`** means the `?key=` URL is not leaked to LemonSqueezy or Google Fonts as a referrer. It *is* sent same-origin to `/api/validate-key`, but that request already carries the key in its POST body, so no new exposure.
- **Family 6 cross-key case is safe:** two different keys quarantined in the same millisecond produce two distinct entries, because the key name is part of the storage key.

## Not this agent's call

- Whether a licence key already written into Vercel Web Analytics needs a retention or notification response → security-auditor / Grant.
- Whether LemonSqueezy's edge in fact emits 429/403 with a JSON `error` body → settle with one week of upstream logging (recipe in H-1), or take the fleet's word for it and ship the status-first guard regardless, since it is correct either way.
- Formula correctness beyond the arithmetic traced here (Cornell path buffer, USDA baselines, NCHFP jar weights) → engineering-verifier.

**Every finding above is reported; none is fixed. No product file was modified in this session.**
