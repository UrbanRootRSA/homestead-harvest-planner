// tests/bounds-and-sanitisers.test.mjs
//
// Audit 2026-08-17 (docs/audit-vault-families-2026-08-17.md), finding H-1 and
// the two L-5 sites it names:
//
//   H-1  BedEditor converted every bed VALUE for display and left every bed
//        BOUND as an imperial literal. Field.commit clamps in whatever unit it
//        was handed, so in metric mode the Depth box read "Depth (cm)" and
//        capped the customer at 48 CM - a 60 cm bed, the commonest European
//        raised-bed depth, snapped to 48 and the Soil tab then ordered 21% too
//        little soil. Length ran the other way: 100 m was accepted against a
//        declared ceiling of 100 ft. ProduceTargetField already converted its
//        bounds with its value; BedEditor did not.
//   L-5  The soil-component price and the Cost Savings grocery price carry the
//        same defect without the consequence (both ceilings sit far above any
//        real price). Fixed in the same pass so the pattern closes once.
//
// The harness drives the REAL functions out of the shipped source: Field.commit,
// BedEditor's commitLen/commitDepth and computeBedVolumeCuFt are brace-extracted
// from src/App.jsx at run time and evaluated. Nothing is hand-copied - a hand
// copy goes stale the first time the file moves and then proves nothing about
// what ships.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   Against the pre-fix source (HHP_APP_SRC=<a copy of main:src/App.jsx>) the
//   metric cases fail = the reproduction. Exit 0 once the bounds convert.
//
// Extractor ported from tests/load-quarantine.test.mjs (same repo), with one
// addition: it steps over a function's parameter list before counting body
// braces, because `function Field({ label, ... })` destructures its parameters
// and those braces used to end the slice at the end of the signature.

import { readFileSync } from 'node:fs';
import { CROPS } from '../src/data/crops.js';
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

