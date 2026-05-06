# Homestead Round-3 Code Review — 2026-05-06
**Tip audited:** 255291a on main
**Auditor:** code-reviewer agent
**Auditor time:** 2026-05-06T11:22:08
**Verdict:** NEEDS-CHANGES

## Summary
Two HIGH security/correctness regressions, three MEDIUM consistency / UX issues, and seven LOW polish items. Build clean (`npm run build` → 388.28 KB raw / 109.74 KB gz, 33 modules). Five of six post-launch commits (`580dc93..255291a`) verifiably correct in their stated intent; the URL-key slot-burn fix (`4f862e1`) closes its threat model cleanly and the contract migration (`255291a`) faithfully preserves prior behaviour. The two HIGH findings are not regressions introduced by `255291a` itself — they were pre-existing latent bugs that the contract migration's `console.warn` now makes more observable and that the audit's "what should have been caught earlier" lens surfaces. C1 is a 1-line edit (4-arg call to a 3-arg function silently clamping `qty` to 1). H1 is a multi-line refactor of `api/generate.js` cache ordering. The other items are content-drift (companion pair counts) and minor polish.

Totals: 0 CRITICAL / 2 HIGH / 3 MEDIUM / 7 LOW = 12 findings.

---

## CRITICAL (0)

None.

---

## HIGH (2)

### H1: Licence cache short-circuit bypasses the new canonical-instance gate
**File:** `api/generate.js:153-160`
**Severity:** HIGH (security: paid-feature DoS / cost-control bypass against legit customer)

**What:** `validateLicence(key, instanceId)` reads the 1-hour Upstash cache (`hhp:lk:ok:<licenceHash>`) BEFORE consulting the canonical-instance binding. Cache hit short-circuits to `{ ok: true, fromCache: true }` (line 156). The instance check at lines 167-192 — the security-critical change introduced in `1748b2c` ("device-cap bypass") — is only consulted on cache miss. The comment at lines 184-187 claims "generate.js no longer accepts a bare-key call even during the client-side 48h grace window", but for the entirety of the 1-hour cache window after any successful validate, that claim is false.

**Reproduce / Attack scenario:**
1. Legit customer hits `/api/generate` from device A at T=0. Server validates against LS, NX-binds canonical instance, and writes `hhp:lk:ok:<hash>="1"` with 3600s TTL.
2. Attacker (with stolen / phished licence key) calls `/api/generate` from device B at T=10 minutes, sending `instanceId=""` (or any random value).
3. Cache hit at line 155 → returns `{ ok: true }` immediately. Canonical-instance check, store_id check, and LS_VALIDATE call are all skipped.
4. Per-licence rate-limit (line 616) increments the customer's 20/24h bucket. Anthropic credits burn against the legit customer's quota.
5. After 20 calls the customer is locked out of plan generation for 24 hours via their own rate limit.

**Why it matters:** The audit fix in `1748b2c` (and its rebrand in `255291a` to `{ ok, reason }`) was supposed to prevent exactly this — a cleared `hhp_instance` pretending to be a fresh device while burning Anthropic credits without binding. The cache short-circuit makes the new gate effectively unenforced for warm caches. The threat is not "attacker generates plans" — they get rate-limited within 20 calls — but "attacker DoS's legitimate customer's daily plan quota". $39.99 product, 20-plan/day limit, 1-hour cache means an attacker with a leaked key can drain the customer's daily allotment in the time it takes to send 20 HTTP requests.

