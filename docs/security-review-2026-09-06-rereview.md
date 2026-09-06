# Security re-review — The Homestead Plan (fix wave for the 2026-09-06 audit)

**Date:** 2026-09-07
**Branch / commit:** `fix/audit-2026-09-06` @ `75ec332` (two commits over `main` @ `2b46161`) — **not deployed**
**Scope:** closure of every finding in `docs/security-review-2026-09-06.md`, plus a hunt for security regressions across the whole `main..HEAD` diff (17 files, +4309 / −375).
**Trust models:** **A** (paid API proxy — `/api/generate` spends Anthropic behind a LemonSqueezy licence gate with canonical instance binding in Upstash) and **E** (static client bundle on Vercel; headers + supply chain).
**Read-only.** Nothing was fixed. No Anthropic credit was spent: every probe stubs `globalThis.fetch` and counts attempts by host. The live validator was **not** probed at all (see §9).

---

## Verdict

**SHIP WITH CAUTION — merge to `main`.**

The branch closes 8 of the 9 code-side findings outright and is strictly better than `main` on every axis I measured. The one HIGH below is a **residual of the H-1 fix, not a regression**: `main` today carries the *unconditional* lockout with no precondition at all, so holding this branch would leave customers worse off. Merge, then fix the residual as its own change and re-verify.

**0 CRITICAL / 1 HIGH / 0 MEDIUM / 4 LOW / 5 informational.**

