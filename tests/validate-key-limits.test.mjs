// tests/validate-key-limits.test.mjs
//
// Security review 2026-09-06 (../docs/security-review-2026-09-06.md):
//
//   H-1 (HIGH)  The per-licence rate bucket was INCREMENTED on every request,
//               before LemonSqueezy was consulted, keyed on a licence key the
//               CALLER supplies. Anyone holding a customer's key could spray
//               /api/validate-key from rotating IPs - measured, denied from
//               request #51 within the hour - and the owner then loaded the
//               site from their own clean IP, with their own good key and
//               their own bound instance, and got 429. The client correctly
//               reads that as transient and KEEPS the licence, so nothing is
//               deleted; but `paid` never becomes true, and there is nothing
//               the customer can do. The product they paid $39.99 for is a
//               paywall for as long as the spray runs.
//   L-1 (LOW)   The origin allowlist trusted any homestead-harvest-planner*
//               .vercel.app origin IN PRODUCTION. Those subdomains are
//               first-come across the whole platform.
//   L-5 (LOW)   A `text/plain` body is a CORS "simple request": no preflight,
//               so the 405-on-OPTIONS that makes a forged origin harmless
//               never runs.
//
// This suite drives the REAL handler with an in-memory Upstash emulator at the
// fetch boundary (the client pipelines to `<url>/pipeline`), so the buckets
// are real counters with real keys, not a mock of the intent.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   Control: HHP_VALIDATE_SRC=<a copy of the pre-fix api/validate-key.js>.
//   Write that copy INSIDE this repo (node_modules/.cache/ is the convention
//   here) so its `@upstash/redis` import still resolves:
//     mkdir -p node_modules/.cache/hhp-prefix
//     git show e9cf852:api/validate-key.js > node_modules/.cache/hhp-prefix/validate-key.js
//     HHP_VALIDATE_SRC=$PWD/node_modules/.cache/hhp-prefix/validate-key.js //       node tests/validate-key-limits.test.mjs
//   Measured against that file: 14 assertions fail, and H1-4 is the finding
//   itself - the owner's own request answered
//   `429 Too many attempts for this licence`.

import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HANDLER_PATH = process.env.HHP_VALIDATE_SRC || join(HERE, '..', 'api', 'validate-key.js');
if (process.env.HHP_VALIDATE_SRC) console.log(`[control run] handler=${HANDLER_PATH}`);

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }

// ─────────────────────────────────────────────── environment, before import
const UPSTASH_URL = 'https://emulated-upstash.invalid';
process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = 'emulator-token-not-a-credential';
process.env.LEMONSQUEEZY_STORE_ID = '348457';
delete process.env.VERCEL_ENV;

const realWarn = console.warn; const realError = console.error; const realLog = console.log;
console.warn = () => {}; console.error = () => {};
const handler = (await import(pathToFileURL(HANDLER_PATH).href)).default;
console.warn = realWarn; console.error = realError;

// ─────────────────────────────────────────── the Upstash + LemonSqueezy wire
// One fetch stub routes three upstreams: the Redis pipeline, LS validate and
// LS activate. Redis is a real Map with real INCR/GET/SET/EXPIRE semantics, so
// a bucket that is not bumped is observably not bumped.
const store = new Map();
let lsScript = null;
const lsCalls = [];
// @upstash/redis asks for base64-encoded string results (Upstash-Encoding
// header) and decodes them client-side. An emulator that answers in plain text
// hands the SDK garbage: a counter of 55 came back as a mojibake string, whose
// Number() is NaN, and the gate under test then read "no count" and passed
// every request. The stub has to speak the same wire the client asked for, or
// the suite measures the stub.
let b64 = false;
const enc = (v) => (b64 ? Buffer.from(String(v), 'utf8').toString('base64') : v);

function redisCommand(cmd) {
  const [name, key, ...rest] = cmd;
  const op = String(name).toLowerCase();
  if (op === 'incr') {
    const next = (Number(store.get(key)) || 0) + 1;
    store.set(key, String(next));
    return next;
  }
  if (op === 'get') return store.has(key) ? enc(store.get(key)) : null;
  if (op === 'set') { store.set(key, String(rest[0])); return 'OK'; }
  if (op === 'expire') return store.has(key) ? 1 : 0;
  if (op === 'del') { const had = store.delete(key); return had ? 1 : 0; }
  throw new Error(`emulator does not implement ${op}`);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith(UPSTASH_URL)) {
    const h = init.headers || {};
    b64 = String(h['Upstash-Encoding'] || h['upstash-encoding'] || '') === 'base64';
    const body = JSON.parse(init.body);
    const cmds = Array.isArray(body[0]) ? body : [body];
    const out = cmds.map((c) => {
      try { return { result: redisCommand(c) }; }
      catch (e) { return { error: e.message }; }
    });
    return { ok: true, status: 200, headers: new Map(), json: async () => out, text: async () => JSON.stringify(out) };
  }
  const leg = u.includes('/activate') ? 'activate' : 'validate';
  lsCalls.push(leg);
  const step = lsScript && lsScript[leg];
  if (!step) throw new Error(`unscripted LemonSqueezy ${leg}`);
  return { ok: step.status === 200, status: step.status, json: async () => step.body };
};

