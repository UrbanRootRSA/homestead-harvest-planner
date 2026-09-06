// tests/render-drive.test.mjs
//
// The goldens next door pin the ARITHMETIC. This file pins what reaches the
// SCREEN, because the 2026-09-06 engineering fixes moved a lot of render code:
// the savings headline changed basis, the soil card started billing the settled
// volume, the paid Growing Plan stopped printing the model's numbers and
// started printing the engine's, and a new garden-space Field appeared on Tab 5.
// `npm run build` proves that JSX parses. It does not prove that a component
// renders, that an identifier is in scope, or that the number on screen is the
// one the engine computed.
//
// So this bundles the REAL src/App.jsx with esbuild - appending nothing but a
// line of `export { ... }` so the inner components can be reached - and renders
// them through react-dom/server.
//
// WHAT THIS CANNOT SEE: SSR runs no effects and no event handlers. Anything
// that only happens after a click, a blur, or a useEffect is out of scope here;
// tests/paywall-mount-chain.test.mjs drives the mount effects, and the unit
// bounds on the new Field are driven in tests/calc-golden.test.mjs.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = join(REPO, 'src');
const OUT_DIR = join(REPO, 'node_modules', '.cache', 'hhp-render');
const OUT = join(OUT_DIR, 'app-bundle.mjs');
// CONTROL: point this at a copy of the pre-fix source to prove the checks are
// not vacuous. The bundle still resolves ./data/crops.js from src/, so a
// control run pairs the OLD component tree with today's crop table - which is
// exactly what makes the H-1/H-2/H-3 rows go red there. Measured: against
// 2b46161 that run reports 4/42 OK; against the tree it reports 46/46 and
// exits 0.
const APP_PATH = process.env.HHP_APP_SRC || join(SRC, 'App.jsx');
if (process.env.HHP_APP_SRC) console.log(`[control run] app=${APP_PATH}`);

// ── browser shims, installed BEFORE the bundle is imported ──────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.matchMedia = (q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
});
globalThis.window = globalThis;
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
}
globalThis.location = { href: 'https://thehomesteadplan.com/', search: '', hash: '', pathname: '/' };
globalThis.history = { pushState() {}, replaceState() {}, state: null };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = {
  documentElement: { style: {} },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null, querySelector: () => null,
  visibilityState: 'visible',
};
globalThis.scrollTo = () => {};

// ── bundle the shipped source, verbatim plus one export line ────────────────
const WANTED = [
  'PlanRenderer', 'GardenSpaceField', 'SoilCalculator', 'CropDbCard',
  'SelfSufficiencyCalculator', 'PlantingDateCalculator',
  'computeResults', 'computeSavingsRows', 'engineYieldRows', 'engineHarvestRows',
  'getFrostDates', 'PRESETS',
];
const appText = readFileSync(APP_PATH, 'utf8');
// esbuild refuses to export a name the file does not declare, and in a CONTROL
// run against pre-fix source several of these do not exist yet. Export what is
// there and report the rest as failures, so the control prints a COUNT rather
// than a build error.
const declared = WANTED.filter((nm) => new RegExp('^(?:const|let|function)\\s+' + nm + '\\b', 'm').test(appText));
const missingExports = WANTED.filter((nm) => !declared.includes(nm));
const EXTRA = `
export { ${declared.join(', ')} };
`;
const built = await esbuild.build({
  stdin: {
    contents: appText + EXTRA,
    resolveDir: SRC, loader: 'jsx', sourcefile: 'App.jsx',
  },
  bundle: true, format: 'esm', write: false, platform: 'neutral', jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' },
  // React must NOT be bundled: react-dom/server and the components have to
  // share one instance or every hook reads a null dispatcher.
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@vercel/analytics'],
});
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, built.outputFiles[0].text, 'utf8');

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const M = await import(`${pathToFileURL(OUT).href}?t=${Date.now()}`);
const { CROPS } = await import(pathToFileURL(join(SRC, 'data', 'crops.js')).href);