**Fix:**
```js
async function validateLicence(key, instanceId) {
  if (!key || typeof key !== "string" || key.length < 8 || key.length > 128) {
    return { ok: false, reason: "bad_key_shape" };
  }
  const licenceHash = hashKey(key);
  const cacheKey = `hhp:lk:ok:${licenceHash}`;

  // Always consult canonical-instance binding FIRST, BEFORE the cache.
  // The cache encodes "this licence is currently valid in LS"; it does NOT
  // encode "this caller is authorised to generate". The canonical-instance
  // gate is the per-caller authorisation check.
  const clientInstanceId = (typeof instanceId === "string"
    && instanceId.length > 0 && instanceId.length <= 64) ? instanceId : "";
  let canonicalInstanceId = "";
  if (redis) {
    try {
      const stored = await redis.get(instanceBindKey(licenceHash));
      if (typeof stored === "string" && stored.length > 0 && stored.length <= 64) {
        canonicalInstanceId = stored;
      }
    } catch (e) {
      console.warn("[generate] instance binding read failed:", e?.message);
    }
  }
  // Once a canonical exists, EVERY caller must present an instance_id that
  // matches the canonical (or send no instance and have the canonical fill
  // in for them). A bare-key call with no canonical is rejected.
  const instanceIdForLs = canonicalInstanceId || clientInstanceId;
  if (!instanceIdForLs) {
    console.warn("[generate] no instance_id available — refusing to validate");
    return { ok: false, reason: "instance_missing" };
  }
  // (Optional but stronger): if a canonical exists AND the client sent a
  // DIFFERENT non-empty instance_id, log it as a mismatched-instance signal
  // for telemetry. The current code silently uses canonical and ignores
  // client's value.

  // Cache fast-path: if the licence is cached AND we have a valid canonical
  // (or first-bind client instance), trust the cache. This still skips the
  // LS round-trip but no longer allows bare-key bypass.
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return { ok: true, fromCache: true };
    } catch (e) {
      console.warn("[generate] licence cache read failed:", e?.message);
    }
  }

  // Cache miss: ask LemonSqueezy with instanceIdForLs (rest of function unchanged).
  ...
}
```

The key change is that the canonical-instance gate runs unconditionally before the cache returns `ok`. Cache still saves the LS round-trip; it just no longer overrides the per-caller authorisation check.

A simpler alternative: include `instanceIdForLs` in the cache key (`hhp:lk:ok:<hash>:<instance>`). That avoids reordering but means each instance pays for its own LS validation. Less DRY but more obviously correct.

---

### H2: `clampInt(b.qty, def.qty, 1, MAX_BEDS_PER_GROUP)` calls 3-arg function with 4 args — `qty` always loads as 1
**File:** `src/App.jsx:6699`
**Severity:** HIGH (data-loss regression on every page reload for users with multi-quantity beds)

**What:** `clampInt` is declared at line 304 with signature `(v, min, max)`. The bed-load sanitiser at line 6699 calls it with FOUR arguments: `clampInt(b.qty, def.qty, 1, MAX_BEDS_PER_GROUP)`. JavaScript silently discards the extra argument. The function reads `min = def.qty = 1` and `max = 1`, then applies `Math.max(1, Math.min(1, n))`. **Every bed quantity loaded from localStorage gets clamped to 1, regardless of its actual stored value.**

**Reproduce:**
1. Open the Soil Calculator. Set Bed 1 quantity to 5 via the Counter (`MAX_BEDS_PER_GROUP=20`). Watch results update.
2. Refresh the page.
3. Bed 1's quantity counter shows 1, not 5. Total volume / cost / soil amounts all collapse to a single bed's worth.

**Why it matters:** The Counter UI in `BedEditor` (line 1842-1844) supports up to 20 beds per group. Real homesteaders use this — the spec specifically supports multi-bed setups with shared dimensions. Round-1 finding `M3` ("MAX_BEDS_PER_GROUP constant") was added precisely so the LS sanitiser and UI cap stay in sync. The sanitiser is now silently lying: it accepts any stored value and clamps it to 1. Users lose their bed-quantity data on every refresh.

This is not introduced by `255291a` — the line `clampInt(b.qty, def.qty, 1, MAX_BEDS_PER_GROUP)` predates it (likely from `580dc93` or earlier) — but it's a high-impact silent data-loss bug that the prior audit rounds did not catch and that should be in the round-3 closure list.

**Fix:** Use `sanitizeNum` (which has the matching 4-arg signature) and round, OR keep `clampInt` but call with the right arg count.
```jsx
// Replacement (sanitizeNum + Math.round):
qty: Math.round(sanitizeNum(b.qty, def.qty, 1, MAX_BEDS_PER_GROUP)),

// OR (clampInt with correct 3 args, manual fallback):
qty: clampInt(b.qty ?? def.qty, 1, MAX_BEDS_PER_GROUP),
```

