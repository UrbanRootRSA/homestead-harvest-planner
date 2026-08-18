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
import { fileURLToPath } from 'node:url';
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
// No Upstash: rateLimitOK returns true and the licence cache is skipped, so
// every case reaches LS. VERCEL_ENV must stay unset or the handler's
// fail-closed gate answers 503 before any of this runs.
process.env.LEMONSQUEEZY_STORE_ID = '348457';
// Deliberately NOT in Anthropic's `sk-ant-` shape: the handler only needs this
// to be truthy (it goes into a header the stub never reads), and a realistic
// literal here trips the workspace secret scanner for a value that is not one.
process.env.ANTHROPIC_API_KEY = 'test-placeholder-no-credential-here';
delete process.env.VERCEL_ENV;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const realWarn = console.warn; const realError = console.error; const realLog = console.log;
console.warn = () => {}; console.error = () => {};
const handler = (await import('../api/generate.js')).default;
console.warn = realWarn; console.error = realError;

const LS_VALIDATE = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const KEY = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const INSTANCE = 'inst-mine';
const LS_META = { store_id: 348457 };

// A tool_use response that sanitisePlan accepts: one month with one task is
// enough for the monthlySchedule.length check the handler makes.
const GOOD_PLAN = {
  content: [{
    type: 'tool_use',
    name: 'submit_growing_plan',
    input: {
      summary: 'A test plan.',
      monthlySchedule: [{ month: 'March', tasks: ['Sow tomatoes under cover'] }],
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
async function runGenerate(body, { ls, anthropic } = {}) {
  const attempts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
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
      headers: { origin: 'https://thehomesteadplan.com', 'x-real-ip': '203.0.113.9' },
      body,
    }, res);
  } finally {
    console.warn = w; console.error = e;
    globalThis.fetch = realFetch;
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
  check('G-1.w2', 'a failure only sets an error message',
    /setError\(data\?\.error/.test(branch), branch.slice(-260));
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
