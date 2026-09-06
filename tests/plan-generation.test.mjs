// tests/plan-generation.test.mjs
//
// Code review 2026-09-06 (../docs/code-review-2026-09-06.md), findings H-1,
// L-5, L-1 and the client half of M-5. One code path, so one harness.
//
//   H-1  `generating`, `error` and the AbortController lived inside
//        GrowingPlanTab, and the tab is rendered behind `tab === "growing-plan"
//        &&`. Switching tabs unmounted it and the cleanup aborted the fetch:
//        the server finished the plan, returned it to nobody, and the customer
//        came back to an empty form having spent one of twenty daily
//        generations and about $0.06 of Anthropic credit. No error, no plan,
//        no explanation.
//   L-5  the AbortError branch could not tell an unmount from a 90 s timeout
//        (both called ac.abort(), so signal.aborted was true on both), and the
//        dead branch was documented as the unmount case.
//   L-1  an HTTP 200 whose body would not parse was reported to the customer
//        as "The plan generator returned an error (200)".
//   M-5  a plan body that is not the current shape was written into state
//        unchecked, and every array access downstream is unguarded - so the
//        whole app, free calculators included, went to the ErrorBoundary.
//
// The harness drives the REAL generatePlan out of the shipped source: it is
// brace-extracted from src/App.jsx at run time and evaluated with fetch,
// localStorage, the state setters and the three refs injected. Nothing is
// hand-copied - a hand copy goes stale the first time the file moves and then
// proves nothing about what ships.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   Control: HHP_APP_SRC=<a copy of the stage-A tree>, e.g.
//     git show e9cf852:src/App.jsx > /tmp/prefix-App.jsx
//     HHP_APP_SRC=/tmp/prefix-App.jsx node tests/plan-generation.test.mjs
//   Measured: 22 of 25 fail there. The whole behavioural block fails because
//   generatePlan does not exist in that revision - the request lived inside
//   the component, which IS the finding.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = process.env.HHP_APP_SRC || join(HERE, '..', 'src', 'App.jsx');
const SRC = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');
if (process.env.HHP_APP_SRC) console.log(`[control run] app=${SRC_PATH}`);

// ---------------------------------------------------------------- extractor
// Ported verbatim from tests/paywall-mount-chain.test.mjs (same repo).
function walk(src, start, isFn) {
  let i = start;
  let depth = 0;
  let mode = 'code';
  if (isFn) {
    // Step over the parameter list, whose destructuring braces are not body.
    // Without this, `function GrowingPlanTab({ a, b })` slices to the end of
    // its own SIGNATURE and every assertion about the body reads a few
    // characters and passes. (Ported from tests/bounds-and-sanitisers.test.mjs,
    // which met the same trap on `function Field({ ... })`.)
    let p = 0;
    for (let j = src.indexOf('(', start); j < src.length; j += 1) {
      if (src[j] === '(') p += 1;
      else if (src[j] === ')') { p -= 1; if (p === 0) { i = j + 1; break; } }
    }
  }
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
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; i += 1; continue; }
    i += 1;
  }
  throw new Error(`unterminated declaration while extracting at ${start}`);
}