Strongly recommend a quick post-fix verification step: store a multi-qty bed, refresh, confirm qty persists.

---

## MEDIUM (3)

### M1: Hardcoded "153 pairings" copy contradicts data file (230 entries) and computed stat (line 2897)
**File:** `src/App.jsx:3143` ("164 extension-sourced pairings"), `src/App.jsx:3330` ("153 pairings"), `index.html:106` (JSON-LD: "153 pairings")
**Severity:** MEDIUM (marketing-copy drift; SEO concern; visible to every prospective customer)

**What:** `src/data/companions.js` contains 230 entries (verified by `grep -E "^  \{ a:" | wc -l`). The dynamic `SocialProofSection` (line 2893) correctly reads `COMPANIONS.length` and would display 230. But three separate hardcoded strings still claim:
- PricingSection feature bullet: **"82 crops, 164 extension-sourced pairings"** (App.jsx:3143)
- FAQ answer: **"Our 153 pairings are sourced from..."** (App.jsx:3330)
- JSON-LD FAQPage @schema.org: **"Our 153 pairings are sourced from..."** (index.html:106)

So a homepage visitor sees "230 companion pairings" in the stats row AND "164 extension-sourced pairings" three sections later AND "153 pairings" in the FAQ AND "153 pairings" in Google's rich-result preview (FAQPage JSON-LD).

**Why it matters:** Inconsistency makes the product look careless. Also, schema.org data feeding Google rich-results showing wrong numbers is mildly bad for SEO trust signals. Database has GROWN since these copies were written but never updated. Caught in earlier Aero-Calc audits as the "stat drift" pattern — one hardcoded number + one computed number means the hardcoded one rots while data evolves.

**Fix:** Replace all three hardcoded numbers with `${COMPANIONS.length}` (in JSX context) and a build-time export-to-html (or a generated comment in index.html JSON-LD that includes the count). The simplest defensible fix:
- App.jsx:3143 — change PricingSection's freeFeatures array to a function that templates with `COMPANIONS.length`.
- App.jsx:3330 — same for FAQ_ITEMS.
- index.html:106 — drop the specific number, say "Companion pairings sourced from university extensions and peer-reviewed studies".

---

### M2: Per-IP rate limit at 20/24h shares constants with per-licence — paying customer behind shared NAT can be DoS'd by neighbour spam
**File:** `api/generate.js:48-49, 587, 616`
**Severity:** MEDIUM (security & UX: shared-NAT customers get false 429s)

**What:** Line 48-49 declares `RL_MAX = 20` and `RL_WINDOW_SEC = 86400` (24 hours). The `rateLimitOK(suffix)` helper hardcodes both. Line 587 calls `rateLimitOK('ip:${ip}')` BEFORE licence validation; line 616 calls `rateLimitOK('lk:<hash>')` AFTER. Both buckets use the same 20-per-24h limit. The comment at line 585 claims "Tighter than the per-licence limit because it's pre-auth" — that comment is incorrect; they are identical.

Practical impact:
- A NATted home network (typical CGNAT mobile carrier IP, corporate proxy, university dorm, family with multiple devices) can have many distinct customers behind one IP. Per-IP 20/24h bucket caps ALL of them combined.
- A single legitimate customer who generates 20 plans across the day plus an attacker spamming bad keys against the same IP locks out the customer for 24 hours.
- An attacker deliberately spamming bad keys at midnight UTC against a known-target IP (e.g. revealed via a Reddit username) blocks the customer for the rest of the day.

The comment-vs-code drift is the smoking gun: someone intended the per-IP gate to be tighter than per-licence, but the implementation makes them the same. This means the per-IP gate's INTENT (stop bad-key spam) is mis-sized — it should be more like 60/h, not 20/24h.

