// tests/generate-licence-gate.test.mjs
//
// Fleet-sweep audit 2026-08-18 (../docs/audit-sweep-families-2026-08-18.md),
// H-1 blast radius: "Homestead's own api/generate.js licence gate should be
// checked in the same pass - it consumes the same LS responses."
//
// It carried the identical hole. validateLicence asked only whether the BODY
// looked like a business error, so an LS-edge throttle or WAF refusal that
// serialised any `error` string skipped the transient return and landed on
// `reason: "ls_api_error"` with no transient flag - which the handler answers
// with HTTP 401 and the copy "Your licence couldn't be verified. Please
// re-enter your key on the home page." A paying customer, mid LemonSqueezy
// incident, told to go and re-enter a key that is perfectly good. That is the
// exact copy the 2026-06-12 verdict-consistency split was written to prevent;
// the `!js.error` conjunct left it reachable for one body shape.
//
// This suite drives the REAL handler with globalThis.fetch stubbed per upstream,
// and counts upstream ATTEMPTS rather than trusting status codes alone - the
// pre-fix handler answers some cases with the same status for a different
// reason.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SRC = process.env.HHP_APP_SRC || join(HERE, '..', 'src', 'App.jsx');

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }

// ------------------------------------------------------------ environment
// Upstash is EMULATED here (see the fetch stub below). It used to be absent,
// which was fine while every case ran with VERCEL_ENV unset - but the
// security L-2 case needs VERCEL_ENV=production, and in production a missing
// Upstash client fails the whole handler closed at 503 before the licence gate
// it is trying to exercise. An emulated store keeps every existing row's
// meaning (rateLimitOK still returns true under the configured ceilings, the
// licence cache is per-key and each case uses its own) and unlocks the
// production-mode cases.
process.env.UPSTASH_REDIS_REST_URL = 'https://emulated-upstash.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'emulator-token-not-a-credential';
process.env.LEMONSQUEEZY_STORE_ID = '348457';
// Deliberately NOT in Anthropic's `sk-ant-` shape: the handler only needs this
// to be truthy (it goes into a header the stub never reads), and a realistic
// literal here trips the workspace secret scanner for a value that is not one.
process.env.ANTHROPIC_API_KEY = 'test-placeholder-no-credential-here';
delete process.env.VERCEL_ENV;

const realWarn = console.warn; const realError = console.error; const realLog = console.log;
console.warn = () => {}; console.error = () => {};
// HHP_GENERATE_SRC points the suite at a saved copy of another revision, to
// prove the cases go red there. Keep that copy INSIDE this repo (e.g. under
// node_modules/.cache/) so its `@upstash/redis` import still resolves.
const HANDLER_PATH = process.env.HHP_GENERATE_SRC || join(HERE, '..', 'api', 'generate.js');
const handler = (await import(pathToFileURL(HANDLER_PATH).href)).default;
console.warn = realWarn; console.error = realError;
if (process.env.HHP_GENERATE_SRC) console.log(`[control run] handler=${HANDLER_PATH}`);

const LS_VALIDATE = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const KEY = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const INSTANCE = 'inst-mine';
const LS_META = { store_id: 348457 };

// A tool_use response that sanitisePlan accepts: one month with one task is
// enough for the monthlySchedule.length check the handler makes.
// The four sections the completeness gate requires (deferred L-3, fixed
// 2026-09-06): summary, one month, one tip and a savings block. The three the
// model may legitimately leave empty - bedLayouts, successionPlanting,
// preservationGuide - are deliberately absent here, which is itself the proof
// that the gate does not demand them.
const GOOD_PLAN = {
  content: [{
    type: 'tool_use',
    name: 'submit_growing_plan',
    input: {
      summary: 'A test plan.',
      monthlySchedule: [{ month: 'March', tasks: ['Sow tomatoes under cover'] }],
      tips: ['Water in the morning.'],
      savingsEstimate: { topSavers: ['Tomatoes'], note: 'Tomatoes carry the total.' },
    },
  }],
  usage: { input_tokens: 10, output_tokens: 20 },
};

const INPUT = {
  licenseKey: KEY,
  instanceId: INSTANCE,
  familySize: 4,
  zone: '7b',
  lastSpringFrost: '2026-04-15',
  firstFallFrost: '2026-10-20',
  hemisphere: 'north',
  gardenSqFt: 320,
  sunExposure: 'Full sun',
  soilType: 'Loam',
  waterMethod: 'Drip',
  experience: 'Some experience',
  goals: ['Fresh eating'],
  crops: ['Tomato', 'Lettuce'],
  displayUnits: 'imperial',
  currency: '$',
  producePerPersonLbs: 300,
};