| Gate | Result |
|---|---|
| `npm test` (9 suites, 712 assertions) | **exit 0** |
| `npm run build` | **exit 0** — `dist/assets/index-CZJQzzOA.js`, 405.36 kB |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| `npm audit` (incl. dev) | 6 (1 low / 1 moderate / 4 high) — same build-chain band as 2026-09-06, unchanged |
| `tools/security-scan.mjs` | HEAD 0C/**14**H/2M/1I vs main 0C/**13**H/2M/1I — **delta +1 HIGH, and it is `new Function` in a new test harness** (`tests/plan-generation.test.mjs:143`), the same idiom the other 8 test files already use. No shipped-code delta. |

---

## 1. Threat model (unchanged in shape, one new actor)

The attacker who matters is **someone holding a customer's licence key** — pasted in a forum, resold, shared across a household, or lifted from a shared machine. They cannot read the victim's `hhp_instance` (different origin, different device), so they cannot spend the victim's Anthropic budget: the canonical-instance binding in `hhp:instance:<hash>` forces every `/api/generate` call onto the first-bound device. What they *can* do is attack **availability of the thing the customer bought**, by driving the per-licence rate bucket on `/api/validate-key` into a state that denies the owner. Homestead's client denies on a 429 and never seeds `paid` from storage, so every reload re-validates and re-fails: the customer who paid $39.99 sees a paywall with no action available to them. Blast radius is one customer per key held, sustained for as long as the attacker keeps paying for ~5 proxy addresses. The second actor is a **stranger with the URL** aiming at the Anthropic budget; the origin allowlist, the licence gate and the instance binding all sit in front of that, and this branch narrows the first of them.

---

## 2. What I actually ran

| # | Probe | Result |
|---|---|---|
| 1 | `tests/validate-key-limits.test.mjs`, `tests/generate-licence-gate.test.mjs`, all 9 suites | exit 0, 712/712 |
| 2 | **Own probe A–F** on the real `api/validate-key.js` with an in-memory Upstash emulator (real INCR/GET/SET/EXPIRE, base64 wire) | found the HIGH below |
| 3 | **Own probe** on the real `api/generate.js`: L-1 ×6 shapes, L-5 ×7 content types, L-2 ×2 fault legs, the limiter reorder ×32 requests, XFF, a 2.7 MB body, a prompt-injection payload, a hostile 999-row model output | recorded below |
| 4 | **Origin matrix, both trees:** 30 header shapes × 2 environments × 2 routes = 120 verdicts, run against `75ec332` and against `main`, then diffed | 5 rows changed, all `pass → BLOCK`, all production-column, all preview-origin. **Zero rows widened.** |
| 5 | Live GETs (no validator probe): header set on `thehomesteadplan.com`, redirect on `homestead-harvest-planner.vercel.app/` and `/api/generate` | `X-Xss-Protection: 1; mode=block` still live (the L-3 delta); **both** redirects are 308 to the apex |
| 6 | Supply chain: registry integrity vs lockfile for `@upstash/redis@1.38.3`, whole-tree install-script scan, ChainDrop IOC filename sweep, keyv-wave package check, `npm config ls` project section | all clean, detail in §7 |
| 7 | Working tree vs commit for all five changed source files | `git status` clean; `api/validate-key.js` differs from `git show` **only by CRLF** (byte-identical after `tr -d '\r'`) — noted so nobody re-reads it as a parallel mutation |

---

## 3. Findings

### HIGH-1 — The known-good exemption cannot be *earned* once the bucket is full, and a junk `instance_id` fills the bucket without minting it

- **Severity:** HIGH · **Label:** CONFIRMED (measured end-to-end, in-process, against the real handler) · **Tag:** residual of the H-1 fix, not a regression
- **OWASP:** A04:2025 Insecure Design
- **Location:** `api/validate-key.js:349-355` (the gate), `:539-540` (the bump-without-mark leg), `:603` (the only unconditional mint)

```js
// :349  the gate — reads the marker, then the bucket
const licenceKnownGood = await licenceIsKnownGood(key);
if (!licenceKnownGood && (await licenceBucketExceeded(key))) {
  return res.status(429).json({ valid: false, error: "Too many attempts for this licence. Try again in an hour." });
}
…
// :539  the leg an attacker chooses
if (ACTIVATION_LIMIT_RE.test(errStr)) await markLicenceKnownGood(key);
else await bumpLicenceBucket(key);          // ← an instance rejection lands here
```

- **The mechanism, in one line:** the exemption (`hhp:vk:ok:<sha>`) can only be minted by a request that *passes* the gate the exemption exists to bypass. Fill the bucket first and the victim can never mint it.
- **Attack:** the attacker holds the victim's key but not the victim's `instance_id`. They send `{key: <victim's>, instance_id: "junk"}`. LemonSqueezy finds the key and rejects the **instance** — an `error` string that does not match `/activation limit/i`, on a status inside `LS_VERDICT_STATUSES` (200 / 400 / 404 all reach the same leg). That is a "verdict", so it bumps `lkbad:<sha>` — and it is not an activation-limit verdict, so it does **not** mint the marker. Fifty of those and the bucket denies. The owner then arrives from their own clean IP, with their own good key and their own bound instance, and is answered `429` **without LemonSqueezy ever being consulted** — so the mint at `:603` is unreachable, forever, for as long as the bucket is kept full.
- **Measured** (`homestead-h1-residual.probe.mjs`, real handler + real counters):

```
A1  failure bucket after 60 junk-instance sprays = 50
A3  known-good marker minted by the spray? false
A4  OWNER: http=429 body={"valid":false,"error":"Too many attempts for this licence. Try again in an hour."}
A5  OWNER reached LemonSqueezy? legs=[]
E1  5 further owner attempts from 5 clean IPs: 429,429,429,429,429
E2  marker earned? false
F1  control: a PRE-MARKED key survives the same 60 junk sprays: http=200
```

- **Cost to the attacker.** Per-IP is 10 / 600 s = **60 requests/hour/IP**. The bucket denies at 50 and its TTL is 3600 s from the *first* bump; once full, the attacker's own requests 429 before LS so they cannot extend it. Re-saturating the moment it expires needs 50 requests in a burst — **5 addresses**. The victim's only escape is to load the app inside the few seconds between expiry and re-saturation; if they ever win that race they are marked and immune for 30 days (refreshed on every visit).
- **Why this is live on day one.** `hhp:vk:ok:` is a brand-new namespace and `lkbad:` is a deliberate rename, so **at the moment this branch deploys not one customer's key is marked**. The fix's protection is zero at t=0 and accrues one customer at a time as they visit. An attacker already holding a leaked key and watching for the deploy wins that race for that key.
- **How narrow is it, honestly.** Much narrower than pre-fix. On `main` the bucket is bumped by *every* request including 429'd ones, so one IP sustains an unconditional lockout of any key, marked or not. Here the attacker needs the victim unmarked, needs ~5 addresses, and must re-burst every hour. The fix is real and large. What it does not do is *close* the harm class.
- **Fix shape.** Two changes; take both. First, mint on the response that proves the key exists — an instance rejection is a statement about the instance, not about the key:

```js
// api/validate-key.js:539
if (ACTIVATION_LIMIT_RE.test(errStr) || looksLikeStaleInstance) {
  // LS found the KEY and rejected the INSTANCE: the key is real.
  await markLicenceKnownGood(key);
} else {
  await bumpLicenceBucket(key);
}
```

`looksLikeStaleInstance` is already computed one line above. An unknown key still answers `license_key not found` with no instance wording, so the Phase-2 L6 probe cap on unknown keys is untouched.

Second, a wording-independent backstop so the owner is never locked out even if LemonSqueezy rephrases: let the **bound device** through the gate regardless of the bucket. `api/generate.js` already owns `hhp:instance:<licenceHash>`; read it here.

```js
// api/validate-key.js, at the gate
const bound = instanceId && redis
  ? await redis.get(`hhp:instance:${hashKey(key)}`).catch(() => null)
  : null;
const isBoundDevice = Boolean(bound) && bound === instanceId;
if (!licenceKnownGood && !isBoundDevice && (await licenceBucketExceeded(key))) { … }
```

An attacker cannot forge that: `instance_id` lives in the victim's `localStorage` on the victim's device.

A third shape — keying the failure bucket on `(licence, instance)` — also works but lets any caller mint a fresh sub-bucket by rotating the instance id, which removes the per-licence cap for that shape entirely. Prefer the two above.

- **Regression test the fix needs.** The shipped `H1-1..H1-5` cannot catch this because `H1-1` validates the owner **first**, which mints the marker before the spray. A closing test must spray a key that has *never* been validated, with a junk `instance_id`, and then assert the owner is served.
- **Deployment note:** licence path. Re-arms the live-Buy checklist in `Homestead/CLAUDE.md` §21.

---

### LOW-1 — The known-good exemption is never revoked

- **Severity:** LOW · **Label:** CONFIRMED (measured) · **Tag:** NEW, introduced by the H-1 fix
- **OWASP:** A01:2025 Broken Access Control (cap evasion, not access)
- **Location:** `api/validate-key.js:177-183` (`markLicenceKnownGood`, `ex: 30 * 86400`); no `del` anywhere.
- `markLicenceKnownGood` writes a 30-day marker and nothing ever deletes it. A key that is later **disabled, expired, refunded or found to be from another store** keeps its exemption, so it is skipped past the per-licence bucket for up to 30 days and each probe still costs a LemonSqueezy round-trip from the shared Vercel egress IP.
- **Measured:** after one good validate then 63 `disabled` verdicts — `bucket count = 64`, requests still answered `200` (not 429), `3/3` LS round-trips still spent.
- **What bounds it.** The exemption grants **no access**: LS is still asked and still says no, and `/api/generate` reads a different namespace (`hhp:lk:ok:`, 1 h) that the marker does not touch. Total LS volume was never bounded by the per-licence tier anyway — an attacker with N addresses gets 60·N LS calls/hour regardless, since each distinct key carries its own bucket. So the incremental harm is the loss of a cap that was not the binding constraint.
- **Fix shape:** `await redis.del(licenceOkKey(key));` alongside each `bumpLicenceBucket(key)` on a definitive-negative leg (`:577` not-active, `:483` / `:597` wrong store).
- Also carried forward from the fixer's own note: a real key from **another** LemonSqueezy store whose pool is full is marked known-good at `:412` / `:456`, because those legs run before the store gate. Same class, same remedy, no access granted.

### LOW-2 — `http://localhost:5173` and `:3000` are trusted origins **in production**

- **Severity:** LOW · **Label:** CONFIRMED (measured: `200`, and **one Anthropic call**, under `VERCEL_ENV=production`) · **Tag:** NEW — adjacent to L-1, one line above the line that was fixed
- **OWASP:** A01:2025 Broken Access Control
- **Location:** `api/generate.js:29-34` / `api/validate-key.js:20-25` — `ALLOWED_ORIGINS` is unconditional.
- L-1's fix gated the `*.vercel.app` branch on `VERCEL_ENV !== "production"` with the rationale "production traffic never legitimately carries a preview origin". Exactly the same is true of the two localhost entries, and they were left unconditional. A page served from `http://localhost:5173` on a victim's machine — the default Vite port, so any local dev server or locally-installed tool — sends that `Origin`, and it passes both gates on the production deployment and reaches Anthropic.
- **What bounds it.** The caller still needs a valid licence key plus the bound `instance_id` to get a plan, and the responses carry no `Access-Control-Allow-Origin` (verified live 2026-09-06), so a browser on such a page cannot read the reply. A scripted attacker forges any origin they like, so this was never their obstacle either. The residual is the same latent one as L-1: the day anyone adds a CORS header, this line is the bypass.
- **Fix shape:** move the two localhost entries into the same `VERCEL_ENV !== "production"` block the preview regex now lives in.

### LOW-3 — The origin gate is an OR, so an allowed `Referer` rescues a disallowed `Origin`

- **Severity:** LOW · **Label:** CONFIRMED (measured: `Origin: https://evil.example` + `Referer: https://thehomesteadplan.com/x` → `200`) · **Tag:** NEW (pre-existing shape, surfaced by the matrix)
- **OWASP:** A01:2025 Broken Access Control
- **Location:** `api/generate.js:89-95`, `api/validate-key.js:93-99`
- A browser cannot produce that pair — a cross-origin fetch sets both to the attacker's origin, and `Referrer-Policy: strict-origin-when-cross-origin` keeps them consistent — and a scripted attacker forges both, so this is inert today. It is the shape that bites when someone later trusts `Referer` in a context where `Origin` is the stronger signal.
- **Fix shape:** if `origin` is present and not in the allowlist, reject without consulting `referer`. Use `referer` only as the fallback for a request that carries no `Origin`.
- **Verified NOT vulnerable** in the same matrix: suffix bypass (`thehomesteadplan.com.evil.example`) blocked on both origin and referer — the trailing `/` in `startsWith(allowed + "/")` closes it, so the scanner's two `ORIGIN-STARTSWITH` MEDIUMs are idiom hits, not bugs. Also blocked: prefix-in-path, `http://` apex, case-shifted host, trailing-dot host, subdomain of the apex, `null` origin, array-valued header, backslash and userinfo referers, and `localhost:51730` (the longer-port trap).

### LOW-4 — `415` / `403` / `405` return before the per-IP limiter, so those rejections are unmetered

- **Severity:** LOW · **Label:** CONFIRMED (read + driven) · **Tag:** NEW for the 415; pre-existing for 403/405
- **OWASP:** A02:2025 Security Misconfiguration
- **Location:** `api/validate-key.js:298-313` then `:333`; `api/generate.js:699-711` then `:746`
- The new 415 gate is placed with the other header-only checks, above the Upstash fail-closed gate and the per-IP bucket. A caller can therefore emit unlimited 415s (and 403s) without touching a counter. Each costs one Vercel invocation and nothing else — no Redis, no LemonSqueezy, no Anthropic.
- The placement is defensible and I would keep it: spending a Redis round-trip to meter a request you can reject from headers alone is the worse trade. Recorded because it is the same family as the Aero-Calc 2026-09-06 note ("charge the IP bucket before the input-format reject") and someone will otherwise rediscover it.

---

## 4. Informational

- **I-1 — `VERCEL_ENV` is now load-bearing for three production gates.** The Upstash fail-closed 503, the `LEMONSQUEEZY_STORE_ID` fail-closed, and (new, from L-1) the preview-origin allowlist all key on `process.env.VERCEL_ENV === "production"`. If that variable were ever absent on a production deploy, all three soften in the same request. Vercel always sets it, so this is not reachable today; it is worth one line in the spec because the L-1 fix made a third consumer of a single platform signal.
- **I-2 — The zero-crop reorder, priced.** `sanitiseInput` + the zero-crop `400` now run *before* the per-licence bucket (`api/generate.js:792-800`). Driven: a zero-crop request costs `1` LS call, `0` Anthropic, and **does not move `hhp:rl:generate:lk:<hash>`** — only `hhp:lk:ok:` and `hhp:instance:` are touched. So a caller who already holds a valid licence and a bound instance can send up to 60 zero-crop rejects per hour per IP without spending any of their own 20/day. That is the intended engineering fix (a plan for an empty garden no longer burns a paid slot) and the residual is a Vercel invocation. Both gates it moved past — `validateLicence` and the instance binding — still run first, so nothing reaches Anthropic earlier than before.
- **I-3 — Body-size gate: ruled N/A, and correctly so.** The weakness a sibling auditor found on Grow Room — a body gate that trusts `content-length`, bypassed by omitting the header, lying small, or sending `abc` — **cannot exist here: `grep -rn "content-length\|bodyParser\|sizeLimit" api/ src/ vercel.json` returns nothing.** Homestead never built a body gate, and does not need one, because the prompt is bounded by per-field clamps instead of by the envelope. Driven: a **2,764 KB** request body produced an **8.7 KB** Anthropic request and a **5,453-character** user message, with exactly `MAX_CROPS = 64` crops in it, from an input carrying 5,000 crops of 500 characters, 500 goals, and eight 10,000-character scalars. That is the stronger shape — there is no attacker-controlled header in the trust path at all. Above ~4.5 MB the platform answers `FUNCTION_PAYLOAD_TOO_LARGE` before the function runs (measured 2026-09-06). No change recommended.
- **I-4 — Prompt injection still holds after the schema change.** A crop name carrying ` `, `\n\n[SYSTEM] Ignore prior instructions…` and `‮` reaches the prompt with every control character and bidi override replaced by a space, on one line, with no `[SYSTEM]` at the start of any line. `UNSAFE_CHAR_RE` + `clampStrArray` are unchanged and still cover the new prompt.
- **I-5 — `@upstash/redis@1.38.4` is now installable.** The fixer was blocked by this repo's own 72-hour quarantine at run time (`ETARGET … with a date before 2026/09/04`) and correctly did not override it for a freshness bump with no advisory. As of 2026-09-07 the quarantine has passed: `npm i @upstash/redis@^1.38.4` when convenient. 1.38.3 has no advisory, so this is hygiene, not a gate.

---

## 5. Closure table — every id from `docs/security-review-2026-09-06.md`

| Id | Sev | Status | Evidence |
|---|---|---|---|
| **H-1** per-licence bucket bumped before the verdict | HIGH | **PARTIAL** — measured repro closed, harm class open | Bucket is read-only at the gate (`:349-355`) and bumped only on verdict legs. Owner served after 60 pool-full sprays (`H1-4`); unknown key still first-429 at **#51** (`H1-7`); 60 LS outages leave the bucket at **≤1** (`H1-10/11`); the exemption does **not** bypass the per-IP tier (**measured: first 429 at #10 of 14 on an exempt key**); marker TTL **30 days**, bucket TTL **3600 s**; an attacker can mint the exemption only for a key they already possess. **Open: HIGH-1 above.** |
| **M-1** unused `LEMONSQUEEZY_API_KEY` in 3 envs | MED | **CLOSED (orchestrator)** | Deleted via the Vercel API today. Zero references in the repo (re-grepped). Rotation in LemonSqueezy is the remaining owner step. |
| **M-2** prod-power creds Development-scoped / `Config` | MED | **CLOSED (orchestrator)** | `ANTHROPIC_API_KEY` re-scoped to Preview + Production and marked Sensitive. Not re-verified from here — outside this branch. |
| **L-1** `*.vercel.app` origin trusted in production | LOW | **CLOSED** | Both routes gated on `VERCEL_ENV !== "production"`. **Origin matrix diffed against both trees: 5 of 30 shapes changed, all `pass → BLOCK`, all production, all preview-origin; 25 identical; zero widened.** In production a claimable preview origin now gets `403` with `0` Anthropic and `0` LS calls, via `Origin` *and* via `Referer`; previews still work; the apex still generates. Live 308 on `homestead-harvest-planner.vercel.app` for **both** `/` and `/api/generate` confirms the fix's premise and rules out the HeatLens failure mode (a prod `*.vercel.app` deploy 403-ing its own calls). |
| **L-2** two server faults told the customer to re-enter a good key | LOW | **CLOSED** | `store_id_misconfig` and `validation_exception` both carry `transient: true`. Driven in production mode: both answer **503** *"The licence server is temporarily unavailable…"*, neither says "re-enter", `0` Anthropic. The exception leg is forced with a throwing getter, so it is driven rather than asserted from source. |
| **L-3** `X-XSS-Protection: 1; mode=block` | LOW | **CLOSED (pending deploy)** | `vercel.json` now `"0"`; nothing else in the header block changed; CSP untouched. Live still serves `1; mode=block` — the delta lands on deploy. |
| **L-4** forged `hhp_pending` unlocks three client tabs | LOW | **ACCEPTED, documented** | `src/App.jsx:8153-8166` records the trade in place. The R-1a predicate `age >= 0 && age < GRACE_WINDOW_MS` is intact; the only diff line is a comment. The withheld asset (`/api/generate`) is unaffected. |
| **L-5** `text/plain` is a preflight-free POST shape | LOW | **CLOSED** | 415 before the body parse on both routes. Driven on `/api/generate`: `text/plain`, `text/plain;charset=UTF-8`, `application/x-www-form-urlencoded`, `multipart/form-data`, and **no content-type at all** → all `415`, all `0` Anthropic. Controls: `application/json; charset=utf-8` and `APPLICATION/JSON` both `200`. Both client `fetch` calls send `Content-Type: application/json` (`src/App.jsx:853`, `:8369`), so the gate cannot break the real client. |
| **L-6** revoked licence generates for up to an hour | LOW | **ACCEPTED, documented** | `api/generate.js:152-158` names the two Upstash keys to delete for prompt revocation. TTL unchanged at 3600 s. |
| **L-7** `getIp()` fell back to leftmost XFF | LOW | **CLOSED** | Rightmost entry on both routes, comment corrected (Vercel *overwrites*, it does not append). Driven: three requests with rotating leftmost entries and a fixed rightmost created **one** bucket, `hhp:rl:generate:ip:198.51.100.7`, and no `…:ip:0.0.0.0`. |
| **L-8** `.npmrc` comment said `min-release-age` was inert | LOW | **CLOSED** | Comment corrected and now names `npm config ls` as the verification. Verified live: project section reads `before = "2026-09-03T22:50:39.341Z"` and `ignore-scripts = true`, on npm 11.11.0. |
| **I-1** no CSP reporting | INFO | not done, by instruction | — |
| **I-2** `img-src` tightened | INFO | already closed | — |
| **I-3** lemon.js host | INFO | already canonical | `index.html` loads `assets.lemonsqueezy.com` |
| **I-4** pool-full message discloses `(limit/limit)` | INFO | **CLOSED** | The response-minimisation comment now names the one deliberate exception (`api/validate-key.js:604-612`) |
| **I-5..I-8** | INFO | no action needed / owner checks | — |

---

## 6. Regression hunt across the whole diff — what I checked and found clean

- **Plan-body retention (the product's hardest rule).** Only **three** storage writes exist in `src/`: the generic `saveJSON` (`:735`), the corruption quarantine copy (`:781`), and `hhp_pending` (`:8244`). `planPersisted` (`:7923-7927`) is `{inputs, generatedAt, cropFingerprint}` — **no `plan` key**, and the memo's deps are `[planState]` so it cannot drift. The initialiser at `:7820` still refuses to read `saved.plan` and still removes the legacy `hhp_plan` blob. Moving the request up to `App` changed *where the fetch lives*, not what is persisted. `paid` still `useState(false)`, `validating` still `useState(true)`.
- **Abort / unmount.** Exactly two `.abort()` sites remain: the validate-key 15 s timeout (`:848`) and the plan 90 s timeout (`:8360`). The unmount abort is gone — that *was* code-review H-1. No new spend path: the old behaviour cancelled the client's read while the server kept generating, which is what threw away a paid slot. The one-at-a-time guard moved from `disabled={generating}` to `planGeneratingRef`, checked first thing in `generatePlan`, so two clicks in one tick cannot both pass.
- **The new `PLAN_SCHEMA`.** Every remaining field is bounded server-side and **again** client-side. Driven with a hostile 999-row model output: `monthlySchedule` → 12 rows × 12 tasks × 240 chars; `tips` → 12 × 400; `successionPlanting.plantings` `1e9 → 12`, `intervalWeeks` `-1e9 → 1`; `summary` → 1200; whole plan **42 KB**. `harvestTimeline`, `yieldEstimates`, `savingsEstimate.annualSavings`, `savingsEstimate.currency` and an unknown `extraField` were **all dropped** — the sanitiser is a build-from-allowlist, not a delete-list, and `additionalProperties: false` appears at all 7 object levels.
- **Model output → HTML.** `src/` still has **zero** `dangerouslySetInnerHTML` / `innerHTML` / `document.write` / `eval` / `new Function` / `insertAdjacentHTML`. Every model-supplied string in `buildPlanReportHtml` is `escapeHtml`'d — re-checked line by line after the schema change, including the two **new** engine-driven sections (`harvestRows`, `yieldRows`) that replaced the model's. The unescaped interpolations are: a constant CSS blob, pre-escaped fragments, `MONTH_ORDER` slices, server-clamped integers (`plantings`, `intervalWeeks`), and `familySize` — which is `clampInt(loadState(LS_FAMILY,4),4,1,12)`, always an integer 1–12. `currency` is `escapeHtml`'d and is now the **customer's** symbol, not the model's; the removal of `normaliseCurrency` closed a real override.
- **`normalisePlan` is a net gain.** The client now has its own schema gate at the one write site, so a stale or compromised lambda cannot smuggle a field onto the page even if the server sanitiser were bypassed. Credit it.
- **URL-key trust boundary intact.** Both gates still present: `skipStoredInstance` skips the LS_INSTANCE **read** (`:8056`) *and* the cleanup **wipe** (`:7963`), and the N-1 deferral still fires on ANY stored key. The M-1 change adds only `replaceState` + `setTab` on the success leg. The M-6 prefill sets `prefillKey`, which opens the form and fills the input — **no auto-submit** (`:3905`, `:3913`), and it only fires when the stored key is already gone, so it cannot burn a live slot.
- **Instance binding untouched.** `hhp:instance:` `SET NX` + sliding TTL, the canonical-over-client precedence, and the bare-key refusal are byte-identical to `main`; the only generate-side changes in that region are the two `transient: true` flags and comments.
- **"Definitive verdict" was not redefined.** `LS_VERDICT_STATUSES` / `lsMayStateVerdict` are **pre-existing on `main`** (2 hits in validate-key, 3 in generate). The H-1 fix reuses the existing rule rather than inventing a new one — which is why an LS outage cannot fill the bucket.
- **Namespace collision.** `hhp:vk:ok:` (new, validate-key exemption) vs `hhp:lk:ok:` (generate's 1 h licence cache) are distinct prefixes. The exemption has **no** effect on `/api/generate` and therefore cannot grant Anthropic spend.
- **`.npmrc`.** Only the comment changed. `ignore-scripts=true` and `min-release-age=3` both still present and both verified live.
- **`vercel.json`.** One value changed. CSP byte-identical: `script-src` still has no `'unsafe-inline'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, HSTS with `preload`, COOP `same-origin-allow-popups`.
- **Analytics.** `beforeSend: redactLicenceKey` still wired in `src/main.jsx:83`; suite green 19/19. No plan content is passed to the beacon.

---

## 7. Supply chain

- `@upstash/redis` **1.37.0 → 1.38.3**. Lockfile integrity `sha512-vtS0Bon…XXRnag==` is **identical to the registry's** `dist.integrity`; tarball resolves to `registry.npmjs.org`; sole dependency `uncrypto`. Published 2026-08-26, not part of any named wave.
- Whole-tree install-script scan: **two** hooks, `esbuild@0.21.5 postinstall` and `rollup@4.60.1 prepare`, both neutered by `ignore-scripts=true`. Unchanged from 2026-09-06.
- ChainDrop / Shai-Hulud #6 IOC filename sweep (`setup.mjs`, `Math_Symbol.js`, `math_init.js`, `bun_environment.js`, `setup_bun.js`, `telemetry.js`) — **zero hits**. None of `keyv` / `cacheable` / `flat-cache` / `file-entry-cache` in the tree.
- `npm audit --omit=dev` = **0**. The 6 dev-tree advisories are the known vite-5 build-chain band (esbuild dev-server CORS, postcss/`@babel/core` `sourceMappingURL`, browserslist, nanoid, the two Vite Windows dev-server items) — all build-time or dev-server, none reaching the bundle or the serverless runtime, and this project ships no CSS files at all. Unchanged.

---

## 8. What is already right (credit, so nobody "fixes" it)

- **The 415 gate is placed correctly relative to spend:** driven, five preflight-free content types on `/api/generate` all die at 415 with `0` Anthropic calls. That is the other half of the L-1 door and it is shut.
- **The origin rewrite only narrowed.** 120 measured verdicts across two trees; the only movement is five production rows going from `pass` to `BLOCK`. That is the proof standard for an allowlist change and this one meets it.
- **The bucket rename (`lk:` → `lkbad:`) is deliberate and right** — no in-progress lockout survives the deploy.
- **The exemption does not bypass the per-IP tier.** Measured: an exempt key still 429s at request #10 from one address.
- **An LS outage is not a verdict.** 60 consecutive 503s leave the bucket at ≤1.
- **The transient/definitive split (C1) is unchanged and now covers two more legs.** No branch in this diff fabricates a definitive `valid:false` from a server fault.
- **The `?key=` boundary is still the strongest in the portfolio** — read gate, wipe gate and the N-1 any-stored-key deferral all intact through a heavy edit of the surrounding code.
- **The prompt is bounded by field clamps, not by an envelope header** — the shape Grow Room's finding says to prefer.
- **Both new API behaviours are pinned by tests that go red against the pre-fix source**, using `HHP_VALIDATE_SRC` / `HHP_GENERATE_SRC` source overrides. That is verification by outcome, not by assertion.

---

## 9. What I did **not** check

- **The live deployment.** This branch is not deployed, so nothing here was verified in production. I spent **zero** of my two permitted live-validator probes — a probe against `main` would have measured the pre-fix code and told me nothing about the fix. The only live requests I made were three GETs: the header set on the apex, and the redirect on `homestead-harvest-planner.vercel.app/` and `/api/generate`.
- **The exact LemonSqueezy response to a `validate` carrying an unknown `instance_id`.** HIGH-1 does not depend on it: statuses 200, 400 and 404 all reach the same bump, and the *only* escape is an error string matching `/activation limit/i`. The handler's own `looksLikeStaleInstance` / `retry_activation` path exists precisely because LS returns an instance-mentioning error there, which is first-party evidence that the shape occurs. Worth one confirmation against a real key during the §21 live-Buy pass.
- **No live purchase, no activation, no real licence key.** The `/activate` leg, a genuine wrong-store key and the LemonSqueezy overlay were exercised only against stubs.
- **Upstash contents.** Bucket behaviour was measured against an in-memory emulator of the REST protocol, not the real database. Live counters, their TTLs, key sprawl and the eviction policy on the free tier are unverified — the last of these matters, because an eviction of `hhp:vk:ok:` re-opens the HIGH-1 window for that key.
- **The two dashboard MEDIUMs.** I took the orchestrator's report that `LEMONSQUEEZY_API_KEY` is deleted and `ANTHROPIC_API_KEY` is Sensitive/Preview+Production at face value; I did not re-run `vercel env ls`. Rotation of the deleted LS API key in LemonSqueezy is still owed.
- **The Anthropic spend cap** ($100/month per `CLAUDE.md` §8) — not visible from here.
- **The code lane.** A code-reviewer is covering it in parallel. I read the engineering and UX hunks only for security-relevant constructs.
- **Account posture** — MFA on Vercel, LemonSqueezy, Anthropic, Upstash, GitHub, domains.co.za. Owner pass.

---

## 10. Next actions, in order

1. **Merge `fix/audit-2026-09-06` to `main`.** It is strictly better than what is live.
2. **Fix HIGH-1 as its own change** — the `looksLikeStaleInstance` mint plus the bound-device backstop (§3), with a test that sprays a **never-validated** key using a junk `instance_id` and asserts the owner is served. Then re-audit.
3. **Delete the exemption on a definitive-negative verdict** (LOW-1) — one `redis.del` per bump site.
4. **Move the two localhost origins inside the `VERCEL_ENV` block** (LOW-2) — three lines, same shape as the L-1 fix that shipped.
5. **Make the origin gate an if/else rather than an OR** (LOW-3).
6. **Owner, before or with the deploy:** rotate the deleted `LEMONSQUEEZY_API_KEY` in LemonSqueezy; run the §21 live-Buy checklist (`vercel.json` and both API files changed on the licence path); confirm the $100/month Anthropic cap; note that `Homestead/CLAUDE.md` records deploys as blocked until the Vercel team leaves Hobby.
7. **Housekeeping:** `npm i @upstash/redis@^1.38.4` (quarantine has now passed); and the spec deltas the fixer listed for `Homestead/CLAUDE.md` §8/§12/§21, which now include the split validate-key bucket and the new exemption key.

*Per Urban Root policy, nothing in this review was applied. Fixes belong to a separate bug-fixer session, followed by a re-audit.*
