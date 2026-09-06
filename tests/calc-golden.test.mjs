// tests/calc-golden.test.mjs
//
// The calculation goldens. Engineering review 2026-09-06 (I-3) named their
// absence as the reason every HIGH and MEDIUM in that document survived a green
// five-suite run:
//
//   "Five suites, 241 assertions, exit 0 - and not one pins a numeric result
//    from computeResults, computeSoilResults, computePreservationForCrop, or
//    computePlantingDates."
//
// So this file pins numbers. Every expected value below comes from the review's
// own tables, or is derived from a figure it states, or - where the review gave
// none - is a first pin of a value computed by the shipped code and hand-checked
// against the arithmetic in the review's method section.
//
// TWO FAMILIES OF CASES, and the difference matters:
//
//   REVIEW-ERA. The review measured savings and footprints against the crop
//   constants of the day, and four of those constants were themselves findings
//   (M-2 spacings, L-3 the rounded 0.11, M-6 three BLS prices). Re-pinning its
//   tables against today's table would silently redefine what "the review said".
//   Instead these cases run the REAL shipped functions over a crop table
//   restored to the review-era constants, and reproduce its figures to the
//   digit: $70.92, 59.22 months, 47.6%, 22 / 397 / 2,955 sq ft, $1,102, $5,113.
//   That is what proves the FIX is the fix.
//
//   SHIPPED. The same cases over today's crop table, pinning the new baseline
//   so the next constant change has to be deliberate.
//
// The engine is lifted out of src/App.jsx VERBATIM by brace extraction at run
// time - the same technique tests/bounds-and-sanitisers.test.mjs uses - because
// App.jsx is JSX and cannot be imported by node, and because a hand-copied
// formula goes stale the first time the file moves and then proves nothing
// about what ships. api/generate.js is lifted the same way rather than imported,
// so no module-level Redis client is constructed and no network call is
// possible from this suite. Nothing here calls Anthropic or LemonSqueezy.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//
// CONTROL (proves these cases are not vacuous). Point the harness at a copy of
// the pre-fix sources:
//   HHP_APP_SRC=<pre-fix App.jsx> HHP_CROPS_SRC=<pre-fix crops.js> \
//   HHP_GENERATE_SRC=<pre-fix generate.js> node tests/calc-golden.test.mjs
// Against 2b46161 (the audit tip) that run fails 100 of 172 cases - measured,
// not asserted. Against the tree it reports 253/253 and exits 0.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = process.env.HHP_APP_SRC || join(HERE, '..', 'src', 'App.jsx');
const CROPS_PATH = process.env.HHP_CROPS_SRC || join(HERE, '..', 'src', 'data', 'crops.js');
const GENERATE_PATH = process.env.HHP_GENERATE_SRC || join(HERE, '..', 'api', 'generate.js');
if (process.env.HHP_APP_SRC || process.env.HHP_CROPS_SRC || process.env.HHP_GENERATE_SRC) {
  console.log(`[control run] app=${APP_PATH}\n              crops=${CROPS_PATH}\n              generate=${GENERATE_PATH}`);
}
// Windows checkouts hold CRLF. Normalise before any offset arithmetic.
const APP_SRC = readFileSync(APP_PATH, 'utf8').replace(/\r\n/g, '\n');
const GEN_SRC = readFileSync(GENERATE_PATH, 'utf8').replace(/\r\n/g, '\n');
const { CROPS } = await import(pathToFileURL(resolve(CROPS_PATH)).href);