**Why it matters:** $39.99 customers expecting plan generation get 429s with no recourse. They can't tell whether they hit their own limit or a neighbour's. The error message at line 589-591 says "Too many attempts from this network", which leaks the per-IP gate's existence — but that doesn't help the customer. They must wait up to 24 hours.

This is also a regression-by-omission of the round-1 audit ("rate limit / cost control"): the audit accepted the rate limit but didn't separately verify that the per-IP and per-licence buckets had different sizes.

**Fix:** Two separate constant pairs.
```js
// Per-licence (cost control: 20 plans/24h is generous for a $40 product).
const RL_LICENCE_MAX = 20;
const RL_LICENCE_WINDOW_SEC = 86400;

// Per-IP pre-flight (anti-abuse: cap bad-key spam without throttling
// legit customers behind shared NAT). 60/hour is plenty for a single user
// hitting Generate; 24h for paying licence is a separate concern.
const RL_IP_MAX = 60;
const RL_IP_WINDOW_SEC = 3600;

async function rateLimitOK(suffix, max, windowSec) { ... }

// Then:
if (!(await rateLimitOK(`ip:${ip}`, RL_IP_MAX, RL_IP_WINDOW_SEC))) ...
if (!(await rateLimitOK(`lk:${hashKey(licenseKey)}`, RL_LICENCE_MAX, RL_LICENCE_WINDOW_SEC))) ...
```

---

### M3: vercel.app→custom-domain redirect only catches the canonical Vercel URL, not preview-deploy URLs that GSC may have indexed
**File:** `vercel.json:2-11` (added in `d0e877e`)
**Severity:** MEDIUM (the stated motivation of the commit — fix GSC duplicate-content reports — is only partially achieved)

**What:** The redirect rule matches host `homestead-harvest-planner.vercel.app` exactly. Vercel auto-assigns several other hostnames per project:
- `homestead-harvest-planner-git-main-<owner>.vercel.app` (per-branch alias)
- `homestead-harvest-planner-<hash>.vercel.app` (per-deployment alias)
- `homestead-harvest-planner-<owner>.vercel.app` (project alias on some plans)

Any of these may have been indexed by Google in the past — the `vercel.json` redirect only catches the canonical one. The commit `d0e877e` was specifically named "Redirect *.vercel.app → custom domain to fix GSC duplicate-content reports", which implies the author expected wildcard matching but configured exact matching.

Note: validate-key.js's `isAllowedOrigin` uses regex `/^https:\/\/homestead-harvest-planner[a-z0-9-]*\.vercel\.app...` which DOES match all three formats. So the API allowlist is wider than the redirect.

**Why it matters:** GSC duplicate-content reports may persist if Google still has indexed entries for branch/deployment Vercel URLs. The redirect should catch all of them.

**Fix:** Use `value` as a regex (Vercel supports it):
```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [
        { "type": "host", "value": "(?:.*\\.)?homestead-harvest-planner[a-z0-9-]*\\.vercel\\.app" }
      ],
      "destination": "https://thehomesteadplan.com/:path*",
      "permanent": true
    }
  ]
}
```
Verify in production with curl on the branch URL after deploy.

Alternative if regex isn't supported in `value`: list each known Vercel host explicitly. Less elegant but more obvious.

---

## LOW (7)

### L1: `setTimeout` on line 7109 has no cleanup; reference held until callback fires after unmount
**File:** `src/App.jsx:7109`
**Severity:** LOW (memory leak; only fires once, only 8s after mount; harmless in practice)

**What:** The 8-second LS-SDK-give-up timer is created with `setTimeout(...)` on line 7109 but the cleanup function on lines 7112-7115 only `clearInterval(pollHandle)`. The setTimeout's callback is never cleared. If the component unmounts before 8 seconds (e.g. in dev StrictMode mount/unmount/remount), the callback fires on a stale closure. The callback only does `if (pollHandle) clearInterval(pollHandle); pollHandle = null;` — both `pollHandle` is a closed-over-let so the post-cleanup callback no-ops. So no actual bug, but the pattern is sloppy.

**Fix:**
```jsx
const giveUpHandle = setTimeout(() => { ... }, 8000);
return () => {
  cancelled = true;
  if (pollHandle) clearInterval(pollHandle);
  clearTimeout(giveUpHandle);
};
```

