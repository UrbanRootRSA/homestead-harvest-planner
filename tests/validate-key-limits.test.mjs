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
                      referer, contentType = 'application/json', ls, env } = {}) {
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
  if (referer) headers.referer = referer;
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
// The attacker's shape for the HIGH-1 residual: LemonSqueezy FOUND the key and
// rejected the INSTANCE the caller supplied. 200 / 400 / 404 all reach the same
// leg; 404 is the one measured against the live API's wording.
const BAD_INSTANCE = { validate: { status: 404, body: { error: 'license_key instance not found' } } };
const DISABLED = { validate: { status: 200, body: { valid: false, license_key: { status: 'disabled' }, meta: LS_META } } };
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

// ══════════════════ HIGH-1 residual: the exemption has to be EARNABLE
//
// Security re-review 2026-09-07 (../docs/security-review-2026-09-06-rereview.md):
// the exemption could only be minted by a request that PASSED the very gate it
// exists to bypass. An attacker holding a leaked key sent it with a junk
// instance_id: LemonSqueezy rejected the INSTANCE, which is not activation-limit
// wording, so every one of those bumped the bucket and none of them minted the
// marker. Fifty of those and the owner - own clean IP, own good key, own bound
// instance - was answered 429 with LemonSqueezy never consulted, permanently.
// H1-1..H1-5 above cannot catch it because H1-1 validates the owner FIRST,
// which mints the marker before the spray.

group('HIGH-1 residual: a never-validated key sprayed with a junk instance_id');

{
  const victim = 'EEEEEEEE-5555-5555-5555-NEVERSEENYET';
  const sprayed = [];
  for (let i = 0; i < 60; i += 1) {
    sprayed.push(await call({ key: victim, ip: nextIp(), instance_id: 'junk-instance', ls: BAD_INSTANCE }));
  }
  check('H1r-1', 'an instance rejection never fills the licence bucket',
    Number(store.get(`hhp:rl:validate-key:lkbad:${hash(victim)}`) || 0) === 0,
    `count=${store.get(`hhp:rl:validate-key:lkbad:${hash(victim)}`)}`);
  check('H1r-2', 'because LS finding the KEY and refusing the DEVICE proves the key is real',
    store.has(`hhp:vk:ok:${hash(victim)}`), 'no known-good marker minted');
  check('H1r-3', 'the spray is answered, so nothing about it looks special to the attacker',
    sprayed.every((r) => r.status === 200), `statuses=${[...new Set(sprayed.map((r) => r.status))].join(',')}`);

  const owner = await call({ key: victim, instance_id: 'inst-mine', ip: '203.0.113.77', ls: OK_VALID_BOUND });
  check('H1r-4', 'the owner, on their own bound device, is served',
    owner.status === 200 && owner.body.valid === true, `http=${owner.status} ${JSON.stringify(owner.body)}`);
  check('H1r-5', 'and their answer came from LemonSqueezy, not from a limiter',
    owner.lsLegs.length === 1, `legs=${JSON.stringify(owner.lsLegs)}`);

  // The same customer on a NEW device has no instance to present at all.
  const fresh = await call({
    key: victim, ip: '203.0.113.78',
    ls: { validate: OK_VALID.validate, activate: { status: 200, body: ACTIVATE_OK } },
  });
  check('H1r-6', 'and so is the same customer on a fresh device with no instance',
    fresh.status === 200 && fresh.body.valid === true, `http=${fresh.status} ${JSON.stringify(fresh.body)}`);
}

{
  // The control that must survive the change: the probe hole the limiter was
  // added for. An UNKNOWN key answers "license_key not found" - no instance
  // wording - so it still counts, junk instance_id or not.
  const unknown = 'YYYYYYYY-9999-9999-9999-NEVERSOLD22';
  const probes = [];
  for (let i = 0; i < 60; i += 1) {
    probes.push(await call({ key: unknown, ip: nextIp(), instance_id: 'junk-instance', ls: NOT_FOUND }));
  }
  check('H1r-7', 'an unknown key sprayed WITH an instance_id is still capped',
    probes.findIndex((r) => r.status === 429) === 50,
    `first 429 at #${probes.findIndex((r) => r.status === 429) + 1}`);
  check('H1r-8', 'and it never earned the exemption',
    !store.has(`hhp:vk:ok:${hash(unknown)}`), 'marker minted for a key LS says does not exist');
}

group('HIGH-1 residual: the bound device is a wording-independent backstop');

{
  // /api/generate binds the first generating device to hhp:instance:<hash>.
  // Fill the bucket with verdicts that do NOT mint (plain not-found), so the
  // ONLY thing that can serve the owner here is the binding.
  const bound = 'FFFFFFFF-6666-6666-6666-BOUNDDEVICE1';
  store.set(`hhp:instance:${hash(bound)}`, 'inst-canonical');
  for (let i = 0; i < 60; i += 1) await call({ key: bound, ip: nextIp(), instance_id: 'junk', ls: NOT_FOUND });
  check('H1r-9', 'the bucket is full and no exemption was earned',
    Number(store.get(`hhp:rl:validate-key:lkbad:${hash(bound)}`) || 0) >= 50 /* RL_LICENCE_MAX */ &&
    !store.has(`hhp:vk:ok:${hash(bound)}`),
    `count=${store.get(`hhp:rl:validate-key:lkbad:${hash(bound)}`)} marker=${store.has(`hhp:vk:ok:${hash(bound)}`)}`);

  // Controls first: a success would mint the marker and hide the backstop.
  const stranger = await call({ key: bound, instance_id: 'inst-somebody-else', ip: nextIp(), ls: OK_VALID_BOUND });
  check('H1r-10', 'a caller claiming an instance that is not the bound one is still denied',
    stranger.status === 429 && stranger.lsLegs.length === 0, `http=${stranger.status} legs=${JSON.stringify(stranger.lsLegs)}`);
  const bare = await call({ key: bound, ip: nextIp(), ls: OK_VALID });
  check('H1r-11', 'and so is a caller presenting no instance at all',
    bare.status === 429 && bare.lsLegs.length === 0, `http=${bare.status} legs=${JSON.stringify(bare.lsLegs)}`);

  const owner = await call({ key: bound, instance_id: 'inst-canonical', ip: nextIp(), ls: OK_VALID_BOUND });
  check('H1r-12', 'the bound device gets past a full bucket',
    owner.status === 200 && owner.body.valid === true && owner.lsLegs.length === 1,
    `http=${owner.status} legs=${JSON.stringify(owner.lsLegs)}`);
  check('H1r-13', 'and that success mints the exemption, so it is a one-time rescue',
    store.has(`hhp:vk:ok:${hash(bound)}`), 'no marker after the bound device validated');
}

// ═══════════════════ LOW-1: a key that goes definitively bad loses its brake

group('LOW-1: the exemption is revoked on a definitive negative verdict');

{
  const refunded = 'GGGGGGGG-7777-7777-7777-REFUNDEDKEY1';
  const good = await call({ key: refunded, instance_id: 'inst-r', ip: nextIp(), ls: OK_VALID_BOUND });
  check('R1-1', 'the key validates once and is marked known-good',
    good.status === 200 && store.has(`hhp:vk:ok:${hash(refunded)}`), JSON.stringify(good.body));

  const after = [];
  for (let i = 0; i < 63; i += 1) {
    after.push(await call({ key: refunded, instance_id: 'inst-r', ip: nextIp(), ls: DISABLED }));
  }
  check('R1-2', 'the first disabled verdict deletes the marker',
    !store.has(`hhp:vk:ok:${hash(refunded)}`), 'exemption survived a definitive negative');
  check('R1-3', 'so the per-licence bucket applies again and the probes are capped',
    after.filter((r) => r.status === 429).length > 0,
    `429s=${after.filter((r) => r.status === 429).length}/63`);
  check('R1-4', 'and each denied probe costs no LemonSqueezy round-trip',
    after[after.length - 1].lsLegs.length === 0, JSON.stringify(after[after.length - 1].lsLegs));
}

{
  // A full pool is not a definitive negative and must keep its exemption -
  // that is the customer H-1 was fixed for.
  const full = 'HHHHHHHH-8888-8888-8888-POOLISFULL1';
  const r = await call({ key: full, ip: nextIp(), ls: POOL_FULL });
  check('R1-5', 'a full device pool still earns the exemption',
    r.status === 200 && r.body.activation_limit_reached === true && store.has(`hhp:vk:ok:${hash(full)}`),
    `http=${r.status} ${JSON.stringify(r.body)}`);

  // ...but only for a key from OUR store. This leg returns before the store
  // gate, so a foreign full-pool key used to earn a 30-day pass on our bucket.
  const foreign = 'IIIIIIII-9999-9999-9999-OTHERSTORE1';
  const f = await call({
    key: foreign, ip: nextIp(),
    ls: { validate: { status: 200, body: { valid: true, license_key: { status: 'active', activation_limit: 3, activation_usage: 3 }, meta: { store_id: 999999 } } } },
  });
  check('R1-6', 'a full-pool key from ANOTHER LemonSqueezy store earns nothing',
    !store.has(`hhp:vk:ok:${hash(foreign)}`), 'foreign key marked known-good');
  check('R1-7', 'and it is still answered, not 500d', f.status === 200, `http=${f.status}`);
}

// ═══════════════════════════ LOW-2 / LOW-3: the origin gate

group('LOW-2: localhost is a development origin, not a production one');

{
  const key = 'JJJJJJJJ-1010-1010-1010-LOCALHOSTOK';
  const prod = await call({ key, origin: 'http://localhost:5173', instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND });
  check('R2-1', 'http://localhost:5173 is refused in production',
    prod.status === 403 && prod.lsLegs.length === 0, `http=${prod.status} legs=${JSON.stringify(prod.lsLegs)}`);
  const prod3000 = await call({ key, origin: 'http://localhost:3000', instance_id: 'x', ip: nextIp(), env: 'production' });
  check('R2-2', 'and so is http://localhost:3000', prod3000.status === 403, `http=${prod3000.status}`);
  const dev = await call({ key, origin: 'http://localhost:5173', instance_id: 'x', ip: nextIp(), env: null, ls: OK_VALID_BOUND });
  check('R2-3', 'control: local development still works', dev.status === 200, `http=${dev.status}`);
  const devRef = await call({ key, origin: '', referer: 'http://localhost:5173/', instance_id: 'x', ip: nextIp(), env: 'preview', ls: OK_VALID_BOUND });
  check('R2-4', 'control: the same holds for the Referer arm on a preview deploy',
    devRef.status === 200, `http=${devRef.status}`);
  const prodRef = await call({ key, origin: '', referer: 'http://localhost:5173/', instance_id: 'x', ip: nextIp(), env: 'production' });
  check('R2-5', 'and the Referer arm is closed in production too', prodRef.status === 403, `http=${prodRef.status}`);
}

group('LOW-3: when both Origin and Referer are present, both must pass');

{
  const key = 'KKKKKKKK-1111-1111-1111-ORIGINPAIRS';
  const mixed = await call({
    key, origin: 'https://evil.example', referer: 'https://thehomesteadplan.com/growing-plan',
    instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND,
  });
  check('R3-1', 'a foreign Origin is no longer rescued by an allowed Referer',
    mixed.status === 403 && mixed.lsLegs.length === 0, `http=${mixed.status} legs=${JSON.stringify(mixed.lsLegs)}`);
  const inverted = await call({
    key, origin: 'https://thehomesteadplan.com', referer: 'https://evil.example/x',
    instance_id: 'x', ip: nextIp(), env: 'production',
  });
  check('R3-2', 'and the inverse pair is refused as well', inverted.status === 403, `http=${inverted.status}`);
  const both = await call({
    key, origin: 'https://thehomesteadplan.com', referer: 'https://thehomesteadplan.com/growing-plan',
    instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND,
  });
  check('R3-3', 'control: the real client sends both, and both pass', both.status === 200, `http=${both.status}`);
  const originOnly = await call({ key, origin: 'https://www.thehomesteadplan.com', instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND });
  check('R3-4', 'control: a lone allowed Origin still passes', originOnly.status === 200, `http=${originOnly.status}`);
  const refererOnly = await call({ key, origin: '', referer: 'https://thehomesteadplan.com/', instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND });
  check('R3-5', 'control: a lone allowed Referer still passes', refererOnly.status === 200, `http=${refererOnly.status}`);
  // Fleet canon (feedback_origin_allowlist_headerless_get.md): an allowlist can
  // only gate a cross-site BROWSER call, and those always carry the header.
  const headerless = await call({ key, origin: '', instance_id: 'x', ip: nextIp(), env: 'production', ls: OK_VALID_BOUND });
  check('R3-6', 'a request carrying neither header passes the gate',
    headerless.status === 200, `http=${headerless.status}`);
  const suffix = await call({ key, origin: '', referer: 'https://thehomesteadplan.com.evil.example/x', instance_id: 'x', ip: nextIp(), env: 'production' });
  check('R3-7', 'control: the suffix bypass is still closed on the Referer arm',
    suffix.status === 403, `http=${suffix.status}`);
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
