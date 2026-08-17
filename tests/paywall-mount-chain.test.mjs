// tests/paywall-mount-chain.test.mjs
//
// Security audit 2026-08-17 (../../docs/security-paywall-storage-keys-2026-08-17.md),
// Homestead findings M-1, M-3 and L-2. Three defects in ONE code path, so one
// harness drives the whole path:
//
//   M-1  a ?key= link that validates overwrites a DIFFERENT stored licence.
//        commitPaid writes hhp_key AND hhp_instance in one breath, so one click
//        destroys the victim's pointer to their own activated instance.
//   M-3  a rejected ?key= `return`s out of the chain, so the customer's own
//        stored key and their 48 h grace window are never consulted for that
//        page load. They sit on the free tier until they reload.
//   L-2  a NEGATIVE grace age (clock ran ahead at checkout, then corrected
//        back) fell past the grant and wiped hhp_pending - locking out a
//        customer who had just paid and had no licence email yet.
//   R-1a re-audit (../../docs/security-reaudit-paywall-fixes-2026-08-17.md):
//        the first L-2 fix dropped the `age >= 0` floor along with the wipe, so
//        a future-dated stamp then GRANTED for as long as it was dated. Both
//        edges are the finding. Future-dated: deny, keep. Expired: deny, clear.
//
// The harness drives the REAL mount chain out of the shipped source: every
// declaration it needs is brace-extracted from src/App.jsx at run time, and the
// mount effect itself is sliced between two comment anchors and wrapped in a
// function. Nothing is hand-copied - a hand copy goes stale the first time the
// file moves and then proves nothing about what ships. fetch, localStorage,
// window and the five state setters are injected.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   Against the pre-fix source (HHP_APP_SRC=<a copy of main:src/App.jsx>) the
//   M-1, M-3 and L-2 cases fail = the reproduction. Exit 0 once all three land.
//
// Extractor ported from tests/load-quarantine.test.mjs (same repo, 2026-08-17).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// Control override: point the harness at a saved copy of another revision to
// prove the cases go red there. Printed when set, so a green run can never be
// mistaken for a run against the tree.
const SRC_PATH = process.env.HHP_APP_SRC || join(HERE, '..', 'src', 'App.jsx');

// Windows checkouts hold CRLF. Normalise before any offset arithmetic.
const SRC = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- extractor

// Top-level declarations the chain closes over. All present in both revisions:
// this harness tests behaviour, not the presence of a new helper.
const REQUIRED = [
  'LS_CORRUPT_PREFIX',
  'LS_KEY',
  'LS_INSTANCE',
  'LS_PENDING',
  'GRACE_WINDOW_MS',
  'persistState',
  'findQuarantinedCopy',
  'quarantineRaw',
  'loadState',
  'clearLS',
  'validateKeyRemote',
];