// Route on the FULL endpoint, never a substring, and record every attempt by
// host so "no Anthropic call happened" is asserted rather than assumed.
// A real in-memory Upstash, because the handler's rate buckets, licence cache
// and instance binding all go over the wire. It speaks base64 when the client
// asks for it: an emulator that answers plain text hands the SDK garbage that
// decodes to mojibake, and every counter then reads as NaN - which looks like
// "no limit configured" and silently makes a limiter case vacuous.
const redisStore = new Map();
let b64 = false;
const enc = (v) => (b64 ? Buffer.from(String(v), 'utf8').toString('base64') : v);
function redisCommand(cmd) {
  const [name, key, ...rest] = cmd;
  const op = String(name).toLowerCase();
  if (op === 'incr') { const n = (Number(redisStore.get(key)) || 0) + 1; redisStore.set(key, String(n)); return n; }
  // LOW-7 (fix round, 2026-09-10): the refund path. Without decr here the
  // handler's refund would be swallowed by its own try/catch and every LOW-7
  // row would pass against a handler that refunds nothing.
  if (op === 'decr') { const n = (Number(redisStore.get(key)) || 0) - 1; redisStore.set(key, String(n)); return n; }
  if (op === 'get') return redisStore.has(key) ? enc(redisStore.get(key)) : null;
  if (op === 'set') { redisStore.set(key, String(rest[0])); return 'OK'; }
  if (op === 'expire') return redisStore.has(key) ? 1 : 0;
  throw new Error(`emulator does not implement ${op}`);
}

async function runGenerate(body, { ls, anthropic, extraHeaders, env } = {}) {
  const attempts = [];
  const sent = [];
  const realFetch = globalThis.fetch;
  const prevEnv = process.env.VERCEL_ENV;
  if (env) process.env.VERCEL_ENV = env;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://emulated-upstash.invalid')) {
      const h = (init && init.headers) || {};
      b64 = String(h['Upstash-Encoding'] || h['upstash-encoding'] || '') === 'base64';
      const parsed = JSON.parse(init.body);
      const cmds = Array.isArray(parsed[0]) ? parsed : [parsed];
      const out = cmds.map((c) => {
        try { return { result: redisCommand(c) }; } catch (e) { return { error: e.message }; }
      });
      return { ok: true, status: 200, headers: new Map(), json: async () => out, text: async () => JSON.stringify(out) };
    }
    attempts.push(u);
    if (u === LS_VALIDATE) {
      if (!ls) throw new Error('unscripted LemonSqueezy call');
      return { ok: ls.status === 200, status: ls.status, json: async () => ls.body };
    }
    if (u === ANTHROPIC) {
      if (!anthropic) throw new Error('unscripted Anthropic call');
      // LOW-2 (fix round, 2026-09-10): keep the request body so a case can read
      // the PROMPT the handler actually sent, not the payload it was given.
      try { sent.push(JSON.parse(init.body)); } catch { sent.push(null); }
      return {
        ok: anthropic.status === 200,
        status: anthropic.status,
        json: async () => anthropic.body,
        clone: () => ({ text: async () => JSON.stringify(anthropic.body) }),
      };
    }
    throw new Error(`unrouted upstream: ${u}`);
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
    await handler({
      method: 'POST',
      // content-type is required as of the 2026-09-06 security L-5 fix: a
      // `text/plain` body is a CORS "simple request" and skips the preflight
      // that makes a forged origin harmless. The client always sent it.
      headers: {
        origin: 'https://thehomesteadplan.com',
        'x-real-ip': '203.0.113.9',
        'content-type': 'application/json',
        ...(extraHeaders || {}),
      },
      body,
    }, res);
  } finally {
    console.warn = w; console.error = e;
    globalThis.fetch = realFetch;
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
  return {
    ...out,
    attempts,
    sent,
    prompt: String(sent[sent.length - 1]?.messages?.[0]?.content || ''),
    lsCalls: attempts.filter((u) => u === LS_VALIDATE).length,
    anthropicCalls: attempts.filter((u) => u === ANTHROPIC).length,
  };
}

// LOW-7: the per-licence bucket, read straight out of the emulator. The key
// shape is the handler's own: `hhp:rl:generate:lk:<sha256(key).slice(0,16)>`.
const bucketOf = (key) => {
  const k = `hhp:rl:generate:lk:${createHash('sha256').update(String(key)).digest('hex').slice(0, 16)}`;
  return redisStore.has(k) ? Number(redisStore.get(k)) : null;
};

const REENTER = /re-enter your key/i;

group('an LS edge status must not tell a paying customer to re-enter their key');

for (const [status, label] of [[429, 'throttle'], [403, 'refusal'], [401, 'auth fault']]) {
  const r = await runGenerate(INPUT, {
    ls: { status, body: { error: status === 429 ? 'Too many requests. Please slow down.' : 'Forbidden' } },
  });
  check(`G-1.${status}a`, `an LS ${status} ${label} is retryable, not a licence verdict`,
    r.status === 503, `http=${r.status} ${JSON.stringify(r.body)}`);
  check(`G-1.${status}b`, 'and the copy never says "re-enter your key"',
    !REENTER.test(String(r.body?.error || '')), JSON.stringify(r.body?.error));
  check(`G-1.${status}c`, 'and no Anthropic spend was incurred',
    r.anthropicCalls === 0, `anthropic calls=${r.anthropicCalls}`);
}

group('controls: the definitive path must still be definitive');