function sliceDecl(src, name) {
  const re = new RegExp(`^(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  return walk(src, m.index, src.startsWith('function', m.index) || src.startsWith('async function', m.index));
}

// A declaration that lives inside a component is indented, so the ^-anchored
// regex above cannot see it. Find the keyword, then hand the tail to the same
// walker.
function sliceMethod(src, name) {
  const re = new RegExp(`^[ \\t]+(const|let)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  return sliceDecl(src.slice(m.index + m[0].indexOf(m[1])), name);
}

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(id, label) { rows.push({ id, label: `-- ${label}`, verdict: '' }); }

// ------------------------------------------------------- the shipped closure
const REQUIRED = [
  'LS_KEY', 'LS_INSTANCE', 'LS_CORRUPT_PREFIX',
  'importedNumber', 'clampInt',
  'persistState', 'findQuarantinedCopy', 'quarantineRaw', 'loadState', 'clearLS',
  'planStr', 'planStrArr', 'normalisePlan',
  'djb2Hash', 'canonicalizeFingerprintInput', 'computeFingerprint',
];

const GEN_TEXT = sliceMethod(SRC, 'generatePlan');
const missingDecls = REQUIRED.filter((n) => !sliceDecl(SRC, n));

function buildRunner() {
  const picked = REQUIRED.map((name) => {
    const text = sliceDecl(SRC, name);
    return { name, text, at: SRC.indexOf(text) };
  }).sort((a, b) => a.at - b.at);

  const body = `${picked.map((p) => p.text).join('\n\n')}

function __makeGeneratePlan(useCallback, setPlanError, setPlanGenerating,
                            setPlanLoadingIdx, setPlanLongRun, setPlanState,
                            planAbortRef, planAbortReasonRef, planGeneratingRef) {
${GEN_TEXT}
  return generatePlan;
}
return { __makeGeneratePlan, normalisePlan };
`;
  return new Function('localStorage', 'console', 'fetch', 'setTimeout', 'clearTimeout', body);
}

const quietConsole = { warn: () => {}, error: () => {}, log: () => {} };
const KEY = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const INSTANCE = 'inst-mine';

function makeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const CURRENT_PLAN = {
  summary: 'A short summary.',
  monthlySchedule: [{ month: 'March', tasks: ['Sow lettuce under cover'] }],
  bedLayouts: [{ bedName: 'Bed 1', crops: ['Tomato'], notes: 'Companion notes.' }],
  successionPlanting: [{ crop: 'Lettuce', plantings: 4, intervalWeeks: 2, note: 'n' }],
  preservationGuide: [{ crop: 'Tomato', freshShare: '30%', preservationMethods: ['can'], note: 'n' }],
  savingsEstimate: { topSavers: ['Tomatoes'], note: 'Tomatoes carry the total.' },
  tips: ['Water in the morning.'],
};

// The pre-2026-09-06 schema, which is what a warm old lambda would answer a
// new bundle with during a rollout window. CLAUDE.md still documented it.
const OLD_SCHEMA_PLAN = {
  summary: 'Old shape.',
  monthlySchedule: [{ month: 'March', tasks: ['t'] }],
  yieldEstimates: [{ crop: 'Tomato', plants: 4, estimatedLbs: 30, unit: 'lb' }],
  harvestTimeline: [{ crop: 'Tomato', startMonth: 'July', peakMonth: 'August', endMonth: 'September' }],
  preservationGuide: [{ crop: 'Tomato', fresh: '30%', can: '50%', freeze: '20%', jarsNeeded: 12 }],
  savingsEstimate: { annualSavings: 612, currency: 'EUR', topSavers: ['Tomato'] },
  tips: ['t'],
};

// One run of the shipped closure. `script` decides what /api/generate answers.
async function run(script, { store } = {}) {
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
    return script(calls.length, init);
  };
  const storage = makeStorage(store || {
    hhp_key: JSON.stringify(KEY),
    hhp_instance: JSON.stringify(INSTANCE),
  });
  const api = buildRunner()(storage, quietConsole, fetchStub, setTimeout, clearTimeout);

  const log = [];
  const rec = (name) => (v) => log.push([name, typeof v === 'function' ? 'fn' : v]);
  const refs = {
    abort: { current: null },
    reason: { current: null },
    generating: { current: false },
  };
  let planWritten;
  const setPlanState = (updater) => {
    planWritten = typeof updater === 'function'
      ? updater({ inputs: {}, plan: null, generatedAt: null, cropFingerprint: '' })
      : updater;
    log.push(['setPlanState', 'called']);
  };
  const generatePlan = api.__makeGeneratePlan(
    (fn) => fn,
    rec('setPlanError'), rec('setPlanGenerating'), rec('setPlanLoadingIdx'),
    rec('setPlanLongRun'), setPlanState,
    refs.abort, refs.reason, refs.generating,
  );

  const p = generatePlan({
    payload: { familySize: 4, crops: ['Tomato'], gardenSqFt: 320 },
    // The real shape the tab builds. canonicalizeFingerprintInput reads
    // d.inputs.* directly, so a partial object here throws inside
    // computeFingerprint and the digest silently falls back to "" - which
    // would make the stale-plan banner fire on a plan that is perfectly fresh.
    fingerprintInput: {
      familySize: 4, cropIds: ['tomato'], zoneStr: 'USDA zone 7',
      lastSpringFrostStr: 'Apr 15', firstFallFrostStr: 'Oct 20',
      hemisphere: 'north', gardenSqFt: 320, producePerPersonLbs: 300,
      inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: ['fresh'] },
      displayUnits: 'imperial', currency: '$',
    },
    fallbackFingerprint: '',
  });
  return { p, generatePlan, calls, log, refs, planState: () => planWritten,
    errors: () => log.filter(([n]) => n === 'setPlanError').map(([, v]) => v),
    lastError: () => {
      const e = log.filter(([n]) => n === 'setPlanError').map(([, v]) => v);
      return e.length ? e[e.length - 1] : null;
    },
    generatingLog: () => log.filter(([n]) => n === 'setPlanGenerating').map(([, v]) => v),
  };
}

