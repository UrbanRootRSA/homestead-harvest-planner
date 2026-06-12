# Code review — 2026-06-10 — Round 2 (fix verification)

**Verdict:** SHIP (deployed state stands) — 1 HIGH fast-follow + 3 LOW + 2 INFO
**Fix status (2026-06-10, branch `session-8-r2-hardening`):** R2-H1 + R2-L1 + R2-L2 + R2-L3 + R2-I1 FIXED across commits `344b808` (licence-path verdict hardening, incl. security-audit I1) / `21f6f24` (vercel.json headers, incl. security-audit I2) / `1a3e241` (client polish). Build clean 393.61 kB / 111.28 kB gz; SSR probe 50,593 bytes, no crashes. R2-I2 remains OPEN (observation item — close on first real fresh activation). Sibling rollout of R2-H1 (FaminePrep/Aero/Grow/Vertica) pending.
**Baseline:** `main` @ `c51452a` (tree clean, deployed + live-verified 2026-06-10)
**Scope:** Regression hunt on the 9 fix commits `cac97b0..c51452a` closing all 19 round-1 findings (round-1 baseline `b888bb4`). Focus areas per brief: validateKeyRemote return-contract re-audit (all callers), H2 pre-check interaction, L11 grace-panel state machine, M5 CSP census, build + SSR probe.
**Verifications run:** `npm run build` clean — 393.21 kB raw / 111.15 kB gz, 33 modules (byte-identical to round-1 fix-status numbers). SSR probe (`vite build --ssr src/App.jsx` + `renderToString`) renders 50,593 bytes, zero crashes. Live LS endpoint probed with bogus key: HTTP 404 + `{"valid":false,"error":"license_key not found."}` — confirms the pre-check early-bail shape. Content greps executed on all 7 new static pages.

---

## Executive summary

All 19 round-1 fixes are in place and correct. The return-contract migration (C1) — the exact class that produced 2 HIGH regressions in Cipher — was re-audited across every consumer: **no destructive consumer treats `valid:false` as definitive without checking `transient`**, the retry-activation instance-wipe cannot fire on a transient result (client-constructed transients never carry `retry_activation`), and no path leaves `validating` or a spinner stuck. The H2 pre-check is a faithful clone of the FaminePrep-deployed pattern with one improvement (`normaliseLsError` instead of raw `.slice(0,200)`), counts rate limits exactly once, and leaves the instanceId re-validate branch covered by the (now fail-closed) post-check. The L11 grace panel's state machine is sound on success, definitive failure, transient failure, and 48-hour expiry. CSP census: zero inline scripts or handlers on all 12 served HTML pages; `script-src` carries no `'unsafe-inline'`; the downloaded report's own script is listener-based at end-of-body and unaffected by the site CSP.

One genuinely new HIGH was found while tracing the C1 trust boundary one level deeper: **`api/validate-key.js` fabricates a definitive HTTP-200 `valid:false` from unrecognised LemonSqueezy upstream shapes** (LS-side 429/403/WAF HTML, JSON:API `errors[]` bodies). The client correctly trusts our 200s as definitive — so an LS-edge anomaly during mount revalidation still de-licenses the device, which is the same customer-harm class C1 closed. It needs an upstream anomaly to trigger (not user-reproducible at will), so it does not warrant rollback, but it should be the next fix on this product — and on the 4 siblings sharing the handler shape.

---

## Round-1 fixes — verification status (19/19 verified)