---

### L2: Sitemap `public/sitemap.xml` missing `#self-sufficiency` and `#growing-plan` paths; `lastmod` stuck at 2026-04-17
**File:** `public/sitemap.xml`
**Severity:** LOW (minor SEO; Self-Sufficiency was split into its own tab post-launch but sitemap not updated)

**What:**
- Sitemap lists `/`, `/#soil`, `/#companion`, `/#planting-dates`, `/#features`, `/#pricing`, `/#faq`, plus four legal HTML pages.
- Missing: `/#self-sufficiency`, `/#growing-plan`, `/#crops`, `/#cost-savings`, `/#preservation`. The first is the marketing-critical hero tab; the rest are paid tabs where a sitemap entry indicates "this page exists at this URL" to crawlers (paid content gated client-side, but the URL itself is public).
- Every `lastmod` is `2026-04-17` — multiple post-launch UI/security changes since then (the 6 commits in scope of this audit alone) but sitemap unchanged.

**Why it matters:** GSC ranking signal that the site is being maintained. Stale sitemap dates suggest abandonment to crawlers.

**Fix:**
- Add `<url><loc>https://thehomesteadplan.com/#self-sufficiency</loc>...` for the missing public-facing tabs. Don't list paid tabs (their content gates paid-only — putting them in the sitemap doesn't hurt, but they're behind a paywall so the SEO value is zero).
- Update all `<lastmod>` to today, or to the last meaningful content change date per page.
- Consider auto-generating sitemap.xml at build time from `TABS` array.

---