// Slice one top-level declaration out of the source by name. Tracks string,
// template, line-comment and block-comment state so a brace or semicolon inside
// a comment or a string cannot end the slice early. Handles `async function`,
// which the sibling harness did not need. Regex literals are walked as plain
// characters - safe for every name above (the only one is /[:.]/g).
function sliceDecl(src, name) {
  const re = new RegExp(`^(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const isFn = src.startsWith('function', start) || src.startsWith('async function', start);
  let i = start;
  let depth = 0;
  let mode = 'code';
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; i += 1; continue; }
      if (c === '{') { depth += 1; i += 1; continue; }
      if (c === '}') {
        depth -= 1;
        i += 1;
        if (isFn && depth === 0) return src.slice(start, i);
        continue;
      }
      if (c === ';' && depth === 0 && !isFn) return src.slice(start, i + 1);
      i += 1;
      continue;
    }
    if (mode === 'line') { if (c === '\n') mode = 'code'; i += 1; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; i += 2; continue; } i += 1; continue; }
    // inside a string or template literal
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; i += 1; continue; }
    i += 1;
  }
  throw new Error(`unterminated declaration while extracting: ${name}`);
}

function bail(msg) {
  console.error(`${msg}\n(the harness is out of step with ${SRC_PATH})`);
  process.exit(1);
}

// The mount effect lives inside App() and cannot be brace-extracted by name.
// Slice it between the two section banners that bracket it - ASCII fragments
// only, so the box-drawing characters in those banners cannot break the match.
const A = SRC.indexOf('Paywall mount effect');
const B = SRC.indexOf('LemonSqueezy SDK + Checkout.Success hook');
if (A === -1 || B === -1 || B < A) bail('could not locate the paywall mount effect banners');
const effectFrom = SRC.indexOf('useEffect(() => {', A);
if (effectFrom === -1 || effectFrom > B) bail('no useEffect follows the paywall mount effect banner');
const tail = SRC.slice(effectFrom, B).lastIndexOf('}, []);');
if (tail === -1) bail('the paywall mount effect does not close with "}, []);"');
const EFFECT = SRC.slice(effectFrom, effectFrom + tail + '}, []);'.length);

// The slice has to be the real chain, not some neighbouring effect.
for (const marker of ['const attempt =', 'const commitPaid =', 'GRACE_WINDOW_MS', 'stripKeyFromUrl']) {
  if (!EFFECT.includes(marker)) bail(`the sliced mount effect is missing "${marker}"`);
}

function buildModule() {
  const picked = [];
  for (const name of REQUIRED) {
    const text = sliceDecl(SRC, name);
    if (!text) throw new Error(`required declaration not found in source: ${name}`);
    picked.push({ name, text, at: SRC.indexOf(text) });
  }
  picked.sort((a, b) => a.at - b.at); // a const that feeds another keeps its order

  const validate = picked.find((p) => p.name === 'validateKeyRemote').text;
  if (!validate.includes('fetch("/api/validate-key"')) {
    throw new Error('extracted validateKeyRemote does not POST /api/validate-key; the extractor is out of step');
  }

  const body = `${picked.map((p) => p.text).join('\n\n')}

function __mountPaywall(useEffect, window, setPaid, setValidating, setKeyError, setPrefillKey, setTab) {
${EFFECT}
}

return { ${picked.map((p) => p.name).join(', ')}, __mountPaywall };
`;
  return new Function('localStorage', 'console', 'fetch', body);
}

const make = buildModule();
const quietConsole = { warn: () => {}, error: () => {}, log: () => {} };

// ------------------------------------------------------------ stubs

// Map-backed Storage, including length/key(i) - loadState's quarantine scan
// walks them, so get/set/remove alone would not exercise the real code.
function makeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
  };
}

// Enough of window for the chain: location reads, and a replaceState that
// actually moves the URL so a later read sees the stripped key / new hash.
function makeWindow(href) {
  const u = new URL(href);
  return {
    location: {
      get href() { return u.toString(); },
      get search() { return u.search; },
      get hash() { return u.hash; },
    },
    history: {
      state: null,
      replaceState(state, _title, next) {
        this.state = state;
        u.href = new URL(next, u.toString()).toString();
      },
    },
  };
}

// Canned /api/validate-key responses, consumed in call order, plus the request
// log. The log is how the "no oracle" and "no instance_id on the URL path"
// assertions are made - both are about what left the browser.
function makeServer(plan) {
  const calls = [];
  const fetchStub = async (url, init) => {
    const req = JSON.parse(init.body);
    const i = calls.length;
    calls.push({ url, key: req.key, instance_id: req.instance_id });
    const r = typeof plan === 'function' ? plan(req, i) : plan[i];
    if (!r) throw new Error(`no canned response for /api/validate-key call ${i + 1} (key=${req.key})`);
    if (r.networkError) throw new Error('fetch failed');
    return { status: r.status, json: async () => r.body };
  };
  return { fetchStub, calls };
}

// ------------------------------------------------------------ case runner

const KEY_MINE = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const KEY_THEIRS = 'BBBBBBBB-9999-8888-7777-ATTACKERKEY0';
const HOUR = 60 * 60 * 1000;

const OK = (instance) => ({ status: 200, body: { valid: true, instance_id: instance || null } });
const REVOKED = { status: 200, body: { valid: false, error: 'This licence key is not active.' } };
const OUTAGE = { status: 502, body: { valid: false, error: 'Licence server error. Please try again.' } };
const RATE_LIMITED = { status: 429, body: { valid: false, error: 'Too many attempts. Please wait a minute.' } };
// A-1: the shape the server now returns from its activation-limit pre-check.
// The licence is VALID; only the device pool is full. It arrives as an HTTP-200
// valid:false, which is the exact shape the chain answers by wiping.
const POOL_FULL = {
  status: 200,
  body: {
    valid: false,
    error: 'This licence key has reached its device activation limit. Deactivate an old device in your LemonSqueezy account, or contact support.',
    activation_limit_reached: true,
  },
};

function seed(parts) {
  const store = {};
  if (parts.key) store.hhp_key = JSON.stringify(parts.key);
  if (parts.instance) store.hhp_instance = JSON.stringify(parts.instance);
  if (parts.pending != null) store.hhp_pending = String(parts.pending);
  return store;
}

async function drain(isSettled) {
  for (let i = 0; i < 200; i += 1) {
    if (isSettled()) {
      // let the statements after setValidating(false) run (the deny leg sets
      // keyError, prefillKey and the tab AFTER it)
      for (let j = 0; j < 5; j += 1) await new Promise((r) => setImmediate(r));
      return true;
    }
    await new Promise((r) => setImmediate(r));
  }
  return false;
}

let mountCount = 0;
async function mount({ url = 'https://thehomesteadplan.com/', store = {}, plan = [] }) {
  mountCount += 1;
  const storage = makeStorage(store);
  const { fetchStub, calls } = makeServer(plan);
  const api = make(storage, quietConsole, fetchStub);
  const win = makeWindow(url);

  const log = [];
  let settled = false;
  const rec = (name) => (v) => { log.push([name, v]); if (name === 'setValidating' && v === false) settled = true; };
  const setPaid = rec('setPaid');
  const setValidating = rec('setValidating');
  const setKeyError = rec('setKeyError');
  const setPrefillKey = rec('setPrefillKey');
  const setTab = rec('setTab');

  let cleanup = null;
  const useEffect = (fn) => { cleanup = fn(); };
  api.__mountPaywall(useEffect, win, setPaid, setValidating, setKeyError, setPrefillKey, setTab);

  const ok = await drain(() => settled);
  const last = (name, fallback) => {
    for (let i = log.length - 1; i >= 0; i -= 1) if (log[i][0] === name) return log[i][1];
    return fallback;
  };
  const read = (k) => {
    const raw = storage.getItem(k);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  };

  return {
    settled: ok,
    log,
    calls,
    cleanup,
    storage,
    paid: last('setPaid', null),
    validating: last('setValidating', null),
    keyError: last('setKeyError', null),
    prefillKey: last('setPrefillKey', null),
    tab: last('setTab', null),
    everPaid: log.some(([n, v]) => n === 'setPaid' && v === true),
    storedKey: read('hhp_key'),
    storedInstance: read('hhp_instance'),
    pending: storage.getItem('hhp_pending'),
    href: win.location.href,
  };
}

// ------------------------------------------------------------ assertions

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(id, label) { rows.push({ id, label: `-- ${label}`, verdict: '' }); }

// ═════════════════════════════════════════════ M-1: URL-key conflict guard

group('M-1', 'a ?key= link may not overwrite a DIFFERENT stored licence');

{
  // The headline attack: victim holds their own activated licence, clicks
  // "here's your activation link" carrying the attacker's genuine key.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_THEIRS}`,
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    // Keyed by which licence is being validated, and the attacker's key mints
    // a DIFFERENT instance - otherwise an overwrite of hhp_instance writes the
    // same bytes back and the destroyed-pointer half of M-1 is invisible.
    plan: (req) => (req.key === KEY_MINE ? OK('inst-mine') : OK('inst-attacker')),
  });

  check('M-1.1', 'the stored licence key is untouched', r.storedKey === KEY_MINE, `hhp_key=${JSON.stringify(r.storedKey)}`);
  check('M-1.2', 'the stored instance pointer is untouched', r.storedInstance === 'inst-mine', `hhp_instance=${JSON.stringify(r.storedInstance)}`);
  check('M-1.3', 'the foreign key is never sent to the validator', !r.calls.some((c) => c.key === KEY_THEIRS), `calls=${JSON.stringify(r.calls.map((c) => c.key))}`);
  check('M-1.4', 'the stored key still unlocks this load', r.paid === true && r.validating === false);
  check('M-1.5', 'no licence error is left over the paid render', r.keyError === '' || r.keyError === null, `keyError=${JSON.stringify(r.keyError)}`);
  check('M-1.6', 'the foreign key is stripped from the address bar', !r.href.includes('key='), r.href);
}