{
  // A genuinely dead key. This one SHOULD say "re-enter your key".
  const r = await runGenerate(INPUT, {
    ls: { status: 404, body: { valid: false, error: 'license_key not found' } },
  });
  check('G-1.c1', 'control: a dead key still gets the definitive 401',
    r.status === 401 && REENTER.test(String(r.body?.error || '')), `http=${r.status} ${JSON.stringify(r.body)}`);
}

{
  // A revoked-but-present key: HTTP 200, no error, not active.
  const r = await runGenerate(INPUT, {
    ls: { status: 200, body: { valid: false, license_key: { status: 'disabled' }, meta: LS_META } },
  });
  check('G-1.c2', 'control: an inactive licence is still definitive',
    r.status === 401, `http=${r.status} ${JSON.stringify(r.body)}`);
}

{
  // The empty-body guard that already existed keeps its own behaviour.
  const r = await runGenerate(INPUT, { ls: { status: 429, body: {} } });
  check('G-1.c3', 'control: an LS 429 with no error body was already retryable',
    r.status === 503, `http=${r.status} ${JSON.stringify(r.body)}`);
}

{
  const r = await runGenerate(INPUT, { ls: { status: 503, body: { error: 'Service Unavailable' } } });
  check('G-1.c4', 'control: an LS 5xx stays retryable',
    r.status === 503, `http=${r.status} ${JSON.stringify(r.body)}`);
}

{
  // The mirrored exemption: activation-limit wording is a real verdict on any
  // status, so this must NOT become a 503. Behaviour here is unchanged by the
  // fix - the case exists so the two handlers cannot drift apart on the rule.
  const r = await runGenerate(INPUT, {
    ls: { status: 429, body: { error: 'License key activation limit reached.' } },
  });
  check('G-1.c5', 'control: activation-limit wording keeps the definitive path, whatever the status',
    r.status === 401, `http=${r.status} ${JSON.stringify(r.body)}`);
}