| # | Fix commit | Status | Evidence |
|---|---|---|---|
| C1 transient de-license | `cac97b0` | **VERIFIED CLEAN** (client) | `App.jsx:599-625` — definitive iff HTTP-200 + boolean `valid`; non-200 / malformed body / AbortError / network all return `transient:true`. Mount wipe gated `if (r?.transient)` keep : else wipe (`:7227-7235`). Residual server-side gap → new **R2-H1** below |
| H1 frostDates crash loop | `64f0ac0` | **VERIFIED CLEAN** | `manualMissing = mode==="manual" && !frostDates` (`:3947`); both derefs optional-chained (`:3951-3956`); PlantingDateCalculator independently guarded (`frostDates?.lastSpring` `:2276`, `{frostDates && ...}` `:2357`); generate() blocked by manualMissing before any frost string is used; copy says "blank or invalid" in both surfaces |
| H2 activate-first slot burn | `e1400c4` | **VERIFIED CLEAN** (+ R2-I2 note) | `validate-key.js:183-209` — non-mutating bare-key `LS_VALIDATE` → 5xx bail (502) → `json.error` bail (normalised, `retry_activation:false`) → fail-closed store compare → only then `LS_ACTIVATE`. Gates on `json.error` + `meta.store_id`, deliberately NOT on `valid` — robust to the inactive-key `valid:false` shape. Identical to FaminePrep's deployed handler |
| M1 fail-open store_id | `e1400c4` | **VERIFIED CLEAN** (both files) | `validate-key.js:270`, `generate.js:275` — `!= null` escape hatch gone; `js.meta \|\| {}` defaulting means `String(undefined)` rejects without crashing; env-var warn-and-skip hybrid preserved in preview/dev |
| M2 Zone 7 article dates | `25b3019` | **VERIFIED CLEAN** | Grep: "March 22" ×4, "November 5" ×5, zero "April 15"/"October 15"; "32 weeks" recalculated; week offsets re-anchored |
| M3 tomato table math | `25b3019` | **VERIFIED CLEAN** | "~5 qt", "~12 qt", "28 qt", "~21 paste" all present; no stale "10 qt"/"25 qt" rows |
| M4 goal persistence | `198bd90` | **VERIFIED CLEAN** | `LS_GOAL` init with allowlist clamp `GOAL_MULTIPLIER[g] ? g : "fresh_preserving"` (`:6841-6843`); persist effect added (`:7091`). SSR probe exercises the initializer — no crash on empty/garbage LS |
| M5 CSP unsafe-inline | `004211a` | **VERIFIED CLEAN** | Census: zero inline event handlers and zero executable inline scripts across index.html + 11 public pages (JSON-LD blocks are non-executable). `script-src 'self' assets.lemonsqueezy.com app.lemonsqueezy.com va.vercel-scripts.com` — no `'unsafe-inline'`. `style-src` keeps it; no `require-trusted-types-for` (LS-safe per `feedback_csp_trusted_types_ls`). `contact-copy.js`: defer-loaded IIFE, button exists (`contact.html:170`), `.copied` styles intact, clipboard-fail fallback to `window.prompt`. In-report script (`App.jsx:4968-4975`): `getElementById('hhp-print-btn')?.addEventListener` at end of body — works in the downloaded file (file/Blob context, site CSP header doesn't apply; listener-based anyway) |
| L1 report month guard | `553d799` | **VERIFIED CLEAN** | Report builder (`:4841-4850`) now EXACT logic parity with UI chart (`:4676-4684`): map → soften `endIdx`/`peakIdx` -1 → `startIdx`, filter `startIdx >= 0`; section hides when no rows survive |
| L2 filename date | `553d799` | **VERIFIED CLEAN** | `Number(planState.generatedAt) \|\| Date.now()` + local date parts (`:4152-4154`). `generatedAt` is number-typed at every site: set `Date.now()` (`:4106`), load clamp `typeof === "number"` (`:7044`) — the `Number()` coercion can't NaN-out to the fallback for a real plan |
| L3 dead sanitisePlanShape | `553d799` | **VERIFIED CLEAN** | Zero references to `sanitisePlanShape`/`_str(`/`_strArr(`/`_num(` remain; tombstone comment at `:3823`; CURRENCY_SYMBOLS comment updated and the constant still consumed by the currency clamp |
| L4 stop_reason check | `553d799` | **VERIFIED CLEAN** | `generate.js:786-789` — placed after upstream non-200 mapping, before tool-block extraction; `"max_tokens"` is the correct Anthropic value; client surfaces the 502 message verbatim (`App.jsx:4090`) |
| L5 em dashes | `25b3019` | **VERIFIED CLEAN** | `grep -c '—'` = 0 on all 7 files (about + blog index + 5 articles) |
| L6 potato calories | `25b3019` | **VERIFIED CLEAN** | "350 calories per lb" + "52,000"; no 600/90,000 remnants |
| L7 header tap targets | `25b3019` | **VERIFIED** (+ R2-I1 nit) | Mobile `padding: "14px 6px"` + inline-flex on both About/Blog links (`:6358-6378`); computed height ≈ 43.6–44.4 px depending on line-height — see INFO note |
| L8 favicon rewrite | `004211a` | **VERIFIED CLEAN** | `rewrites` block absent from vercel.json |
| L9 sitemap fragments | `25b3019` | **VERIFIED CLEAN** | 12 `<loc>` entries, zero `#` fragments |
| L10 blog copy nits | `25b3019` | **VERIFIED CLEAN** | Index card "in USD." only; about.html links `/blog/` (×1); © year-less ("© Urban Root · ") on new static pages; sage entry explicitly notes the in-app checker scores it neutral |
| L11 grace-window UX | `09e24f0` | **VERIFIED CLEAN** | Full state-machine audit below |

### C1 return-contract re-audit — all consumers (the Cipher-regression class)

| Consumer | Transient handling | Verdict |
|---|---|---|
| `attempt()` helper (`:7137-7155`) | Branches only on `valid` + `retry_activation`. Client-constructed transient results never carry `retry_activation`, so the `clearLS(LS_INSTANCE)` retry-wipe (`:7149`) cannot fire on a transient — only on a definitive HTTP-200 "stale instance" verdict, where the instance is genuinely dead server-side and re-activation is legitimately required | **CLEAN** |
| Mount stored-key path (`:7212-7236`) | `r?.transient` → `setKeyError("…still saved on this device - reload to try again.")`, key + instance KEPT; definitive → silent wipe. Falls through to grace check then step-4 `setValidating(false)` — no stuck overlay. Transient + active 48 h pending still unlocks via grace (correct: grace is the designed trust window) | **CLEAN** |
| URL-`?key=` path (`:7180-7207`) | Treats transient and definitive identically — but the treatment is entirely non-destructive (error + prefill + paywall; both slot-burn gates intact: never reads LS_INSTANCE, `skipStoredInstance` blocks the retry-wipe). Transient message threads through and is user-appropriate | **CLEAN** |
| `activateKey` (`:7336-7357`) | `{ok:false, error}` returned, transient messages thread through; no wipe anywhere; `setActivating(false)` in `finally` — no stuck spinner. H3 `{ok, error?}` contract intact; PaywallOverlay bridges `result.error` → `setKeyError` (`:7503-7510`) | **CLEAN** |
| `saveGraceKey` (L11 panel) | Consumes `activateKey`'s `{ok, error}` correctly; failure → local `graceError` with `role="alert"`; `setGraceSaving(false)` in `finally`; double-submit guarded | **CLEAN** |

### H2 pre-check interaction audit

- **retry_activation flow:** server sets `retry_activation` only on the instanceId branch (`looksLikeStaleInstance`, `:236`); the pre-check's bad-key bail hardcodes `false` (`:194`) — correct, there is no instance to retry in that branch. Client retry (`r2 = validateKeyRemote(key, "")`) then flows through the pre-check before any activate — the wrong-store gate now covers re-activation too.
- **instanceId re-validate branch:** does not pass through the pre-check (by design, no activation can occur there); covered by the now fail-closed post-check at `:270`.
- **Rate-limit accounting:** both buckets (per-IP `:147`, per-licence `:163`) increment exactly once per request, before any LS call. The pre-check adds an LS round-trip, not a rate-limit count. No double-count, no skip.
- **Error normalisation:** pre-check bail → `normaliseLsError` (improvement over FaminePrep's `.slice(0,200)`); store-mismatch + 502 strings identical to the post-check paths. Consistent.
- **callLs failure:** timeout/network → `{status: 504}` → `>= 500` → 502 → client flags transient. No licence wipe possible from a pre-check outage.

### L11 grace-panel state machine

- **Mount-time detection** (`!loadState(LS_KEY, "")`) is computed when GrowingPlanTab mounts, and the tab only mounts when `paid && !validating` (`:7549`) — i.e. after commitPaid (key written first) or grace unlock (no key). Checkout.Success in-session: PaywallOverlay swaps out, GrowingPlanTab mounts fresh, panel shows. Correct in both entry orders.
- **Success:** `setLicenceKeyMissing(false)` → Generate appears; `activateKey` persists key + instance and clears `LS_PENDING` (`:7346-7348`).
- **Definitive invalid:** `graceError` shown (aria-wired), key field editable, no state corruption.
- **Transient:** transient error message shown, nothing wiped, spinner resets — retry-able.
- **48 h expiry:** orthogonal — expiry is evaluated at mount only; if grace lapses mid-session the panel still accepts a key (server validates it independently); next reload lands on the paywall as designed.
- **generate() guard** (`:4026-4031`): unreachable in normal flow (panel replaces the button) but blocks the doomed 401 request if state ever desyncs. All three helper hints (`cropNames`, `manualMissing`) correctly suppressed while the panel shows.

---

## New findings

### [HIGH] R2-H1 — Unrecognised LS upstream shapes become definitive `valid:false` → mount wipe survives one level below the C1 fix

**Status:** FIXED `344b808` — non-200 LS response without a recognised `.error` body now returns 502 (client-transient) at both the main path and the H2 pre-check; genuine definitive rejections (200 bodies incl. inactive shape, non-200s WITH `.error`) unchanged. `generate.js` deliberately NOT touched (out of authorized scope; 401-only consequence). Sibling rollout pending.

**File:** `api/validate-key.js:214-253` (fallthrough), `api/validate-key.js:184-205` (same hole in the pre-check), `src/App.jsx:7227-7235` (the wipe that trusts it); same pattern in `api/generate.js:247-257` (lower consequence)
**What:** The C1 fix moved the client's trust boundary to "HTTP-200 from our server is definitive" — correct, but our server fabricates definitive 200s from ambiguous upstream states. `callLs` only routes `status >= 500` to the transient 502. Any LS response in the 401–499 band whose body is not the business shape — LS/Cloudflare 429 rate-limit or 403 WAF challenge (HTML body → `resp.json()` fails → `json = {}`), or a JSON:API `{"errors":[…]}` body — falls through: `js.error` falsy → `lk.status` undefined → `js.valid` undefined → `isActive` false → **HTTP 200 `{valid:false, error:"This licence key is not active."}`**. The client sees 200 + boolean `valid` → definitive → `clearLS(LS_KEY); clearLS(LS_INSTANCE)`. The pre-check variant is worse-labelled: empty `json` survives to the store compare and returns the definitive **"This licence key is for a different product."** (destructive when reached via mount bare-key revalidation, which is reachable after a legitimate `retry_activation` instance wipe whose follow-up failed transiently).
**Why it matters:** Same harm class as C1 — silent de-license of paying customers plus slot burn on re-paste — but triggered fleet-wide by an LS-edge anomaly instead of per-customer network conditions. Vercel egress IPs are shared across tenants; LS rate-limiting or WAF-challenging a busy egress IP is a plausible production event, and during one, every Homestead customer whose mount revalidation lands in the window is de-licensed at once. Not user-reproducible at will, hence HIGH not CRITICAL.
**Fix:** In `validate-key.js`, treat a non-200 LS status without a recognisable business-error body as transient: after the `ls.status >= 500` check, add `if (ls.status !== 200 && !js.error) return res.status(502).json({ valid:false, error:"Licence server unreachable. Try again." })` — and the same guard after the pre-check's 5xx bail (before the store compare). Optionally also gate the `isActive` fallthrough on `ls.status === 200`. Apply to the 4 sibling products sharing this handler shape (FaminePrep/Aero/Grow/Vertica deployed the identical pre-check today/this week). `generate.js`'s copy only yields a 401 (no wipe) but should be aligned for consistency.

### [LOW] R2-L1 — COOP `same-origin` diverges from the cross-product LS-safe standard

**Status:** FIXED `21f6f24` — `same-origin-allow-popups`, matching the sibling standard. Live-Buy verification required before deploy (header change).

**File:** `vercel.json:30` (pre-existing since Phase-2 `7f9e9d7`, 2026-05-06 — not introduced by the fix commits)
**What:** Homestead ships `Cross-Origin-Opener-Policy: same-origin`; FaminePrep (and the workspace standard per `feedback_coop_corp_ls_compat.md`) ships `same-origin-allow-popups` because strict COOP was observed breaking the LS overlay on a sibling. Homestead's overlay demonstrably opens (live-verified today, mandated by the M5 deploy), so the overlay-open path is fine — but popup-based legs inside checkout (PayPal, 3DS challenge windows that rely on `window.opener`) are severed by strict COOP and are not exercised by the overlay-open Live-Buy check.
**Why it matters:** A customer paying via PayPal or a 3DS-challenged card could hit a dead popup at the worst possible moment. Unproven on this product, one-word fix, and the only purchase fully verified end-to-end (2026-04-27) predates the header.
**Fix:** Change the value to `same-origin-allow-popups` (alignment with siblings), or run one full real-payment Live-Buy through a popup-based method before declaring strict COOP safe here.

### [LOW] R2-L2 — HTTP-400 format rejection is labelled transient → permanent misleading mount message for a corrupt stored key

**Status:** FIXED `344b808` — `validateKeyRemote` treats 400 as definitive `{valid:false}` (mount path wipes the junk key). Verified safe: the server's only 400 site is its own key-length check (after R2-H1 no LS state passes through as 400), and the malformed-body guard keeps platform 400s transient.

**File:** `src/App.jsx:606-617` (non-200 → transient), `api/validate-key.js:156-158` (400 on length < 8 or > 128)
**What:** A stored key that fails the server's shape check returns 400, which the client now flags `transient:true`. The mount path then shows "We couldn't reach the licence server… reload to try again" forever and never wipes the junk key — reload will never succeed. Only reachable by hand-editing localStorage (commitPaid never writes such values), so impact is self-inflicted.
**Fix (optional):** Treat 400 specifically as definitive in `validateKeyRemote`, or pre-validate stored-key shape client-side before calling.

### [LOW] R2-L3 — Grace panel doesn't detect a key saved by another tab → cross-tab double-activation surface

**Status:** FIXED `1a3e241` — `saveGraceKey` re-reads localStorage before activating: a stored key is validated with its stored instance (non-mutating) and reused; transient → retry-able error, nothing wiped; only a definitively-rejected stored key falls through to a fresh activation of the pasted key.

**File:** `src/App.jsx:3895` (`licenceKeyMissing` initialised at mount only)
**What:** If the licence email's `?key=` link opens in a NEW tab (key validated + stored there), the original tab's grace panel still shows; pasting the key there too calls a fresh bare-key activate → a second LS instance → 2 of 3 device slots consumed for one physical device. Mitigations already in place: tab switching remounts GrowingPlanTab (re-reads LS), and the email link typically replaces the same tab.
**Fix (optional):** Re-check `loadState(LS_KEY)` on `window` focus or a `storage` event listener while the panel is mounted.

### [INFO] R2-I1 — L7 tap height is 43.6–44.4 px depending on computed line-height

**Status:** FIXED `1a3e241` — `minHeight: 44` added to both anchors (mobile branch only; desktop unchanged).

**File:** `src/App.jsx:6358, :6371`
**What:** `13px` font with default `line-height: normal` (~1.2–1.26 for Plus Jakarta Sans) + 28 px vertical padding lands within a hair of the 44 px rule on some engines. Add `minHeight: 44` to both anchors for determinism. Materially the fix works (28 px → ~44 px).

### [INFO] R2-I2 — H2 pre-check has not yet been exercised against a real never-activated key

**Status:** OPEN — observation item, not code; close on the first real fresh activation on any of the 5 products.

**What:** LS's bare-key `/validate` response for an inactive (never-activated) key could not be empirically confirmed from here (bogus-key probe confirms the 404 shape only; docs are JS-rendered). The implementation is deliberately robust to the ambiguity — it gates on `json.error` + `meta.store_id` and ignores the `valid` flag, and the post-activate path has an explicit `status === "inactive"` branch suggesting the error-null shape — and the identical handler is deployed on FaminePrep/Aero/Grow. Residual risk: if LS returned a non-null `error` string for inactive keys, ALL first-time activations would fail across 5 products. Recommend: watch the first real fresh activation on any of the 5 products (or run one test purchase + activation) and close this item.

---

## Verified clean (round-2 sweep — don't re-audit without a diff)

- **No destructive consumer of `validateKeyRemote` ignores `transient`** (full inventory above); `retry_activation` can never ride a transient result; no stuck `validating`/spinner state on any path.
- **Rate-limit ordering and accounting** in validate-key.js: both buckets exactly once, before any LS round-trip; pre-check adds no counts.
- **M1 crash-safety:** `js.meta || {}` in both API files — fail-closed compare cannot throw.
- **L4 placement** after upstream error mapping, before tool-block extraction; client surfaces the truncation message.
- **CSP/M5:** zero inline scripts/handlers on all served pages (12 files); JSON-LD only; lemon.js + Vercel analytics origins allowlisted; style-src keeps `'unsafe-inline'`; no trusted-types directive; in-report print script is listener-based and CSP-independent (downloaded file).
- **L8:** no rewrites in vercel.json; security headers otherwise unchanged from Phase-2 state (COOP noted as R2-L1).
- **Content pass:** 0 em dashes ×7 files; zone-7 dates Mar 22/Nov 5 with 32-week arithmetic; tomato table self-consistent; potato 350 cal/lb; sitemap 12 real URLs; USD-only card; about↔blog symmetry; year-less ©; sage neutral note.
- **Build:** 393.21 kB / 111.15 kB gz, 33 modules — matches round-1 fix-status exactly. **SSR probe:** 50,593 bytes, no TDZ/undefined-identifier crashes (M4's `GOAL_MULTIPLIER` initializer and goal clamp exercised under SSR).
- **V2 paywall invariants intact:** plan body still never persisted; `paid` never initialised from LS; render gates unchanged; anti-regression comments preserved; LS_PENDING cleared on every key-commit path.
- **PlantingDateCalculator** independently null-safe (`frostDates?.` + `{frostDates && …}`) — the H1 crash class has no remaining surface.

---

## Suggested fix order

1. **R2-H1** — one guard line in validate-key.js (×2 sites) + sibling rollout. Closes the last de-license path. ✔ DONE `344b808` (Homestead; sibling rollout pending)
2. **R2-L1** — one-word COOP alignment with siblings, or a popup-leg Live-Buy test. ✔ DONE `21f6f24`
3. **R2-L2 / R2-L3 / R2-I1** — batch into the next hygiene PR; none is customer-visible today. ✔ DONE `344b808` / `1a3e241`
4. **R2-I2** — observe/perform one real fresh activation; closes the only unverified assumption in H2. — OPEN

---

## GATE-1 port — 2026-06-12

**Finding (cross-product, root cause verified on Vertica `0e542d2` by the post-deploy Buy-overlay gate):** lemon.js attaches its overlay click listeners DIRECTLY to `.lemonsqueezy-button` elements in a one-time scan at the window `load` event (its `d()` walker; no document-level delegation, and nothing in the app calls `Refresh()`). Homestead had exactly two class uses — the pricing-tile "Get full access" anchor (App.jsx:3350) and the paywall-overlay Buy CTA (App.jsx:3616). The paywall anchor mounts after the scan (overlay opens on locked-tab click) and the pricing anchor is re-rendered past it, so neither ever had a listener: clicks followed the href to the full-page hosted checkout. Purchases complete there, but the in-app `Checkout.Success` eventHandler (the `hhp_pending` 48-h grace write at App.jsx ~7338) can never fire, so buyers returned to a still-locked app until the licence-key email arrived. Pre-existing since launch.

**Fix (commit on `fix/gate1-buy-overlay`, faithful port of Vertica `0e542d2`):**
- Module-scope `openCheckoutOverlay(e)` next to `CHECKOUT_URL`: when `window.LemonSqueezy` exists, `preventDefault()` + `window.LemonSqueezy.Url.Open(CHECKOUT_URL)`; when absent (lemon.js blocked / not yet loaded), no `preventDefault` so the intact `href` navigates to the hosted checkout as the graceful fallback. No `"?embed=1"` string-concat — `Url.Open` sets `embed=1` via the URL API, and concat would break a query-carrying URL.
- Both anchors wired via `onClick={openCheckoutOverlay}`; the `lemonsqueezy-button` class removed from both so a future lemon.js scan can never double-attach.

**CSS override disposition:** NONE existed. Grep confirms zero product CSS rules target `.lemonsqueezy-button` anywhere in the repo (unlike Vertica's PaywallModal override block). The global element-selector `a:focus-visible` rule (App.jsx ~7633) keeps the focus ring on both anchors; the inline styles fully define their appearance. Nothing removed, nothing retargeted.

**Setup-wiring second check (Vertica `aeb42a0` trySetup / Grow :2795 class of bug): ALREADY ROBUST — untouched.** Homestead's SDK effect (App.jsx ~7324-7370) already implements the full retry pattern: guards on `typeof window.createLemonSqueezy === "function"`, calls `createLemonSqueezy()` before `Setup({ eventHandler })`, polls every 250 ms when the defer-loaded SDK isn't ready yet, and gives up after 8 s (CSP-blocked / offline — CTA then works as a plain link, which is exactly the helper's fallback leg). `Checkout.Success` writes `hhp_pending`, flips `paid`, and closes the overlay. With GATE-1 fixed, that handler is now reachable in-app.

**Build:** 393.69 kB raw / 111.32 kB gz, 33 modules (was 393.61 / 111.28 at main tip `3e84661`) — +0.08 kB raw / +0.04 kB gz, the helper plus the onClick wiring.

**Verification still owed (manual, post-deploy):** the mandatory Live-Buy overlay gate from CLAUDE.md §21 — click both Buy CTAs on the deployed site, confirm the overlay opens in ~1.5 s with $39.99 and zero console/CSP errors, and close without purchase.