{
  // Same conflict, but the victim's own stored key has since been revoked.
  // The refusal must still hold, the message must be legible, and the foreign
  // key must NOT be pre-filled into the licence input - a phishing key one
  // click from activation is the thing being defended against.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_THEIRS}`,
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [REVOKED],
  });

  check('M-1.7', 'the conflict is explained to the customer', typeof r.keyError === 'string' && /different licence is already stored/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
  check('M-1.8', 'the foreign key is NOT pre-filled into the licence input', !r.prefillKey || r.prefillKey !== KEY_THEIRS, `prefillKey=${JSON.stringify(r.prefillKey)}`);
  check('M-1.9', 'the app is not unlocked by the refused link', r.everPaid === false && r.validating === false);
  check('M-1.10', 'the revoked stored key was wiped (definitive verdict)', r.storedKey === null && r.storedInstance === null);
  check('M-1.11', 'still no validator call for the foreign key', !r.calls.some((c) => c.key === KEY_THEIRS));
}

{
  // N-1 (security re-audit 2026-08-17,
  // ../../docs/security-reaudit-paywall-fixes-2026-08-17.md).
  //
  // The customer's OWN email link, with the same key already stored. Not a
  // conflict, and until N-1 it ran the URL-key leg - which sends NO instance_id
  // by design, so the server took the fresh-device path and /activate minted a
  // second instance against the same licence. The LemonSqueezy purchase email
  // is the only link many customers keep, so they use it as a bookmark and burn
  // one of three slots per click, silently. Deferring to the stored-key leg
  // revalidates the identical key WITH the instance attached: same unlock, no
  // slot consumed, and nothing to explain to the customer.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_MINE}`,
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [OK('inst-fresh')],
  });

  check('N-1.1', 'the same key from a URL is not treated as a conflict', r.paid === true);
  check('N-1.2', 'exactly one validation ran', r.calls.length === 1 && r.calls[0].key === KEY_MINE, `calls=${JSON.stringify(r.calls)}`);
  check('N-1.3', 'and it CARRIED the stored instance_id (a bare call activates a second one)', r.calls[0].instance_id === 'inst-mine', `instance_id=${JSON.stringify(r.calls[0] && r.calls[0].instance_id)}`);
  check('N-1.4', 'the deferral is silent (no refusal shown for the customer\'s own key)', r.keyError === '' || r.keyError === null, `keyError=${JSON.stringify(r.keyError)}`);
  check('N-1.5', 'the key is still stripped from the address bar', !r.href.includes('key='), r.href);
}