const LS_META = { store_id: 348457 };
const KEY = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const OTHER = 'ZZZZZZZZ-0000-0000-0000-NEVERSOLD00';
const hash = (k) => createHash('sha256').update(String(k)).digest('hex').slice(0, 16);

async function call({ key = KEY, instance_id, ip = '203.0.113.9', origin = 'https://thehomesteadplan.com',
                      contentType = 'application/json', ls, env } = {}) {
  lsScript = ls || null;
  const before = lsCalls.length;
  const prevEnv = process.env.VERCEL_ENV;
  if (env === null) delete process.env.VERCEL_ENV;
  else if (env) process.env.VERCEL_ENV = env;
  const out = { status: 0, body: null };
  const res = {
    setHeader() {},
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; return this; },
  };
  const headers = { 'x-real-ip': ip };
  if (origin) headers.origin = origin;
  if (contentType) headers['content-type'] = contentType;
  const w = console.warn; const e = console.error;
  console.warn = () => {}; console.error = () => {};
  try {
    await handler({ method: 'POST', headers, body: { key, instance_id } }, res);
  } finally {
    console.warn = w; console.error = e;
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
  return { ...out, lsLegs: lsCalls.slice(before) };
}

const OK_VALID = { validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 1 }, meta: LS_META } } };
const OK_VALID_BOUND = { validate: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } } };
const POOL_FULL = { validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 3 }, meta: LS_META } } };
const NOT_FOUND = { validate: { status: 404, body: { error: 'license_key not found' } } };
const LS_OUTAGE = { validate: { status: 503, body: { error: 'Service Unavailable' } } };
const ACTIVATE_OK = { instance: { id: 'inst-new' }, license_key: { status: 'active' }, meta: LS_META };

// A fresh IP per request: the per-IP bucket (10 per 10 min) is a different
// control and must not be what denies these.
let ipN = 0;
const nextIp = () => `198.51.100.${(ipN += 1) % 250}`;

// ══════════════════════════════════ H-1: a leaked key cannot lock out its owner

group('H-1: spraying a leaked key must not deny its owner');

{
  // The owner opens the app once. Their key is bound, LS says valid.
  const first = await call({ instance_id: 'inst-mine', ls: OK_VALID_BOUND });
  check('H1-1', 'the owner validates normally', first.status === 200 && first.body.valid === true,
    JSON.stringify(first.body));
  check('H1-2', 'and the key is recorded as one LemonSqueezy has confirmed',
    store.has(`hhp:vk:ok:${hash(KEY)}`), [...store.keys()].join(', '));

  // Now the attacker sprays the same key from 60 addresses. Every one of those
  // requests gets a definitive answer from LS (the pool is full), which is the
  // most bucket-moving outcome available to them.
  const sprayed = [];
  for (let i = 0; i < 60; i += 1) {
    sprayed.push(await call({ ip: nextIp(), ls: POOL_FULL }));
  }
  check('H1-3', 'the spray itself is answered, not 429d into silence',
    sprayed.every((r) => r.status === 200), `statuses=${[...new Set(sprayed.map((r) => r.status))].join(',')}`);

  // The owner comes back from their own clean address with their own key and
  // their own instance. THIS is the finding.
  const owner = await call({ instance_id: 'inst-mine', ip: '203.0.113.77', ls: OK_VALID_BOUND });
  check('H1-4', 'the owner is still served after 60 sprays of their key',
    owner.status === 200 && owner.body.valid === true, `http=${owner.status} ${JSON.stringify(owner.body)}`);
  check('H1-5', 'and the answer came from LemonSqueezy, not from a limiter',
    owner.lsLegs.length === 1, `legs=${JSON.stringify(owner.lsLegs)}`);
}

group('H-1 controls: the probe hole the limiter exists for stays shut');

{
  // A key nobody has ever validated. Sixty definitive "not found" verdicts
  // must still trip the bucket - this is the Phase-2 L6 case.
  const probes = [];
  for (let i = 0; i < 60; i += 1) {
    probes.push(await call({ key: OTHER, ip: nextIp(), ls: NOT_FOUND }));
  }
  const denied = probes.filter((r) => r.status === 429);
  check('H1-6', 'an UNKNOWN key is still capped', denied.length > 0, `429s=${denied.length}/60`);
  check('H1-7', 'and the cap lands about where it is configured (50/h)',
    probes.findIndex((r) => r.status === 429) >= 50,
    `first 429 at #${probes.findIndex((r) => r.status === 429) + 1}`);
  check('H1-8', 'the bucket that counts is the failure bucket',
    store.has(`hhp:rl:validate-key:lkbad:${hash(OTHER)}`), [...store.keys()].filter((k) => k.includes('lkbad')).join(', '));
  check('H1-9', 'and a denied request never reaches LemonSqueezy',
    probes[probes.length - 1].lsLegs.length === 0, JSON.stringify(probes[probes.length - 1].lsLegs));
}