// ── harness ─────────────────────────────────────────────────────────────────
const rows = [];
const failures = [];
function record(id, label, good, detail) {
  rows.push({ id, label, verdict: good ? 'ok' : 'FAIL' });
  if (!good) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }
// A component that does not exist yet in a CONTROL run must fail its checks,
// not abort the file before the rest of them run.
function safe(fn) {
  try { fn(); } catch (e) { record('E', `a render block threw instead of failing cleanly: ${e?.message}`, false); }
}
const hit = (html, needle) => (typeof needle === 'string' ? html.includes(needle) : needle.test(html));
function has(id, label, html, needle) { record(id, label, hit(html, needle)); }
function hasNot(id, label, html, needle) { record(id, label, !hit(html, needle)); }
function render(id, label, el) {
  try { return renderToStaticMarkup(el); }
  catch (e) { record(id, `${label} renders`, false, e?.message); return ''; }
}

for (const nm of missingExports) {
  record(`X-${nm}`, `src/App.jsx declares ${nm}`, false, 'not found');
}

const BEDS = [{
  id: 'b1', shape: 'rect', lengthFt: 8, widthFt: 4, depthIn: 12, qty: 3,
  diameterFt: 4, outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3,
}];
const soilProps = (metric, currency) => ({
  beds: BEDS, setBeds() {}, mixId: 'classic_60_30_10', setMixId() {},
  mixOverrides: { prices: {}, pcts: {} }, setMixOverrides() {},
  metric, currency,
});
const plantingProps = (patch) => ({
  plantingState: {
    mode: 'zone', zone: 7, manualFrost: null, selectedCrops: ['tomato'],
    referenceYear: 2026, sowMethodChoice: {}, ...patch,
  },
  setPlantingState() {}, hemisphere: 'north',
});

