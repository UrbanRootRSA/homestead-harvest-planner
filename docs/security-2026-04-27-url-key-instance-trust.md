# Security Audit — URL-Key `instance_id` Trust-Boundary Defect Family

**Product:** The Homestead Plan (homestead-harvest-planner)
**Date:** 2026-04-27
**Auditor:** security-auditor (Urban Root)
**Audit target:** working tree at `C:\Users\User\ClaudeCodeN8N\Homestead\homestead-harvest-planner\`
**Tip on `main`:** `34890b4` (per `project_homestead.md` 2026-04-27 entry)
**Reference defects:**
- Aero-Calc rounds 3+4 — original two-gate insight
- `feedback_url_key_instance_trust.md` — cross-product memory

---

## Executive Verdict

**Status: VULNERABLE — both gates missing. Severity HIGH.**

`validateKeyRemote(key, instanceId)` in `src/App.jsx` is the shared validator helper called from THREE distinct entry points (mount stored-key, mount URL-key, modal Activate). It accepts `instanceId` as a positional second argument, leaving the **caller** responsible for deciding whether to send the stored value. The URL-key mount-effect path passes the stored `LS_INSTANCE` unconditionally (`App.jsx:6983-6984`), and on bad-key responses with `retry_activation: true` the helper's caller (`attempt`) wipes `LS_INSTANCE` (`App.jsx:6951`) before retrying with no instance.

Result: the documented phishing-link slot-burn attack is **fully viable** against any paying customer. Three crafted clicks burn three of the customer's three activation slots.

The companion **stored-key** path is unaffected (it should read + clean up — that is its legitimate purpose). The **modal Activate** path is unaffected (it already passes `""` for instance — `App.jsx:7112`). Only the **URL-key** path needs to be gated.

The server endpoint `api/validate-key.js` does NOT issue a fresh `instance_id` on every call; on the activate branch it returns whatever LS gives, on the validate branch it echoes back the caller's instance. So there is no separate server-side slot-burn vector — the defect is purely client-side.

---

## 5-Layer Stack Status (URL-key trust scope only)

| Layer | Status | Notes |
|---|---|---|
| L1 Origin Allowlist | ✅ | `validate-key.js:46-57` — production + localhost + project preview regex |
| L2 Licence Gate | ✅ | endpoint validates against LS; not the issue here |
| L3 Redis Rate Limit | ✅ | 10 / 10 min per IP — caps but does not prevent the attack |
| L4 CSP Header | ✅ | unrelated to this defect |
| L5 DOMPurify | n/a | unrelated to this defect |
| **Gate 1 (URL-key skip-stored-instance READ)** | ❌ | **MISSING** — see Finding #1 |
| **Gate 2 (URL-key skip cleanup WRITE)** | ❌ | **MISSING** — see Finding #2 |

---

## Trust-Boundary Map (entry → helper → side-effect)

```
Entry point (App.jsx)                 instance arg passed                LS_INSTANCE side-effects
────────────────────────────────────  ────────────────────────────────  ──────────────────────────────
Mount stored-key effect (L7008-7021)  loadState(LS_INSTANCE, "")        legit — clearLS on retry
URL-key effect       (L6982-7004)     loadState(LS_INSTANCE, "")  ❌    BAD — clearLS on retry burns slot
Modal Activate       (L7112)          ""  (literal empty string)        legit — only persists on success
/api/generate caller (L4012)          loadState(LS_INSTANCE, "")        n/a — different endpoint
```

The shared helper `validateKeyRemote(key, instanceId)` (App.jsx:544-574) is itself blameless — it only forwards what the caller hands it. The defect lives in the URL-key caller's choice to pass the stored instance and the `attempt` wrapper's choice to wipe it on `retry_activation: true`.

---

## Findings

### Finding #1 — URL-key path READS stored `LS_INSTANCE` and sends it with the unverified key (HIGH)

**Severity:** HIGH
**OWASP category:** A01:2025 — Broken Access Control (slot-burn DoS against legitimate customer's licence)
**Attack class:** phishing-link instance leak

**Location:** `src/App.jsx:6982-6984`

**Current code:**
```jsx
// 1. URL ?key= takes precedence (email link, post-checkout redirect).
const params = new URLSearchParams(window.location.search);
const urlKey = params.get("key");
if (urlKey) {
  const storedInstance = loadState(LS_INSTANCE, "");
  const r = await attempt(urlKey, storedInstance);
```

**Why it is wrong:**
The URL `?key=` value is supplied by whoever crafted the link — this is the **untrusted** entry point. By reading the legit customer's `LS_INSTANCE` and forwarding it under the attacker's key, the server-side LS call is `instance_id=<legit's-instance>` paired with `license_key=<attacker's-fake-key>`. LS will reject the pairing, but the legit `instance_id` value has already been disclosed to the attacker's request flow (and to LS logs under the wrong key). More importantly, this read is the precondition for Finding #2's cleanup-write to corrupt legit state.

**Attack scenario:**
1. Paying customer X has installed Homestead. Their stored state on `thehomesteadplan.com`: `LS_KEY = <real key>`, `LS_INSTANCE = <real instance UUID>`. LS has 1 of 3 activation slots used.
2. Attacker sends X a phishing link `https://thehomesteadplan.com/?key=12345678-aaaa-bbbb-cccc-dddddddddddd` (any random LS-format string).
3. X clicks. URL-key effect fires.
4. `loadState(LS_INSTANCE, "")` returns X's real instance UUID. (Finding #1.)
5. `attempt("12345678-...", "<X's instance>")` calls `validateKeyRemote`. POST body = `{ key: "12345678-...", instance_id: "<X's instance>" }`.
6. LS rejects (key invalid). Endpoint returns `{ valid: false, error: "...", retry_activation: true }` (`validate-key.js:144-148`).
7. `attempt` sees `retry_activation: true` and runs `clearLS(LS_INSTANCE)` (`App.jsx:6951` — Finding #2).
8. X's `LS_INSTANCE` is now empty in localStorage.
9. X's `LS_KEY` is untouched (the URL-key path doesn't wipe stored key — confirmed `App.jsx:6991-7004`).
10. X reloads, or just navigates to a different page that re-runs the paywall mount effect. Stored-key path runs (`App.jsx:7008-7021`).
11. `storedInstance = loadState(LS_INSTANCE, "")` → `""` (we wiped it in step 8).
12. `attempt(<X's key>, "")` → POST body = `{ key: <X's key>, instance_id: undefined }` → `instanceId` empty → endpoint takes the `LS_ACTIVATE` branch (`validate-key.js:121-126`).
13. LS allocates a **new** activation slot. X's slot count now 2 of 3.
14. Repeat clicks 2 and 3 burn slots 2 and 3. After three phishing clicks X is locked out: any 4th activation hits "activation limit reached".

**Why this is silent and repeatable:**
- No malware required.
- Looks like a normal product-domain link in the email/SMS.
- `validateKeyRemote` returns the LS error message but the URL-key path renders it as "couldn't verify that licence key" (`App.jsx:6992`) — X assumes the link is broken, not that they were just attacked.
- `LS_KEY` is preserved, so on reload X does silently re-unlock — they have no signal that anything happened until they hit the slot wall.
- Nothing in `clearLS(LS_INSTANCE)` is observable from the UI.

**Fix:**
Pass `skipStoredInstance: true` (or equivalent options bag) on the URL-key call, and have the helper honour it both in its READ and WRITE paths.

```js
// proposed App.jsx:544-574 — helper signature change
async function validateKeyRemote(key, instanceId, opts) {
  opts = opts || {};
  // ... existing AbortController etc ...
  const body = {
    key: String(key || "").trim(),
    instance_id: opts.skipStoredInstance
      ? undefined
      : (instanceId ? String(instanceId) : undefined),
  };
  // ... rest unchanged ...
}
```

```js
// proposed App.jsx:6982-7004 — URL-key path
if (urlKey) {
  // SECURITY: do NOT read LS_INSTANCE on the URL-key path. The URL-key value
  // is attacker-controllable; sending the legit customer's instance_id with
  // it leaks the instance and primes the cleanup-write slot-burn attack.
  // See docs/security-2026-04-27-url-key-instance-trust.md Finding #1.
  const r = await attempt(urlKey, "", { skipStoredInstance: true });
  // ... rest unchanged ...
}
```

**Priority:** before next deploy. This is HIGH not CRITICAL because customer support cost is the primary impact (slot-burn = "activation limit reached" support ticket, fixable via LS dashboard reset). No data exfiltration, no payment compromise. But it is silent, exploitable from any phishing vector, and Urban Root explicitly tracks this as a known cross-product defect in `feedback_url_key_instance_trust.md`.

---

### Finding #2 — URL-key path's `attempt` helper WIPES `LS_INSTANCE` on retry_activation, burning legit customer's slot (HIGH)

**Severity:** HIGH
**OWASP category:** A01:2025 — Broken Access Control (continuation of Finding #1)
**Attack class:** phishing-link instance leak (cleanup-write half)

**Location:** `src/App.jsx:6945-6957` (`attempt` inner function), exercised from `App.jsx:6984` on the URL-key path

**Current code:**
```jsx
const attempt = async (key, existingInstance) => {
  const r1 = await validateKeyRemote(key, existingInstance || "");
  if (r1?.valid) return r1;
  // If LS no longer recognises our cached instance_id (deactivated remotely
  // from the LS dashboard, etc.), drop it and try a fresh activate.
  if (r1?.retry_activation) {
    clearLS(LS_INSTANCE);
    const r2 = await validateKeyRemote(key, "");
    if (r2?.valid) return r2;
    return r2;
  }
  return r1;
};
```

**Why it is wrong:**
`attempt` is shared between the URL-key path and the stored-key path. The `clearLS(LS_INSTANCE)` line is correct for the stored-key path (the customer's own key being revalidated — if LS says "we don't recognise this instance", legit cleanup is to drop the cache and re-activate). But on the URL-key path, the key being validated is **attacker-controllable**. LS's `retry_activation` flag in this case is a signal that "the (legit-instance, attacker-key) pairing didn't work" — NOT a signal that the legit instance is stale. Acting on it wipes the legit pointer.

The endpoint's `retry_activation` flag is also returned for plain "key invalid" cases when the caller sent any instance_id — `validate-key.js:147` sets `retry_activation: Boolean(instanceId)` whenever LS returns ANY `js.error`, including for a key that simply doesn't exist. So the URL-key path with a random fake key triggers `retry_activation: true` reliably (because Finding #1 ensures `instanceId` is non-empty).

**Attack scenario:**
Same scenario as Finding #1. The two findings are halves of the same attack — Finding #1 is the precondition (read) and Finding #2 is the trigger (write). Closing only Finding #1 (don't read stored instance) would already prevent the attack, because then `Boolean(instanceId)` is false → `retry_activation: false` → cleanup-write doesn't fire. Closing only Finding #2 (don't wipe on URL-key path) would also prevent the attack.

But per the cross-product memory (`feedback_url_key_instance_trust.md`), **both** must be gated for defence-in-depth: Aero-Calc round-3 caught the read (Gate 1), round-4 caught the cleanup-write (Gate 2). Closing only one would re-open if the other half regresses (e.g., if a future refactor decides to send `instance_name` derived from somewhere on the URL-key path, `Boolean(instanceId)` could re-flip to true and reactivate the cleanup-write).

**Fix:**
Either (a) gate `clearLS(LS_INSTANCE)` inside `attempt` on a flag, or (b) separate URL-key path from the `attempt` retry chain entirely (URL-key path doesn't need the retry-on-retry_activation logic — it's a fresh user supplying a new key, there is no "stale cached instance" relationship to repair).

Option (a) — flag gate:
```js
const attempt = async (key, existingInstance, opts) => {
  opts = opts || {};
  const skip = !!opts.skipStoredInstance;
  const r1 = await validateKeyRemote(key, skip ? "" : (existingInstance || ""), opts);
  if (r1?.valid) return r1;
  if (r1?.retry_activation && !skip) {
    clearLS(LS_INSTANCE);
    const r2 = await validateKeyRemote(key, "", opts);
    if (r2?.valid) return r2;
    return r2;
  }
  return r1;
};
```

Option (b) — bypass the retry chain on URL-key:
```js
// URL-key path: direct call, no retry, no LS_INSTANCE side-effects
if (urlKey) {
  const r = await validateKeyRemote(urlKey, "", { skipStoredInstance: true });
  if (cancelled) return;
  stripKeyFromUrl();
  if (r?.valid) {
    commitPaid(urlKey, r.instance_id);
    return;
  }
  // ... error UI, unchanged ...
}
```

Option (b) is simpler and matches the "URL-key validation is independent of stored state" mental model the spec already implies. Recommended.

**Priority:** before next deploy. Same priority as Finding #1 — they are siblings.

---

### Finding #3 — Endpoint's `retry_activation` flag is overly permissive (LOW / informational)

**Severity:** LOW (informational — does not change the client-side attack viability)
**OWASP category:** A06:2025 — Insecure Design (signal/intent mismatch)

**Location:** `api/validate-key.js:140-148`

**Current code:**
```js
// LS returns error strings inline when invalid.
if (js.error) {
  // Retry path: caller sent instance_id that LS no longer recognises (e.g.
  // deactivated from the dashboard). Surface a clean error so the client
  // can drop the cached instance and re-activate.
  return res.status(200).json({
    valid: false,
    error: String(js.error).slice(0, 200),
    retry_activation: Boolean(instanceId),
  });
}
```

**Why it is suboptimal:**
`retry_activation: Boolean(instanceId)` is set true for **every** LS error response when an instance was sent — including "key not found", "key disabled", "key expired", and "key for different store". The flag's name implies "the instance specifically is stale, retry as a fresh activate", but the flag is actually fired for any error condition. This means the client's `attempt` retry-once logic is exercised in cases where retry is meaningless (an expired key won't activate any better the second time). The defect is what makes Finding #2 reliably exploitable from the URL-key path.

The endpoint should ideally inspect `js.error` content (LS error strings include `"license_key not found"`, `"instance not found"`, etc.) and only set `retry_activation: true` when the error string actually indicates a stale instance. But:
- LS error strings are not contractually stable.
- This change would not, by itself, close the URL-key attack — Finding #1's read is sufficient to trigger any retry-on-error logic.
- The client-side fixes for Findings #1 and #2 are higher-leverage.

**Fix (optional, post-Findings #1+#2):** Tighten the flag to fire only on `instance` substring matches in `js.error`:
```js
const looksLikeStaleInstance = instanceId && /instance/i.test(String(js.error || ""));
return res.status(200).json({
  valid: false,
  error: String(js.error).slice(0, 200),
  retry_activation: Boolean(looksLikeStaleInstance),
});
```

**Priority:** post-launch hardening. Defer until after Findings #1 and #2 ship.

---

## Server-Side Slot-Burn Vector Check (negative finding)

Per audit checklist requirement: confirm the server endpoint does NOT issue a fresh `instance_id` on every call (which would create a related, server-side slot-burn vector).

**Verified clean.** `api/validate-key.js:177-184` returns `instance_id: inst?.id || instanceId || null`, which is:
- LS's instance object id when activate fired (only when `instanceId` was empty in the request — caller intent to allocate)
- Otherwise the caller's own `instanceId` echoed back
- Otherwise `null`

The endpoint never independently allocates an instance the caller didn't ask for. Activate-branch slot allocation only happens when the caller deliberately omits `instance_id` (`validate-key.js:121-126`). The server is correctly behaving as a pass-through to LS for slot semantics. Defect is purely client-side, as stated in the verdict.

---

## Recommended Fix Delta

**Files to edit:** 1 file. `src/App.jsx`.

**Lines to change:** ~12 lines net (helper signature + URL-key call site + comments).

**Estimated diff:**
- `App.jsx:544` — `validateKeyRemote(key, instanceId)` → `validateKeyRemote(key, instanceId, opts)`
- `App.jsx:556-559` — gate `instance_id` body field on `!opts.skipStoredInstance`
- `App.jsx:6945` — `attempt(key, existingInstance)` → `attempt(key, existingInstance, opts)` + thread flag through
- `App.jsx:6951` — gate `clearLS(LS_INSTANCE)` on `!opts.skipStoredInstance`
- `App.jsx:6952` — pass `opts` through to retry call
- `App.jsx:6983-6984` — drop `loadState(LS_INSTANCE, "")` read, replace with `attempt(urlKey, "", { skipStoredInstance: true })`
- Add anti-regression comment at URL-key call site referencing this audit
- Add anti-regression comment at `attempt`'s `clearLS(LS_INSTANCE)` referencing this audit

**Stored-key path** (`App.jsx:7008-7021`) — no change. It is the legitimate use of the read+cleanup pair.

**Modal Activate path** (`App.jsx:7112`) — no change. Already passes `""` for instance.

**`/api/generate` caller** (`App.jsx:4011-4012`) — no change. Different endpoint, different trust model (paid generates require canonical-bound instance per spec §8 + canonical instance binding pattern).

**Server endpoint `api/validate-key.js`** — no required change. Optional Finding #3 hardening is post-launch.

**Build risk:** zero. No new dependencies, no API contract changes, no localStorage schema changes, no migration. Existing customers (with legitimate `LS_INSTANCE` in storage) keep working unchanged — the read happens on the stored-key path which is unmodified. URL-key flows from the LS purchase email continue to work because the legitimate post-purchase `?key=` value validates as a fresh activate (no instance_id sent, server takes activate branch, returns fresh `instance_id`, client persists via `commitPaid`).

**Test plan after fix:**
1. **Happy path (post-purchase email link):** real $39.99 purchase, click email link `?key=<real>`, paid tabs unlock, `LS_INSTANCE` populates, reload remains paid. (Should be unchanged by the fix.)
2. **Bad URL key (the attack):** in incognito with no stored state, visit `?key=<random>` — should show "couldn't verify" error; no `LS_INSTANCE` write.
3. **Bad URL key against existing customer (the attack proper):** in browser with valid `LS_KEY` + `LS_INSTANCE`, visit `?key=<random>` — should show error; **`LS_INSTANCE` MUST remain unchanged** (this is the fix's success criterion); reload should continue to validate stored key with stored instance, no slot consumption.
4. **Stored key staleness (legitimate retry path):** valid `LS_KEY` but manually edit `LS_INSTANCE` to a garbage UUID, reload — `attempt` should clear `LS_INSTANCE` and re-activate via stored key. (This path must still work — that's why we don't gut `clearLS(LS_INSTANCE)` from `attempt` outright.)
5. **Modal Activate happy path:** paste real key in modal, paid tabs unlock, `LS_INSTANCE` populates. (Should be unchanged.)

---

## Per Urban Root Convention

This audit is read-only. No code modified. Findings presented for user review before the bug-fixer / next-session edit cycle.

---

## Fix applied 2026-04-27

**Status:** All three findings closed in working tree (uncommitted at time of write).
**Editor:** bug-fixer agent
**Files changed:** `src/App.jsx` (+25 / -7), `api/validate-key.js` (+10 / -2). 35 lines added, 9 removed across both files.

### Closures
- **Finding #1 (HIGH)** — closed via Gate 1 at `App.jsx:558-565` (`validateKeyRemote` body forces `instance_id: undefined` when `opts.skipStoredInstance`) AND URL-key call site at `App.jsx:6993-7001` (no `loadState(LS_INSTANCE, "")` read; passes `""` + flag).
- **Finding #2 (HIGH)** — closed via Gate 2 at `App.jsx:6960` (`if (r1?.retry_activation && !skip)`); `opts` threaded into the recursive retry call.
- **Finding #3 (LOW)** — closed via narrowed flag at `validate-key.js:150-156` (`Boolean(instanceId) && /instance/i.test(errStr)`). TODO comment left in for LS-error-string brittleness.

### Diff hunks (verbatim)

**`src/App.jsx`** — helper signature + Gate 1:
```diff
@@ -541,7 +541,8 @@ function clearLS(key) {
 //   { valid: false, error: string, retry_activation?: boolean }
 // Never throws - network failures resolve to { valid: false, error: ... } so
 // the caller can simply branch on `valid`.
-async function validateKeyRemote(key, instanceId) {
+async function validateKeyRemote(key, instanceId, opts) {
+  opts = opts || {};
   // 15s wall-clock cap keeps the paywall mount effect from spinning forever
   // when cold-start Vercel + cold Upstash + cold LS upstream stack on a slow
   // first request. /api/generate has a 90s timeout already; this path didn't,
@@ -555,7 +556,13 @@ async function validateKeyRemote(key, instanceId) {
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         key: String(key || "").trim(),
-        instance_id: instanceId ? String(instanceId) : undefined,
+        // SECURITY GATE 1: do NOT send the legit customer's stored instance_id
+        // when the caller is the URL-key path. opts.skipStoredInstance forces
+        // the field to undefined regardless of what the caller passed in. See
+        // docs/security-2026-04-27-url-key-instance-trust.md (Finding #1).
+        instance_id: opts.skipStoredInstance
+          ? undefined
+          : (instanceId ? String(instanceId) : undefined),
       }),
     });
```

**`src/App.jsx`** — `attempt` wrapper Gate 2 + URL-key call site:
```diff
@@ -6942,14 +6949,20 @@ export default function App() {
   useEffect(() => {
     let cancelled = false;
 
-    const attempt = async (key, existingInstance) => {
-      const r1 = await validateKeyRemote(key, existingInstance || "");
+    const attempt = async (key, existingInstance, opts) => {
+      opts = opts || {};
+      const skip = !!opts.skipStoredInstance;
+      const r1 = await validateKeyRemote(key, skip ? "" : (existingInstance || ""), opts);
       if (r1?.valid) return r1;
       // If LS no longer recognises our cached instance_id (deactivated remotely
       // from the LS dashboard, etc.), drop it and try a fresh activate.
-      if (r1?.retry_activation) {
+      // SECURITY GATE 2: skip this cleanup-write on the URL-key path. The URL
+      // ?key= value is attacker-controllable; wiping LS_INSTANCE here would
+      // burn the legit customer's activation slot on next reload. See
+      // docs/security-2026-04-27-url-key-instance-trust.md (Finding #2).
+      if (r1?.retry_activation && !skip) {
         clearLS(LS_INSTANCE);
-        const r2 = await validateKeyRemote(key, "");
+        const r2 = await validateKeyRemote(key, "", opts);
         if (r2?.valid) return r2;
         return r2;
       }
@@ -6980,8 +6993,12 @@ export default function App() {
         const params = new URLSearchParams(window.location.search);
         const urlKey = params.get("key");
         if (urlKey) {
-          const storedInstance = loadState(LS_INSTANCE, "");
-          const r = await attempt(urlKey, storedInstance);
+          // SECURITY: do NOT read LS_INSTANCE on the URL-key path. The URL
+          // ?key= value is attacker-controllable; sending the legit customer's
+          // instance_id with it leaks the instance and primes the cleanup-
+          // write slot-burn attack. See
+          // docs/security-2026-04-27-url-key-instance-trust.md (Findings #1+#2).
+          const r = await attempt(urlKey, "", { skipStoredInstance: true });
           if (cancelled) return;
           stripKeyFromUrl();
           if (r?.valid) {
```

**`api/validate-key.js`** — Finding #3 narrowed flag:
```diff
@@ -141,10 +141,18 @@ export default async function handler(req, res) {
       // Retry path: caller sent instance_id that LS no longer recognises (e.g.
       // deactivated from the dashboard). Surface a clean error so the client
       // can drop the cached instance and re-activate.
+      // SECURITY: narrow retry_activation to errors that actually mention an
+      // instance — over-firing it on every error condition (e.g. "key not
+      // found") makes URL-key phishing-link slot-burn easier to exploit. See
+      // docs/security-2026-04-27-url-key-instance-trust.md (Finding #3).
+      // TODO: LS error strings are not contractually stable; revisit if LS
+      // changes the wording of instance-related errors.
+      const errStr = String(js.error || "");
+      const looksLikeStaleInstance = Boolean(instanceId) && /instance/i.test(errStr);
       return res.status(200).json({
         valid: false,
-        error: String(js.error).slice(0, 200),
-        retry_activation: Boolean(instanceId),
+        error: errStr.slice(0, 200),
+        retry_activation: looksLikeStaleInstance,
       });
     }
```

### Deviations from audit's recommended diff
- **Followed Option (a)** in Finding #2 (flag gate) rather than Option (b) (separate URL-key call from `attempt`). Option (a) was the user's explicit instruction; Option (b) was the audit's preferred recommendation. Option (a) preserves the existing call structure with one branch parameter — surgical, matches user's "do not refactor surrounding code" constraint.
- **Server fix (Finding #3) was instructed to ship now** rather than deferred post-launch as the audit suggested. Implemented per user's instruction with a TODO comment for LS-error-string brittleness.
- Diff size is slightly above the audit's `~12 LOC client + 2-4 LOC server` estimate due to anti-regression security comments (also explicitly required by the user). Net executable-line change is ~5 client + ~2 server.

### Manual verification still required
- Steps 1-5 of the audit's Test plan (lines 297-301) — happy path post-purchase email link, bad URL key (no stored state), bad URL key against existing customer (the attack proper), stored-key staleness retry path, modal Activate happy path. None of these can be exercised from the bug-fixer session without a live browser + real LS account.
- `npm run build` should pass cleanly (no syntax errors expected; pure logic changes).