const ok = (plan) => async () => ({ ok: true, status: 200, json: async () => ({ ok: true, plan }) });

// ═════════════════════════════════════════════════ the behaviour, if it exists

const CASE_IDS = [
  'H1-1', 'H1-2', 'H1-3', 'H1-4', 'H1-5', 'H1-6',
  'L1b-1', 'L1b-2', 'L1b-3', 'L1b-4',
  'M5c-1', 'M5c-2', 'M5c-3',
  'L5b-1', 'L5b-2', 'L5b-3',
];

group('H-1', 'the generation is owned above the tab, so a tab change cannot kill it');

if (!GEN_TEXT || missingDecls.length > 0) {
  const why = !GEN_TEXT
    ? 'App declares no generatePlan - the request still lives inside GrowingPlanTab'
    : `missing declarations: ${missingDecls.join(', ')}`;
  for (const id of CASE_IDS) check(id, 'requires the App-level generation owner', false, why);
} else {
  {
    // The plan lands in App state, which is not the component that was on
    // screen when Generate was clicked. That is the whole fix.
    const r = await run(ok(CURRENT_PLAN));
    await r.p;
    check('H1-1', 'a completed generation writes the plan into App state',
      !!r.planState() && r.planState().plan && r.planState().plan.summary === 'A short summary.',
      JSON.stringify(r.planState() && Object.keys(r.planState())));
    check('H1-2', 'exactly one request left the browser', r.calls.length === 1, `calls=${r.calls.length}`);
    check('H1-3', 'and it carried the licence and instance out of storage',
      r.calls[0].body.licenseKey === KEY && r.calls[0].body.instanceId === INSTANCE,
      JSON.stringify({ k: r.calls[0].body.licenseKey, i: r.calls[0].body.instanceId }));
    check('H1-4', 'the busy flag is raised and lowered exactly once each',
      JSON.stringify(r.generatingLog()) === JSON.stringify([true, false]), JSON.stringify(r.generatingLog()));
    check('H1-5', 'a completed generation reports no error',
      r.lastError() === '' || r.lastError() === null, JSON.stringify(r.lastError()));
    // The stale-plan banner compares this digest with the one the tab's effect
    // recomputes, so an empty write here would mean "your crops changed" on
    // every render of a plan that is perfectly fresh.
    check('H1-6', 'the fingerprint and the timestamp are written with the plan',
      /^[0-9a-f]{64}$/.test(String(r.planState().cropFingerprint))
      && Number.isFinite(r.planState().generatedAt),
      JSON.stringify({ fp: r.planState().cropFingerprint, at: r.planState().generatedAt }));
  }

  {
    // L-1: an unreadable 200 must not be described as "an error (200)".
    const r = await run(async () => ({
      ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token {'); },
    }));
    await r.p;
    check('L1b-1', 'an unparseable 200 says the response could not be READ',
      /couldn't read|could not read/i.test(String(r.lastError() || '')), JSON.stringify(r.lastError()));
    check('L1b-2', 'and never claims the generator returned an error (200)',
      !/\(200\)/.test(String(r.lastError() || '')), JSON.stringify(r.lastError()));
  }
  {
    const r = await run(async () => ({
      ok: false, status: 500, json: async () => ({ ok: false, error: 'Server error while generating the plan. Please try again.' }),
    }));
    await r.p;
    check('L1b-3', 'control: a real server message is still shown verbatim',
      r.lastError() === 'Server error while generating the plan. Please try again.', JSON.stringify(r.lastError()));
  }
  {
    const r = await run(async () => ({
      ok: false, status: 500, json: async () => { throw new SyntaxError('empty'); },
    }));
    await r.p;
    check('L1b-4', 'control: an unreadable 500 still names its status',
      /\(500\)/.test(String(r.lastError() || '')), JSON.stringify(r.lastError()));
  }

  {
    // M-5: an off-shape body reaches a named error, never the root boundary.
    const r = await run(ok(OLD_SCHEMA_PLAN));
    await r.p;
    const written = r.planState();
    check('M5c-1', 'a stale-schema plan is normalised, not stored raw',
      !!written && !!written.plan && !('yieldEstimates' in written.plan) && !('harvestTimeline' in written.plan),
      JSON.stringify(written && written.plan && Object.keys(written.plan)));
    check('M5c-2', 'and the model-echoed currency cannot ride in on savingsEstimate',
      !!written && !!written.plan && written.plan.savingsEstimate
        && !('currency' in written.plan.savingsEstimate) && !('annualSavings' in written.plan.savingsEstimate),
      JSON.stringify(written && written.plan && written.plan.savingsEstimate));
  }
  {
    const r = await run(ok({ notAPlan: true }));
    await r.p;
    check('M5c-3', 'a body with no plan in it becomes a message, and nothing is stored',
      r.planState() === undefined && /couldn't read|could not read/i.test(String(r.lastError() || '')),
      JSON.stringify({ stored: r.planState() !== undefined, error: r.lastError() }));
  }

  {
    // L-5: the two abort reasons are told apart by a recorded reason, not by
    // reading signal.aborted, which was true on both.
    const r = await run(async (_n, init) => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    });
    await r.p;
    check('L5b-1', 'an abort with no recorded reason does not claim a timeout',
      !/too long/i.test(String(r.lastError() || '')), JSON.stringify(r.lastError()));
    check('L5b-2', 'and still tells the customer something',
      typeof r.lastError() === 'string' && r.lastError().length > 0, JSON.stringify(r.lastError()));
  }
  {
    // The timeout leg: the reason is set exactly where the 90 s timer sets it.
    const r = await run(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); });
    r.refs.reason.current = 'timeout';
    await r.p;
    check('L5b-3', 'an abort recorded as a timeout says so',
      /too long/i.test(String(r.lastError() || '')), JSON.stringify(r.lastError()));
  }
}