{
  // Nothing stored: a valid ?key= must still unlock and persist, exactly as
  // before. The guard must not cost a first-time customer their activation.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_MINE}`,
    store: {},
    plan: [OK('inst-new')],
  });

  check('M-1.16', 'a fresh device still unlocks from the email link', r.paid === true && r.validating === false);
  check('M-1.17', 'the key and instance are persisted', r.storedKey === KEY_MINE && r.storedInstance === 'inst-new');
  check('M-1.18', 'the key is stripped from the address bar', !r.href.includes('key='), r.href);
}

// ═════════════════════════════════════ M-3: a rejected ?key= must fall through

group('M-3', 'a rejected ?key= must not block the stored key or the grace window');

{
  // NOTE on fixtures: with both M-1 and N-1 in, a ?key= link is only ever sent
  // to the server when NOTHING is stored - a different key is refused, the same
  // key defers. So the fall-through M-3 exists for is: a customer who paid
  // minutes ago, has no licence key yet, and clicks a link during a blip on the
  // licence server. The URL-key leg fails and the 48 h grace still has to get
  // its turn, without a licence error left floating over the unlocked render.
  const stamp = Date.now() - 2 * HOUR;
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_MINE}`,
    store: { hhp_pending: String(stamp) },
    plan: [OUTAGE],
  });

  check('M-3.1', 'the URL key was the only thing validated', r.calls.length === 1 && r.calls[0].key === KEY_MINE, `calls=${JSON.stringify(r.calls.map((c) => c.key))}`);
  check('M-3.2', 'and it sent NO instance_id (gate 1)', r.calls[0].instance_id === undefined, `instance_id=${JSON.stringify(r.calls[0] && r.calls[0].instance_id)}`);
  check('M-3.3', 'the customer is unlocked for this load', r.paid === true && r.validating === false);
  check('M-3.4', 'the stale URL-key error is closed on the success leg', r.keyError === '', `keyError=${JSON.stringify(r.keyError)}`);
  check('M-3.5', 'the stale prefill is closed too', r.prefillKey === '', `prefillKey=${JSON.stringify(r.prefillKey)}`);
  check('M-3.6', 'they are not bounced to the paywall tab', r.tab === null, `tab=${JSON.stringify(r.tab)}`);
  check('M-3.7', 'the grace stamp survived the whole chain', r.pending === String(stamp), `hhp_pending=${r.pending}`);
}

{
  // Same bad link, but the customer paid 3 h ago and has no key yet: the
  // grace window has to get its turn as well.
  const r = await mount({
    url: 'https://thehomesteadplan.com/?key=NOT-A-REAL-KEY-000000000000000000',
    store: seed({ pending: Date.now() - 3 * HOUR }),
    plan: [REVOKED],
  });

  check('M-3.8', 'the 48 h grace window still unlocks after a bad link', r.paid === true && r.validating === false);
  check('M-3.9', 'no licence error is left over the unlocked render', r.keyError === '');
  check('M-3.10', 'the grace stamp is kept', r.pending != null);
}

{
  // Own email link, and the deferred stored-key validation trips the per-IP
  // rate limit. Under N-1 that is ONE request, not two: the link no longer
  // spends a rate-limit token of its own before the stored key gets its turn,
  // which is a second, quieter cost of the old behaviour.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_MINE}`,
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [RATE_LIMITED],
  });

  check('M-3.11', 'a 429 never wipes the stored key', r.storedKey === KEY_MINE && r.storedInstance === 'inst-mine');
  check('M-3.12', 'the customer is told their key is intact', typeof r.keyError === 'string' && /still saved on this device/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
  check('M-3.13', 'the rate limit does not fail the paywall open', r.everPaid === false && r.validating === false);
  check('M-3.14', 'the link cost no second rate-limit token', r.calls.length === 1, `calls=${JSON.stringify(r.calls.map((c) => c.key))}`);
}

