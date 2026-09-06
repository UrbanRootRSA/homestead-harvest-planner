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
  if (op === 'get') return redisStore.has(key) ? enc(redisStore.get(key)) : null;
  if (op === 'set') { redisStore.set(key, String(rest[0])); return 'OK'; }
  if (op === 'expire') return redisStore.has(key) ? 1 : 0;
  throw new Error(`emulator does not implement ${op}`);
}

async function runGenerate(body, { ls, anthropic, extraHeaders, env } = {}) {
  const attempts = [];
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
    lsCalls: attempts.filter((u) => u === LS_VALIDATE).length,
    anthropicCalls: attempts.filter((u) => u === ANTHROPIC).length,
  };
}

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