### L3: FAQ JSON-LD claims "153 pairings"; mirrors copy in App.jsx (already flagged as M1)
**File:** `index.html:106`
**Severity:** LOW (subset of M1 — listed separately so the index.html edit isn't missed when fixing M1)

**What:** Same content drift as M1, but in `index.html` JSON-LD which feeds Google's rich-result preview. Fixing the App.jsx FAQ_ITEMS doesn't update index.html — the JSON-LD is duplicated. Either keep them in sync manually (and document that), or generate JSON-LD at build time from the FAQ_ITEMS array.

**Fix:** Drop the specific number from index.html FAQ JSON-LD (say "Our pairings are sourced from university extensions..."), since updating two places is a maintenance trap.

---

### L4: `cropFingerprint` falls silently to `""` if `crypto.subtle.digest` fails (older browsers / non-HTTPS); stale-plan banner stops working
**File:** `src/App.jsx:3974`
**Severity:** LOW (no crash, but UX confusion: if SHA-256 fails for any reason, the regenerate-confirm dialog says "you already have a fresh plan" even when crops have changed; no banner appears)

**What:** Line 3974 has `.catch(() => { /* crypto.subtle failure - leave "" */ })`. If the digest fails, `currentFingerprint` stays as `""`. Then `fingerprintStale = !!plan && !!currentFingerprint && ...` becomes false, so the banner never shows. The regenerate confirm dialog (line 3998) only fires when `plan && !fingerprintStale` — so a user changing crops would see "you already have a fresh plan" and either cancel (stays stale) or click confirm (burns rate-limited generation slot).

**Why it matters:** `crypto.subtle.digest` requires a secure context (HTTPS or localhost). Production is HTTPS so this is fine in production. But if a user opens the dist HTML over `file://` (after a download attempt? Browser policies vary), or in any other non-secure context, the fingerprint silently fails.

**Fix:** Surface a console warning in the catch + if `currentFingerprint` is "" because of a digest failure (vs because the effect hasn't run yet), set a flag and skip the regenerate-confirm. OR (simpler): use a non-cryptographic hash (e.g. a deterministic hash of the JSON string via a 5-line implementation of djb2 or similar). The fingerprint isn't security-critical — it's a "did inputs change" detector.

---

### L5: validate-key.js console.error("[validate-key] error:", e) logs the full exception object; may include request body
**File:** `api/validate-key.js:194`
**Severity:** LOW (operational hygiene; minor PII leak risk)

**What:** Compare line 194 (`console.error("[validate-key] error:", e);` — full object) with `api/generate.js:724` (`console.error("[generate] handler error:", e?.message, e?.code);` — message + code only). The validate-key handler logs the full exception, which on some runtimes includes the request body in the stack trace's contextual info or the error's `cause` chain. Licence keys are 36-char hex strings so this is mildly sensitive (Vercel logs are private to the project owner, but log-aggregation services may receive them).

**Fix:** Match the safer pattern used in generate.js: `console.error("[validate-key] error:", e?.message, e?.code);`.

---

### L6: `/api/generate` `body.licenseKey` (camelCase) and `/api/validate-key` `body.key` use different conventions — minor footgun for future endpoints
**File:** `api/generate.js:597-598`, `api/validate-key.js:109-110`
**Severity:** LOW (API hygiene; nothing currently broken)

**What:** Two endpoints, two conventions for the same conceptual field:
- `validate-key.js` reads `body.key`, `body.instance_id`, `body.instance_name` (snake_case).
- `generate.js` reads `body.licenseKey`, `body.instanceId` (camelCase).

The client respects each convention correctly so nothing is broken. But anyone adding a new paid serverless function will copy from one or the other and get inconsistent shapes across the surface.

**Fix:** Pick one convention (camelCase for JS-to-JS APIs is the React-ecosystem default) and document it in a comment at the top of each handler, or migrate validate-key.js to camelCase in a future commit. Not urgent.

---

### L7: `redis.set(..., { nx: true })` for canonical-instance binding has a known race window during cache-eviction-and-retry
**File:** `api/generate.js:241-244`
**Severity:** LOW (corner case; only manifests if the canonical key is evicted by Redis memory pressure mid-flight)

**What:** The NX-write at line 241 only succeeds if the canonical key doesn't exist. The lookup at line 172 reads the canonical and stores `canonicalInstanceId`. If between the read (line 172) and the write (line 241), Upstash evicts the canonical key (memory-pressure eviction is rare on Upstash's hobby tier but possible), the canonical is treated as "present" by the local variable but the NX-write succeeds (writing the post-eviction client instance as the new canonical). Two distinct devices sharing a key during this race window can now both have their instances bound.

This is an extreme corner case and Upstash hobby tier is unlikely to evict. Documenting as a known limitation rather than something to fix.

**Fix (if desired):** Use a Redis transaction or Lua script (Upstash supports both via `eval`) to do the read+write atomically. Probably not worth it for this product's scale.

---

## Verified clean (anti-regressions)

- **V1 — V2 paywall persistence (`hhp_plan_v2`)**: Plan body is never persisted. Only `{inputs, generatedAt, cropFingerprint}` written via `persistState(LS_PLAN_V2, ...)` at line 6924. Mount-time `localStorage.removeItem("hhp_plan")` at line 6839 wipes legacy. Plan body initialised to `null` on every mount (line 6868). Anti-regression comment at lines 6917-6922 explicit. No regression.
- **V2 — URL-key slot-burn defence (Findings #1+#2)**: Mount effect line 7001 calls `attempt(urlKey, "", { skipStoredInstance: true })`. validateKeyRemote at line 559-565 forces `instance_id: undefined` when `opts.skipStoredInstance`. Cleanup-write at line 6963-6968 gated on `!skip`. Both gates verified present and correctly wired.
- **V3 — `validateLicence` contract migration to `{ok, reason}` (`255291a`)**: All return-path values replaced byte-for-byte. The handler at line 606-610 logs `reason` to telemetry only and never echoes to the user-visible response body. Per-callsite trace: line 149 (`bad_key_shape`), 191 (`instance_missing`), 200 (`ls_unreachable`), 203 (`ls_api_error`), 207 (`licence_inactive`), 217 (`store_id_misconfig`), 222 (`store_mismatch`), 256 (`validation_exception`). All 8 paths are `ok: false` exits with a slug. Success path returns `{ ok: true }` (line 253) or `{ ok: true, fromCache: true }` (line 156) — both work correctly with the call site `if (!licenceResult.ok)` check at line 607.
- **V4 — `activateKey` contract migration to `{ok, error?}` (`255291a`)**: The bridge in App's `onActivate` lambda at line 7301-7302 correctly surfaces errors via `setKeyError(result.error)`. Internal `setActivating(false)` runs in finally regardless of return path. `setKeyError("")` cleared at the start (line 7135) so user typing a fresh key after a previous error sees the cleared error before activation completes. The PaywallOverlay's `handleSubmit` (line 3466-3470) doesn't read the return value — that's correct, all error surfacing is via the prop-driven `keyError`.
- **V5 — Origin allowlist on both serverless funcs**: validate-key.js:46-57 and generate.js:70-82 both check `Origin` AND `Referer`, both accept production + localhost + Vercel preview regex. Generate.js comment at line 28-29 explicitly excludes preview deploys due to Anthropic spend; verified by reading the regex.
- **V6 — CSP locked**: vercel.json:21 has `connect-src 'self' https://api.lemonsqueezy.com https://app.lemonsqueezy.com https://vitals.vercel-insights.com https://va.vercel-scripts.com` — no `*.lemonsqueezy.com` wildcard in connect-src. frame-src wildcard kept for store-subdomain checkout iframes. form-action restricted to LS subdomains. base-uri 'self', frame-ancestors 'none', object-src 'none'.
- **V7 — Canonical alignment**: index.html:18 (`canonical`), :23 (og:url), :29 (twitter:url), :40 (JSON-LD url) all point to `https://thehomesteadplan.com/`. Sitemap:4 same. Robots.txt:5 same. Legal HTMLs (terms/privacy/refund/contact) line 11 each: same. No drift.
- **V8 — `--tx3` colour token alignment**: `T.tx3` in App.jsx is `#7A6E5F` (line 21). Legal HTMLs all set `--tx3:#7A6E5F` (line 19 of each). Matches. No regression.
- **V9 — `escapeHtml` on every model-rendered string in `buildPlanReportHtml`**: Verified each interpolation: `escapeHtml(m.month)`, `escapeHtml(t)` for tasks, `escapeHtml(b.bedName)`, `escapeHtml(c)` for bed crop chips, `escapeHtml(b.notes)`, `escapeHtml(s.crop)`, `escapeHtml(s.note)`, `escapeHtml(r.crop)` for harvest timeline, `escapeHtml(y.crop)`, `escapeHtml(y.unit)`, `escapeHtml(y.note)`, `escapeHtml(p.crop)`, `escapeHtml(p.freshShare)`, `escapeHtml(m)` for preservation methods, `escapeHtml(p.note)`, `escapeHtml(plan.summary)`, `escapeHtml(plan.savingsEstimate.currency || currency)`, `escapeHtml(s)` for top-savers, `escapeHtml(plan.savingsEstimate.note)`, `escapeHtml(t)` for tips, all metadata fields. Numbers (plants, intervalWeeks, plantings, annualSavings) interpolated raw — these are sanitisePlanShape-bounded integers/numbers and can't carry HTML.
- **V10 — Field decimal typing preserved**: line 670-700, local string state, commits on blur, not `parseFloat||0`. Self-heal at line 674. Skip-if-equal guards at all 5 known callsites: ProduceTargetField (981), Cost Savings price (5710), Soil component price (1581), Soil component pct (1602), BedEditor commitLen/commitDepth (1750-1759). All present.
- **V11 — Counter upper bound per use-site**: `Counter` default is `max=9999` (line 638); all known callsites pass an explicit cap (familySize: 12, bed qty: MAX_BEDS_PER_GROUP=20).
- **V12 — `parseIsoDate` Feb 30 round-trip rejection**: Line 423-435; round-trip check on `getFullYear/getMonth/getDate` correct. Returns null on any mismatch.
- **V13 — `formatDate` instanceof guard**: Line 394 `if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "-";`. Hardens against accidental string/number passes.
- **V14 — Bag estimates always `Math.ceil`**: Line 1437-1439, 1709, 5808, 5809, 5812, 5816, 5819 — all use `Math.ceil`. No `Math.round` or `Math.floor` for bag/jar/batch counts.
- **V15 — L-shape guard `cutout < outer`**: Line 1406 `if (ol <= cl || ow <= cw || cl < 0 || cw < 0) return 0;` AND line 1419-1424 surfaces invalid-L flag separately so the user sees the warning.
- **V16 — Hemisphere shift +6 months**: getFrostDates line 416-419 only applies in zone mode (manual mode trusts user dates as literal). shiftMonths uses `setMonth` not epoch-ms. DST-safe.
- **V17 — visibilitychange referenceYear bump**: Lines 6934-6942 — `bumpIfStale` runs once on mount AND on every `visibilitychange`. setPlantingState only writes when `s.referenceYear < now`. Idempotent.
- **V18 — Mount unconditional `localStorage.removeItem("hhp_plan")`**: Line 6839, runs in useState lazy init; legacy key wiped on every mount.
- **V19 — Plan abort on unmount**: Lines 3866-3884 — beforeunload + cleanup both call `abortControllerRef.current.abort()` and `URL.revokeObjectURL(blobUrlRef.current)`. Effect deps `[]` correct.
- **V20 — `loadState` always `try/catch JSON.parse`**: Line 527-534. Every numeric load passes through `sanitizeNum` or `clampInt` (mostly correctly — H2 is the exception).
- **V21 — Hash routing**: VALID_TABS at 6631 derived from TABS. resolveHash at 6637 (HASH_ALIASES is empty after self-sufficiency split, intentional). Mount + popstate + hashchange listeners all wired with cleanup at lines 7155-7188.
- **V22 — Bad-key URL replaceState to #growing-plan**: Lines 7017-7020 — guarded `replaceState({tab:"growing-plan"}, ...)` BEFORE `setTab`. Bookmark/refresh/copy-link all land on paywall.
- **V23 — `validating` gates paid render**: Line 7287-7289 (`activeTab.paid && validating`) shows ValidatingOverlay. Line 7290 (`activeTab.paid && !validating && !paid`) shows PaywallOverlay. Line 7307+ paid+!validating+paid shows actual paid content. Three-state machine is correct.
- **V24 — LS Setup callback writes LS_PENDING with timestamp**: Line 7089 — sets `Date.now()`. Grace window check at line 7044-7053 reads `Number(loadState(LS_PENDING, 0))` and clamps `age < GRACE_WINDOW_MS`.
- **V25 — `clearLS(LS_INSTANCE)` only on stored-key retry path** (NOT URL-key): Line 6963 gated on `!skip`. Line 7037 unconditional in stored-key fail path. URL-key path never wipes (line 6996-7000 comment).
- **V26 — Companion matrix CSS Grid (post-`ee68529`)**: Verified deterministic uniform cell sizing via gridTemplateColumns at line 2093. role="grid" + aria-rowindex/aria-colindex/aria-rowcount/aria-colcount all present. cellBox object reused for all cells (width/height/min/max all same).
- **V27 — `escapeHtml` handles non-string types**: Line 4631 `const str = typeof s === "string" ? s : String(s);`. "0" survives the prior fix.
- **V28 — sanitisePlan/sanitisePlanShape mirrored**: Both are at api/generate.js:501-559 and src/App.jsx:3775-3837. The client-side `sanitisePlanShape` is used in case of cache rehydrate (though plan body never persists; this is dead-code-but-defensible for any future migration that does cache plan body — which the CLAUDE.md explicitly forbids; nevertheless the function is harmless if unreachable).
- **V29 — Forced tool-use on Anthropic**: generate.js:660 `tool_choice: { type: "tool", name: "submit_growing_plan" }`. Schema at 334-439 has `additionalProperties: false` at every level. Model alias bare `claude-sonnet-4-6` at line 40.
- **V30 — Build clean**: `npm run build` succeeds in 695ms with 33 modules transformed, 388.28 KB raw / 109.74 KB gzipped. No warnings.
- **V31 — No client-side console.log of secrets**: Five console.error/warn in src/, all just exception messages. No PII logged.