function walk(src, start, isFn) {
  let i = start;
  let depth = 0;
  let mode = 'code';
  if (isFn) {
    // Step over the parameter list, whose destructuring braces are not body.
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

// One top-level declaration, by name.
function sliceDecl(src, name) {
  const re = new RegExp(`^(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  return walk(src, m.index, src.startsWith('function', m.index) || src.startsWith('async function', m.index));
}

// One declaration nested inside another (indented), e.g. BedEditor's commitDepth.
function sliceLocal(src, name) {
  const re = new RegExp(`(?:^|\\n)(\\s*)(const|let|function)\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) return null;
  return walk(src, m.index + m[0].indexOf(m[2]), m[2] === 'function');
}

function bail(msg) {
  console.error(`${msg}\n(the harness is out of step with ${SRC_PATH})`);
  process.exit(1);
}

// ------------------------------------------------------------ build the module

// Every bound the fix names, plus the unit factors and the volume formula the
// consequence is measured through.
const NAMES = [
  'sanitizeNum', 'clampInt', 'importedNumber', 'hasKey',
  // PATH_SHARE_OF_FOOTPRINT feeds PATH_BUFFER as of the 2026-09-06
  // engineering fix (M-1); the multiplier is derived, not a literal.
  'PATH_SHARE_OF_FOOTPRINT', 'PATH_BUFFER', 'DEFAULT_PRODUCE_PER_PERSON_LBS',
  'GOAL_MULTIPLIER', 'FREQUENCY_FACTOR', 'ZONE_FROST_DATES', 'computeResults',
  'FT_TO_M', 'IN_TO_CM', 'LB_TO_KG', 'CUFT_TO_L', 'SQFT_TO_SQM',
  'SOIL_PRICE_MAX_PER_CUFT', 'GROCERY_PRICE_MAX_PER_LB',
  'BED_LENGTH_FT_MIN', 'BED_LENGTH_FT_MAX',
  'BED_WIDTH_FT_MIN', 'BED_WIDTH_FT_MAX',
  'BED_DIAMETER_FT_MIN', 'BED_DIAMETER_FT_MAX',
  'BED_OUTER_LENGTH_FT_MIN', 'BED_OUTER_LENGTH_FT_MAX',
  'BED_OUTER_WIDTH_FT_MIN', 'BED_OUTER_WIDTH_FT_MAX',
  'BED_CUTOUT_LENGTH_FT_MIN', 'BED_CUTOUT_LENGTH_FT_MAX',
  'BED_CUTOUT_WIDTH_FT_MIN', 'BED_CUTOUT_WIDTH_FT_MAX',
  'BED_DEPTH_IN_MIN', 'BED_DEPTH_IN_MAX',
  'computeBedVolumeCuFt',
  // Stage B (2026-09-06): the soil-override loader, the crop-selection loader
  // and what they feed. Every one of these exists in both revisions, so a
  // control run reports per-case failures instead of bailing on a name.
  'MIN_PRODUCE_PER_PERSON_LBS', 'SETTLING_BUFFER', 'SOIL_MIXES',
  'computeSoilResults', 'PRESETS', 'LS_SOIL', 'LS_CROPS',
];
const missing = NAMES.filter((n) => !sliceDecl(SRC, n));
if (missing.length) bail(`declarations not found in source: ${missing.join(', ')}`);
const picked = NAMES.map((n) => {
  const text = sliceDecl(SRC, n);
  return { n, text, at: SRC.indexOf(text) };
}).sort((a, b) => a.at - b.at);

// A `const [x, setX] = useState(() => {...});` initialiser cannot be sliced by
// name - the declaration is a destructuring pattern. Anchor on the literal
// text and hand the tail to the same brace walker, which ends the slice at the
// first `;` outside braces, strings and comments.
function sliceStateInit(src, anchor) {
  const at = src.indexOf(anchor);
  if (at === -1) return null;
  return walk(src, at, false);
}
const selectionInit = sliceStateInit(SRC, 'const [selection, setSelection] = useState');
const soilInit = sliceStateInit(SRC, 'const [soilState, setSoilState] = useState');
if (!selectionInit) bail('could not slice the hhp_crops state initialiser');
if (!soilInit) bail('could not slice the hhp_soil state initialiser');
if (!soilInit.includes('mixOverrides')) bail('the hhp_soil slice does not mention mixOverrides');

const bedEditor = sliceDecl(SRC, 'BedEditor');
if (!bedEditor) bail('BedEditor not found');
const commitLenText = sliceLocal(bedEditor, 'commitLen');
const commitDepthText = sliceLocal(bedEditor, 'commitDepth');
const bLenText = sliceLocal(bedEditor, 'bLen');
const bDepthText = sliceLocal(bedEditor, 'bDepth');
if (!commitLenText || !commitDepthText) bail("BedEditor's commit closures were not found");
if (!bLenText || !bDepthText) bail('BedEditor declares no bound converters (bLen / bDepth)');
if (!commitDepthText.includes('IN_TO_CM')) bail('the commitDepth slice does not convert inches');

const fieldText = sliceDecl(SRC, 'Field');
const fieldCommitText = sliceLocal(fieldText, 'commit');
if (!fieldCommitText || !fieldCommitText.includes('Math.max(min, Math.min(max, n))')) {
  bail('the Field.commit slice does not clamp; the extractor is out of step');
}

const api = new Function('CROPS', `${picked.map((p) => p.text).join('\n\n')}

// Field.commit, verbatim, with the self-heal line that precedes it in Field().
function makeFieldCommit({ raw, value, min = 0, max = 9999, onChange }) {
  if (min > max) { [min, max] = [max, min]; }
  let setRaw = () => {};
  ${fieldCommitText}
  return commit;
}

// BedEditor's own converters and commit closures, verbatim, parameterised on
// \`metric\` exactly as the component parameterises them.
function makeBedEditor(metric) {
  const dLen = metric ? FT_TO_M : 1;
  const dDepth = metric ? IN_TO_CM : 1;
  ${bLenText}
  ${bDepthText}
  ${commitLenText}
  ${commitDepthText}
  return { bLen, bDepth, commitLen, commitDepth, dLen, dDepth };
}

// The two state initialisers, verbatim, with useState and loadState injected.
// Running the REAL loader is the point: a harness that re-implements the
// sanitising it is checking proves only that the harness works.
function makeSelectionLoader(saved) {
  const useState = (fn) => [fn(), () => {}];
  const loadState = () => saved;
  ${selectionInit}
  return selection;
}

function makeSoilLoader(saved) {
  const useState = (fn) => [fn(), () => {}];
  const loadState = () => saved;
  ${soilInit}
  return soilState;
}

return { ${picked.map((p) => p.n).join(', ')}, makeFieldCommit, makeBedEditor,
         makeSelectionLoader, makeSoilLoader };
`)(CROPS);

// ------------------------------------------------------------ assertions

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(id, label) { rows.push({ id, label: `-- ${label}`, verdict: '' }); }

// The eight bed Fields, each with the canonical bounds its call site passes.
const LEN_FIELDS = [
  ['lengthFt', 'Length', api.BED_LENGTH_FT_MIN, api.BED_LENGTH_FT_MAX],
  ['widthFt', 'Width', api.BED_WIDTH_FT_MIN, api.BED_WIDTH_FT_MAX],
  ['diameterFt', 'Diameter', api.BED_DIAMETER_FT_MIN, api.BED_DIAMETER_FT_MAX],
  ['outerLengthFt', 'Outer length', api.BED_OUTER_LENGTH_FT_MIN, api.BED_OUTER_LENGTH_FT_MAX],
  ['outerWidthFt', 'Outer width', api.BED_OUTER_WIDTH_FT_MIN, api.BED_OUTER_WIDTH_FT_MAX],
  ['cutoutLengthFt', 'Cutout length', api.BED_CUTOUT_LENGTH_FT_MIN, api.BED_CUTOUT_LENGTH_FT_MAX],
  ['cutoutWidthFt', 'Cutout width', api.BED_CUTOUT_WIDTH_FT_MIN, api.BED_CUTOUT_WIDTH_FT_MAX],
];

// Every BED_* constant, read off the source so the bound expressions in the JSX
// can be evaluated exactly as written.
const BED_CONSTS = {};
for (const m of SRC.matchAll(/^const (BED_[A-Z0-9_]+|MAX_BEDS_PER_GROUP)\s*=\s*([0-9.]+);/gm)) {
  BED_CONSTS[m[1]] = Number(m[2]);
}

// The min/max a given <Field> ACTUALLY passes, lifted out of BedEditor's JSX and
// evaluated with the component's own converters. Reading the real props is what
// puts the wiring under test: a bound that regresses to a bare imperial literal
// fails the cases below instead of being papered over by a harness that
// recomputed the right answer for itself.
function fieldProps(label, metric) {
  const ed = api.makeBedEditor(metric);
  const re = new RegExp(`<Field label="${label}"[\\s\\S]*?min=\\{([^}]+)\\}\\s*max=\\{([^}]+)\\}`);
  const m = re.exec(bedEditor);
  if (!m) bail(`no <Field label="${label}"> with min/max props in BedEditor`);
  const scope = { ...BED_CONSTS, bLen: ed.bLen, bDepth: ed.bDepth };
  const ev = (e) => new Function(...Object.keys(scope), `return (${e});`)(...Object.values(scope));
  return { min: ev(m[1]), max: ev(m[2]), ed };
}

// One customer gesture: focus a bed Field, type a number, blur. Field.commit
// clamps in DISPLAY units against the props the call site passes; the BedEditor
// closure then converts and re-clamps in canonical units.
function typeDepth(metric, typed, canonicalIn = 12) {
  const { min, max, ed } = fieldProps('Depth', metric);
  let stored = null;
  api.makeFieldCommit({
    raw: String(typed),
    value: Number((canonicalIn * ed.dDepth).toFixed(1)),
    min, max,
    onChange: (v) => { stored = ed.commitDepth(v, canonicalIn); },
  })();
  return { box: Math.max(min, Math.min(max, Number(typed))), stored, min, max };
}

function typeLen(metric, typed, label, minFt, maxFt, canonicalFt = 8) {
  const { min, max, ed } = fieldProps(label, metric);
  let stored = null;
  api.makeFieldCommit({
    raw: String(typed),
    value: Number((canonicalFt * ed.dLen).toFixed(2)),
    min, max,
    onChange: (v) => { stored = ed.commitLen(v, canonicalFt, minFt, maxFt); },
  })();
  return { box: Math.max(min, Math.min(max, Number(typed))), stored, min, max };
}

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ═════════════════════════════════════ H-1: the reported repro, in metric

group('H-1', 'a metric bed Field bounds the value in the unit it displays');

{
  // The headline: 60 cm is the commonest European raised-bed depth and the
  // audit's worked case. Pre-fix it snapped to 48 (cm).
  const r = typeDepth(true, 60);
  check('H-1.1', 'metric Depth accepts 60 cm', r.box === 60, `box=${r.box}, field max=${r.max}`);
  check('H-1.2', 'and stores it as 23.62 in', near(r.stored, 60 / api.IN_TO_CM, 1e-9), `stored=${r.stored}`);
}
{
  const r = typeDepth(true, 61);
  check('H-1.3', 'metric Depth accepts 61 cm (the audit worked case)', r.box === 61, `box=${r.box}`);
  check('H-1.4', 'and stores 24.02 in, not 18.90', near(r.stored, 61 / api.IN_TO_CM, 1e-9) && r.stored > 24, `stored=${r.stored}`);
}
{
  // The ceiling still exists - it is just expressed in centimetres now. The
  // box's bound is the 1-decimal RENDERING of 48 in (121.9 cm, i.e. 47.992 in),
  // so a value typed on the bound lands one display step inside the canonical
  // ceiling rather than exactly on it. That residual is why commitDepth
  // re-clamps in inches: on other fields the same rounding goes the other way
  // (49 ft renders as 14.94 m, which converts back to 49.016 ft) and the
  // canonical clamp is what stops it escaping. The box and the store still
  // agree, because the stored value re-renders through the same conversion.
  const r = typeDepth(true, 500);
  const inRange = r.stored <= api.BED_DEPTH_IN_MAX && r.stored > api.BED_DEPTH_IN_MAX - 0.04;
  check('H-1.5', 'metric Depth caps at 48 in expressed in cm', near(r.max, 121.9, 0.05) && inRange, `max=${r.max}, stored=${r.stored}`);
}
{
  // and so does the floor.
  const r = typeDepth(true, 1);
  const inRange = r.stored >= api.BED_DEPTH_IN_MIN && r.stored < api.BED_DEPTH_IN_MIN + 0.04;
  check('H-1.6', 'metric Depth floors at 4 in expressed in cm', near(r.min, 10.2, 0.05) && inRange, `min=${r.min}, stored=${r.stored}`);
}
{
  // Imperial is the control: its behaviour must be byte-identical to before.
  const a = typeDepth(false, 61);
  const b = typeDepth(false, 24);
  const c = typeDepth(false, 2);
  check('H-1.7', 'imperial Depth still caps 61 in at 48 in', a.box === 48 && a.stored === 48, `box=${a.box}, stored=${a.stored}`);
  check('H-1.8', 'imperial Depth still accepts 24 in', b.box === 24 && b.stored === 24, `stored=${b.stored}`);
  check('H-1.9', 'imperial Depth still floors 2 in at 4 in', c.stored === 4, `stored=${c.stored}`);
}
{
  // Length ran the other way: the declared 100 was read as metres.
  const a = typeLen(true, 40, 'Length', api.BED_LENGTH_FT_MIN, api.BED_LENGTH_FT_MAX);
  const b = typeLen(true, 20, 'Length', api.BED_LENGTH_FT_MIN, api.BED_LENGTH_FT_MAX);
  check('H-1.10', 'metric Length caps 40 m at 100 ft (30.48 m)', near(a.stored, api.BED_LENGTH_FT_MAX, 1e-9), `stored=${a.stored} ft`);
  check('H-1.11', 'metric Length still accepts a real 20 m bed', near(b.stored, 20 / api.FT_TO_M, 1e-9), `stored=${b.stored} ft`);
  const c = typeLen(false, 40, 'Length', api.BED_LENGTH_FT_MIN, api.BED_LENGTH_FT_MAX);
  check('H-1.12', 'imperial Length is unchanged at 40 ft', c.stored === 40, `stored=${c.stored}`);
}

// ═════════════════════════════════ H-1: no gesture can store an out-of-range value

group('H-1s', 'a sweep of every bed Field in both units stays inside the canonical bounds');

{
  let escapes = 0;
  let notFinite = 0;
  const TYPED = [-1000, -1, 0, 0.4, 0.5, 1, 4, 12, 48, 49, 50, 99, 100, 101, 328, 1e6];
  for (const metric of [false, true]) {
    for (const [, label, lo, hi] of LEN_FIELDS) {
      for (const t of TYPED) {
        const r = typeLen(metric, t, label, lo, hi);
        if (!Number.isFinite(r.stored)) notFinite += 1;
        else if (r.stored < lo - 1e-9 || r.stored > hi + 1e-9) escapes += 1;
      }
    }
    for (const t of TYPED) {
      const r = typeDepth(metric, t);
      if (!Number.isFinite(r.stored)) notFinite += 1;
      else if (r.stored < api.BED_DEPTH_IN_MIN - 1e-9 || r.stored > api.BED_DEPTH_IN_MAX + 1e-9) escapes += 1;
    }
  }
  const total = TYPED.length * (LEN_FIELDS.length + 1) * 2;
  check('H-1s.1', `all ${total} typed values land inside the canonical bounds`, escapes === 0, `${escapes} escaped`);
  check('H-1s.2', 'and every committed value is finite', notFinite === 0, `${notFinite} non-finite`);
}

{
  // A blur with no edit must still not move the canonical value (the drift
  // guard the H-2 audit added). The bounds change must not have spent it.
  const ed = api.makeBedEditor(true);
  let canonical = 12.3456;
  for (let i = 0; i < 20; i += 1) {
    const displayed = Number((canonical * ed.dDepth).toFixed(1));
    canonical = ed.commitDepth(displayed, canonical);
  }
  check('H-1s.3', '20 metric blur cycles with no edit do not drift the canonical depth', canonical === 12.3456, `canonical=${canonical}`);
}

{
  // The box and the store must agree after a bound-adjacent commit, or the
  // customer reads one number and buys soil for another. Field.commit sets the
  // box to its clamped display value; the canonical value it produced has to
  // render back as that same string.
  let disagreements = 0;
  const ed = { false: api.makeBedEditor(false), true: api.makeBedEditor(true) };
  for (const metric of [false, true]) {
    const d = ed[metric].dLen;
    for (const [, label, lo, hi] of LEN_FIELDS) {
      for (const t of [-5, 0, 0.1, lo, hi, 1e6]) {
        const r = typeLen(metric, t, label, lo, hi);
        if (Number((r.stored * d).toFixed(2)) !== r.box) disagreements += 1;
      }
    }
    for (const t of [-5, 0, 1, 500]) {
      const r = typeDepth(metric, t);
      if (Number((r.stored * ed[metric].dDepth).toFixed(1)) !== r.box) disagreements += 1;
    }
  }
  check('H-1s.4', 'the box always shows what was stored', disagreements === 0, `${disagreements} disagreed`);
}

// ═════════════════════════════════════════════════ H-1: the money consequence

group('H-1m', 'the Soil tab orders the right amount of soil for a 60 cm bed');

{
  const stored = typeDepth(true, 60).stored;
  const bed = { shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: stored };
  const ordered = api.computeBedVolumeCuFt(bed);
  const wanted = api.computeBedVolumeCuFt({ ...bed, depthIn: 60 / api.IN_TO_CM });
  check('H-1m.1', 'the ordered volume matches the requested depth', near(ordered, wanted, 1e-9), `ordered=${ordered.toFixed(2)}, wanted=${wanted.toFixed(2)} cu ft`);
  // Pre-fix this bed stored 48 cm and ordered 50.39 against 62.99 cu ft.
  const preFix = api.computeBedVolumeCuFt({ ...bed, depthIn: 48 / api.IN_TO_CM });
  check('H-1m.2', 'and is not the 48 cm figure the unit-blind clamp produced', !near(ordered, preFix, 0.01), `ordered=${ordered.toFixed(2)}, pre-fix=${preFix.toFixed(2)} cu ft`);
}

// ═══════════════════ H-1 blast radius: the editor and the loader share one bound

group('H-1b', 'the bed bounds are declared once and read by both sides');

{
  // The audit asked for this symmetry (which matched by hand before the fix) to
  // SURVIVE it. Both sides are resolved here from the source text, in imperial,
  // so a future edit to either copy alone turns this red.
  const LABEL_TO_FIELD = {
    Length: 'lengthFt', Width: 'widthFt', Diameter: 'diameterFt',
    'Outer length': 'outerLengthFt', 'Outer width': 'outerWidthFt',
    'Cutout length': 'cutoutLengthFt', 'Cutout width': 'cutoutWidthFt',
    Depth: 'depthIn',
  };
  const consts = {};
  for (const m of SRC.matchAll(/^const (BED_[A-Z0-9_]+|MAX_BEDS_PER_GROUP)\s*=\s*([0-9.]+);/gm)) {
    consts[m[1]] = Number(m[2]);
  }
  // imperial: the display factor is 1, so a bound converter is the identity
  const scope = { ...consts, bLen: (v) => v, bDepth: (v) => v };
  const resolve = (expr) => new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));

  const editorBounds = {};
  for (const m of bedEditor.matchAll(/<Field label="([^"]+)"[\s\S]*?min=\{([^}]+)\}\s*max=\{([^}]+)\}/g)) {
    const f = LABEL_TO_FIELD[m[1]];
    if (f) editorBounds[f] = [resolve(m[2]), resolve(m[3])];
  }
  const loaderBounds = {};
  for (const m of SRC.matchAll(/(\w+):\s*(?:Math\.round\()?sanitizeNum\(\s*b\.\w+,\s*def\.\w+,\s*([^,]+),\s*([^)]+)\)/g)) {
    loaderBounds[m[1]] = [resolve(m[2].trim()), resolve(m[3].trim())];
  }

  let mismatches = 0;
  for (const f of Object.values(LABEL_TO_FIELD)) {
    const e = editorBounds[f];
    const l = loaderBounds[f];
    if (!e || !l || e[0] !== l[0] || e[1] !== l[1]) mismatches += 1;
  }
  check('H-1b.1', 'all 8 editor bounds equal the loader bounds in imperial', mismatches === 0, `${mismatches} mismatched`);
  check('H-1b.2', 'the editor reads them from the named constants', /min=\{b(?:Len|Depth)\(BED_/.test(bedEditor), 'no bLen(BED_…) / bDepth(BED_…) prop found');
  check('H-1b.3', 'and so does the loader', /sanitizeNum\([^)]*BED_[A-Z_]+/.test(SRC), 'the hhp_beds loader still carries bare literals');
}

// ═══════════════════════════════════════════ L-5: the two price Fields, same shape

group('L-5', 'a price bound converts with the price it bounds');

{
  // Soil component price: canonical $/cu ft, displayed $/L in metric.
  const metricMax = Number((api.SOIL_PRICE_MAX_PER_CUFT / api.CUFT_TO_L).toFixed(3));
  check('L-5.1', 'the metric soil-price ceiling is the cu-ft ceiling per litre', near(metricMax, 35.28, 0.01), `max=${metricMax}/L`);
  check('L-5.2', 'and is far below the pre-fix 999/L', metricMax < api.SOIL_PRICE_MAX_PER_CUFT, `max=${metricMax}`);
  // Grocery price: canonical $/lb, displayed $/kg in metric.
  const kgMax = Number((api.GROCERY_PRICE_MAX_PER_LB / api.LB_TO_KG).toFixed(2));
  check('L-5.3', 'the metric grocery ceiling is the lb ceiling per kg', near(kgMax, 1102.31, 0.01), `max=${kgMax}/kg`);
  check('L-5.4', 'and both canonical ceilings are re-imposed on commit', /Math\.min\(SOIL_PRICE_MAX_PER_CUFT/.test(SRC) && /Math\.min\(GROCERY_PRICE_MAX_PER_LB/.test(SRC), 'a commit path is missing its canonical clamp');
}

// ═══════════════════ M-1 / M-2: junk lands on the DEFAULT, never on the minimum

group('M-1', 'sanitizeNum reaches its declared default for every junk value');

// The twelve values the audit measured. `undefined` is the control: an absent
// field behaved correctly the whole time, and the divergence between it and
// `null` is what the finding is.
const JUNK = [
  ['null', null], ["''", ''], ['[]', []], ['false', false], ["' '", ' '],
  ["'x'", 'x'], ['{}', {}], ["'5abc'", '5abc'], ['true', true], ["['5']", ['5']],
  ['NaN', NaN], ['undefined', undefined],
];

// Every triple the hhp_beds loader passes, lifted from the source so a future
// field is covered without editing this list. def comes from DEFAULT_BED.
const LOADER_TRIPLES = [];
{
  const defaults = new Function(`${sliceDecl(SRC, 'BED_ID_SESSION')}
${sliceDecl(SRC, 'bedIdCounter')}
${sliceDecl(SRC, 'DEFAULT_BED')}
return DEFAULT_BED();`)();
  const scope = { ...BED_CONSTS };
  const ev = (e) => new Function(...Object.keys(scope), `return (${e});`)(...Object.values(scope));
  for (const m of SRC.matchAll(/(\w+):\s*(?:Math\.round\()?sanitizeNum\(\s*b\.\w+,\s*def\.\w+,\s*([^,]+),\s*([^)]+)\)/g)) {
    LOADER_TRIPLES.push({ field: m[1], def: defaults[m[1]], min: ev(m[2].trim()), max: ev(m[3].trim()) });
  }
}
if (LOADER_TRIPLES.length !== 9) bail(`expected 9 sanitizeNum triples in the hhp_beds loader, found ${LOADER_TRIPLES.length}`);

{
  const landedOnMin = [];
  const landedElsewhere = [];
  for (const { field, def, min, max } of LOADER_TRIPLES) {
    for (const [label, v] of JUNK) {
      const out = api.sanitizeNum(v, def, min, max);
      if (out === def) continue;
      if (out === min) landedOnMin.push(`${field}(${label})→${out}`);
      else landedElsewhere.push(`${field}(${label})→${out}`);
    }
  }
  check('M-1.1', `all ${JUNK.length} junk values on all 9 bed fields land on the declared default`,
    landedOnMin.length === 0 && landedElsewhere.length === 0,
    [...landedOnMin, ...landedElsewhere].slice(0, 6).join(', '));
  check('M-1.2', 'in particular null no longer behaves differently from an absent field',
    LOADER_TRIPLES.every(({ def, min, max }) => api.sanitizeNum(null, def, min, max) === api.sanitizeNum(undefined, def, min, max)),
    'null and undefined still diverge');
}

{
  // The other half of the contract: a REAL number is not junk. Out of range
  // clamps to the nearest bound, in range passes through, and a numeric string
  // is repaired rather than discarded.
  const t = LOADER_TRIPLES.find((x) => x.field === 'depthIn');
  check('M-1.3', 'a real in-range number is untouched', api.sanitizeNum(18, t.def, t.min, t.max) === 18);
  check('M-1.4', 'a real number above the max clamps to the max', api.sanitizeNum(9000, t.def, t.min, t.max) === t.max);
  check('M-1.5', 'a real number below the min clamps to the min', api.sanitizeNum(-9000, t.def, t.min, t.max) === t.min);
  check('M-1.6', 'a numeric string is repaired, not discarded', api.sanitizeNum('18.5', t.def, t.min, t.max) === 18.5);
  check('M-1.7', 'a real zero survives where the field allows it', api.sanitizeNum(0, 4, 0, 99) === 0);
  // Round-trip: a clean bed must come out of the loader byte-identical.
  const clean = { lengthFt: 12, widthFt: 4, depthIn: 18, diameterFt: 4, outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3, qty: 2 };
  const after = {};
  for (const { field, def, min, max } of LOADER_TRIPLES) after[field] = api.sanitizeNum(clean[field], def, min, max);
  check('M-1.8', 'a clean stored bed round-trips unchanged', JSON.stringify(after) === JSON.stringify(clean), JSON.stringify(after));
}

group('M-2', 'clampInt takes a fallback, and every call site passes one');

{
  const junkToDefault = JUNK.every(([, v]) => api.clampInt(v, 4, 1, 12) === 4);
  check('M-2.1', 'every junk familySize lands on 4, not on the minimum of 1', junkToDefault,
    JUNK.filter(([, v]) => api.clampInt(v, 4, 1, 12) !== 4).map(([l]) => l).join(', '));
  check('M-2.2', 'a real family size still clamps into 1-12', api.clampInt(50, 4, 1, 12) === 12 && api.clampInt(0, 4, 1, 12) === 1 && api.clampInt(6, 4, 1, 12) === 6);
  check('M-2.3', 'and still rounds to an integer', api.clampInt(5.6, 4, 1, 12) === 6 && api.clampInt('5.4', 4, 1, 12) === 5);
  // The produce target, whose junk value pinned the KPI at 100%.
  const ppp = (v) => api.sanitizeNum(v, 300, 50, 800);
  check('M-2.4', 'every junk produce target lands on 300 lb, not on the 50 lb minimum', JUNK.every(([, v]) => ppp(v) === 300),
    JUNK.filter(([, v]) => ppp(v) !== 300).map(([l]) => l).join(', '));
  // referenceYear: same helper, and the pre-gate that used to coerce is gone.
  const Y = 2026;
  check('M-2.5', 'a junk reference year is this year, not last year', JUNK.every(([, v]) => api.clampInt(v, Y, Y - 1, Y + 2) === Y),
    JUNK.filter(([, v]) => api.clampInt(v, Y, Y - 1, Y + 2) !== Y).map(([l]) => l).join(', '));
}

{
  // A guard lives where it is CALLED. A stale three-argument call would read
  // the caller's `min` as the fallback and the `max` as the min, silently, so
  // the call sites are asserted by shape as well as the helper by behaviour.
  const calls = [...SRC.matchAll(/\bclampInt\(/g)].map((m) => {
    let i = m.index + m[0].length;
    let depth = 1;
    let args = 1;
    while (i < SRC.length && depth > 0) {
      const c = SRC[i];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') depth -= 1;
      else if (c === ',' && depth === 1) args += 1;
      i += 1;
    }
    return args;
  });
  check('M-2.6', `every clampInt call site passes 4 arguments (${calls.length} found)`,
    calls.length > 0 && calls.every((n) => n === 4), `arg counts: ${calls.join(', ')}`);
  check('M-2.7', 'both sanitisers route through the one junk gate',
    /const sanitizeNum[\s\S]{0,400}?importedNumber\(v\)/.test(SRC) && /const clampInt[\s\S]{0,600}?importedNumber\(v\)/.test(SRC),
    'a sanitiser still coerces with a bare Number(v)');
  check('M-2.8', 'and no hand-rolled fourth copy has reappeared',
    !/Number\.isFinite\(Number\(/.test(SRC), 'a Number.isFinite(Number(...)) guard is back in the source');
}

// ═══════════════ M-3: a prototype-named key must not survive a load gate

group('M-3', 'a stored key that names an Object.prototype member is not a known key');

// The six names a plain object literal answers truthily for, plus ordinary junk
// and a real crop as controls.
const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];

// The state initializers live inside App() and cannot be brace-extracted, so
// the gates are lifted from the source between two stable anchors and evaluated.
const LOADERS_FROM = SRC.indexOf('// Calculator state');
const LOADERS_TO = SRC.indexOf('// ── Paywall state');
if (LOADERS_FROM === -1 || LOADERS_TO === -1 || LOADERS_TO < LOADERS_FROM) bail('could not locate the state-initializer region');
const LOADERS = SRC.slice(LOADERS_FROM, LOADERS_TO);

{
  // Raw truthiness, so the reason the gates were wrong is on the record.
  const inheritedTruthy = PROTO_KEYS.filter((k) => CROPS[k]);
  check('M-3.1', 'the maps really do answer truthily for all six prototype names', inheritedTruthy.length === 6, `${inheritedTruthy.length} of 6`);
  check('M-3.2', 'and hasKey answers no for every one of them', PROTO_KEYS.every((k) => api.hasKey(CROPS, k) === false),
    PROTO_KEYS.filter((k) => api.hasKey(CROPS, k)).join(', '));
  check('M-3.3', 'while a real crop is still a known key', api.hasKey(CROPS, 'tomato') === true);
  check('M-3.4', 'JSON.parse makes __proto__ an ordinary own key, which is why it was reachable',
    Object.prototype.hasOwnProperty.call(JSON.parse('{"__proto__":"weekly"}'), '__proto__') === true);
}

{
  // The crop gate, as written in the source, applied to a poisoned hhp_crops.
  const m = /if \((.+?)\) clean\[k\] = v;/.exec(LOADERS);
  if (!m) bail('could not locate the hhp_crops gate in the state-initializer region');
  const gate = new Function('CROPS', 'FREQUENCY_FACTOR', 'hasKey', 'k', 'v', `return Boolean(${m[1]});`);
  const survivors = PROTO_KEYS.filter((k) => gate(CROPS, api.FREQUENCY_FACTOR, api.hasKey, k, 'weekly'));
  check('M-3.5', 'no prototype-named crop id survives the hhp_crops gate', survivors.length === 0, survivors.join(', '));
  check('M-3.6', 'a real crop still survives it', gate(CROPS, api.FREQUENCY_FACTOR, api.hasKey, 'tomato', 'weekly') === true);
  check('M-3.7', 'and a prototype-named FREQUENCY value is refused too', !gate(CROPS, api.FREQUENCY_FACTOR, api.hasKey, 'tomato', 'constructor'));
  check('M-3.8', 'ordinary junk is still filtered', !gate(CROPS, api.FREQUENCY_FACTOR, api.hasKey, 'banana', 'weekly'));
}

{
  // The crash itself: computeResults runs inside the root App useMemo, so a
  // throw here is the whole app replaced by the ErrorBoundary, and reloading
  // re-reads the same key. Drive the poisoned payload through the gate and then
  // through the engine, exactly as a page load does.
  let threw = null;
  let result = null;
  try {
    const clean = {};
    for (const [k, v] of Object.entries(JSON.parse('{"constructor":"weekly","toString":"weekly","tomato":"weekly"}'))) {
      if (api.hasKey(CROPS, k) && api.hasKey(api.FREQUENCY_FACTOR, v)) clean[k] = v;
    }
    result = api.computeResults(clean, 4, 'fresh_preserving', 300);
  } catch (e) { threw = e; }
  check('M-3.9', 'a poisoned hhp_crops no longer throws inside the root useMemo', threw === null, threw && `${threw.constructor.name}: ${threw.message}`);
  check('M-3.10', 'and the real crop in the same payload still plans', result && result.perCrop.length === 1 && result.totalPlants > 0, result && `perCrop=${result.perCrop.length}`);
  check('M-3.11', 'the KPI is a real number, not NaN', result && Number.isFinite(result.selfSufficiencyPct), result && `${result.selfSufficiencyPct}`);
}

{
  // The softer variants the audit measured: a prototype-named goal used to
  // return a FUNCTION from the multiplier map and take every figure to NaN, and
  // a prototype-named zone returned a function whose .lastSpring is undefined.
  const goalGate = /return (hasKey\(GOAL_MULTIPLIER[^;]+|GOAL_MULTIPLIER[^;]+) : "fresh_preserving";/.exec(LOADERS);
  if (!goalGate) bail('could not locate the hhp_goal gate');
  const goalOf = new Function('GOAL_MULTIPLIER', 'hasKey', 'g', `return ${goalGate[1]} : "fresh_preserving";`);
  const zoneGate = /zone: (.+?) \? saved\.zone : 7,/.exec(LOADERS);
  if (!zoneGate) bail('could not locate the hhp_planting zone gate');
  const zoneOk = new Function('ZONE_FROST_DATES', 'hasKey', 'saved', `return Boolean(${zoneGate[1]});`);
  const badGoals = PROTO_KEYS.filter((k) => goalOf(api.GOAL_MULTIPLIER, api.hasKey, k) !== 'fresh_preserving');
  const badZones = PROTO_KEYS.filter((k) => zoneOk(api.ZONE_FROST_DATES, api.hasKey, { zone: k }));
  check('M-3.12', 'a prototype-named goal falls back to fresh_preserving', badGoals.length === 0, badGoals.join(', '));
  check('M-3.13', 'a real goal is still honoured', goalOf(api.GOAL_MULTIPLIER, api.hasKey, 'full_year') === 'full_year');
  check('M-3.14', 'a prototype-named zone falls back to 7', badZones.length === 0, badZones.join(', '));
  check('M-3.15', 'a real zone is still honoured', zoneOk(api.ZONE_FROST_DATES, api.hasKey, { zone: 9 }) === true);
}

{
  // Coverage by source shape: a tenth loader added later must not read a map
  // by an untrusted key without the gate.
  const gates = (LOADERS.match(/hasKey\(/g) || []).length;
  check('M-3.16', `every load gate reads through hasKey (${gates} calls)`, gates >= 10, `only ${gates}`);
  const bare = [...LOADERS.matchAll(/(?:CROPS|GOAL_MULTIPLIER|FREQUENCY_FACTOR|ZONE_FROST_DATES)\[/g)];
  // One bare read is legitimate: preservationOptionsFor(CROPS[id]) sits one
  // line below `if (!hasKey(CROPS, id)) continue;`.
  const unguarded = bare.filter((m) => {
    const lineStart = LOADERS.lastIndexOf('\n', m.index) + 1;
    const prevLine = LOADERS.slice(LOADERS.lastIndexOf('\n', lineStart - 2) + 1, lineStart);
    const thisLine = LOADERS.slice(lineStart, LOADERS.indexOf('\n', m.index));
    return !thisLine.includes('hasKey(') && !prevLine.includes('hasKey(');
  });
  check('M-3.17', 'no unguarded map lookup remains in the state initializers', unguarded.length === 0,
    unguarded.map((m) => LOADERS.slice(m.index - 30, m.index + 20).trim()).join(' | '));
  check('M-3.18', 'and the render-path destructure is guarded too',
    /Array\.isArray\(crop\.yieldPerPlantLbs\)/.test(SRC), 'computeResults still destructures the raw field');
}


// ═══════════ M-4: hhp_soil.mixOverrides leaves meet the editor's own bounds

group('M-4', 'every soil override leaf meets the bounds the editor declares');

{
  // Fleet-sweep audit 2026-08-18 M-2 (docs/audit-sweep-families-2026-08-18.md).
  // mixOverrides was the ONE numeric localStorage surface the 08-17 sanitiser
  // pass did not reach: the loader checked the SHAPE and nothing inside it,
  // and both consumers read the leaves with `??`, which catches null and
  // undefined and nothing else. Measured then: a stored price of 99999 (the
  // editor's ceiling is 999) billed $960,086.40 for three beds; a stored pct of
  // 60 - a percentage where the app stores a FRACTION - ordered 1,280 bags of
  // soil; "banana" printed NaN on the tab whose whole job is telling the
  // customer how much soil to buy.
  const load = (saved) => api.makeSoilLoader(saved);
  const prices = (saved) => (load(saved).mixOverrides || {}).prices || {};
  const pcts = (saved) => (load(saved).mixOverrides || {}).pcts || {};
  const withPrice = (v) => ({ mixId: 'classic_60_30_10', mixOverrides: { prices: { classic_60_30_10: { compost: v } }, pcts: {} } });
  const withPct = (v) => ({ mixId: 'custom', mixOverrides: { prices: {}, pcts: { custom: { a: v } } } });

  const bad = [
    ['banana', undefined], [true, undefined], [[], undefined], [null, undefined],
    [{}, undefined], [-50, 0], [99999, api.SOIL_PRICE_MAX_PER_CUFT],
    ['12', 12], [7.5, 7.5], [0, 0],
  ];
  let i = 0;
  for (const [stored, expected] of bad) {
    i += 1;
    const got = prices(withPrice(stored)).classic_60_30_10.compost;
    check(`M-4.${i}`, `a stored price of ${JSON.stringify(stored)} loads as ${JSON.stringify(expected)}`,
      got === expected, `got ${JSON.stringify(got)}`);
  }

  check('M-4.11', 'a percentage written where a fraction belongs is clamped to 1',
    pcts(withPct(60)).custom.a === 1, JSON.stringify(pcts(withPct(60))));
  check('M-4.12', 'a negative share cannot order negative soil',
    pcts(withPct(-1)).custom.a === 0, JSON.stringify(pcts(withPct(-1))));
  check('M-4.13', 'and a real fraction is untouched',
    pcts(withPct(0.45)).custom.a === 0.45, JSON.stringify(pcts(withPct(0.45))));

  {
    // A bucket whose only key is not a mix id reads to migrateBucket as the
    // legacy FLAT shape, so it is re-filed under the active mix - and every
    // leaf inside it is then an unknown component key, which is where it dies.
    // Either way, nothing from it can reach a price.
    const got = prices({ mixId: 'classic_60_30_10', mixOverrides: { prices: { not_a_mix: { compost: 5 } }, pcts: {} } });
    const values = Object.values(got).flatMap((m) => Object.values(m));
    check('M-4.14', 'nothing from an unknown mix id survives as a price',
      values.length === 0, JSON.stringify(got));
  }
  check('M-4.15', 'and so is an unknown component key',
    prices({ mixId: 'classic_60_30_10', mixOverrides: { prices: { classic_60_30_10: { unicorn: 5 } }, pcts: {} } }).classic_60_30_10.unicorn === undefined);
  check('M-4.16', 'a prototype-named component key never reaches the object',
    Object.getPrototypeOf(prices({ mixId: 'classic_60_30_10', mixOverrides: { prices: { classic_60_30_10: { __proto__: { polluted: 1 } } }, pcts: {} } }).classic_60_30_10) === Object.prototype);

  // The consequence, through the real money path.
  const BED = [{ id: 'b1', shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: 12, qty: 1 }];
  const mixFor = (saved) => {
    const over = (load(saved).mixOverrides || {});
    const base = api.SOIL_MIXES.find((m) => m.id === 'classic_60_30_10');
    return {
      components: base.components.map((c) => ({
        ...c,
        pct: (over.pcts?.classic_60_30_10 || {})[c.key] ?? c.pct,
        pricePerCuFt: (over.prices?.classic_60_30_10 || {})[c.key] ?? c.pricePerCuFt,
      })),
    };
  };
  const honest = api.computeSoilResults(BED, mixFor(null)).totalCost;
  const poisoned = api.computeSoilResults(BED, mixFor(withPrice(99999))).totalCost;
  const junk = api.computeSoilResults(BED, mixFor(withPrice('banana'))).totalCost;
  check('M-4.17', 'the honest default bed still costs what it always did',
    Math.abs(honest - 163.2) < 0.01, `${honest}`);
  check('M-4.18', 'a poisoned price can no longer bill six figures for one bed',
    poisoned <= 32 * api.SOIL_PRICE_MAX_PER_CUFT + 0.01 && poisoned < 10000, `${poisoned}`);
  check('M-4.19', 'and a junk price cannot make the total NaN',
    Number.isFinite(junk) && Math.abs(junk - honest) < 0.01, `${junk}`);
}

// ═════════════ M-5: clearing a Field restores the value, it does not commit min

group('M-5', 'clearing a Field puts the current value back, not the minimum');

{
  // audit-vault-families-2026-08-17 L-4. Select-all + delete + blur on "Annual
  // produce per person" committed min = 50 lb: the household target fell from
  // 1,200 lb to 200 and the hero self-sufficiency KPI read 100.0% for a garden
  // that honestly covers 47.8%. "I cleared the box" is a far more natural
  // gesture than "I set my household's annual need to the lowest value this
  // product allows".
  const clear = (value, min, max) => {
    let committed = 'NOT CALLED';
    let displayed = null;
    const commit = api.makeFieldCommit({
      raw: '   ', value, min, max,
      onChange: (v) => { committed = v; },
    });
    displayed = commit();
    return { committed };
  };

  const produce = clear(300, api.MIN_PRODUCE_PER_PERSON_LBS ?? 50, 800);
  check('M-5.1', 'clearing the produce target commits nothing',
    produce.committed === 'NOT CALLED', `committed ${JSON.stringify(produce.committed)}`);
  const depth = clear(12, 4, 48);
  check('M-5.2', 'clearing a bed depth commits nothing either',
    depth.committed === 'NOT CALLED', `committed ${JSON.stringify(depth.committed)}`);
  const zero = clear(0, 0, 500);
  check('M-5.3', 'a field legitimately sitting at zero is left at zero',
    zero.committed === 'NOT CALLED', `committed ${JSON.stringify(zero.committed)}`);
  const noValue = clear(undefined, 4, 48);
  check('M-5.4', 'a field with no value to restore still falls back to its minimum',
    noValue.committed === 4, `committed ${JSON.stringify(noValue.committed)}`);

  // The KPI the finding is really about, measured through the real engine.
  const sel = { tomato: 'weekly', carrot: 'weekly', lettuce_leaf: 'weekly' };
  const honest = api.computeResults(sel, 4, 'full_year', 300);
  const cleared = api.computeResults(sel, 4, 'full_year', 50);
  check('M-5.5', 'the household target the KPI divides by is unchanged by a clear',
    honest.householdTarget === 1200 && cleared.householdTarget === 200,
    `${honest.householdTarget} / ${cleared.householdTarget}`);
  check('M-5.6', 'and a cleared target is what inflated the KPI (6x on this basket)',
    cleared.selfSufficiencyPct > honest.selfSufficiencyPct * 3,
    `${cleared.selfSufficiencyPct} vs ${honest.selfSufficiencyPct}`);
}

// ══════════════ M-6: an empty crop selection is a choice, not a missing key

group('M-6', 'an empty crop selection survives a reload');

{
  // Code review 2026-09-06 M-4. hhp_crops was written as `{}` correctly and
  // discarded on read, so a customer who cleared every box to build a short
  // list and then reloaded silently got the twelve-crop preset back - with
  // different plant counts, a different area, a different savings figure and a
  // different plan behind them.
  const load = (saved) => api.makeSelectionLoader(saved);
  const preset = Object.keys(api.PRESETS.family_basics.selection).length;

  check('M-6.1', 'an empty object stays empty', Object.keys(load({})).length === 0,
    JSON.stringify(load({})));
  check('M-6.2', 'an absent key still gets the starter preset',
    Object.keys(load(null)).length === preset, `${Object.keys(load(null)).length}`);
  check('M-6.3', 'so does a stored value that is not an object',
    Object.keys(load('nope')).length === preset && Object.keys(load(7)).length === preset);
  check('M-6.4', 'an array is junk here, not an empty selection',
    Object.keys(load([])).length === preset, JSON.stringify(load([])));
  check('M-6.5', 'a real selection is loaded as stored',
    JSON.stringify(load({ tomato: 'weekly' })) === JSON.stringify({ tomato: 'weekly' }),
    JSON.stringify(load({ tomato: 'weekly' })));
  check('M-6.6', 'and junk entries are still filtered out',
    Object.keys(load({ tomato: 'weekly', not_a_crop: 'weekly', carrot: 'hourly' })).length === 1);
  check('M-6.7', 'an empty selection produces no plants and no space, not a preset',
    api.computeResults(load({}), 4, 'full_year', 300).perCrop.length === 0);
}

// ═════ N-5: the garden-space Field at its metric floor, five focus/blur cycles

group('N-5', 'the garden-space Field does not drift at the bound it displays');

{
  // Code re-review 2026-09-07. The bound was rounded (Math.round(0.929) = 1 m2)
  // while the value was displayed at one decimal (0.9), so the field opened
  // BELOW its own minimum. An untouched focus + Tab ran Field.commit, which
  // clamped 0.9 up to 1 and wrote 1 / SQFT_TO_SQM = 10.7639 sq ft: a 7.6% jump
  // at the floor, from a gesture that changed nothing.
  //
  // This drives the WHOLE chain the customer touches - the real Field.commit
  // over the real GardenSpaceField bounds - because either half alone looks
  // correct. Field.commit clamps to the bound it is given; GardenSpaceField's
  // own commit skips a no-op. The defect lived between them.
  const garden = sliceDecl(SRC, 'GardenSpaceField');
  const gMin = sliceDecl(SRC, 'GARDEN_SQFT_MIN');
  const gMax = sliceDecl(SRC, 'GARDEN_SQFT_MAX');
  const gToDisplay = garden && sliceLocal(garden, 'toDisplay');
  const gMinLocal = garden && sliceLocal(garden, 'min');
  const gMaxLocal = garden && sliceLocal(garden, 'max');
  const gCommit = garden && sliceLocal(garden, 'commit');
  if (!garden || !gToDisplay || !gMinLocal || !gMaxLocal || !gCommit || !gMin || !gMax) {
    check('N-5.0', 'GardenSpaceField, its display transform and its bounds are all liftable',
      false, 'the extractor is out of step with the source');
  } else {
    const makeGarden = new Function('SQFT_TO_SQM', `${gMin}\n${gMax}
      return function makeGarden(metric, canonical, onChange) {
        ${gToDisplay}
        ${gMinLocal}
        ${gMaxLocal}
        ${gCommit}
        return { commit, min, max, display: toDisplay(canonical) };
      };`)(api.SQFT_TO_SQM);

    // One untouched focus + blur: the box shows what it shows, and blurs.
    const cycles = (metric, start, n) => {
      let canonical = start;
      const seen = [];
      for (let i = 0; i < n; i += 1) {
        const g = makeGarden(metric, canonical, (v) => { canonical = v; });
        seen.push(g.display);
        api.makeFieldCommit({
          raw: String(g.display), value: g.display, min: g.min, max: g.max,
          onChange: g.commit,
        })();
      }
      return { canonical, seen };
    };

    const floorM = cycles(true, 10, 5);
    check('N-5.1', 'five untouched cycles at the metric floor leave 10 sq ft alone',
      Math.abs(floorM.canonical - 10) < 1e-9, `stored=${floorM.canonical} shown=${floorM.seen.join(',')}`);
    const ceilM = cycles(true, 100000, 5);
    check('N-5.2', 'and five at the metric ceiling leave 100000 sq ft alone',
      Math.abs(ceilM.canonical - 100000) < 1e-9, `stored=${ceilM.canonical}`);
    const midM = cycles(true, 137.2 / api.SQFT_TO_SQM, 5);
    check('N-5.3', 'control: the mid-range case that already held still holds',
      Math.abs(midM.canonical - 137.2 / api.SQFT_TO_SQM) < 1e-9, `stored=${midM.canonical}`);
    const floorI = cycles(false, 10, 5);
    check('N-5.4', 'control: the imperial floor was never affected',
      floorI.canonical === 10, `stored=${floorI.canonical}`);

    // A real edit must still clamp. The floor moving must not become "no floor".
    let below = null;
    const g = makeGarden(true, 320, (v) => { below = v; });
    api.makeFieldCommit({ raw: '0.1', value: g.display, min: g.min, max: g.max, onChange: g.commit })();
    check('N-5.5', 'typing below the floor still clamps to the 10 sq ft minimum',
      below !== null && Math.abs(below - 10) < 1e-6, `stored=${below}`);
    let above = null;
    const g2 = makeGarden(true, 320, (v) => { above = v; });
    api.makeFieldCommit({ raw: '999999', value: g2.display, min: g2.min, max: g2.max, onChange: g2.commit })();
    // The ceiling lands within one step of the display's own resolution: 100000
    // sq ft is 9290.304 m2 and the box carries one decimal, so the clamp can
    // only ever be 9290.3. It may not EXCEED the maximum, and it may not fall a
    // whole step below it (Math.round used to put it at 9290 = 99996.7 sq ft).
    check('N-5.6', 'and typing above the ceiling clamps to the maximum, within the display step',
      above !== null && above <= 100000 && above > 100000 - (0.1 / api.SQFT_TO_SQM), `stored=${above}`);
  }
}

// ═════ R3-1: the produce-target Field at its metric floor, five focus/blur cycles

group('R3-1', 'the produce-target Field does not drift at the bound it displays');

{
  // Code review round 3, 2026-09-07. The N-5 class on the one other Field that
  // converts its bounds: the value was displayed at one decimal (22.7 kg at
  // the 50 lb floor) while the JSX handed Field a bound of Math.round(22.68)
  // = 23, so an untouched focus + Tab clamped 22.7 up to 23 and wrote
  // 23 / LB_TO_KG = 50.706 lb. The harness lifts the closure's own display
  // transform, its bounds AND the min/max props the JSX passes, so it measures
  // the shipped pair on either revision: the pre-fix source rounds the props,
  // the fix passes the closure's bounds straight through.
  const produce = sliceDecl(SRC, 'ProduceTargetField');
  const pMin = sliceDecl(SRC, 'MIN_PRODUCE_PER_PERSON_LBS');
  const pMax = sliceDecl(SRC, 'MAX_PRODUCE_PER_PERSON_LBS');
  const pieces = produce && ['toDisplay', 'displayValue', 'min', 'max', 'commit']
    .map((name) => sliceLocal(produce, name))
    .filter(Boolean);
  const props = produce && /<Field label="Annual produce per person"[\s\S]*?min=\{([^}]+)\}\s*max=\{([^}]+)\}/.exec(produce);
  if (!produce || !pMin || !pMax || !props || !pieces || pieces.length < 4) {
    check('R3-1.0', 'ProduceTargetField, its bounds and its Field props are all liftable',
      false, 'the extractor is out of step with the source');
  } else {
    const makeProduce = new Function('LB_TO_KG', `${pMin}\n${pMax}
      return function makeProduce(metric, value, onChange) {
        ${pieces.join('\n')}
        return { commit, min: (${props[1]}), max: (${props[2]}), display: displayValue };
      };`)(api.LB_TO_KG);

    const cyclesP = (metric, start, n) => {
      let canonical = start;
      const seen = [];
      for (let i = 0; i < n; i += 1) {
        const p = makeProduce(metric, canonical, (v) => { canonical = v; });
        seen.push(p.display);
        api.makeFieldCommit({
          raw: String(p.display), value: p.display, min: p.min, max: p.max,
          onChange: p.commit,
        })();
      }
      return { canonical, seen };
    };

    const floorM = cyclesP(true, 50, 5);
    check('R3-1.1', 'five untouched cycles at the metric floor leave 50 lb alone',
      Math.abs(floorM.canonical - 50) < 1e-9, `stored=${floorM.canonical} shown=${floorM.seen.join(',')}`);
    const ceilM = cyclesP(true, 800, 5);
    check('R3-1.2', 'and five at the metric ceiling leave 800 lb alone',
      Math.abs(ceilM.canonical - 800) < 1e-9, `stored=${ceilM.canonical}`);
    const midM = cyclesP(true, 300, 5);
    check('R3-1.3', 'control: the default 300 lb still holds',
      Math.abs(midM.canonical - 300) < 1e-9, `stored=${midM.canonical}`);
    const floorI = cyclesP(false, 50, 5);
    check('R3-1.4', 'control: the imperial floor was never affected', floorI.canonical === 50, `stored=${floorI.canonical}`);

    // Typing the floor, or below it, in kg lands within one display step of
    // the 50 lb minimum: 22.7 kg is 50.04 lb; the pre-fix bound of 23 kg put
    // it at 50.71.
    const stepLb = 0.1 / api.LB_TO_KG;
    let typed = null;
    const p20 = makeProduce(true, 300, (v) => { typed = v; });
    api.makeFieldCommit({ raw: '20', value: p20.display, min: p20.min, max: p20.max, onChange: p20.commit })();
    check('R3-1.5', 'typing 20 kg lands on the 50 lb floor, within the display step',
      typed !== null && typed >= 50 && typed < 50 + stepLb, `stored=${typed}`);
    let typedMax = null;
    const p999 = makeProduce(true, 300, (v) => { typedMax = v; });
    api.makeFieldCommit({ raw: '999', value: p999.display, min: p999.min, max: p999.max, onChange: p999.commit })();
    check('R3-1.6', 'typing above the ceiling clamps to 800 lb, within the display step',
      typedMax !== null && typedMax <= 800 && typedMax > 800 - stepLb, `stored=${typedMax}`);
    check('R3-1.7', 'the <Field> is handed the closure\'s own bounds, not a separately rounded pair',
      props[1].trim() === 'min' && props[2].trim() === 'max', `min={${props[1]}} max={${props[2]}}`);

    // R3-5: a value stored from a metric entry prints rounded once the header
    // toggle goes back to imperial, and an untouched blur on it writes nothing.
    const fromKg = 25 / api.LB_TO_KG; // 55.11556554621939 lb
    let wrote = null;
    const pI = makeProduce(false, fromKg, (v) => { wrote = v; });
    check('R3-5.p1', 'imperial shows a metric-entered value at one decimal (55.1, not 55.11556554621939)',
      pI.display === 55.1, `display=${pI.display}`);
    api.makeFieldCommit({ raw: String(pI.display), value: pI.display, min: pI.min, max: pI.max, onChange: pI.commit })();
    check('R3-5.p2', 'and an untouched blur on it writes nothing', wrote === null, `wrote=${wrote}`);
  }
}

// --------------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\nbounds + sanitisers probe  (source: ${SRC_PATH})`);
console.log('H-1 unit-aware bed bounds | L-5 unit-aware price bounds\n');
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
console.log(`bounds + sanitisers: ${cases}/${cases} assertions OK.`);
process.exit(0);