// ---------------------------------------------------------------- extractor
// Ported from tests/bounds-and-sanitisers.test.mjs. Walks one top-level
// declaration, stepping over strings, template literals and comments so a brace
// or a semicolon inside them cannot end the slice early.
//
// One addition over that harness: REGEX LITERALS. escapeHtml contains
// `.replace(/"/g, "&quot;")`, and a walker that does not know a regex when it
// sees one reads that quote as the start of a string, swallows the rest of the
// file, and hands back JSX. The heuristic is the standard one - a `/` in an
// operand position starts a regex, a `/` after a value is division - and it is
// exercised by every declaration this suite lifts.
const REGEX_OPERAND_CHARS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_OPERAND_WORDS = new Set(['return', 'typeof', 'instanceof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await']);
function startsRegex(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  const prev = src[j];
  if (REGEX_OPERAND_CHARS.has(prev)) return true;
  if (/[A-Za-z0-9_$]/.test(prev)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k -= 1;
    return REGEX_OPERAND_WORDS.has(src.slice(k + 1, j + 1));
  }
  return false;
}
function skipRegex(src, i) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[') { inClass = true; j += 1; continue; }
    if (c === ']') { inClass = false; j += 1; continue; }
    if (c === '\n') return i + 1;           // not a regex after all; bail safely
    if (c === '/' && !inClass) {
      j += 1;
      while (j < src.length && /[a-z]/.test(src[j])) j += 1;  // flags
      return j;
    }
    j += 1;
  }
  return i + 1;
}
function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j += 1;
  }
  return src.length;
}
// Template literals nest: buildPlanReportHtml is one big `...${rows.map((r) =>
// `...`).join("")}...`. A walker that just toggles a boolean on every backtick
// reads the inner ones as closing the outer one and then parses HTML as code.
// So this keeps a stack: a backtick pushes a template frame, `${` pushes a code
// frame inside it, and the matching `}` pops back into the template.
function walk(src, start, isFn) {
  let i = start;
  const stack = [{ kind: 'code', depth: 0, sub: false }];
  if (isFn) {
    let p = 0;
    for (let j = src.indexOf('(', start); j < src.length; j += 1) {
      if (src[j] === '(') p += 1;
      else if (src[j] === ')') { p -= 1; if (p === 0) { i = j + 1; break; } }
    }
  }
  while (i < src.length) {
    const f = stack[stack.length - 1];
    const c = src[i];
    const c2 = src[i + 1];
    if (f.kind === 'tmpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '$' && c2 === '{') { stack.push({ kind: 'code', depth: 0, sub: true }); i += 2; continue; }
      if (c === '`') { stack.pop(); i += 1; continue; }
      i += 1;
      continue;
    }
    if (c === '/' && c2 === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl + 1; continue; }
    if (c === '/' && c2 === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"') { i = skipString(src, i); continue; }
    if (c === '`') { stack.push({ kind: 'tmpl' }); i += 1; continue; }
    if (c === '/' && startsRegex(src, i)) { i = skipRegex(src, i); continue; }
    if (c === '{') { f.depth += 1; i += 1; continue; }
    if (c === '}') {
      if (f.sub && f.depth === 0) { stack.pop(); i += 1; continue; }
      f.depth -= 1;
      i += 1;
      if (isFn && stack.length === 1 && f.depth === 0) return src.slice(start, i);
      continue;
    }
    if (c === ';' && stack.length === 1 && f.depth === 0 && !isFn) return src.slice(start, i + 1);
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
// One declaration nested inside another (indented), e.g. GardenSpaceField's
// commit closure. Same helper name and shape as tests/bounds-and-sanitisers.
function sliceLocal(src, name) {
  const re = new RegExp(`(?:^|\\n)(\\s*)(const|let|function)\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) return null;
  return walk(src, m.index + m[0].indexOf(m[2]), m[2] === 'function');
}

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail !== undefined ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }
// A missing declaration is already reported as an X- row above; without this
// wrapper the first TypeError from it would abort the run and the CONTROL
// against pre-fix sources would print a stack trace instead of a count.
function safe(fn) {
  try { fn(); } catch (e) {
    check('E', `a golden block threw instead of failing cleanly: ${e?.message}`, false);
  }
}
function near(id, label, actual, expected, eps = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= eps;
  check(id, label, ok, `expected ${expected}, got ${actual}`);
}
function eq(id, label, actual, expected) {
  check(id, label, Object.is(actual, expected) || actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Build one evaluable module out of the named top-level declarations, in source
// order so const/TDZ resolves exactly as it does in the file.
function buildModule(src, names, argName, argValue, tag) {
  const missing = names.filter((n) => !sliceDecl(src, n));
  for (const n of missing) {
    check(`X-${n}`, `${tag}: top-level declaration ${n} exists`, false, 'not found');
  }
  const found = names.filter((n) => sliceDecl(src, n));
  const picked = found.map((n) => {
    const text = sliceDecl(src, n);
    return { n, text, at: src.indexOf(text) };
  }).sort((a, b) => a.at - b.at);
  const body = `${picked.map((p) => p.text).join('\n\n')}
return { ${picked.map((p) => p.n).join(', ')} };`;
  try {
    return new Function(argName, body)(argValue);
  } catch (e) {
    check(`X-${tag}`, `${tag}: extracted module evaluates`, false, e?.message);
    return {};
  }
}

const APP_NAMES = [
  'SQFT_TO_SQM', 'LB_TO_KG', 'FT_TO_M', 'IN_TO_CM', 'CUFT_TO_CUYD',
  'CUFT_TO_L', 'CUFT_TO_CUM', 'SETTLING_BUFFER',
  'PATH_SHARE_OF_FOOTPRINT', 'PATH_BUFFER',
  'DEFAULT_PRODUCE_PER_PERSON_LBS', 'GOAL_MULTIPLIER', 'FREQUENCY_FACTOR',
  'PRESETS', 'BAG_SIZES_CUFT', 'BAG_SIZES_L', 'ZONE_FROST_DATES',
  'fmtDecimal', 'fmtInt', 'ZERO_DECIMAL_CURRENCIES', 'moneyDecimals',
  'fmtAreaValue', 'fmtMassValue', 'fmtMassRounded',
  'monthDayToDate', 'addWeeks', 'shiftMonths', 'SHORT_MONTHS',
  'daysInYear', 'dayOfYear', 'getFrostDates', 'parseIsoDate',
  'computePlantingDates', 'splitRange',
  'computeResults', 'computeSavingsRows',
  'SOIL_MIXES', 'computeBedVolumeCuFt', 'computeSoilResults',
  'FREEZER_BAG_LBS', 'FREEZER_BAG_CUFT', 'DEHYDRATOR_LBS_PER_BATCH',
  'ROOT_CELLAR_LBS_PER_INCH', 'QUART_LBS', 'PINT_LBS',
  'PINT_PER_QUART_RATIO', 'SAUCE_QUART_LBS', 'PRESERVATION_SHELF_MONTHS',
  'jarQuartLbs', 'computePreservationForCrop',
  'MONTH_ORDER', 'monthIndex', 'engineYieldRows', 'engineHarvestRows',
  'SUN_OPTIONS', 'SOIL_OPTIONS', 'WATER_OPTIONS', 'EXPERIENCE_OPTIONS',
  'GOAL_CHIPS', 'escapeHtml', 'buildPlanReportHtml',
];
const app = buildModule(APP_SRC, APP_NAMES, 'CROPS', CROPS, 'App.jsx');

const GEN_NAMES = [
  'MONTH_NAMES', 'SYSTEM_PROMPT', 'PLAN_SCHEMA', 'buildUserPrompt',
  'PLAN_STR_MAX', 'PLAN_SHORT_MAX', 's', 'sArr', 'n', 'sanitisePlan',
];
const gen = buildModule(GEN_SRC, GEN_NAMES, '__unused', null, 'api/generate.js');

// If the engine did not come out at all there is nothing to measure. Report and
// stop rather than printing 190 cascading failures.
if (!app.computeResults || !app.computeSoilResults) {
  console.error('\ncalc-golden: the engine could not be extracted; see the X- rows above.');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

// ------------------------------------------------------- review-era overlay
// The crop constants as the 2026-09-06 engineering review measured them. Only
// the five spacings it corrected (M-2), the twelve 9-per-sq-ft crops that
// carried the rounded literal 0.11 (L-3), and the three BLS prices it re-based
// (M-6) differ from the shipped table.
function reviewEraCrops() {
  const out = JSON.parse(JSON.stringify(CROPS));
  for (const k of Object.keys(out)) {
    if (Math.abs(out[k].spacingSqFt - 1 / 9) < 1e-12) out[k].spacingSqFt = 0.11;
  }
  out.peas_snap.spacingSqFt = 0.0625;
  out.peas_shell.spacingSqFt = 0.0625;
  out.arugula.spacingSqFt = 0.0625;
  out.lettuce.spacingSqFt = 0.11;
  out.parsnip.spacingSqFt = 0.11;
  out.tomato.groceryPricePerLb = 2.50;
  out.tomato_determinate.groceryPricePerLb = 2.50;
  out.lettuce.groceryPricePerLb = 2.75;
  out.potato.groceryPricePerLb = 1.10;
  return out;
}
const reviewApp = buildModule(APP_SRC, APP_NAMES, 'CROPS', reviewEraCrops(), 'App.jsx@review-era');

const REVIEW_SETUP_COST = 350;   // the setup total the review's break-even used
function summarise(engine, selection, familySize, goal) {
  const r = engine.computeResults(selection, familySize, goal);
  const s = engine.computeSavingsRows(r.perCrop, {});
  const uncapped = s.rows.reduce((acc, x) => acc + x.expectedYieldLbs * x.pricePerLb, 0);
  return {
    r,
    savings: s.totalSavings,
    uncapped,
    surplusLbs: s.totalSurplusLbs,
    breakEven: REVIEW_SETUP_COST / (s.totalSavings / 12),
  };
}
const allSelection = (table) => Object.keys(table).reduce((a, k) => { a[k] = 'weekly'; return a; }, {});

// ══════════════════════════════════════════════════════════ 1. constants
group('unit conversions - exact by definition (L-2)');
safe(() => {
near('C-1', 'SQFT_TO_SQM = 0.3048^2', app.SQFT_TO_SQM, 0.09290304, 0);
near('C-2', 'FT_TO_M = 0.3048', app.FT_TO_M, 0.3048, 0);
near('C-3', 'IN_TO_CM = 2.54', app.IN_TO_CM, 2.54, 0);
near('C-4', 'CUFT_TO_CUYD = 1/27', app.CUFT_TO_CUYD, 1 / 27, 0);
near('C-5', 'LB_TO_KG = 0.45359237 (was 0.453592)', app.LB_TO_KG, 0.45359237, 0);
near('C-6', 'CUFT_TO_L = 28.316846592 (was 28.3168)', app.CUFT_TO_L, 28.316846592, 0);
near('C-7', 'CUFT_TO_CUM = 0.028316846592 (was 0.0283168)', app.CUFT_TO_CUM, 0.028316846592, 0);
near('C-8', 'CUFT_TO_L = CUFT_TO_CUM x 1000', app.CUFT_TO_L, app.CUFT_TO_CUM * 1000, 1e-9);
});

group('path buffer - M-1');
safe(() => {
near('C-9', 'PATH_SHARE_OF_FOOTPRINT = 0.30', app.PATH_SHARE_OF_FOOTPRINT, 0.30, 0);
near('C-10', 'PATH_BUFFER = 1/(1-0.30) = 1.428571...', app.PATH_BUFFER, 1 / 0.7, 1e-12);
near('C-11', 'paths really are 30% of the buffered footprint',
  (app.PATH_BUFFER - 1) / app.PATH_BUFFER, 0.30, 1e-12);
check('C-12', 'PATH_BUFFER is no longer the 1.30 that meant 23.1%',
  Math.abs(app.PATH_BUFFER - 1.30) > 0.1, app.PATH_BUFFER);
});

group('preservation constants - M-3 / L-6');
safe(() => {
near('C-13', 'QUART_LBS = 3 (NCHFP 21 lb / 7 qt)', app.QUART_LBS, 3, 0);
near('C-14', 'PINT_LBS = 13/9 = 1.4444 (NCHFP 13 lb / 9 pt), was 1.5', app.PINT_LBS, 13 / 9, 1e-12);
near('C-15', 'SAUCE_QUART_LBS = 5 (NCHFP 35 lb / 7 qt)', app.SAUCE_QUART_LBS, 5, 0);
near('C-16', 'PINT_PER_QUART_RATIO = PINT_LBS / QUART_LBS', app.PINT_PER_QUART_RATIO, (13 / 9) / 3, 1e-12);
near('C-17', 'SETTLING_BUFFER = 1.15', app.SETTLING_BUFFER, 1.15, 0);
near('C-18', 'FREEZER_BAG_LBS = 3', app.FREEZER_BAG_LBS, 3, 0);
near('C-19', 'FREEZER_BAG_CUFT = 0.1337 (1 US gal)', app.FREEZER_BAG_CUFT, 0.1337, 0);
near('C-20', 'DEHYDRATOR_LBS_PER_BATCH = 8', app.DEHYDRATOR_LBS_PER_BATCH, 8, 0);
near('C-21', 'ROOT_CELLAR_LBS_PER_INCH = 5/6', app.ROOT_CELLAR_LBS_PER_INCH, 5 / 6, 1e-12);
near('C-22', 'DEFAULT_PRODUCE_PER_PERSON_LBS = 300', app.DEFAULT_PRODUCE_PER_PERSON_LBS, 300, 0);

// ══════════════════════════════════════════════════ 2. crop table (M-2/L-3/M-6)
});
group('Square Foot Gardening spacings - M-2');
safe(() => {
const perSqFt = (k) => 1 / CROPS[k].spacingSqFt;
near('S-1', 'peas_snap = 8 plants/sq ft (was 16)', perSqFt('peas_snap'), 8, 1e-9);
near('S-2', 'peas_shell = 8 plants/sq ft (was 16)', perSqFt('peas_shell'), 8, 1e-9);
near('S-3', 'arugula = 4 plants/sq ft (was 16)', perSqFt('arugula'), 4, 1e-9);
near('S-4', 'lettuce (leaf) = 4 plants/sq ft (was 9.09)', perSqFt('lettuce'), 4, 1e-9);
near('S-5', 'parsnip = 4 plants/sq ft (was 9.09)', perSqFt('parsnip'), 4, 1e-9);
near('S-6', 'carrot = 16 plants/sq ft (unchanged, correct)', perSqFt('carrot'), 16, 1e-9);
near('S-7', 'radish = 16 plants/sq ft (unchanged, correct)', perSqFt('radish'), 16, 1e-9);
for (const [i, k] of ['beet', 'spinach', 'green_beans_bush', 'turnip'].entries()) {
  near(`S-${8 + i}`, `${k} = exactly 9 plants/sq ft (1/9, not the rounded 0.11)`, perSqFt(k), 9, 1e-9);
}
const stillEleven = Object.keys(CROPS).filter((k) => CROPS[k].spacingSqFt === 0.11);
eq('S-12', 'no crop carries the rounded literal 0.11 any more (L-3)', stillEleven.length, 0);
const nineCrops = Object.keys(CROPS).filter((k) => Math.abs(CROPS[k].spacingSqFt - 1 / 9) < 1e-12);
eq('S-13', 'twelve crops moved from 0.11 to 1/9, two of them left for 0.25', nineCrops.length, 10);
});

group('grocery prices re-based on BLS - M-6');
safe(() => {
near('P-1', 'potato = $0.94/lb (BLS APU0000712112, Jul-2026 $0.942)', CROPS.potato.groceryPricePerLb, 0.94, 1e-12);
near('P-2', 'tomato = $2.00/lb (BLS APU0000712311, $2.003)', CROPS.tomato.groceryPricePerLb, 2.00, 1e-12);
near('P-3', 'tomato_determinate follows the same field-tomato series', CROPS.tomato_determinate.groceryPricePerLb, 2.00, 1e-12);
near('P-4', 'lettuce (leaf) = $3.47/lb (BLS APU0000FL2101, $3.469)', CROPS.lettuce.groceryPricePerLb, 3.47, 1e-12);
check('P-5', 'every crop still carries a finite grocery price',
  Object.keys(CROPS).every((k) => Number.isFinite(CROPS[k].groceryPricePerLb)));
});

group('crop-specific canning weights - M-3');
safe(() => {
near('P-6', 'green_beans_bush lbsPerQuart = 2 (NCHFP 14 lb / 7 qt)', CROPS.green_beans_bush.lbsPerQuart, 2, 0);
near('P-7', 'green_beans_pole lbsPerQuart = 2', CROPS.green_beans_pole.lbsPerQuart, 2, 0);
near('P-8', 'carrot lbsPerQuart = 2.5 (NCHFP 17.5 lb / 7 qt)', CROPS.carrot.lbsPerQuart, 2.5, 0);
eq('P-9', 'tomato has no override and uses the documented default', CROPS.tomato.lbsPerQuart, undefined);
check('P-10', 'no crop carries a non-positive lbsPerQuart',
  Object.keys(CROPS).every((k) => CROPS[k].lbsPerQuart === undefined
    || (Number.isFinite(CROPS[k].lbsPerQuart) && CROPS[k].lbsPerQuart > 0)));
});

group('Full Homestead preset - M-4');
safe(() => {
const fh = app.PRESETS?.full_homestead?.selection || {};
eq('M4-1', 'preset selects the 74 non-variety crops, not all 82', Object.keys(fh).length, 74);
check('M4-2', 'no variety child is selected beside its parent',
  Object.keys(fh).every((k) => !CROPS[k].parentCrop));
near('M4-3', 'summed consumption 295.45 lb/person/yr, against a 300 lb default',
  Object.keys(fh).reduce((s, k) => s + CROPS[k].avgConsumptionLbsPerPersonYear, 0), 295.45, 1e-9);
near('M4-4', 'selecting all 82 would have charged 350.45 lb/person (+18.6%)',
  Object.keys(CROPS).reduce((s, k) => s + CROPS[k].avgConsumptionLbsPerPersonYear, 0), 350.45, 1e-9);

// ═══════════════════════════════════ 3. the review's own tables, reproduced
});
group('REVIEW-ERA: household A - 1 person, Salad Garden, fresh_only');
safe(() => {
if (reviewApp.computeResults && reviewApp.computeSavingsRows) {
  const A = summarise(reviewApp, reviewApp.PRESETS.salad_garden.selection, 1, 'fresh_only');
  eq('RA-1', 'plants = 43', A.r.totalPlants, 43);
  near('RA-2', 'raw crop area = 15.43 sq ft', A.r.totalSpaceRaw, 15.43, 1e-9);
  near('RA-3', 'path-buffered footprint = 22.04 sq ft (review: 20 -> 22)', A.r.totalSpaceSqft, 22.042857142857144, 1e-9);
  near('RA-4', 'mid-range yield = 45.525 lb', A.r.totalYieldLbs, 45.525, 1e-9);
  near('RA-5', 'conservative yield = 34.25 lb', A.r.totalYieldConservativeLbs, 34.25, 1e-9);
  near('RA-6', 'self-sufficiency on the conservative basis = 11.4167%', A.r.rawSelfSufficiencyPct, 34.25 / 300 * 100, 1e-9);
  near('RA-7', 'displaced-purchase savings = $70.92 (review H-1)', A.savings, 70.925, 1e-9);
  near('RA-8', 'the uncapped figure it replaced = $128.91', A.uncapped, 128.9125, 1e-9);
  near('RA-9', 'break-even at $350 setup = 59.22 months (was 32.58)', A.breakEven, 59.21748325, 1e-6);
  check('RA-10', 'surplus above household need is real and is NOT counted as money', A.surplusLbs > 0, A.surplusLbs);
} else {
  check('RA-0', 'review-era engine extracted', false, 'computeResults / computeSavingsRows missing');
}
});

group('REVIEW-ERA: household B2 - 4 people, Family Basics, full_year');
safe(() => {
if (reviewApp.computeResults && reviewApp.computeSavingsRows) {
  const B = summarise(reviewApp, reviewApp.PRESETS.family_basics.selection, 4, 'full_year');
  eq('RB-1', 'plants = 1064', B.r.totalPlants, 1064);
  near('RB-2', 'raw crop area = 278.04 sq ft', B.r.totalSpaceRaw, 278.04, 1e-9);
  near('RB-3', 'path-buffered footprint = 397.2 sq ft (review: 361 -> 397)', B.r.totalSpaceSqft, 397.2, 1e-9);
  near('RB-4', 'self-sufficiency = 47.6% (review: 63.3% shipped vs 47.6% per spec)', B.r.rawSelfSufficiencyPct, 47.6, 1e-9);
  near('RB-5', 'mid-range yield 760.1 lb, conservative 571.2 lb', B.r.totalYieldConservativeLbs, 571.2, 1e-9);
  near('RB-6', 'displaced-purchase savings = $1,102.00 (review H-1)', B.savings, 1102, 1e-9);
  near('RB-7', 'the uncapped figure it replaced = $1,509.06', B.uncapped, 1509.06, 1e-9);
}
});

group('REVIEW-ERA: household C - 6 people, all 82 crops, full_year');
safe(() => {
if (reviewApp.computeResults && reviewApp.computeSavingsRows) {
  const C = summarise(reviewApp, allSelection(CROPS), 6, 'full_year');
  eq('RC-1', 'plants = 3256', C.r.totalPlants, 3256);
  near('RC-2', 'raw crop area = 2068.6 sq ft', C.r.totalSpaceRaw, 2068.6, 1e-9);
  near('RC-3', 'path-buffered footprint = 2955.14 sq ft (review: 2,689 -> 2,955)', C.r.totalSpaceSqft, 2068.6 / 0.7, 1e-9);
  near('RC-4', 'displaced-purchase savings = $5,113.50 (review H-1)', C.savings, 5113.5, 1e-9);
  near('RC-5', 'the uncapped figure it replaced = $7,423.68', C.uncapped, 7423.68, 1e-9);
  near('RC-6', 'raw self-sufficiency 118.13% on the conservative basis', C.r.rawSelfSufficiencyPct, 2126.35 / 1800 * 100, 1e-9);
  near('RC-7', 'displayed self-sufficiency still caps at 100%', C.r.selfSufficiencyPct, 100, 0);
}

// ═════════════════════════════════════════════ 4. today's shipped constants
});
group('SHIPPED: the same households on the corrected crop table');
safe(() => {
{
  const A = summarise(app, app.PRESETS.salad_garden.selection, 1, 'fresh_only');
  eq('SA-1', 'A plants = 43 (spacing does not change plant counts)', A.r.totalPlants, 43);
  near('SA-2', 'A raw crop area = 20.1944 sq ft (SFG spacings widened)', A.r.totalSpaceRaw, 20.194444444444443, 1e-9);
  near('SA-3', 'A buffered footprint = 28.8492 sq ft', A.r.totalSpaceSqft, 20.194444444444443 / 0.7, 1e-9);
  near('SA-4', 'A self-sufficiency = 11.4167%', A.r.rawSelfSufficiencyPct, 11.416666666666666, 1e-9);
  near('SA-5', 'A savings = $71.875 at BLS prices', A.savings, 71.875, 1e-9);
  near('SA-6', 'A break-even at $350 = 58.43 months', A.breakEven, 58.43478260869565, 1e-6);

  const B = summarise(app, app.PRESETS.family_basics.selection, 4, 'fresh_preserving');
  eq('SB-1', 'B plants = 798', B.r.totalPlants, 798);
  near('SB-2', 'B raw crop area = 241.3889 sq ft', B.r.totalSpaceRaw, 241.38888888888889, 1e-8);
  near('SB-3', 'B self-sufficiency = 35.9167%', B.r.rawSelfSufficiencyPct, 431 / 1200 * 100, 1e-9);
  near('SB-4', 'B savings = $815.40', B.savings, 815.4, 1e-9);

  const B2 = summarise(app, app.PRESETS.family_basics.selection, 4, 'full_year');
  eq('SB2-1', 'B2 plants = 1064', B2.r.totalPlants, 1064);
  near('SB2-2', 'B2 raw crop area = 315.8056 sq ft', B2.r.totalSpaceRaw, 315.80555555555554, 1e-8);
  near('SB2-3', 'B2 self-sufficiency = 47.6%', B2.r.rawSelfSufficiencyPct, 47.6, 1e-9);
  near('SB2-4', 'B2 savings = $1,087.20', B2.savings, 1087.2, 1e-9);

  const FH = summarise(app, app.PRESETS.full_homestead.selection, 6, 'full_year');
  eq('SF-1', 'Full Homestead preset plants = 3110 (74 crops, no double-count)', FH.r.totalPlants, 3110);
  near('SF-2', 'FH raw crop area = 1752.0689 sq ft', FH.r.totalSpaceRaw, 1752.0688888888888, 1e-7);
  near('SF-3', 'FH self-sufficiency = 98.95%', FH.r.rawSelfSufficiencyPct, 98.95277777777778, 1e-9);
  near('SF-4', 'FH savings = $4,278.30', FH.savings, 4278.3, 1e-9);
}
});

group('SHIPPED: computeResults boundaries');
safe(() => {
{
  const zero = app.computeResults({}, 4, 'full_year');
  eq('BD-1', 'no crops -> 0 plants', zero.totalPlants, 0);
  near('BD-2', 'no crops -> 0 sq ft', zero.totalSpaceSqft, 0, 0);
  near('BD-3', 'no crops -> 0%', zero.selfSufficiencyPct, 0, 0);
  near('BD-4', 'no crops -> household target still 1200 lb', zero.householdTarget, 1200, 0);
  const t0 = app.computeResults({ tomato: 'weekly' }, 4, 'full_year', 0);
  near('BD-5', 'a zero produce target divides to 0, never Infinity', t0.rawSelfSufficiencyPct, 0, 0);
  const broken = app.computeResults({ __ghost: 'weekly' }, 4, 'full_year');
  eq('BD-6', 'an unknown crop id is skipped, not crashed on', broken.totalPlants, 0);
  // The code review traced this one by hand: 25 lb/person x 4 people x 0.75
  // goal x 1.0 frequency = 75 lb of demand, ceil(75/8) = 10 plants, 40 sq ft,
  // midpoint yield 100 lb.
  const single = app.computeResults({ tomato: 'weekly' }, 4, 'fresh_preserving');
  eq('BD-7', 'tomato, family of 4, fresh+preserving -> 10 plants (75/8, rounded up)', single.totalPlants, 10);
  near('BD-8', '... 40 sq ft of crop area', single.totalSpaceRaw, 40, 1e-9);
  near('BD-9', '... 100 lb mid-range yield', single.totalYieldLbs, 100, 1e-9);
  near('BD-10', '... 80 lb conservative yield', single.totalYieldConservativeLbs, 80, 1e-9);
  near('BD-10b', '... against 75 lb of household demand', single.perCrop[0].annualNeedLbs, 75, 1e-9);
  const sv = app.computeSavingsRows(single.perCrop, {});
  near('BD-11', 'savings credit the 75 lb eaten, not the 100 lb grown', sv.totalSavings, 75 * 2.00, 1e-9);
  near('BD-11b', 'the uncapped figure would have been $200', sv.rows[0].expectedYieldLbs * sv.rows[0].pricePerLb, 200, 1e-9);
  near('BD-11c', '25 lb of surplus is reported, not monetised', sv.totalSurplusLbs, 25, 1e-9);
  const sv2 = app.computeSavingsRows(single.perCrop, { tomato: 4 });
  near('BD-12', 'a user price override wins over the crop default', sv2.totalSavings, 75 * 4, 1e-9);
  const sv3 = app.computeSavingsRows(single.perCrop, { tomato: 'banana' });
  near('BD-13', 'a non-numeric override falls back to the crop default', sv3.totalSavings, 150, 1e-9);
  near('BD-14', 'ROI identity (S-C)/C = S/C - 1 holds', (sv.totalSavings - 350) / 350, sv.totalSavings / 350 - 1, 1e-12);
  near('BD-15', 'break-even x monthly savings = setup cost', (350 / (sv.totalSavings / 12)) * (sv.totalSavings / 12), 350, 1e-9);
}

// ══════════════════════════════════════════════════════════════ 5. soil
});
group('bed volume');
safe(() => {
near('V-1', 'rect 8 x 4 x 12 in = 32 cu ft', app.computeBedVolumeCuFt({ shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: 12 }), 32, 0);
near('V-2', 'circle d=4 ft x 10 in = 10.4719755119660 cu ft', app.computeBedVolumeCuFt({ shape: 'circle', diameterFt: 4, depthIn: 10 }), 10.471975511965978, 1e-12);
near('V-3', 'L-shape (8x6 - 4x3) x 12 in = 36 cu ft', app.computeBedVolumeCuFt({ shape: 'lshape', outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3, depthIn: 12 }), 36, 0);
near('V-4', 'L-shape with cutout >= outer refuses, returns 0', app.computeBedVolumeCuFt({ shape: 'lshape', outerLengthFt: 4, outerWidthFt: 3, cutoutLengthFt: 4, cutoutWidthFt: 3, depthIn: 12 }), 0, 0);
near('V-5', 'a negative length clamps to 0', app.computeBedVolumeCuFt({ shape: 'rect', lengthFt: -8, widthFt: 4, depthIn: 12 }), 0, 0);
near('V-6', 'an unknown shape returns 0', app.computeBedVolumeCuFt({ shape: 'hexagon', lengthFt: 8, widthFt: 4, depthIn: 12 }), 0, 0);
});

group('soil bill on the settled volume - H-3 (three 8x4x12 beds, classic 60/30/10)');
safe(() => {
{
  const classic = app.SOIL_MIXES.find((m) => m.id === 'classic_60_30_10');
  const s = app.computeSoilResults([{ shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: 12, qty: 3 }], classic);
  near('H3-1', 'bed volume = 96 cu ft', s.totalCuFt, 96, 1e-9);
  near('H3-2', 'with the 15% settling buffer = 110.4 cu ft', s.totalCuFtWithSettling, 110.4, 1e-9);
  near('H3-3', 'cubic yards = 3.5556', s.cuYd, 96 / 27, 1e-12);
  // N-1 (code re-review 2026-09-07): the bulk-order figure. H-3 left the 72 px
  // headline and the cubic-yard stat on the RAW volume while the bags, the
  // subtotals and the cost moved to the settled one, so the card printed 3.56
  // and 110.4 cu ft side by side - two volumes, two bases, one card.
  near('N1-1', 'cubic yards to BUY = 4.0889 (110.4 / 27)', s.cuYdWithSettling, 110.4 / 27, 1e-12);
  near('N1-2', 'and it is the raw figure times the same buffer', s.cuYdWithSettling, s.cuYd * app.SETTLING_BUFFER, 1e-12);
  near('N1-3', 'cubic metres to buy = 3.1261', s.totalCuFtWithSettling * app.CUFT_TO_CUM, 110.4 * 0.028316846592, 1e-12);
  const by = Object.fromEntries(s.components.map((c) => [c.key, c]));
  near('H3-4', 'topsoil raw share = 57.6 cu ft', by.topsoil.cuft, 57.6, 1e-9);
  near('H3-5', 'topsoil to buy = 66.24 cu ft', by.topsoil.cuftWithSettling, 66.24, 1e-9);
  eq('H3-6', 'topsoil = 45 bags at 1.5 cu ft (the card used to say 39)', Math.ceil(by.topsoil.cuftWithSettling / 1.5), 45);
  eq('H3-7', 'compost = 23 bags at 1.5 cu ft (was 20)', Math.ceil(by.compost.cuftWithSettling / 1.5), 23);
  eq('H3-8', 'coarse sand = 8 bags at 1.5 cu ft (was 7)', Math.ceil(by.sand.cuftWithSettling / 1.5), 8);
  near('H3-9', 'topsoil subtotal = $231.84', by.topsoil.costWithSettling, 231.84, 1e-9);
  near('H3-10', 'compost subtotal = $231.84', by.compost.costWithSettling, 231.84, 1e-9);
  near('H3-11', 'sand subtotal = $99.36', by.sand.costWithSettling, 99.36, 1e-9);
  near('H3-12', 'estimated cost = $563.04, the volume the card recommends', s.totalCostWithSettling, 563.04, 1e-9);
  near('H3-13', 'the un-buffered $489.60 is still returned, but nothing bills against it', s.totalCost, 489.6, 1e-9);
  near('H3-14', 'the shortfall the review measured was $73.44', s.totalCostWithSettling - s.totalCost, 73.44, 1e-9);
  eq('H3-15', 'bag counts always round UP, never to 44', Math.ceil(66.24 / 1.5), 45);
  // metric path: the same settled volume, in litres, against ZA/UK/AU bag sizes
  const litres = by.topsoil.cuftWithSettling * app.CUFT_TO_L;
  near('H3-16', 'topsoil in litres = 1875.71 L', litres, 1875.7079, 1e-3);
  eq('H3-17', 'metric 50 L bags = 38', Math.ceil(litres / 50), 38);
  eq('H3-18', 'metric bag sizes are 40/50/75 L', app.BAG_SIZES_L.join(','), '40,50,75');
  eq('H3-19', 'imperial bag sizes are 1/1.5/2 cu ft', app.BAG_SIZES_CUFT.join(','), '1,1.5,2');
  check('H3-20', 'the dead bags1/bags1_5/bags2 fields are gone (I-4)',
    by.topsoil.bags1 === undefined && by.topsoil.bags1_5 === undefined && by.topsoil.bags2 === undefined);
}
});

group('soil boundaries');
safe(() => {
{
  const classic = app.SOIL_MIXES.find((m) => m.id === 'classic_60_30_10');
  const empty = app.computeSoilResults([], classic);
  near('SO-1', 'no beds -> 0 cu ft', empty.totalCuFt, 0, 0);
  near('SO-2', 'no beds -> $0 settled', empty.totalCostWithSettling, 0, 0);
  const zeroQty = app.computeSoilResults([{ shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: 12, qty: 0 }], classic);
  near('SO-3', 'quantity 0 -> 0 cu ft', zeroQty.totalCuFt, 0, 0);
  const tiny = app.computeSoilResults([{ shape: 'rect', lengthFt: 0.5, widthFt: 0.5, depthIn: 4, qty: 1 }], classic);
  eq('SO-4', 'a tiny bed still needs 1 whole bag of each component',
    tiny.components.map((c) => Math.ceil(c.cuftWithSettling / 1.5)).join(','), '1,1,1');
  const bad = app.computeSoilResults([{ shape: 'lshape', outerLengthFt: 4, outerWidthFt: 3, cutoutLengthFt: 4, cutoutWidthFt: 3, depthIn: 12, qty: 1 }], classic);
  check('SO-5', 'an impossible L-shape is flagged, not silently zeroed', bad.hasInvalidLShape === true);
  for (const mix of app.SOIL_MIXES) {
    near(`SO-6.${mix.id}`, `${mix.id} component percentages sum to exactly 1`,
      mix.components.reduce((s, c) => s + c.pct, 0), 1, 1e-12);
  }
}

// ══════════════════════════════════════════════════════ 6. preservation
});
group('canning weights per crop and per product - M-3');
safe(() => {
{
  const t = app.computePreservationForCrop(100, 0, 'can', CROPS.tomato);
  eq('PR-1', 'tomatoes, 100 lb -> 34 quarts (NCHFP 3 lb/qt)', t.jarsQuart, 34);
  eq('PR-2', 'tomatoes, 100 lb -> 70 pints (13/9 lb/pt; the old 1.5 said 67)', t.jarsPint, 70);
  const b = app.computePreservationForCrop(100, 0, 'can', CROPS.green_beans_bush);
  eq('PR-3', 'snap beans, 100 lb -> 50 quarts (the review measured 34, a third low)', b.jarsQuart, 50);
  eq('PR-4', 'snap beans -> 104 pints', b.jarsPint, 104);
  const c = app.computePreservationForCrop(100, 0, 'can', CROPS.carrot);
  eq('PR-5', 'carrots, 100 lb -> 40 quarts (2.5 lb/qt)', c.jarsQuart, 40);
  const sauce = app.computePreservationForCrop(100, 0, 'sauce', CROPS.tomato);
  eq('PR-6', 'thin tomato sauce, 100 lb -> 20 quarts (5 lb/qt; the review measured 34)', sauce.jarsQuart, 20);
  const sauceBeans = app.computePreservationForCrop(100, 0, 'sauce', CROPS.green_beans_bush);
  eq('PR-7', 'sauce is a property of the product: it wins over the crop figure', sauceBeans.jarsQuart, 20);
  const noOverride = app.computePreservationForCrop(100, 0, 'can', CROPS.peas_shell);
  eq('PR-8', 'a crop with no published same-basis figure keeps the documented default', noOverride.jarsQuart, 34);
  eq('PR-9', 'jarQuartLbs(null, "can") = the whole-tomato default', app.jarQuartLbs(null, 'can'), 3);
  eq('PR-10', 'jarQuartLbs(anything, "sauce") = 5', app.jarQuartLbs(CROPS.carrot, 'sauce'), 5);
  eq('PR-11', 'a nonsense lbsPerQuart is ignored', app.jarQuartLbs({ lbsPerQuart: -1 }, 'can'), 3);
}
});

group('the other preservation methods');
safe(() => {
{
  const f = app.computePreservationForCrop(100, 0, 'freeze', CROPS.tomato);
  eq('PR-12', '100 lb -> 34 gallon freezer bags', f.freezerBags, 34);
  near('PR-13', '... = 4.5458 cu ft of freezer space', f.freezerCuFt, 4.5458, 1e-4);
  eq('PR-14', '100 lb -> 13 dehydrator batches', app.computePreservationForCrop(100, 0, 'dehydrate', CROPS.tomato).dehydratorBatches, 13);
  eq('PR-15', '100 lb -> 120 inches of root-cellar shelf', app.computePreservationForCrop(100, 0, 'root_cellar', CROPS.potato).shelfInches, 120);
  const third = app.computePreservationForCrop(100, 33, 'can', CROPS.tomato);
  near('PR-16', '33% eaten fresh leaves 67 lb to preserve', third.preserved, 67, 1e-9);
  eq('PR-17', '... = 23 quarts', third.jarsQuart, 23);
  eq('PR-18', '... = 47 pints', third.jarsPint, 47);
  const all = app.computePreservationForCrop(100, 100, 'can', CROPS.tomato);
  eq('PR-19', '100% fresh -> no jars at all', `${all.jarsPint}/${all.jarsQuart}`, '0/0');
  const un = app.computePreservationForCrop(100, 60, 'fresh', CROPS.lettuce);
  near('PR-20', 'a fresh-only crop reports the 40 lb it cannot store', un.unstorablePreserved, 40, 1e-9);
  const zero = app.computePreservationForCrop(0, 0, 'can', CROPS.tomato);
  eq('PR-21', 'a zero harvest needs zero jars', `${zero.jarsPint}/${zero.jarsQuart}`, '0/0');
}

// ═══════════════════════════════════════════════════ 7. dates and windows
});
group('planting dates');
safe(() => {
{
  const z7 = app.getFrostDates('zone', 7, 'north', null, 2026);
  eq('D-1', 'zone 7 north: last spring frost 22 Mar 2026', z7.lastSpring.toDateString(), 'Sun Mar 22 2026');
  eq('D-2', 'zone 7 north: first fall frost 5 Nov 2026', z7.firstFall.toDateString(), 'Thu Nov 05 2026');
  const g = app.computePlantingDates(CROPS.garlic, z7);
  eq('D-3', 'garlic sows 20 weeks before last frost: 2 Nov 2025', g.directSow.toDateString(), 'Sun Nov 02 2025');
  eq('D-4', 'garlic harvest starts 36 weeks later: 12 Jul 2026', g.harvestStart.toDateString(), 'Sun Jul 12 2026');
  eq('D-5', 'garlic is cool-season, so nothing truncates it', g.harvestEndEffective.toDateString(), g.harvestEnd.toDateString());
  const z3 = app.getFrostDates('zone', 3, 'north', null, 2026);
  const t3 = app.computePlantingDates(CROPS.tomato, z3);
  eq('D-6', 'zone 3 tomato harvest starts 7 Aug 2026', t3.harvestStart.toDateString(), 'Fri Aug 07 2026');
  eq('D-7', 'raw harvest end is still 30 Oct 2026, for the badge test', t3.harvestEnd.toDateString(), 'Fri Oct 30 2026');
  eq('D-8', 'M-8: printed end truncates at the 15 Sep first frost', t3.harvestEndEffective.toDateString(), 'Tue Sep 15 2026');
  check('D-9', 'and the frost-risk badge still fires', t3.frostRiskAtHarvest === true);
  const t7 = app.computePlantingDates(CROPS.tomato, z7);
  check('D-10', 'zone 7 tomato is not at risk, so nothing is truncated',
    t7.frostRiskAtHarvest === false && t7.harvestEndEffective.getTime() === t7.harvestEnd.getTime());
  const kale3 = app.computePlantingDates(CROPS.kale, z3);
  check('D-11', 'a cool-season crop is never truncated, even past first frost',
    kale3.harvestEndEffective.getTime() === kale3.harvestEnd.getTime());
  const south = app.getFrostDates('zone', 7, 'south', null, 2026);
  eq('D-12', 'southern hemisphere shifts last spring frost by 6 months', south.lastSpring.toDateString(), 'Tue Sep 22 2026');
  eq('D-13', 'southern hemisphere shifts first fall frost by 6 months', south.firstFall.toDateString(), 'Wed May 05 2027');
  eq('D-14', 'no crop at all -> the empty result, not a throw', app.computePlantingDates(null, z7).anchorMethod, null);
  eq('D-15', 'no frost dates -> the empty result', app.computePlantingDates(CROPS.tomato, null).harvestStart, null);
}
});

group('manual frost dates - L-8');
safe(() => {
{
  eq('L8-1', 'a reversed pair is refused', app.getFrostDates('manual', 7, 'north', { lastSpring: '2026-11-01', firstFall: '2026-03-01' }, 2026), null);
  eq('L8-2', 'a same-day pair is refused (a zero-length season)', app.getFrostDates('manual', 7, 'north', { lastSpring: '2026-05-01', firstFall: '2026-05-01' }, 2026), null);
  const ok = app.getFrostDates('manual', 7, 'north', { lastSpring: '2026-04-10', firstFall: '2026-10-20' }, 2026);
  check('L8-3', 'a correct pair is accepted unchanged',
    ok && ok.lastSpring.toDateString() === 'Fri Apr 10 2026' && ok.firstFall.toDateString() === 'Tue Oct 20 2026');
  eq('L8-4', 'a missing date is still refused', app.getFrostDates('manual', 7, 'north', { lastSpring: '2026-04-10' }, 2026), null);
  eq('L8-5', '30 February is still rejected by the round-trip check', app.parseIsoDate('2026-02-30'), null);
  eq('L8-6', 'an unknown zone has no dates', app.getFrostDates('zone', 12, 'north', null, 2026), null);
}
});

group('leap years - L-7');
safe(() => {
eq('L7-1', '2024 has 366 days', app.daysInYear(2024), 366);
eq('L7-2', '2026 has 365 days', app.daysInYear(2026), 365);
eq('L7-3', '2100 has 365 days (century rule)', app.daysInYear(2100), 365);
eq('L7-4', '2000 has 366 days (400 rule)', app.daysInYear(2000), 366);

// ══════════════════════════════════ 8. the paid plan's numbers are OURS (H-2)
});
group('the Growing Plan renders the engine, not the model - H-2');
safe(() => {
{
  const r = app.computeResults(app.PRESETS.salad_garden.selection, 1, 'fresh_only');
  const z7 = app.getFrostDates('zone', 7, 'north', null, 2026);
  const yields = app.engineYieldRows(r.perCrop);
  const harvest = app.engineHarvestRows(r.perCrop, z7, {});
  const savings = app.computeSavingsRows(r.perCrop, {}).totalSavings;
  eq('H2-1', 'one yield row per selected crop', yields.length, r.perCrop.length);
  const tom = yields.find((y) => y.crop === 'Tomatoes (General)');
  eq('H2-2', 'tomato row carries the engine plant count', tom.plants, 2);
  near('H2-3', 'tomato row carries the engine mid-range yield in lb', tom.yieldLbs, 20, 1e-9);
  near('H2-4', 'tomato row carries the low end', tom.lowLbs, 16, 1e-9);
  near('H2-5', 'tomato row carries the high end', tom.highLbs, 24, 1e-9);
  check('H2-6', 'every yield figure is finite', yields.every((y) => Number.isFinite(y.yieldLbs)));
  eq('H2-7', 'one harvest row per crop with derivable dates', harvest.length, r.perCrop.length);
  const th = harvest.find((h) => h.crop === 'Tomatoes (General)');
  eq('H2-8', 'tomato harvest window June to September in zone 7', `${th.startMonth}-${th.endMonth}`, 'June-September');
  eq('H2-9', 'peak is the midpoint of the window', th.peakMonth, 'July');
  check('H2-10', 'every month name is one the chart can place',
    harvest.every((h) => app.monthIndex(h.startMonth) >= 0 && app.monthIndex(h.endMonth) >= 0 && app.monthIndex(h.peakMonth) >= 0));
  near('H2-11', 'the plan savings figure IS the Cost Savings total', savings, 71.875, 1e-9);
  eq('H2-12', 'no frost dates -> no invented timeline', app.engineHarvestRows(r.perCrop, null, {}).length, 0);
  eq('H2-13', 'no crops -> no yield rows', app.engineYieldRows([]).length, 0);
}
});

group('the plan schema no longer asks the model for numbers - H-2');
safe(() => {
if (gen.PLAN_SCHEMA) {
  const props = gen.PLAN_SCHEMA.properties || {};
  check('H2-14', 'yieldEstimates is gone from the tool schema', props.yieldEstimates === undefined);
  check('H2-15', 'harvestTimeline is gone from the tool schema', props.harvestTimeline === undefined);
  check('H2-16', 'neither is still required', !(gen.PLAN_SCHEMA.required || []).some((k) => k === 'yieldEstimates' || k === 'harvestTimeline'));
  const se = props.savingsEstimate?.properties || {};
  check('H2-17', 'savingsEstimate no longer carries annualSavings', se.annualSavings === undefined);
  check('H2-18', 'savingsEstimate no longer carries a currency', se.currency === undefined);
  eq('H2-19', 'savingsEstimate keeps exactly topSavers and note', Object.keys(se).sort().join(','), 'note,topSavers');
  check('H2-20', 'the prose sections are all still required',
    ['summary', 'monthlySchedule', 'bedLayouts', 'successionPlanting', 'preservationGuide', 'savingsEstimate', 'tips']
      .every((k) => (gen.PLAN_SCHEMA.required || []).includes(k)));
  check('H2-21', 'additionalProperties is still closed at the top level', gen.PLAN_SCHEMA.additionalProperties === false);
}
if (gen.buildUserPrompt) {
  const prompt = gen.buildUserPrompt({
    familySize: 4, hemisphere: 'north', zone: 'USDA zone 7',
    lastSpringFrost: 'Mar 22', firstFallFrost: 'Nov 5', gardenSqFt: 320,
    sunExposure: 'Full sun', soilType: 'Loam', waterMethod: 'Drip',
    experience: 'Some experience', goals: ['Fresh eating'],
    crops: ['Tomatoes (General)'], displayUnits: 'imperial',
    producePerPersonLbs: 300,
  });
  check('H2-22', 'the prompt no longer names a currency', !/currency/i.test(prompt));
  check('H2-23', 'the prompt still sends garden space labelled sq ft', /320 sq ft/.test(prompt));
  check('H2-24', 'the prompt still sends the produce target labelled lb', /300 lb\/person/.test(prompt));
  check('H2-25', 'the prompt tells the model the app prints the numbers', /app prints/i.test(prompt));
}
if (gen.SYSTEM_PROMPT) {
  check('H2-26', 'the system prompt tells the model not to state the figures',
    /Do not state any of them/i.test(gen.SYSTEM_PROMPT));
  check('H2-27', 'the system prompt no longer tells it to match a currency',
    !/match it/i.test(gen.SYSTEM_PROMPT));
}
if (gen.sanitisePlan) {
  const smuggled = gen.sanitisePlan({
    summary: 'x',
    monthlySchedule: [{ month: 'March', tasks: ['t'] }],
    bedLayouts: [], successionPlanting: [], preservationGuide: [],
    yieldEstimates: [{ crop: 'Tomatoes', plants: 999, estimatedYield: 9999, unit: 'kg', note: '' }],
    harvestTimeline: [{ crop: 'Tomatoes', startMonth: 'January', endMonth: 'March', peakMonth: 'February' }],
    savingsEstimate: { annualSavings: 99999, currency: '€', topSavers: ['Tomatoes'], note: 'n' },
    tips: ['t'],
  });
  check('H2-28', 'a smuggled yieldEstimates array is dropped', smuggled.yieldEstimates === undefined);
  check('H2-29', 'a smuggled harvestTimeline array is dropped', smuggled.harvestTimeline === undefined);
  check('H2-30', 'a smuggled annualSavings is dropped', smuggled.savingsEstimate.annualSavings === undefined);
  check('H2-31', 'a smuggled currency is dropped (code review M-3)', smuggled.savingsEstimate.currency === undefined);
  eq('H2-32', 'the shortlist and the note survive', smuggled.savingsEstimate.topSavers.join(','), 'Tomatoes');
  eq('H2-33', 'the prose survives', smuggled.monthlySchedule.length, 1);
}
});

group('the downloaded report carries the same numbers - H-2 / code review M-3');
safe(() => {
if (app.buildPlanReportHtml) {
  const r = app.computeResults(app.PRESETS.salad_garden.selection, 1, 'fresh_only');
  const z7 = app.getFrostDates('zone', 7, 'north', null, 2026);
  const html = app.buildPlanReportHtml({
    plan: {
      summary: 'A plan.',
      monthlySchedule: [{ month: 'March', tasks: ['Sow lettuce'] }],
      bedLayouts: [], successionPlanting: [], preservationGuide: [],
      // a plan body that still carries a model currency, as an old one would
      savingsEstimate: { currency: '€', annualSavings: 612, topSavers: ['Tomatoes'], note: 'note' },
      tips: [],
    },
    inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: [] },
    familySize: 1, zoneStr: 'USDA zone 7',
    lastSpringFrostStr: 'Mar 22', firstFallFrostStr: 'Nov 5', hemisphere: 'north',
    gardenSqFt: 20, metric: false, currency: 'R',
    cropNames: r.perCrop.map((x) => x.crop.name), generatedAt: Date.UTC(2026, 8, 6),
    engineYields: app.engineYieldRows(r.perCrop),
    engineHarvest: app.engineHarvestRows(r.perCrop, z7, {}),
    engineSavings: app.computeSavingsRows(r.perCrop, {}).totalSavings,
  });
  check('RP-1', 'the report prints the customer\'s currency', /class="num currency">R</.test(html));
  check('RP-2', 'the report never prints the model\'s euro echo', !html.includes('€'));
  check('RP-3', 'the report prints the engine savings total (72)', /class="num big">72</.test(html));
  check('RP-4', 'the report never prints the model\'s 612', !/>612</.test(html));
  check('RP-5', 'the report prints the engine plant count for tomatoes', /Tomatoes \(General\)<\/strong>\s*<span class="num"[^>]*>2 plants/.test(html));
  check('RP-6', 'the report prints the engine yield with a lb label', /~20\.0 lb/.test(html));
  check('RP-7', 'the report still draws a harvest timeline', /class="header-row"/.test(html));
  check('RP-8', 'the report still carries the model prose', html.includes('A plan.') && html.includes('Sow lettuce'));
  const htmlMetric = app.buildPlanReportHtml({
    plan: { summary: 's', monthlySchedule: [{ month: 'March', tasks: ['t'] }], bedLayouts: [], successionPlanting: [], preservationGuide: [], savingsEstimate: null, tips: [] },
    inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: [] },
    familySize: 1, zoneStr: 'USDA zone 7', lastSpringFrostStr: '', firstFallFrostStr: '', hemisphere: 'north',
    gardenSqFt: 20, metric: true, currency: 'R', cropNames: [], generatedAt: Date.UTC(2026, 8, 6),
    engineYields: app.engineYieldRows(r.perCrop), engineHarvest: [], engineSavings: 0,
  });
  check('RP-9', 'in metric the yield is kg and is labelled kg', /~9\.1 kg/.test(htmlMetric));
  check('RP-10', 'in metric the garden space is m2 and is labelled m2', /1\.9 m²/.test(htmlMetric));
  check('RP-11', 'a plan with no savings block does not throw', htmlMetric.length > 0);
}

// ══════════════════════════════════════════════════ 9. display formatting
});
group('area and mass never print as zero - L-1');
safe(() => {
{
  let areaZeros = 0;
  let massZeros = 0;
  let collapsed = 0;
  for (const k of Object.keys(CROPS)) {
    for (const metric of [true, false]) {
      if (Number(app.fmtAreaValue(CROPS[k].spacingSqFt, metric)) === 0) areaZeros += 1;
      const lo = app.fmtMassValue(CROPS[k].yieldPerPlantLbs[0], metric);
      const hi = app.fmtMassValue(CROPS[k].yieldPerPlantLbs[1], metric);
      if (Number(lo) === 0) massZeros += 1;
      if (lo === hi && CROPS[k].yieldPerPlantLbs[0] !== CROPS[k].yieldPerPlantLbs[1]) collapsed += 1;
    }
  }
  eq('L1-1', 'no crop prints 0 for its spacing, in either unit system (31 did in metric)', areaZeros, 0);
  eq('L1-2', 'no crop prints 0 for its low yield (radish did)', massZeros, 0);
  eq('L1-3', 'no crop collapses its yield RANGE to one repeated figure (4 did)', collapsed, 0);
  eq('L1-4', 'a 16-per-sq-ft crop in metric = 0.006 m2, not 0.0', app.fmtAreaValue(0.0625, true), '0.006');
  eq('L1-5', '... and 0.063 sq ft in imperial, not 0.1', app.fmtAreaValue(0.0625, false), '0.063');
  eq('L1-6', 'a 4 sq ft crop still reads 0.37 m2', app.fmtAreaValue(4, true), '0.37');
  eq('L1-7', 'a 16 sq ft crop still reads 16.0 sq ft', app.fmtAreaValue(16, false), '16.0');
  eq('L1-8', 'radish low yield in kg = 0.023, not 0.0', app.fmtMassValue(0.05, true), '0.023');
  eq('L1-9', 'a big yield still reads 30.0 lb', app.fmtMassValue(30, false), '30.0');
  eq('L1-10', 'a non-numeric input degrades to zero rather than NaN', app.fmtAreaValue(undefined, false), '0.000');
  // N-3 (code re-review 2026-09-07): the INVERSE of L-1. A true zero is not a
  // measurement, and both ends of the Preservation tab's fresh/preserved slider
  // are true zeros - they printed "0.000 lb" on every crop row.
  eq('N3-1', 'a true zero prints as 0, not 0.000', app.fmtMassRounded(0, false), '0');
  eq('N3-2', '... in metric too', app.fmtMassRounded(0, true), '0');
  eq('N3-3', 'a small non-zero still keeps its magnitude', app.fmtMassRounded(0.05, true), '0.023');
  eq('N3-4', 'and a whole number is still rounded', app.fmtMassRounded(89.6, false), '90');
  eq('N3-5', 'control: the sub-0.1 degrade stays on the per-plant formatter', app.fmtMassValue(0, false), '0.000');
}
});

group('the new garden-space Field converts its bounds with its value - M-5');
safe(() => {
  // Canon from audit 2026-08-17 H-1: a bound has to travel in the same unit as
  // the value it bounds, and a metric Field that re-encodes its own displayed
  // value on every blur drifts the stored figure. The commit closure is lifted
  // out of GardenSpaceField verbatim and driven here.
  const field = sliceDecl(APP_SRC, 'GardenSpaceField');
  const minC = sliceDecl(APP_SRC, 'GARDEN_SQFT_MIN');
  const maxC = sliceDecl(APP_SRC, 'GARDEN_SQFT_MAX');
  const commitText = field && sliceLocal(field, 'commit');
  // N-5 (code re-review 2026-09-07): the display transform and the two bounds
  // are lifted with the commit closure now, because the fix made them ONE
  // expression. A harness that recomputed the bound for itself would have
  // reported the floor as correct while the shipped Field clamped against a
  // different number.
  const toDisplayText = field && sliceLocal(field, 'toDisplay');
  const minLocal = field && sliceLocal(field, 'min');
  const maxLocal = field && sliceLocal(field, 'max');
  if (!field || !commitText || !minC || !maxC || !toDisplayText || !minLocal || !maxLocal) {
    check('M5-0', 'GardenSpaceField and its commit closure exist', false, 'not found');
    return;
  }
  const make = new Function('SQFT_TO_SQM', `${minC}\n${maxC}
    return function make(metric, canonical, onChange) {
      ${toDisplayText}
      ${minLocal}
      ${maxLocal}
      ${commitText}
      return { commit, min, max, display: toDisplay(canonical) };
    };`)(app.SQFT_TO_SQM);
  const writes = [];
  const fieldM = make(true, 320, (v) => writes.push(v));
  const commitM = fieldM.commit;
  commitM(Number((320 * app.SQFT_TO_SQM).toFixed(1)));
  eq('M5-1', 'an untouched focus+blur in metric writes nothing (no drift)', writes.length, 0);
  commitM(50);
  near('M5-2', '50 m2 commits as 538.19 sq ft, not as 50', writes[0], 50 / app.SQFT_TO_SQM, 1e-9);
  commitM(999999);
  near('M5-3', 'the metric ceiling clamps to the 100000 SQ FT max, not to 100000 m2', writes[1], 100000, 1e-9);
  const writesI = [];
  const fieldI = make(false, 320, (v) => writesI.push(v));
  const commitI = fieldI.commit;
  commitI(320);
  eq('M5-4', 'an untouched focus+blur in imperial writes nothing', writesI.length, 0);
  commitI(5);
  near('M5-5', 'below the floor clamps to 10 sq ft', writesI[0], 10, 1e-9);
  commitI(640);
  near('M5-6', 'a real imperial edit is stored as typed', writesI[1], 640, 1e-9);

  // N-5: the bound the Field clamps against, against the value the Field shows.
  // These were computed by two different expressions - Math.round(0.929) = 1 m2
  // as the floor, Number((0.929).toFixed(1)) = 0.9 as the value - so the field
  // opened one step BELOW its own minimum and one blur committed the minimum.
  const atFloorM = make(true, 10, () => {});
  eq('N5-1', 'the metric floor equals the metric display of the 10 sq ft minimum',
    atFloorM.min, atFloorM.display, `min=${atFloorM.min} display=${atFloorM.display}`);
  const atCeilM = make(true, 100000, () => {});
  eq('N5-2', 'and the metric ceiling equals the display of the 100000 sq ft maximum',
    atCeilM.max, atCeilM.display, `max=${atCeilM.max} display=${atCeilM.display}`);
  const atFloorI = make(false, 10, () => {});
  eq('N5-3', 'control: imperial floor and display already agreed', atFloorI.min, atFloorI.display);
  // And the JSX must hand the Field exactly those two, or the pair above is a
  // statement about numbers nothing reads.
  check('N5-4', 'the <Field> is passed the same min and max the closure computes',
    /<Field label="Garden space available"[\s\S]{0,400}?min=\{min\}\s*max=\{max\}/.test(field),
    'the min/max props are not the lifted bounds');
});

group('money decimals - L-9');
safe(() => {
eq('L9-1', 'the yen takes no minor unit', app.moneyDecimals('¥'), 0);
eq('L9-2', 'the dollar takes two', app.moneyDecimals('$'), 2);
eq('L9-3', 'the rand takes two', app.moneyDecimals('R'), 2);
eq('L9-4', 'the euro takes two', app.moneyDecimals('€'), 2);
eq('L9-5', 'the pound takes two', app.moneyDecimals('£'), 2);
eq('L9-6', 'an unknown symbol takes two', app.moneyDecimals('kr'), 2);
eq('L9-7', 'a yen price formats without cents', app.fmtDecimal(910.21, app.moneyDecimals('¥')), '910');
eq('L9-8', 'a rand price keeps cents', app.fmtDecimal(910.21, app.moneyDecimals('R')), '910.21');
eq('L9-9', 'a NaN cost degrades to a dash, never to $NaN', app.fmtDecimal(NaN, 2), '-');
});

// ------------------------------------------------------------------- report
const width = Math.max(...rows.map((r) => r.label.length)) + 2;
console.log('\nCalculation goldens  (engineering review 2026-09-06)\n');
for (const r of rows) {
  if (!r.verdict) { console.log(`\n${r.label}`); continue; }
  console.log(`${r.id.padEnd(7)} ${r.label.padEnd(width)} ${r.verdict}`);
}
const total = rows.filter((r) => r.verdict).length;
console.log(`\ncalc-golden: ${total - failures.length}/${total} cases OK.`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