{
  // A LemonSqueezy outage is not a statement about anyone's key, so it may not
  // fill a bucket that denies people.
  const third = 'CCCCCCCC-3333-3333-3333-THIRDPARTY00';
  for (let i = 0; i < 60; i += 1) {
    await call({ key: third, ip: nextIp(), ls: LS_OUTAGE });
  }
  const after = await call({ key: third, ip: nextIp(), ls: NOT_FOUND });
  check('H1-10', 'sixty LS outages do not exhaust the customer’s bucket',
    after.status === 200, `http=${after.status} ${JSON.stringify(after.body)}`);
  check('H1-11', 'because a transient upstream is never counted as a verdict',
    Number(store.get(`hhp:rl:validate-key:lkbad:${hash(third)}`) || 0) <= 1,
    `count=${store.get(`hhp:rl:validate-key:lkbad:${hash(third)}`)}`);
}

{
  // The activation path must still work end to end with the new bucket in
  // place: a fresh device on a key with a free slot.
  const fresh = 'DDDDDDDD-4444-4444-4444-FRESHDEVICE0';
  const r = await call({
    key: fresh, ip: nextIp(),
    ls: { validate: OK_VALID.validate, activate: { status: 200, body: ACTIVATE_OK } },
  });
  check('H1-12', 'a fresh activation still succeeds', r.status === 200 && r.body.valid === true, JSON.stringify(r.body));
  check('H1-13', 'and it took validate then activate', r.lsLegs.join('+') === 'validate+activate', JSON.stringify(r.lsLegs));
  check('H1-14', 'and that key is now exempt too', store.has(`hhp:vk:ok:${hash(fresh)}`), 'no ok marker written');
}

// ═════════════════════════════════════════════ L-1: the preview-origin branch

group('L-1: a claimable *.vercel.app origin is not trusted in production');

{
  const evil = 'https://homestead-harvest-planner-evil.vercel.app';
  const prod = await call({ origin: evil, ip: nextIp(), env: 'production', ls: OK_VALID_BOUND, instance_id: 'x' });
  check('L1-1', 'in production a claimable preview origin is refused',
    prod.status === 403, `http=${prod.status} ${JSON.stringify(prod.body)}`);
  check('L1-2', 'and never reaches LemonSqueezy', prod.lsLegs.length === 0, JSON.stringify(prod.lsLegs));

  const preview = await call({ origin: evil, ip: nextIp(), env: 'preview', ls: OK_VALID_BOUND, instance_id: 'x' });
  check('L1-3', 'on a preview deploy the branch still works (SSO-gated there)',
    preview.status === 200, `http=${preview.status} ${JSON.stringify(preview.body)}`);

  const apex = await call({ origin: 'https://thehomesteadplan.com', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND, instance_id: 'x' });
  check('L1-4', 'control: the real site is served in production', apex.status === 200, `http=${apex.status}`);

  const spoof = await call({ origin: 'https://thehomesteadplan.com.evil.example', ip: nextIp(), env: 'production' });
  check('L1-5', 'control: the suffix bypass is still closed', spoof.status === 403, `http=${spoof.status}`);
}

// ══════════════════════════════════════════ L-5: preflight-free content types

group('L-5: only application/json is accepted');

{
  const plain = await call({ contentType: 'text/plain', ip: nextIp() });
  check('L5-1', 'a text/plain body is refused', plain.status === 415, `http=${plain.status} ${JSON.stringify(plain.body)}`);
  check('L5-2', 'and it costs no upstream call', plain.lsLegs.length === 0, JSON.stringify(plain.lsLegs));
  const none = await call({ contentType: '', ip: nextIp() });
  check('L5-3', 'so is a request with no content type at all', none.status === 415, `http=${none.status}`);
  const form = await call({ contentType: 'application/x-www-form-urlencoded', ip: nextIp() });
  check('L5-4', 'so is a form post', form.status === 415, `http=${form.status}`);
  const charset = await call({ contentType: 'application/json; charset=UTF-8', ip: nextIp(), ls: OK_VALID_BOUND, instance_id: 'x' });
  check('L5-5', 'control: the real client shape, with a charset, is accepted',
    charset.status === 200, `http=${charset.status} ${JSON.stringify(charset.body)}`);
  const badOrigin = await call({ origin: 'https://evil.example', contentType: 'text/plain', ip: nextIp() });
  check('L5-6', 'the origin gate still answers first, so the 403 matrix is unchanged',
    badOrigin.status === 403, `http=${badOrigin.status}`);
}

// --------------------------------------------------------------------- report

globalThis.fetch = realFetch;
console.log = realLog;
const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\nvalidate-key limits probe  (handler: ${HANDLER_PATH})`);
console.log('H-1 per-licence bucket | L-1 preview origin | L-5 content type\n');
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
console.log(`validate-key limits: ${cases}/${cases} assertions OK.`);
process.exit(0);