{
  // The M-1/M-3 interaction: a refused foreign key AND a licence server the
  // stored key cannot reach. Nothing may be wiped, the message must be about
  // the customer's own key, and the foreign key must still never be pre-filled.
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${KEY_THEIRS}`,
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [OUTAGE],
  });

  check('M-3.15', 'the conflict path plus an outage wipes nothing', r.storedKey === KEY_MINE && r.storedInstance === 'inst-mine');
  check('M-3.16', 'the transient message is what the customer reads', typeof r.keyError === 'string' && /still saved on this device/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
  check('M-3.17', 'the foreign key is still never pre-filled', r.prefillKey !== KEY_THEIRS, `prefillKey=${JSON.stringify(r.prefillKey)}`);
  check('M-3.18', 'and it never reached the validator', !r.calls.some((c) => c.key === KEY_THEIRS));
}

{
  // Nothing stored, nothing pending: the pre-existing bad-?key= UX must be
  // intact - error shown, key pre-filled, routed to the paywall tab, hash
  // rewritten so refresh/bookmark/copy-link land back there (audit #H3).
  const BAD = 'NOT-A-REAL-KEY-000000000000000000';
  const r = await mount({
    url: `https://thehomesteadplan.com/?key=${BAD}`,
    store: {},
    plan: [REVOKED],
  });

  check('M-3.19', 'the rejection is surfaced', r.keyError === 'This licence key is not active.', `keyError=${JSON.stringify(r.keyError)}`);
  check('M-3.20', 'the key is pre-filled for a retry', r.prefillKey === BAD);
  check('M-3.21', 'the user lands on the paywall tab', r.tab === 'growing-plan');
  check('M-3.22', 'the hash is rewritten to #growing-plan', r.href.endsWith('#growing-plan'), r.href);
  check('M-3.23', 'not paid', r.everPaid === false && r.validating === false);
}

// ═══════════════════════════════════════════ L-2: grace window, both edges

group('L-2', 'the 48 h window is bounded at BOTH edges, and only ONE clears');

{
  // The reported case: the device clock ran 2 h ahead when Checkout.Success
  // stamped hhp_pending, and has since been corrected backwards.
  //
  // R-1a (re-audit 2026-08-17): this case has TWO halves and the first fix
  // traded one for the other. The window has not started yet, so it may not
  // grant - a negative age is always < GRACE_WINDOW_MS, so granting on it makes
  // "48 hours" mean "as long as the stamp is dated". But it is also not spent,
  // and it is the only evidence a customer who has no licence email yet has
  // paid, so it may not be wiped either. Deny, KEEP, let it age into range.
  const stamp = Date.now() + 2 * HOUR;
  const r = await mount({ store: seed({ pending: stamp }), plan: [] });

  check('L-2.1', 'a future-dated stamp does NOT grant', r.everPaid === false && r.validating === false);
  check('L-2.2', 'and the just-paid stamp is NOT wiped', r.pending === String(stamp), `hhp_pending=${r.pending}`);
  check('L-2.3', 'no validator call was needed', r.calls.length === 0);
}