// ═══════════════════════════════════ the source contract H-1 depends on

group('H-1s', 'the tab may no longer own, or abort, the request');

{
  const tab = sliceDecl(SRC, 'GrowingPlanTab');
  check('H1s-1', 'GrowingPlanTab was found in the source', !!tab, 'extractor out of step');
  if (tab) {
    check('H1s-2', 'its unmount cleanup aborts nothing',
      !/\.abort\(/.test(tab), 'an abort() call is back inside the tab component');
    check('H1s-3', 'it holds no AbortController of its own',
      !/new AbortController\(/.test(tab), 'the tab constructs its own controller again');
    check('H1s-4', 'and it does not POST /api/generate itself',
      !/fetch\("\/api\/generate"/.test(tab), 'the request is back inside the tab');
    check('H1s-5', 'it receives the busy state as a prop instead',
      /generating, error, longRun, loadingIdx/.test(tab), 'the tab no longer takes the generation props');
    check('H1s-6', 'and it still revokes its own blob URLs on unmount',
      /revokeObjectURL/.test(tab), 'the download cleanup was lost in the move');
  }
  check('H1s-7', 'App owns the request and hands it down',
    /onGeneratePlan=\{generatePlan\}/.test(SRC), 'App does not pass generatePlan to the tab');
  check('H1s-8', 'the reassurance copy no longer says only "do not close the tab"',
    !/don't close the tab/.test(SRC), 'the copy still tells the customer the old rule');
  // L-4 (code review 2026-09-06): the tab got the RAW setter, so its two
  // in-tab links changed the view without touching history - the hash kept
  // saying #growing-plan while another tab was on screen, and a reload or a
  // copied link then landed somewhere the customer was not reading.
  const tabSite = /<GrowingPlanTab[\s\S]*?\/>/.exec(SRC);
  check('H1s-9', 'the Growing Plan tab render site was found', !!tabSite, 'render site not found');
  if (tabSite) {
    check('H1s-10', 'it routes through changeTab, not the raw state setter',
      /setTab=\{changeTab\}/.test(tabSite[0]), 'setTab={setTab} is back on the Growing Plan tab');
  }
}

// --------------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\nplan-generation probe  (source: ${SRC_PATH})`);
console.log('H-1 the request outlives the tab | L-5 abort reasons | L-1 unreadable 200 | M-5 off-shape body\n');
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
console.log(`plan generation: ${cases}/${cases} assertions OK.`);
process.exit(0);