{
  // The point of the endpoint. If this breaks, nothing above matters.
  const r = await runGenerate(INPUT, {
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-1.c6', 'control: a real report still generates',
    r.status === 200 && r.body?.ok === true, `http=${r.status} ${JSON.stringify(r.body?.error || '')}`);
  check('G-1.c7', 'and the plan survived sanitisation',
    r.body?.plan?.monthlySchedule?.length === 1 && r.body.plan.monthlySchedule[0].month === 'March',
    JSON.stringify(r.body?.plan?.monthlySchedule));
  check('G-1.c8', 'and it took exactly one LS call and one Anthropic call',
    r.lsCalls === 1 && r.anthropicCalls === 1, `ls=${r.lsCalls} anthropic=${r.anthropicCalls}`);
}


// ═══════════════════ STAGE B: security review 2026-09-06, generate side

group('L-2: a server fault may not be reported as a verdict on the key');

{
  // Missing LEMONSQUEEZY_STORE_ID in production is OUR misconfiguration. It
  // used to answer 401 "Your licence couldn't be verified. Please re-enter
  // your key on the home page." - the exact copy the verdict split exists to
  // prevent, aimed at a customer whose key was never even judged.
  const saved = process.env.LEMONSQUEEZY_STORE_ID;
  delete process.env.LEMONSQUEEZY_STORE_ID;
  const r = await runGenerate({ ...INPUT, licenseKey: 'L2AAAAAA-1111-2222-3333-STOREIDGONE' }, {
    env: 'production',
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
  });
  process.env.LEMONSQUEEZY_STORE_ID = saved;
  check('G-2.a1', 'a missing store id is retryable, not a licence verdict',
    r.status === 503, `http=${r.status} ${JSON.stringify(r.body)}`);
  check('G-2.a2', 'and the copy never tells the customer to re-enter a good key',
    !REENTER.test(String(r.body?.error || '')), JSON.stringify(r.body?.error));
  check('G-2.a3', 'and it still fails CLOSED - no Anthropic spend',
    r.anthropicCalls === 0, `anthropic=${r.anthropicCalls}`);
}

{
  // An unexpected throw inside validateLicence is a server fault too. Forced
  // here by a body whose `meta` getter throws, which is the only property the
  // function reads after the last guard.
  const hostile = new Proxy({ valid: true, license_key: { status: 'active' } }, {
    get(target, prop) {
      if (prop === 'meta') throw new Error('injected fault inside validateLicence');
      return target[prop];
    },
  });
  const r = await runGenerate({ ...INPUT, licenseKey: 'L2BBBBBB-1111-2222-3333-THROWINSIDE' }, {
    ls: { status: 200, body: hostile },
  });
  check('G-2.b1', 'an exception inside validation is retryable, not a verdict',
    r.status === 503, `http=${r.status} ${JSON.stringify(r.body)}`);
  check('G-2.b2', 'and its copy does not blame the key either',
    !REENTER.test(String(r.body?.error || '')), JSON.stringify(r.body?.error));
  check('G-2.b3', 'no Anthropic spend', r.anthropicCalls === 0, `anthropic=${r.anthropicCalls}`);
}

group('L-1: a claimable *.vercel.app origin is not trusted in production');

{
  const evil = 'https://homestead-harvest-planner-evil.vercel.app';
  const prod = await runGenerate(INPUT, { env: 'production', extraHeaders: { origin: evil } });
  check('G-3.1', 'in production the claimable preview origin is refused',
    prod.status === 403, `http=${prod.status} ${JSON.stringify(prod.body)}`);
  check('G-3.2', 'and it reaches neither LemonSqueezy nor Anthropic',
    prod.lsCalls === 0 && prod.anthropicCalls === 0, `ls=${prod.lsCalls} anthropic=${prod.anthropicCalls}`);

  const preview = await runGenerate({ ...INPUT, licenseKey: 'PRAAAAAA-1111-2222-3333-PREVIEWOK0' }, {
    env: 'preview', extraHeaders: { origin: evil },
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-3.3', 'on a preview deploy the branch still works (SSO-gated there)',
    preview.status === 200, `http=${preview.status} ${JSON.stringify(preview.body?.error || '')}`);

  const apex = await runGenerate({ ...INPUT, licenseKey: 'APAAAAAA-1111-2222-3333-APEXORIGIN' }, {
    env: 'production',
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-3.4', 'control: the real site still generates in production',
    apex.status === 200 && apex.body?.ok === true, `http=${apex.status} ${JSON.stringify(apex.body?.error || '')}`);
}

group('LOW-2 / LOW-3 (re-review 2026-09-07): the origin gate on the spend endpoint');

{
  // LOW-2: the localhost entries were unconditional, so a page served from the
  // default Vite port on anyone's machine reached Anthropic on production.
  const lh = await runGenerate({ ...INPUT, licenseKey: 'LHAAAAAA-1111-2222-3333-LOCALHOST0' }, {
    env: 'production', extraHeaders: { origin: 'http://localhost:5173' },
  });
  check('G-6.1', 'in production a localhost origin is refused', lh.status === 403, `http=${lh.status}`);
  check('G-6.2', 'and it reaches neither LemonSqueezy nor Anthropic',
    lh.lsCalls === 0 && lh.anthropicCalls === 0, `ls=${lh.lsCalls} anthropic=${lh.anthropicCalls}`);
  const lhDev = await runGenerate({ ...INPUT, licenseKey: 'LHAAAAAA-1111-2222-3333-LOCALDEV00' }, {
    extraHeaders: { origin: 'http://localhost:5173' },
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-6.3', 'control: local development still generates', lhDev.status === 200, `http=${lhDev.status}`);

  // LOW-3: an allowed Referer used to rescue a foreign Origin.
  const mixed = await runGenerate({ ...INPUT, licenseKey: 'MXAAAAAA-1111-2222-3333-MIXEDPAIR0' }, {
    env: 'production',
    extraHeaders: { origin: 'https://evil.example', referer: 'https://thehomesteadplan.com/growing-plan' },
  });
  check('G-6.4', 'a foreign Origin is not rescued by an allowed Referer',
    mixed.status === 403, `http=${mixed.status}`);
  check('G-6.5', 'and nothing upstream is spent on it',
    mixed.lsCalls === 0 && mixed.anthropicCalls === 0, `ls=${mixed.lsCalls} anthropic=${mixed.anthropicCalls}`);
  const both = await runGenerate({ ...INPUT, licenseKey: 'MXAAAAAA-1111-2222-3333-BOTHGOOD00' }, {
    env: 'production',
    extraHeaders: { referer: 'https://thehomesteadplan.com/growing-plan' },
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-6.6', 'control: the real client sends both and both pass', both.status === 200, `http=${both.status}`);
  const refOnly = await runGenerate({ ...INPUT, licenseKey: 'MXAAAAAA-1111-2222-3333-REFONLY000' }, {
    env: 'production',
    extraHeaders: { origin: undefined, referer: 'https://thehomesteadplan.com/' },
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-6.7', 'control: a lone allowed Referer still passes', refOnly.status === 200, `http=${refOnly.status}`);
  // Fleet canon (workspace memory feedback_origin_allowlist_headerless_get.md):
  // an allowlist can only gate a cross-site BROWSER call, and those always carry
  // the header. The licence gate below is what protects the spend.
  const headerless = await runGenerate({ ...INPUT, licenseKey: 'MXAAAAAA-1111-2222-3333-NOHEADERS0' }, {
    env: 'production',
    extraHeaders: { origin: undefined },
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-6.8', 'a request carrying neither header passes the gate',
    headerless.status === 200, `http=${headerless.status} ${JSON.stringify(headerless.body?.error || '')}`);
  const suffix = await runGenerate({ ...INPUT, licenseKey: 'MXAAAAAA-1111-2222-3333-SUFFIXBYP0' }, {
    env: 'production',
    extraHeaders: { origin: undefined, referer: 'https://thehomesteadplan.com.evil.example/x' },
  });
  check('G-6.9', 'control: the suffix bypass on the Referer arm is still closed',
    suffix.status === 403, `http=${suffix.status}`);
}

group('L-5: only application/json is accepted');

{
  const plain = await runGenerate(INPUT, { extraHeaders: { 'content-type': 'text/plain' } });
  check('G-4.1', 'a preflight-free text/plain body is refused',
    plain.status === 415, `http=${plain.status} ${JSON.stringify(plain.body)}`);
  check('G-4.2', 'and costs nothing upstream',
    plain.lsCalls === 0 && plain.anthropicCalls === 0, `ls=${plain.lsCalls} anthropic=${plain.anthropicCalls}`);
  const none = await runGenerate(INPUT, { extraHeaders: { 'content-type': undefined } });
  check('G-4.3', 'so is a request with no content type', none.status === 415, `http=${none.status}`);
  const bad = await runGenerate(INPUT, {
    extraHeaders: { origin: 'https://evil.example', 'content-type': 'text/plain' },
  });
  check('G-4.4', 'the origin gate still answers first, so the audited 403 matrix is unchanged',
    bad.status === 403, `http=${bad.status}`);
}

group('the completeness gate reads the plan, not one section of it');

{
  // audit-vault-families-2026-08-17 L-3. A response carrying one month and
  // nothing else shipped as ok:true: a Summary, one month and silence, billed
  // against the customer's twenty-a-day, and the regenerate confirm then
  // treated that stub as a fresh plan.
  const onlyMonths = {
    content: [{
      type: 'tool_use', name: 'submit_growing_plan',
      input: { monthlySchedule: [{ month: 'March', tasks: ['Sow tomatoes'] }] },
    }],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  const r = await runGenerate({ ...INPUT, licenseKey: 'CGAAAAAA-1111-2222-3333-ONESECTION' }, {
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: onlyMonths },
  });
  check('G-5.1', 'a plan that is one section and nothing else is refused',
    r.status === 502, `http=${r.status} ${JSON.stringify(r.body)}`);
  check('G-5.2', 'and the customer is told it was incomplete',
    /incomplete/i.test(String(r.body?.error || '')), JSON.stringify(r.body?.error));

  // The other half: sections a real plan may legitimately leave empty must NOT
  // trigger a refusal. GOOD_PLAN carries no bedLayouts, no succession and no
  // preservation guide.
  const ok = await runGenerate({ ...INPUT, licenseKey: 'CGBBBBBB-1111-2222-3333-NOBEDLAYOU' }, {
    ls: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } },
    anthropic: { status: 200, body: GOOD_PLAN },
  });
  check('G-5.3', 'a plan with no bed layouts, succession or preservation still ships',
    ok.status === 200 && ok.body?.ok === true, `http=${ok.status} ${JSON.stringify(ok.body?.error || '')}`);
  check('G-5.4', 'and it carries the sections the model did fill',
    ok.body?.plan?.tips?.length === 1 && !!ok.body?.plan?.savingsEstimate,
    JSON.stringify(ok.body?.plan && Object.keys(ok.body.plan)));
}

group('R3-9: the savings note may not carry a second figure under the engine\'s total');

{
  // Code review round 3, 2026-09-07 (PLAUSIBLE, reproduced here with stubs).
  // H-2 removed every numeric field the model could fill; the prose fields
  // stayed unconstrained, and savingsEstimate.note renders directly beneath
  // the engine's total on the savings card. A note that says "$1,234" or
  // "42 lb" puts a second number in the card the engine owns. The server drops
  // the sentence that carries the figure and keeps the rest.
  const ACTIVE = { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } };
  const withNote = (note, topSavers = ['Tomatoes']) => ({
    content: [{
      type: 'tool_use', name: 'submit_growing_plan',
      input: {
        summary: 'A test plan.',
        monthlySchedule: [{ month: 'March', tasks: ['Sow tomatoes under cover'] }],
        tips: ['Water in the morning.'],
        savingsEstimate: { topSavers, note },
      },
    }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const noisy = await runGenerate({ ...INPUT, licenseKey: 'CGCCCCCC-1111-2222-3333-NOISYNOTE0' }, {
    ls: ACTIVE,
    anthropic: { status: 200, body: withNote(
      'Tomatoes carry the total. You should save roughly $1,234 a year. Expect about 42 lb of tomatoes. Water in the morning.',
      ['Tomatoes', 'Squash ($120)'],
    ) },
  });
  const note = String(noisy.body?.plan?.savingsEstimate?.note ?? '');
  check('R3-9.1', 'the plan still ships', noisy.status === 200 && noisy.body?.ok === true, `http=${noisy.status} ${JSON.stringify(noisy.body?.error || '')}`);
  check('R3-9.2', 'the dollar sentence is gone from the note', !/\$1,234/.test(note), note);
  check('R3-9.3', 'and the weight sentence', !/42 lb/.test(note), note);
  check('R3-9.4', 'the sentences without a figure survive, in order', note === 'Tomatoes carry the total. Water in the morning.', note);
  check('R3-9.5', 'a top-saver carrying a figure is dropped whole; the plain crop name stays',
    JSON.stringify(noisy.body?.plan?.savingsEstimate?.topSavers) === '["Tomatoes"]', JSON.stringify(noisy.body?.plan?.savingsEstimate?.topSavers));

  const shapes = [
    ['a kilogram figure', 'You can expect 19 kg of squash. Rotate the beds.', 'Rotate the beds.'],
    ['a plant count', 'Plant 12 plants of basil. Rotate the beds.', 'Rotate the beds.'],
    ['a rand amount', 'That is about R450 a month. Rotate the beds.', 'Rotate the beds.'],
    ['a spelled-out currency', 'Roughly 900 dollars a year. Rotate the beds.', 'Rotate the beds.'],
  ];
  let i = 0;
  for (const [label, text, expected] of shapes) {
    i += 1;
    const r = await runGenerate({ ...INPUT, licenseKey: `CGDDDDD${i}-1111-2222-3333-FIGURESHAPE` }, {
      ls: ACTIVE, anthropic: { status: 200, body: withNote(text) },
    });
    check(`R3-9.6.${i}`, `${label} is dropped with its sentence`, r.body?.plan?.savingsEstimate?.note === expected, JSON.stringify(r.body?.plan?.savingsEstimate?.note));
  }

  const onlyFigure = await runGenerate({ ...INPUT, licenseKey: 'CGEEEEEE-1111-2222-3333-ONLYFIGURE' }, {
    ls: ACTIVE, anthropic: { status: 200, body: withNote('Around $900 a year.') },
  });
  check('R3-9.7', 'a note that is nothing but a figure ships EMPTY rather than refusing the plan',
    onlyFigure.status === 200 && onlyFigure.body?.plan?.savingsEstimate?.note === '', `http=${onlyFigure.status} note=${JSON.stringify(onlyFigure.body?.plan?.savingsEstimate?.note)}`);

  const clean = await runGenerate({ ...INPUT, licenseKey: 'CGFFFFFF-1111-2222-3333-CLEANNOTE0' }, {
    ls: ACTIVE, anthropic: { status: 200, body: withNote('Tomatoes and beans carry most of it; herbs are cheap to buy but pricey per ounce at the shop.') },
  });
  check('R3-9.8', 'control: a note with no figure is untouched',
    clean.body?.plan?.savingsEstimate?.note === 'Tomatoes and beans carry most of it; herbs are cheap to buy but pricey per ounce at the shop.',
    JSON.stringify(clean.body?.plan?.savingsEstimate?.note));
  check('R3-9.9', 'control: the prose sections outside the savings card are not touched (a month task may count plants)',
    noisy.body?.plan?.monthlySchedule?.[0]?.tasks?.[0] === 'Sow tomatoes under cover' && noisy.body?.plan?.tips?.[0] === 'Water in the morning.');
}

group('the mirror: the two handlers must not drift apart on the rule');

{
  // The rule is duplicated by design - the two api files are self-contained and
  // already keep their own callLs, hashKey and store gate. Duplication without a
  // drift guard is how two copies of one decision end up disagreeing, so compare
  // them here rather than trusting a comment to be read.
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const grab = (file, re) => {
    const src = readFileSync(join(HERE, '..', 'api', file), 'utf8').replace(/\r\n/g, '\n');
    const m = re.exec(src);
    return m ? norm(m[0]) : '';
  };
  const STATUSES = /const LS_VERDICT_STATUSES = new Set\(\[[^\]]*\]\);/;
  const LIMIT_RE = /const ACTIVATION_LIMIT_RE = [^\n]+/;
  const HELPER = /function lsMayStateVerdict\(status, errStr\) \{[\s\S]*?\n\}/;

  for (const [id, label, re] of [
    ['G-1.m1', 'the verdict-status set matches its twin', STATUSES],
    ['G-1.m2', 'the activation-limit regex matches its twin', LIMIT_RE],
    ['G-1.m3', 'the lsMayStateVerdict body matches its twin', HELPER],
  ]) {
    const mine = grab('generate.js', re);
    const twin = grab('validate-key.js', re);
    check(id, label, mine.length > 0 && mine === twin, `generate=${mine || '(missing)'} | validate-key=${twin || '(missing)'}`);
  }
}

group('the client end: a generate failure may never touch licence state');

{
  // The other half of "transient is treated as transient". The server can only
  // send a retryable status; what makes it safe is that the client answers ANY
  // generate failure with a message and nothing else - no wipe, no de-licensing.
  const SRC = readFileSync(APP_SRC, 'utf8').replace(/\r\n/g, '\n');
  const from = SRC.indexOf('const resp = await fetch("/api/generate"');
  const to = SRC.indexOf('// Compute the fingerprint at generation time', from);
  const branch = from === -1 || to === -1 ? '' : SRC.slice(from, to);

  check('G-1.w1', 'the generate call and its failure branch were found in the source',
    branch.length > 0 && branch.includes('if (!resp.ok || !data?.ok)'), `slice=${branch.length} chars`);
  // H-1 (code review 2026-09-06) moved this whole branch out of GrowingPlanTab
  // and into App, where the state is called planError. The rule under test is
  // unchanged: a failure sets a message and touches nothing else.
  check('G-1.w2', 'a failure only sets an error message',
    /set(?:Plan)?Error\(\s*data\?\.error/.test(branch), branch.slice(-260));
  check('G-1.w3', 'and never clears the stored licence',
    !/clearLS\(/.test(branch), 'clearLS( appears in the generate failure path');
  check('G-1.w4', 'and never drops the paid session',
    !/setPaid\(false\)/.test(branch), 'setPaid(false) appears in the generate failure path');
}

// ══════════════════ the fix round for the round-3 diff review (2026-09-10)

group('LOW-2: the prompt learns which crops cannot be harvested');

{
  const ACTIVE = { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } };
  const blocked = await runGenerate({
    ...INPUT,
    licenseKey: 'CGL2AAAA-1111-2222-3333-FROSTBLOCKD',
    crops: ['Tomatoes (General)', 'Sweet Potatoes'],
    frostBlockedCrops: ['Sweet Potatoes'],
  }, { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
  check('LOW-2.g1', 'the plan still ships', blocked.status === 200 && blocked.body?.ok === true, `http=${blocked.status}`);
  check('LOW-2.g2', 'the prompt names the crop the engine has ruled out',
    /Cannot be harvested in this zone[^\n]*Sweet Potatoes/.test(blocked.prompt),
    blocked.prompt.match(/Cannot be harvested[^\n]*/)?.[0] || '(no such line)');
  check('LOW-2.g3', 'and tells the model not to schedule a harvest for it',
    /Never schedule a harvest[^\n]*unable to be harvested in this zone/.test(blocked.prompt),
    blocked.prompt.match(/Never schedule[^.]*\./)?.[0] || '(no such instruction)');
  check('LOW-2.g4', 'a name that is not in this request\'s crop list never reaches the prompt', await (async () => {
    const r = await runGenerate({
      ...INPUT, licenseKey: 'CGL2BBBB-1111-2222-3333-FROSTBLOCKD',
      crops: ['Tomatoes (General)'], frostBlockedCrops: ['Ginger'],
    }, { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
    return !/Ginger/.test(r.prompt) && !/Cannot be harvested in this zone/.test(r.prompt);
  })());
  const plain = await runGenerate({ ...INPUT, licenseKey: 'CGL2CCCC-1111-2222-3333-NOTHINGBLKD' },
    { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
  check('LOW-2.g5', 'control: with nothing blocked the prompt carries no such line',
    plain.status === 200 && !/Cannot be harvested in this zone/.test(plain.prompt));
  check('LOW-2.g6', 'control: the frost dates and the crop list are still in the prompt either way',
    /First fall frost: 2026-10-20/.test(plain.prompt) && /Selected crops: Tomato, Lettuce/.test(plain.prompt),
    plain.prompt.slice(0, 200));
}

group('LOW-3: the savings scrub, driven through the handler, in both directions');

{
  const ACTIVE = { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } };
  const withNote = (note, topSavers = ['Tomatoes']) => ({
    content: [{
      type: 'tool_use', name: 'submit_growing_plan',
      input: {
        summary: 'A test plan.',
        monthlySchedule: [{ month: 'March', tasks: ['Sow tomatoes under cover'] }],
        tips: ['Water in the morning.'],
        savingsEstimate: { topSavers, note },
      },
    }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  // The four money shapes R3-9's single regex let through, and the two advice
  // sentences it deleted. `keep` is what must survive the scrub.
  const shapes = [
    ['a currency CODE', 'About 900 USD across the season. Rotate the beds.', 'Rotate the beds.'],
    ['a euro code', 'Savings near 900 EUR a year. Rotate the beds.', 'Rotate the beds.'],
    ['a bare figure in a savings claim', 'That should save you roughly 900 a year. Rotate the beds.', 'Rotate the beds.'],
    ['a spelled amount', 'Save about nine hundred dollars. Rotate the beds.', 'Rotate the beds.'],
    ['a share of the grocery bill', 'Cut roughly 30% off your grocery bill. Rotate the beds.', 'Rotate the beds.'],
    ['a container spec (must SURVIVE)', 'Grow potatoes in 20 kg grow bags to save space. Rotate the beds.',
      'Grow potatoes in 20 kg grow bags to save space. Rotate the beds.'],
    ['a spacing instruction (must SURVIVE)', 'Space your 12 plants a foot apart. Rotate the beds.',
      'Space your 12 plants a foot apart. Rotate the beds.'],
    ['a year (must SURVIVE)', 'By 2027 your beds will be productive. Rotate the beds.',
      'By 2027 your beds will be productive. Rotate the beds.'],
  ];
  let i = 0;
  for (const [label, text, expected] of shapes) {
    i += 1;
    const r = await runGenerate({ ...INPUT, licenseKey: `CGL3${String(i).padStart(4, '0')}-1111-2222-3333-SCRUBSHAPES` },
      { ls: ACTIVE, anthropic: { status: 200, body: withNote(text) } });
    check(`LOW-3.g${i}`, `${label}`, r.body?.plan?.savingsEstimate?.note === expected,
      JSON.stringify(r.body?.plan?.savingsEstimate?.note));
  }
  // The regression guards from R3-9 itself: the shapes that already worked.
  const held = await runGenerate({ ...INPUT, licenseKey: 'CGL3HELD-1111-2222-3333-SCRUBSHAPES' }, {
    ls: ACTIVE,
    anthropic: { status: 200, body: withNote(
      'Tomatoes carry the total. You should save roughly $1,234 a year. Expect about 42 lb of tomatoes. Water in the morning.',
      ['Tomatoes', 'Squash ($120)'],
    ) },
  });
  check('LOW-3.g9', 'R3-9 still holds: the money and yield sentences go, the prose stays',
    held.body?.plan?.savingsEstimate?.note === 'Tomatoes carry the total. Water in the morning.',
    JSON.stringify(held.body?.plan?.savingsEstimate?.note));
  check('LOW-3.g10', 'and a top saver carrying a figure is still dropped whole',
    JSON.stringify(held.body?.plan?.savingsEstimate?.topSavers) === '["Tomatoes"]',
    JSON.stringify(held.body?.plan?.savingsEstimate?.topSavers));
}

group('LOW-7: a generation this server refuses must not spend one of the 20');

{
  const ACTIVE = { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: LS_META } };
  const TRUNCATED = {
    status: 200,
    body: { stop_reason: 'max_tokens', content: [], usage: { input_tokens: 1, output_tokens: 4096 } },
  };
  const NO_TOOL = { status: 200, body: { content: [{ type: 'text', text: 'I cannot help with that.' }], usage: {} } };
  const INCOMPLETE = {
    status: 200,
    body: {
      content: [{ type: 'tool_use', name: 'submit_growing_plan', input: { summary: '', monthlySchedule: [], tips: [], savingsEstimate: null } }],
      usage: {},
    },
  };
  const cases = [
    ['LOW-7.1', 'an Anthropic 5xx refunds the slot', { status: 503, body: { error: { message: 'overloaded' } } }, 502, 0],
    ['LOW-7.2', 'an Anthropic 429 refunds the slot', { status: 429, body: { error: { message: 'rate limited' } } }, 502, 0],
    ['LOW-7.3', 'an auth failure refunds the slot', { status: 401, body: { error: { message: 'bad key' } } }, 502, 0],
    ['LOW-7.4', 'a response with no tool_use block refunds the slot', NO_TOOL, 502, 0],
    ['LOW-7.5', 'an incomplete plan refunds the slot', INCOMPLETE, 502, 0],
    ['LOW-7.6', 'a truncated plan deliberately does NOT (the customer can fix it, and it is repeatable)', TRUNCATED, 502, 1],
  ];
  let i = 0;
  for (const [id, label, anthropic, status, expected] of cases) {
    i += 1;
    const key = `CGL7${String(i).padStart(4, '0')}-1111-2222-3333-REFUNDSLOTS`;
    const r = await runGenerate({ ...INPUT, licenseKey: key }, { ls: ACTIVE, anthropic });
    check(id, label, r.status === status && bucketOf(key) === expected,
      `http=${r.status} bucket=${bucketOf(key)} (expected ${expected})`);
  }
  // The bucket still counts what it is for: a plan that SHIPPED is charged, and
  // a refund can never leave a negative count that would grant a 21st plan.
  const paidKey = 'CGL7OK00-1111-2222-3333-REFUNDSLOTS';
  const ok = await runGenerate({ ...INPUT, licenseKey: paidKey }, { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
  check('LOW-7.7', 'control: a plan that ships is charged one slot',
    ok.status === 200 && bucketOf(paidKey) === 1, `http=${ok.status} bucket=${bucketOf(paidKey)}`);
  const mixKey = 'CGL7MIX0-1111-2222-3333-REFUNDSLOTS';
  await runGenerate({ ...INPUT, licenseKey: mixKey }, { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
  await runGenerate({ ...INPUT, licenseKey: mixKey }, { ls: ACTIVE, anthropic: { status: 503, body: { error: { message: 'overloaded' } } } });
  await runGenerate({ ...INPUT, licenseKey: mixKey }, { ls: ACTIVE, anthropic: { status: 200, body: GOOD_PLAN } });
  check('LOW-7.8', 'two shipped plans and one outage leave the count at two',
    bucketOf(mixKey) === 2, `bucket=${bucketOf(mixKey)}`);
  const floorKey = 'CGL7FLR0-1111-2222-3333-REFUNDSLOTS';
  await runGenerate({ ...INPUT, licenseKey: floorKey }, { ls: ACTIVE, anthropic: { status: 503, body: { error: { message: 'overloaded' } } } });
  await runGenerate({ ...INPUT, licenseKey: floorKey }, { ls: ACTIVE, anthropic: { status: 503, body: { error: { message: 'overloaded' } } } });
  check('LOW-7.9', 'and the count never goes below zero', bucketOf(floorKey) === 0, `bucket=${bucketOf(floorKey)}`);
  // A refusal BEFORE the bump must not refund something it never spent.
  const earlyKey = 'CGL7EARL-1111-2222-3333-REFUNDSLOTS';
  const early = await runGenerate({ ...INPUT, licenseKey: earlyKey, crops: [] }, { ls: ACTIVE });
  check('LOW-7.10', 'control: a request refused before the bucket is bumped leaves no count at all',
    early.status === 400 && bucketOf(earlyKey) === null, `http=${early.status} bucket=${bucketOf(earlyKey)}`);
}

// --------------------------------------------------------------------- report

console.log = realLog;
const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\ngenerate licence-gate probe  (handler: api/generate.js, client: ${APP_SRC})`);
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
console.log(`generate licence gate: ${cases}/${cases} assertions OK.`);
process.exit(0);