// ══════════════════════════════════════════════════════════ the whole app
group('the app mounts');
safe(() => {
{
  const html = render('A-1', '<App/>', React.createElement(M.default));
  has('A-1', 'the whole app renders without throwing', html, 'Know exactly what to grow');
  record('A-2', 'and produces a real page, not an empty shell', html.length > 20000, `${html.length} chars`);
}

// ═══════════════════════════════════ self-sufficiency headline basis (H-1)
});
group('the free headline is on the yield basis the plants were sized on - H-1');
safe(() => {
{
  const html = render('SS', 'SelfSufficiencyCalculator', React.createElement(M.SelfSufficiencyCalculator, {
    familySize: 4, setFamilySize() {}, goal: 'full_year', setGoal() {},
    selection: M.PRESETS.family_basics.selection, setSelection() {},
    metric: false, producePerPerson: 300, setProducePerPerson() {},
  }));
  has('H1-1', 'family of 4, Family Basics, full year reads 48%', html, '>48<');
  hasNot('H1-2', 'and no longer the midpoint 63%', html, '>63<');
  has('H1-3', 'the basis is stated beside the number', html, 'conservative end of');
  has('H1-4', 'the yield stat says which end of the range it is', html, 'Estimated yield (mid-range)');
  has('M1-1', 'path copy names paths as a share of the footprint', html, '30% of the total footprint');
  hasNot('M1-2', 'the old "30% extra for paths" wording is gone', html, '30% extra for');
  has('M1-3', 'the buffered footprint is 451.2 sq ft (1/(1-0.30)), not 411.5', html, '451.2');
}

// ═════════════════════════════════════════════ the soil bill (H-3, L-5, L-9)
});
group('the soil card bills the volume it recommends - H-3');
safe(() => {
{
  const html = render('SO', 'SoilCalculator', React.createElement(M.SoilCalculator, soilProps(false, '$')));
  has('H3-1', 'the hero still shows 110.4 cu ft with the settling buffer', html, '110.4');
  has('H3-2', 'topsoil quantity is the 66.2 cu ft you must buy', html, '66.2');
  hasNot('H3-3', 'the un-buffered 57.6 is no longer the quantity on the card', html, '>57.6<');
  has('H3-4', 'topsoil is 45 bags at 1.5 cu ft, not 39', html, /1\.5 cu ft bags[\s\S]{0,240}?45/);
  has('H3-5', 'the topsoil subtotal is $231.84', html, '231.84');
  has('H3-6', 'every quantity says it includes settling', html, 'incl. settling');
  has('L5-1', 'the soil tab now carries the same no-FX note as Cost Savings', html, 'no currency conversion is applied');
}
{
  const html = render('SOM', 'SoilCalculator (metric)', React.createElement(M.SoilCalculator, soilProps(true, 'R')));
  has('H3-7', 'metric topsoil is 1875.7 L, the settled volume', html, '1875.7');
  has('H3-8', 'metric 50 L bags = 38', html, /50 L bags[\s\S]{0,240}?38/);
  has('H3-9', 'metric rows say incl. settling too', html, 'incl. settling');
}
{
  const html = render('SOY', 'SoilCalculator (yen)', React.createElement(M.SoilCalculator, soilProps(false, '¥')));
  has('L9-1', 'a yen subtotal prints without a minor unit', html, '¥232');
  hasNot('L9-2', 'and never with cents', html, '231.84');
}

// ══════════════════════════════════════════════════ crop database in metric
});
group('no crop reads as needing no space - L-1');
safe(() => {
{
  const html = render('CD', 'CropDbCard', React.createElement(M.CropDbCard, {
    row: { ...CROPS.carrot, id: 'carrot' }, expanded: false, onToggle() {},
    massConv: 0.45359237, areaConv: 0.09290304, unitMass: 'kg', unitArea: 'm²', metric: true,
  }));
  has('L1-1', 'carrot spacing prints 0.006 m2', html, '0.006');
  hasNot('L1-2', 'and never "0.0 m2"', html, '0.0 m²');
}

// ═══════════════════════════════════ the paid plan prints OUR numbers (H-2)
});
group('the Growing Plan prints the engine, not the model - H-2');
safe(() => {
{
  const res = M.computeResults(M.PRESETS.salad_garden.selection, 1, 'fresh_only');
  const frost = M.getFrostDates('zone', 7, 'north', null, 2026);
  const html = render('PL', 'PlanRenderer', React.createElement(M.PlanRenderer, {
    plan: {
      summary: 'A short summary.',
      monthlySchedule: [{ month: 'March', tasks: ['Sow lettuce under cover'] }],
      bedLayouts: [], successionPlanting: [], preservationGuide: [],
      savingsEstimate: { topSavers: ['Tomatoes'], note: 'Tomatoes carry the total.' },
      tips: ['Water in the morning.'],
    },
    metric: false, currency: 'R', isMobile: false, generatedAt: Date.UTC(2026, 8, 6),
    engineYields: M.engineYieldRows(res.perCrop),
    engineHarvest: M.engineHarvestRows(res.perCrop, frost, {}),
    engineSavings: M.computeSavingsRows(res.perCrop, {}).totalSavings,
    onDownload() {}, onClear() {},
  }));
  has('H2-1', 'savings print in the customer\'s own currency', html, '>R</span>');
  has('H2-2', 'the figure is the engine total, 72', html, '>72</span>');
  hasNot('H2-3', 'no model-echoed currency reaches the screen', html, '€');
  has('H2-4', 'the tomato row carries the engine plant count', html, '2 plants');
  has('H2-5', 'and the engine yield, labelled lb', html, '20.0 lb');
  has('H2-6', 'and discloses the low-high range', html, 'Range 16.0');
  has('H2-7', 'the harvest timeline still draws', html, 'Harvest timeline');
  has('H2-8', 'the model prose survives untouched', html, 'A short summary.');
  has('H2-9', 'so does its top-savers shortlist', html, 'Tomatoes');
  const metricHtml = render('PLM', 'PlanRenderer (metric)', React.createElement(M.PlanRenderer, {
    plan: {
      summary: 's', monthlySchedule: [{ month: 'March', tasks: ['t'] }], bedLayouts: [],
      successionPlanting: [], preservationGuide: [], savingsEstimate: null, tips: [],
    },
    metric: true, currency: 'R', isMobile: false, generatedAt: null,
    engineYields: M.engineYieldRows(res.perCrop), engineHarvest: [], engineSavings: 0,
    onDownload() {}, onClear() {},
  }));
  has('H2-10', 'in metric the yields are kg and say kg', metricHtml, '9.1 kg');
  hasNot('H2-11', 'and never carry a lb label', metricHtml, ' lb');
  record('H2-12', 'a plan with no savings block still renders', metricHtml.length > 0);
}

// ═════════════════════════════════════ the garden-space input on Tab 5 (M-5)
});
group('the customer can state the space they actually have - M-5');
safe(() => {
{
  const base = { derived: 320, onChange() {}, isMobile: false };
  const dflt = render('GS', 'GardenSpaceField', React.createElement(M.GardenSpaceField, { ...base, value: null, metric: false, tight: false }));
  has('M5-1', 'the field is on the form and labelled', dflt, 'Garden space available');
  has('M5-2', 'it defaults to what the selection needs', dflt, 'value="320"');
  has('M5-3', 'and says so, so the number is not mistaken for a measurement', dflt, 'area your crop selection needs');
  const tight = render('GST', 'GardenSpaceField (tight)', React.createElement(M.GardenSpaceField, { ...base, value: 200, metric: false, tight: true }));
  has('M5-4', 'a garden smaller than the selection is called out', tight, 'more than the space you have');
  has('M5-5', 'with the figure it is short against', tight, '320 sq ft');
  const metric = render('GSM', 'GardenSpaceField (metric)', React.createElement(M.GardenSpaceField, { ...base, value: null, metric: true, tight: false }));
  has('M5-6', 'metric shows m2 and converts the value', metric, 'value="29.7"');
}

// ═══════════════════════════════ planting dates: frost copy and truncation
});
group('planting dates - M-7, M-8, L-8');
safe(() => {
{
  const zone = render('PD', 'PlantingDateCalculator', React.createElement(M.PlantingDateCalculator, plantingProps({})));
  has('M7-1', 'the zone note says what a hardiness zone does and does not encode', zone, 'how cold your winter gets, not when your frosts fall');
  has('M7-2', 'and points anyone outside zones 3-11 at manual entry', zone, 'Outside zones 3 to 11');
  const zone3 = render('PD3', 'PlantingDateCalculator (zone 3)', React.createElement(M.PlantingDateCalculator, plantingProps({ zone: 3 })));
  has('M8-1', 'a zone-3 tomato harvest window ends at the 15 Sep first frost', zone3, /Harvest<\/span>[\s\S]{0,200}?Aug 7[\s\S]{0,20}?Sep 15/);
  hasNot('M8-2', 'and no longer runs 45 days past the plant\'s death', zone3, /Aug 7[\s\S]{0,20}?Oct 30/);
  const reversed = render('PDR', 'PlantingDateCalculator (reversed dates)', React.createElement(M.PlantingDateCalculator,
    plantingProps({ mode: 'manual', manualFrost: { lastSpring: '2026-11-01', firstFall: '2026-03-01' } })));
  has('L8-1', 'a backwards season is explained on screen', reversed, 'has to come after the last spring frost');
}
});

// ------------------------------------------------------------------- report
const width = Math.max(...rows.map((r) => r.label.length)) + 2;
console.log('\nRender drive  (engineering review 2026-09-06)\n');
for (const r of rows) {
  if (!r.verdict) { console.log(`\n${r.label}`); continue; }
  console.log(`${r.id.padEnd(7)} ${r.label.padEnd(width)} ${r.verdict}`);
}
const total = rows.filter((r) => r.verdict).length;
console.log(`\nrender drive: ${total - failures.length}/${total} checks OK.`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