{
  // The tampered end of the same edge: set hhp_pending far enough ahead and the
  // unbounded window never closes. Same verdict as the 2 h skew, same reason -
  // the chain cannot tell a broken clock from a hand-edited value, so it treats
  // both as "not yet", which costs an attacker everything and a customer nothing.
  const stamp = Date.now() + 10 * 365 * 24 * HOUR;
  const r = await mount({ store: seed({ pending: stamp }), plan: [] });

  check('L-2.4', 'a +10-year stamp grants nothing', r.everPaid === false && r.validating === false);
  check('L-2.5', 'and it is still not wiped (a deny is not an expiry)', r.pending === String(stamp), `hhp_pending=${r.pending}`);
}

{
  // The upper bound must be exactly where it was, and this is the ONE edge that
  // clears: a spent window is evidence of nothing. Keep this case honest - a
  // "never wipe" over-correction of L-2.2/L-2.5 turns it red.
  const stamp = Date.now() - 49 * HOUR;
  const r = await mount({ store: seed({ pending: stamp }), plan: [] });

  check('L-2.6', 'an expired window does not grant', r.everPaid === false && r.validating === false);
  check('L-2.7', 'and the expired stamp IS cleared', r.pending === null, `hhp_pending=${r.pending}`);
}

{
  const stamp = Date.now() - 1 * HOUR;
  const r = await mount({ store: seed({ pending: stamp }), plan: [] });
  check('L-2.8', 'a fresh purchase grants (control)', r.paid === true);
  check('L-2.9', 'and keeps its stamp (control)', r.pending === String(stamp));
}

{
  // Garbage in the slot must not grant. loadState quarantines the bytes and
  // returns the fallback, so Number(0) fails the > 0 gate.
  const r = await mount({ store: { hhp_pending: 'tomorrow' }, plan: [] });
  check('L-2.10', 'an unparseable stamp grants nothing', r.everPaid === false && r.validating === false);
}

// ═══════════════════════════ A-1: a full device pool is not a bad licence key

group('A-1', 'a full activation pool must not delete a valid licence');

{
  // No attacker required. The customer clears their browser data, or Safari's
  // ITP deletes script-writable storage after seven days without interaction,
  // or they open the app on a fourth device. The stored key is validated with
  // no instance, the server answers "limit reached", and the chain reads a
  // definitive valid:false and DELETES the key they paid for. They then have to
  // find the purchase email AND free a slot, and their first re-paste fails too.
  const r = await mount({
    store: seed({ key: KEY_MINE }),
    plan: [POOL_FULL],
  });

  check('A-1.1', 'the licence key is KEPT', r.storedKey === KEY_MINE, `hhp_key=${JSON.stringify(r.storedKey)}`);
  check('A-1.2', 'nothing is unlocked (this device really has no slot)', r.everPaid === false && r.validating === false);
  check('A-1.3', 'the customer is told why', typeof r.keyError === 'string' && /activation limit/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
  check('A-1.4', 'and the message names the remedy', typeof r.keyError === 'string' && /deactivate|contact support/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
}

{
  // Same verdict reached through the stale-instance retry: the first call is
  // rejected on the (key, instance) pair, the chain drops the pointer and
  // re-validates bare, and THAT call is the one that hits the pre-check. The
  // wipe sits below both legs, so the exemption has to cover the retry result.
  const r = await mount({
    store: seed({ key: KEY_MINE, instance: 'inst-dead' }),
    plan: [
      { status: 200, body: { valid: false, error: 'This device is no longer activated.', retry_activation: true } },
      POOL_FULL,
    ],
  });

  check('A-1.5', 'the retry ran bare', r.calls.length === 2 && r.calls[1].instance_id === undefined, `calls=${JSON.stringify(r.calls)}`);
  check('A-1.6', 'the licence key survives the retry leg too', r.storedKey === KEY_MINE, `hhp_key=${JSON.stringify(r.storedKey)}`);
  check('A-1.7', 'and the reason still reaches the customer', typeof r.keyError === 'string' && /activation limit/i.test(r.keyError), `keyError=${JSON.stringify(r.keyError)}`);
}

{
  // The exemption must not swallow the real revocation: a definitive verdict
  // with no flag still de-licenses. Without this case a "never wipe"
  // over-correction of A-1.1 would read as a pass.
  const r = await mount({
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [REVOKED],
  });
  check('A-1.8', 'a genuinely revoked key is still wiped', r.storedKey === null && r.storedInstance === null);
}

{
  // A full pool must not cost the customer a live grace window either: they may
  // have bought minutes ago on a device that has no slot yet.
  const stamp = Date.now() - 1 * HOUR;
  const r = await mount({
    store: { ...seed({ key: KEY_MINE }), hhp_pending: String(stamp) },
    plan: [POOL_FULL],
  });
  check('A-1.9', 'the grace window still unlocks', r.paid === true);
  check('A-1.10', 'and the licence key is still kept', r.storedKey === KEY_MINE);
}

// ═══════════════════════════════════════════════════ canon + source shape

group('canon', 'portfolio invariants this chain must keep');

{
  // `paid` is never initialised from localStorage: a stored key alone must not
  // unlock anything before the server answers.
  const r = await mount({
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [REVOKED],
  });
  check('canon.1', 'a revoked stored key de-licenses the device', r.storedKey === null && r.storedInstance === null);
  check('canon.2', 'and grants nothing', r.everPaid === false);
  check('canon.3', 'the wipe is silent (no error thrown at the customer)', r.keyError === null, `keyError=${JSON.stringify(r.keyError)}`);
}

{
  // A network reject is transient, not a verdict.
  const r = await mount({
    store: seed({ key: KEY_MINE, instance: 'inst-mine' }),
    plan: [{ networkError: true }],
  });
  check('canon.4', 'a network failure never wipes the stored key', r.storedKey === KEY_MINE && r.storedInstance === 'inst-mine');
  check('canon.5', 'and never fails the paywall open', r.everPaid === false && r.validating === false);
}

// Source-shape guards. The runtime cases above prove the behaviour of the
// chain the harness drives; these pin the lines a future edit is most likely
// to undo, in the file itself. Comments are stripped first: the fix's own
// comment quotes both `age >= 0` and the clear it guards, and a check its own
// documentation can satisfy is not a check.
{
  const CODE = EFFECT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('shape.1', 'the grant is gated on BOTH edges of the window', /age\s*>=\s*0\s*&&\s*age\s*<\s*GRACE_WINDOW_MS/.test(CODE));
  check('shape.2', 'only an EXPIRED window clears the stamp', /age\s*>=\s*GRACE_WINDOW_MS\)\s*clearLS\(LS_PENDING\)/.test(CODE));
  const copy = (SRC.match(/A different licence is already stored on this device/g) || []).length;
  check('shape.3', 'the conflict-guard copy string ships exactly once', copy === 1, `${copy} occurrence(s)`);
  const conflictAt = CODE.indexOf('conflictingKey');
  const attemptAt = CODE.indexOf('attempt(urlKey');
  check('shape.4', 'the conflict guard is read BEFORE attempt(urlKey', conflictAt !== -1 && attemptAt !== -1 && conflictAt < attemptAt);
}

// ═══════════════════════════════ A-1 server half: the pre-check that emits it
//
// The client cases above prove the chain honours the flag. This proves the flag
// is ever RAISED: the real handler is imported and driven through a scripted
// LemonSqueezy, so the LS call SEQUENCE is asserted, not assumed. A pool-full
// key must be caught on the pre-check and never reach /activate - reaching it
// would burn nothing (LS refuses) but would answer with an error that falls to
// the definitive bottom return, which is the wipe this batch is closing.

group('A-1s', 'the server raises activation_limit_reached before /activate');

{
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  const handler = (await import('../api/validate-key.js')).default;
  console.warn = realWarn;
  console.error = realError;

  process.env.LEMONSQUEEZY_STORE_ID = '348457';
  delete process.env.VERCEL_ENV;

  const LS_META = { store_id: 348457 };
  const realFetch = globalThis.fetch;

  async function runServer(body, script) {
    const legs = [];
    globalThis.fetch = async (url, init) => {
      const leg = String(url).includes('/activate') ? 'activate' : 'validate';
      legs.push({ leg, body: String(init.body) });
      const step = script[leg];
      if (!step) throw new Error(`unscripted LS call: ${leg}`);
      return { ok: step.status === 200, status: step.status, json: async () => step.body };
    };
    const out = { status: 0, body: null };
    const res = {
      setHeader() {},
      status(c) { out.status = c; return this; },
      json(b) { out.body = b; return this; },
    };
    const w = console.warn; const e = console.error;
    console.warn = () => {}; console.error = () => {};
    try {
      await handler({ method: 'POST', headers: { origin: 'https://thehomesteadplan.com', 'x-real-ip': '203.0.113.9' }, body }, res);
    } finally {
      console.warn = w; console.error = e;
      globalThis.fetch = realFetch;
    }
    return { ...out, legs };
  }

  {
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 3 }, meta: LS_META } },
    });
    check('A-1s.1', 'a full pool never reaches /activate', r.legs.length === 1 && r.legs[0].leg === 'validate', `legs=${JSON.stringify(r.legs.map((l) => l.leg))}`);
    check('A-1s.2', 'and the verdict carries the flag', r.status === 200 && r.body.valid === false && r.body.activation_limit_reached === true, JSON.stringify(r.body));
    check('A-1s.3', 'the message names the remedy', typeof r.body.error === 'string' && /deactivate|contact support/i.test(r.body.error), JSON.stringify(r.body.error));
  }

  {
    // Head-room left: the pre-check must not stand between a legitimate first
    // activation and its slot.
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 1 }, meta: LS_META } },
      activate: { status: 200, body: { activated: true, license_key: { status: 'active' }, instance: { id: 'inst-new' }, meta: LS_META } },
    });
    check('A-1s.4', 'a key with slots left still activates', r.legs.map((l) => l.leg).join('+') === 'validate+activate', `legs=${JSON.stringify(r.legs.map((l) => l.leg))}`);
    check('A-1s.5', 'and grants', r.body.valid === true && r.body.instance_id === 'inst-new', JSON.stringify(r.body));
  }

  {
    // LS omitting the counters (or sending junk) must not fabricate a limit.
    // Number(undefined) is NaN, and NaN >= NaN is false, so the gate is skipped.
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
      activate: { status: 200, body: { activated: true, license_key: { status: 'active' }, instance: { id: 'inst-new' }, meta: LS_META } },
    });
    check('A-1s.6', 'absent counters do not fabricate a limit', r.body.valid === true, JSON.stringify(r.body));
  }

  {
    // The race the pre-check cannot see: two devices at 2 of 3 both pass it and
    // LS rejects one of them at /activate. That rejection used to be a plain
    // definitive valid:false, i.e. a wipe.
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 2 }, meta: LS_META } },
      activate: { status: 400, body: { activated: false, error: 'License key activation limit reached.' } },
    });
    check('A-1s.7', 'an LS-side limit rejection is flagged too', r.body.activation_limit_reached === true, JSON.stringify(r.body));
    check('A-1s.8', 'and reads as a limit, not as "could not be validated"', /activation limit/i.test(r.body.error || ''), JSON.stringify(r.body.error));
  }

  {
    // The bucket order: LS wording that carries BOTH "invalid" and the limit
    // must land in the limit bucket, not the not-found one.
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 400, body: { valid: false, error: 'invalid: activation_limit reached for this license key' } },
    });
    check('A-1s.9', 'the limit bucket is tested before not-found/invalid', /activation limit/i.test(r.body.error || ''), JSON.stringify(r.body.error));
  }

  {
    // A real dead key must stay definitive, or the client stops wiping anything.
    const r = await runServer({ key: KEY_MINE }, {
      validate: { status: 404, body: { valid: false, error: 'license_key not found' } },
    });
    check('A-1s.10', 'a dead key is still a plain definitive reject', r.body.valid === false && !r.body.activation_limit_reached, JSON.stringify(r.body));
  }
}

// --------------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\npaywall mount-chain probe  (source: ${SRC_PATH})`);
console.log(`M-1 URL-key conflict guard | M-3 rejected-?key= fall-through | L-2 grace clock skew\n`);
for (const r of rows) {
  const head = `${r.id} ${r.label}`;
  console.log(r.verdict ? `${head.padEnd(w)}  ${r.verdict}` : `\n${head}`);
}
console.log('');

if (failures.length) {
  console.error(`FAILED ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
const cases = rows.filter((r) => r.verdict).length;
// Counted, not typed: a hardcoded mount count goes stale the first time a case
// is added and then misreports how much was actually exercised.
console.log(`paywall mount chain: ${cases}/${cases} assertions OK across ${mountCount} mounts.`);
process.exit(0);
