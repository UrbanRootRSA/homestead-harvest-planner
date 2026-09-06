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
  // L-6 / mutant M16: the timeline's own arithmetic, so the expected bar
  // position is derived from the shipped helpers instead of copied.
  'daysInYear', 'dayOfYear', 'splitRange', 'computePlantingDates',
  // Stage B (code review 2026-09-06): the paywall overlay's held-message
  // render (H-2), the client-side plan shape gate (M-5), the two tabs whose
  // copy carries a unit or a stat that was wrong (L-6, L-7), the small pill
  // (L-3) and the breakdown card that printed 0.0 m2 (M-2).
  'PaywallOverlay', 'normalisePlan', 'CostSavingsCalculator',
  'PreservationPlanner', 'PillSelect', 'CropBreakdownCard', 'AppHeader',
  'buildPlanReportHtml', 'GrowingPlanTab',
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

// ══════════════════════════════════════════════ STAGE B (code review 09-06)

// ─────────────────────────── H-2: a held licence message must be legible
group('a held licence message renders outside the collapsed form - H-2');
safe(() => {
{
  // The two states that most need explaining set NO prefill, so the licence
  // form stays collapsed and, before this fix, the only render site of the
  // message was inside it. A customer whose device pool is full, or whose
  // licence server is down, saw a bare $39.99 sales page.
  const overlay = (keyError, prefillKey = '') => render('PW', 'PaywallOverlay',
    React.createElement(M.PaywallOverlay, {
      tab: { id: 'growing-plan', label: 'Growing Plan', paid: true },
      keyError, prefillKey, activating: false,
      onActivate() {}, onClearError() {}, onClearPrefill() {},
    }));

  const pool = overlay('This licence key has reached its device activation limit. Deactivate an old device in your LemonSqueezy account, or contact support.');
  has('H2b-1', 'the full-pool message is on the page with the form still collapsed', pool, 'reached its device activation limit');
  has('H2b-2', 'and it names the remedy', pool, 'Deactivate an old device');
  hasNot('H2b-3', 'and the licence form is genuinely still collapsed', pool, '<form');
  has('H2b-4', 'the "Already purchased?" affordance is still offered', pool, 'Already purchased?');
  has('H2b-5', 'the message is announced, not just coloured', pool, 'role="alert"');

  const outage = overlay('We could not reach the licence server to verify your saved key. It is still saved on this device - reload to try again.');
  has('H2b-6', 'the outage message is on the page too', outage, 'reload to try again');
  hasNot('H2b-7', 'with no form to open', outage, '<form');

  const clean = overlay('');
  hasNot('H2b-8', 'and a customer with no licence problem is shown no alert', clean, 'role="alert"');
  has('H2b-9', 'control: the sales page itself is unchanged', clean, 'Unlock your full growing plan');

  const prefilled = overlay('We could not verify that licence key.', 'ABCD-1234-EFGH-5678');
  has('H2b-10', 'the prefill path still opens the form', prefilled, '<form');
  has('H2b-11', 'and still shows the message', prefilled, 'We could not verify that licence key.');
  record('H2b-12', 'exactly once, not twice',
    prefilled.split('We could not verify that licence key.').length - 1 === 1);
}
});

// ───────────────── H-1: the tab renders the generation state it is handed
group('the Growing Plan tab renders the generation state App owns - H-1');
safe(() => {
{
  const res = M.computeResults(M.PRESETS.salad_garden.selection, 2, 'fresh_preserving');
  // A licence key on the device: without one the tab correctly renders the
  // 48-hour grace panel ("Payment received. One step left") instead of the
  // Generate button, and every assertion below would be about the wrong view.
  globalThis.localStorage.setItem('hhp_key', JSON.stringify('AAAAAAAA-1111-2222-3333-MYOWNLICENCE'));
  const tab = (over) => render('GP', 'GrowingPlanTab', React.createElement(M.GrowingPlanTab, {
    baseResults: res,
    planState: { inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: ['fresh'], gardenSqFt: null }, plan: null, generatedAt: null, cropFingerprint: '' },
    setPlanState() {}, familySize: 2, hemisphere: 'north',
    plantingState: { mode: 'zone', zone: 7, manualFrost: null, selectedCrops: ['tomato'], referenceYear: 2026, sowMethodChoice: {} },
    metric: false, currency: '$', producePerPerson: 300, setTab() {},
    costSavings: { priceOverrides: {}, setupCosts: {} }, onActivateKey() {},
    generating: false, error: '', longRun: false, loadingIdx: 0,
    onGeneratePlan() {}, setError() {}, ...over,
  }));
  const idle = tab({});
  has('H1r-1', 'the idle tab offers to generate', idle, 'Generate my growing plan');
  const busy = tab({ generating: true, loadingIdx: 1 });
  has('H1r-2', 'a generation in flight shows the loading copy the parent owns', busy, 'Picking varieties for your zone');
  has('H1r-3', 'and the reassurance line says the other tabs are safe to visit', busy, 'You can look at the other tabs');
  hasNot('H1r-4', 'and no longer tells them not to leave', busy, "don't close the tab");
  const failed = tab({ error: 'The plan generator sent a response we could not read. Please try again.' });
  has('H1r-5', 'an error from the parent is rendered as an alert', failed, 'we could not read');
  globalThis.localStorage.removeItem('hhp_key');
}
});

// ─────────────────────── M-5: an off-shape plan body may not reach the DOM
group('a plan body that is not the current shape cannot crash the app - M-5');
safe(() => {
{
  // Each of these took the WHOLE app to the ErrorBoundary before the fix -
  // free calculators included - because every array access on the plan was
  // unguarded on both the screen and the report path.
  const OFF_SHAPE = [
    ['a partial body', { summary: 'Partial.' }],
    ['the old documented schema', {
      summary: 'Old.',
      monthlySchedule: [{ month: 'March', tasks: ['t'] }],
      yieldEstimates: [{ crop: 'Tomato', plants: 4, estimatedLbs: 30 }],
      preservationGuide: [{ crop: 'Tomato', fresh: '30%', can: '50%', freeze: '20%', jarsNeeded: 12 }],
      savingsEstimate: { annualSavings: 612, currency: '$', topSavers: ['Tomato'] },
    }],
    ['arrays where objects belong', { summary: 'X', monthlySchedule: 'nope', tips: 'nope', bedLayouts: {} }],
    ['nulls throughout', { summary: 'X', monthlySchedule: null, bedLayouts: null, successionPlanting: null, preservationGuide: null, savingsEstimate: null, tips: null }],
  ];
  let i = 0;
  for (const [label, body] of OFF_SHAPE) {
    i += 1;
    const plan = M.normalisePlan(body);
    record(`M5b-n${i}`, `normalisePlan survives ${label}`, plan === null || typeof plan === 'object');
    if (!plan) continue;
    const html = render('PLX', `PlanRenderer (${label})`, React.createElement(M.PlanRenderer, {
      plan, metric: false, currency: '$', isMobile: false, generatedAt: null,
      engineYields: [], engineHarvest: [], engineSavings: 0,
      onDownload() {}, onClear() {},
    }));
    record(`M5b-r${i}`, `and PlanRenderer renders ${label} without throwing`, html.length > 0);
  }
  record('M5b-1', 'a body that is not an object at all is refused outright',
    M.normalisePlan(null) === null && M.normalisePlan('a plan') === null && M.normalisePlan([]) === null);
  record('M5b-2', 'a body with nothing to show is refused rather than rendered empty',
    M.normalisePlan({ tips: ['x'] }) === null);
  const good = M.normalisePlan({
    summary: 'S', monthlySchedule: [{ month: 'March', tasks: ['t'] }],
    bedLayouts: [{ bedName: 'Bed 1', crops: ['Tomato'], notes: 'n' }],
    successionPlanting: [{ crop: 'Lettuce', plantings: 4, intervalWeeks: 2, note: 'n' }],
    preservationGuide: [{ crop: 'Tomato', freshShare: '30%', preservationMethods: ['can'], note: 'n' }],
    savingsEstimate: { topSavers: ['Tomato'], note: 'n' }, tips: ['t'],
  });
  record('M5b-3', 'a current-shape body passes through with every section intact',
    !!good && good.bedLayouts.length === 1 && good.successionPlanting[0].plantings === 4
    && good.preservationGuide[0].preservationMethods[0] === 'can' && good.tips.length === 1);
  record('M5b-4', 'and out-of-range numbers are clamped, not trusted',
    M.normalisePlan({ summary: 'S', monthlySchedule: [{ month: 'March', tasks: ['t'] }],
      successionPlanting: [{ crop: 'X', plantings: 1e9, intervalWeeks: -4, note: '' }] })
      .successionPlanting[0].plantings === 12);
}
});

// ────────────────────────── L-2: an unknown month must not lead the schedule
group('the monthly schedule is filtered on a real month - L-2');
safe(() => {
{
  // Built as a literal, not through normalisePlan: this case must be able to
  // run against a revision that has no normaliser, so the control run shows
  // the phantom month reaching the DOM.
  const plan = {
    summary: 'S',
    monthlySchedule: [
      { month: 'March', tasks: ['C'] },
      { month: 'March', tasks: ['A'] },
      { month: 'Marchember', tasks: ['B'] },
      { month: 'January', tasks: ['Z'] },
    ],
    bedLayouts: [], successionPlanting: [], preservationGuide: [],
    tips: [], savingsEstimate: null,
  };
  const html = render('PLM2', 'PlanRenderer (bad month)', React.createElement(M.PlanRenderer, {
    plan, metric: false, currency: '$', isMobile: false, generatedAt: null,
    engineYields: [], engineHarvest: [], engineSavings: 0, onDownload() {}, onClear() {},
  }));
  hasNot('L2b-1', 'a month name we do not know is dropped, not sorted to -1', html, 'Marchember');
  hasNot('L2b-2', 'and its task list goes with it', html, '>B</li>');
  record('L2b-3', 'January still leads the schedule',
    html.indexOf('>January<') > 0 && html.indexOf('>January<') < html.indexOf('>March<'));
  record('L2b-4', 'both March entries survive (duplicate months are legal)',
    (html.split('>March<').length - 1) === 2);

  // The downloaded report is the copy the customer keeps, and it builds its own
  // month list. One filter, every chain.
  let report = '';
  try {
    report = M.buildPlanReportHtml({
      plan, inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: ['fresh'], gardenSqFt: null },
      familySize: 4, zoneStr: 'USDA zone 7',
      lastSpringFrostStr: 'Apr 15', firstFallFrostStr: 'Oct 20', hemisphere: 'north',
      gardenSqFt: 320, metric: false, currency: '$', cropNames: ['Tomato'],
      generatedAt: Date.UTC(2026, 8, 6), engineYields: [], engineHarvest: [], engineSavings: 0,
    });
  } catch (e) { record('L2b-5', `the report builder ran: ${e?.message}`, false); }
  if (report) {
    hasNot('L2b-5', 'the downloaded report drops the phantom month too', report, 'Marchember');
    has('L2b-6', 'and still carries the real ones', report, 'January');
  }
}
});

// ────────────────────────── L-3: the 44 px floor on the most-tapped controls
group('mobile tap targets meet the 44 px floor the spec states - L-3');
safe(() => {
{
  const realMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    matches: /max-width:\s*640px/.test(q), media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    onchange: null, dispatchEvent: () => false,
  });
  try {
    const small = render('PS', 'PillSelect (sm, mobile)', React.createElement(M.PillSelect, {
      options: [{ id: 'a', label: 'Rarely' }, { id: 'b', label: 'Sometimes' }],
      value: 'a', onChange() {}, size: 'sm', ariaLabel: 'Frequency',
    }));
    has('L3b-1', 'the small pills are 44 px on a phone', small, 'min-height:44px');
    hasNot('L3b-2', 'and no longer 40', small, 'min-height:40px');
    const header = render('AH', 'AppHeader', React.createElement(M.AppHeader, {
      metric: false, setMetric() {}, currency: '$', setCurrency() {},
      hemisphere: 'north', setHemisphere() {},
    }));
    has('L3b-3', 'the header unit/currency/hemisphere pills are 44 px', header, 'min-height:44px');
    hasNot('L3b-4', 'with none left at 40', header, 'min-height:40px');
  } finally {
    globalThis.matchMedia = realMatchMedia;
  }
  const desktop = render('PSD', 'PillSelect (sm, desktop)', React.createElement(M.PillSelect, {
    options: [{ id: 'a', label: 'Rarely' }], value: 'a', onChange() {}, size: 'sm', ariaLabel: 'F',
  }));
  has('L3b-5', 'control: the desktop row keeps its tighter pill', desktop, 'min-height:40px');
}
});

// ───────────── L-6 + L-7 + M-2: units and stats on the two paid calculators
group('paid-tab copy and stats - L-6, L-7, M-2');
safe(() => {
{
  const res = M.computeResults(M.PRESETS.family_basics.selection, 4, 'fresh_preserving');
  const preserv = (metric) => render('PP', 'PreservationPlanner', React.createElement(M.PreservationPlanner, {
    baseResults: res, preservation: { freshPct: 30, methodChoice: {} },
    setPreservation() {}, metric,
  }));
  const imp = preserv(false);
  has('L6b-1', 'imperial keeps the NCHFP figures in lb', imp, '1.44 lb');
  const met = preserv(true);
  has('L6b-2', 'metric converts the quart baseline to 1.4 kg', met, '1.4 kg');
  has('L6b-3', 'and the pint to 0.66 kg', met, '0.66 kg');
  has('L6b-4', 'and the dehydrator batch to 3.6 kg', met, '3.6 kg');
  hasNot('L6b-5', 'no pound weight survives the metric note', met, ' lb ');
  has('L6b-6', 'the container names stay the products they are', met, 'gallon bag');

  const savings = (setupCosts) => render('CS', 'CostSavingsCalculator', React.createElement(M.CostSavingsCalculator, {
    baseResults: res, beds: BEDS, soilState: { mixId: 'classic_60_30_10', mixOverrides: null },
    costSavings: { priceOverrides: {}, setupCosts },
    setCostSavings() {}, metric: false, currency: '$',
  }));
  const zero = savings({ beds: 0, soil: 0, seeds: 0, tools: 0, irrigation: 0 });
  hasNot('L7b-1', 'with no setup costs entered, break-even is not "0.0"', zero, '>0.0<');
  has('L7b-2', 'and the copy still asks for the setup costs', zero, 'Add your setup costs');
  const priced = savings({ beds: 350, soil: 0, seeds: 0, tools: 0, irrigation: 0 });
  record('L7b-3', 'control: a real setup cost still produces a real break-even',
    /Break-even/i.test(priced) && !/>0\.0</.test(priced));

  const card = render('CB', 'CropBreakdownCard (metric)', React.createElement(M.CropBreakdownCard, {
    result: res.perCrop.find((r) => r.cropId === 'basil') || res.perCrop[0],
    metric: true, areaConv: 0.09290304, massConv: 0.45359237, unitArea: 'm²', unitMass: 'kg',
  }));
  hasNot('M2b-1', 'the self-sufficiency breakdown never prints 0.0 m2', card, '0.0 m²');

  // The same rule on the annual-yield line: 23 of 82 crops printed "~0 kg/yr"
  // in metric while imperial printed "~1 lb/yr" off the identical 0.75 lb.
  const tiny = M.computeResults({ arugula: 'rarely' }, 4, 'fresh_only');
  const tinyCard = (metric) => render('CBT', 'CropBreakdownCard (small crop)', React.createElement(M.CropBreakdownCard, {
    result: tiny.perCrop[0], metric,
    areaConv: metric ? 0.09290304 : 1, massConv: metric ? 0.45359237 : 1,
    unitArea: metric ? 'm²' : 'sq ft', unitMass: metric ? 'kg' : 'lb',
  }));
  const tinyMetric = tinyCard(true);
  hasNot('M2b-2', 'a real harvest never reads as ~0 kg/yr', tinyMetric, '~0 kg');
  has('M2b-3', 'it reads as the fraction it is', tinyMetric, '0.34');
  // Imperial has the same defect in the other direction: 0.75 lb printed as
  // "~1 lb/yr" overstates a small harvest by a third. Both units now print the
  // number.
  has('M2b-4', 'imperial prints the fraction too, instead of rounding 0.75 up to 1', tinyCard(false), '~0.75 lb');
  const big = M.computeResults({ potato: 'weekly' }, 4, 'full_year');
  const bigCard = render('CBB', 'CropBreakdownCard (large crop)', React.createElement(M.CropBreakdownCard, {
    result: big.perCrop[0], metric: false, areaConv: 1, massConv: 1, unitArea: 'sq ft', unitMass: 'lb',
  }));
  record('M2b-5', 'control: a real harvest is still a whole number, not 3 decimals',
    /~\d+ lb\/yr/.test(bigCard) && !/~\d+\.\d+ lb\/yr/.test(bigCard),
    (bigCard.match(/~[\d.]+ lb\/yr/) || [''])[0]);
}
});

// ═══ M-6 ruling: a prefilled key has to say whose key it is (2026-09-07)
group('the prefilled licence box names where the key came from - M-6');
safe(() => {
{
  const overlay = (prefillKey) => render('PWP', 'PaywallOverlay (prefill)',
    React.createElement(M.PaywallOverlay, {
      tab: { id: 'growing-plan', label: 'Growing Plan', paid: true },
      keyError: 'This licence key was not found.', prefillKey, activating: false,
      onActivate() {}, onClearError() {}, onClearPrefill() {},
    }));
  const filled = overlay('ABCD-1234-EFGH-5678');
  has('M6-1', 'the prefilled key is in the box', filled, 'value="ABCD-1234-EFGH-5678"');
  has('M6-2', 'and the copy says the key came from the link, not from this device', filled,
    'This key came from the link you opened, not from a licence saved on this device.');
  has('M6-3', 'and that activating it registers THIS device to that key', filled,
    /this device is registered to that key and uses one of its\s+three activations/);
  has('M6-4', 'the note is wired to the input for a screen reader', filled, 'hhp-prefill-note');
  has('M6-5', 'and the input points at both the error and the note', filled,
    'aria-describedby="hhp-key-error hhp-prefill-note"');
  const bare = overlay('');
  hasNot('M6-6', 'a customer opening the form themselves is not told about a link', bare,
    'This key came from the link you opened');
  hasNot('M6-7', 'control: with no prefill the form is not opened for them', bare, 'value="ABCD-1234-EFGH-5678"');
}
});

// ═════════ L-6 / MUTANT M16: the timeline BAR, not just the daysInYear helper
//
// calc-golden pins daysInYear(2024) = 366. Nothing rendered a bar and measured
// it, so replacing `daysInYear(referenceYear)` with a hardcoded 365 inside
// PlantingTimelineChart survived the whole suite. The live effect is a 0.27%
// drift on every bar in a leap year - small, but the helper exists precisely
// to prevent it, and a helper nothing consumes correctly is not a fix.
group('the planting timeline divides the year by the year it is drawing - L-6');
safe(() => {
{
  // Every bar's left offset is (dayOfYear / totalDays) * 100, so a rendered
  // percentage carries the denominator with it: multiply it back out and a
  // correct chart returns an integer day.
  // A PHASE BAR carries both a left and a width in per cent. The month
  // gridlines next to it are `left:X%;width:1px` - a 12-column grid that
  // divides by 12 whatever the year does, so matching on `left` alone measures
  // the gridlines and passes in every year. That trap is why this reads both.
  const pcts = (html) => [...html.matchAll(/left:([\d.]+)%;width:([\d.]+)%/g)]
    .map((m) => Number(m[1])).filter((p) => p > 0);

  // The expectation is DERIVED, not copied: the same crop, the same frost
  // dates and the same phase the chart draws, divided by the year the chart is
  // drawing. dayOfYear can be fractional across a DST boundary, so the day is
  // never rounded here - the point is the DENOMINATOR.
  const firstBarPct = (year) => {
    const frost = M.getFrostDates('zone', 7, 'north', null, year);
    const d = M.computePlantingDates(CROPS.tomato, frost, undefined);
    const seg = M.splitRange(d.startIndoors, d.transplant, year)[0];
    const day = Math.max(0, M.dayOfYear(seg.start, year));
    return { with366: (day / 366) * 100, with365: (day / 365) * 100, day };
  };

  const leap = render('PDL', 'PlantingDateCalculator (2024, leap)',
    React.createElement(M.PlantingDateCalculator, plantingProps({ referenceYear: 2024, selectedCrops: ['tomato', 'kale', 'carrot'] })));
  const leapPcts = pcts(leap);
  const e2024 = firstBarPct(2024);
  record('L6-1', 'the leap-year chart drew bars to measure', leapPcts.length >= 3, `${leapPcts.length} bars`);
  record('L6-2', 'the first tomato bar sits at day/366, the year the chart is drawing',
    leap.includes(`left:${e2024.with366}%`),
    `expected left:${e2024.with366}% (day ${e2024.day} / 366); drawn ${leapPcts.slice(0, 3).join(', ')}`);
  record('L6-3', 'and NOT at day/365 - which is what a hardcoded 365 would draw',
    !leap.includes(`left:${e2024.with365}%`), `the mutant's left:${e2024.with365}% is on the page`);

  const common = render('PDC', 'PlantingDateCalculator (2025, common)',
    React.createElement(M.PlantingDateCalculator, plantingProps({ referenceYear: 2025, selectedCrops: ['tomato', 'kale', 'carrot'] })));
  const commonPcts = pcts(common);
  const e2025 = firstBarPct(2025);
  record('L6-4', 'control: the same chart in a common year divides by 365',
    common.includes(`left:${e2025.with365}%`),
    `expected left:${e2025.with365}% (day ${e2025.day} / 365); drawn ${commonPcts.slice(0, 3).join(', ')}`);
  record('L6-5', 'control: the two years really do draw different bars',
    JSON.stringify(leapPcts) !== JSON.stringify(commonPcts),
    `leap=${leapPcts.slice(0, 2).join(',')} common=${commonPcts.slice(0, 2).join(',')}`);
}
});

// ═════════════════ N-1: one card, one basis per figure, every figure labelled
group('the soil card never prints two volumes on two bases - N-1');
safe(() => {
{
  const html = render('SON', 'SoilCalculator (N-1)', React.createElement(M.SoilCalculator, soilProps(false, '$')));
  // The 72 px headline. H-3 moved the bags, the subtotals and the cost onto the
  // settled volume and left this one - and the "Volume (cu yd)" stat - on the
  // raw one, so the biggest number on the page was the one a bulk-soil buyer
  // must NOT order.
  has('N1-1', 'the headline says what it is: the volume to buy', html, 'Total soil to buy (incl. settling)');
  hasNot('N1-2', 'the unqualified "Total soil needed" eyebrow is gone', html, 'Total soil needed');
  has('N1-3', 'and the number under it is the settled 110.4, not the raw 96.0', html,
    /Total soil to buy \(incl\. settling\)[\s\S]{0,400}?110\.4/);
  has('N1-4', 'the bulk-order figure is the settled 4.09 cu yd', html, '4.09 cu yd');
  hasNot('N1-5', 'the raw 3.56 cu yd no longer stands alone as "Volume (cu yd)"', html, 'Volume (cu yd)<');
  has('N1-6', 'the cubic-yard stat says it includes settling', html, 'Volume (cu yd, incl. settling)');
  has('N1-7', 'the raw bed volume is still on the card, named as the pre-settling measure', html,
    /your beds measure 96\.0 cu ft \(3\.56 cu yd\) before the 15% settling buffer/);
}
{
  const html = render('SONM', 'SoilCalculator (N-1, metric)', React.createElement(M.SoilCalculator, soilProps(true, 'R')));
  has('N1-8', 'metric headline is the settled 3126.2 L', html,
    /Total soil to buy \(incl\. settling\)[\s\S]{0,400}?3126\.2/);
  has('N1-9', 'and the bulk figure is 3.13 m3, not the raw 2.72', html, '3.13 m³');
  has('N1-10', 'the raw 2718.4 L (2.72 m3) is labelled as the bed measurement', html,
    /your beds measure 2718\.4 L \(2\.72 m³\) before the 15% settling buffer/);
  has('N1-11', 'and the stat carries the basis in metric too', html, 'Volume (m³, incl. settling)');
}
});

// ══════════════════════ N-4: three states on the Cost Savings hero, all live
group('the Cost Savings hero has no unreachable branch - N-4');
safe(() => {
{
  const res = M.computeResults({}, 4, 'full_year');
  const empty = render('CSE', 'CostSavingsCalculator (no crops)', React.createElement(M.CostSavingsCalculator, {
    baseResults: res, beds: BEDS, soilState: { mixId: 'classic_60_30_10', mixOverrides: null },
    costSavings: { priceOverrides: {}, setupCosts: {} }, setCostSavings() {}, metric: false, currency: '$',
  }));
  has('N4-1', 'an empty selection gets the tab-level empty state', empty, 'Pick your crops first');
  hasNot('N4-2', 'and the hero sentence that could never be reached is gone from the source', empty,
    'Add at least one crop in the Self-Sufficiency tab');
  const res2 = M.computeResults({ tomato: 'weekly' }, 4, 'full_year');
  const savings = (setupCosts) => render('CSH', 'CostSavingsCalculator (hero)', React.createElement(M.CostSavingsCalculator, {
    baseResults: res2, beds: BEDS, soilState: { mixId: 'classic_60_30_10', mixOverrides: null },
    costSavings: { priceOverrides: {}, setupCosts }, setCostSavings() {}, metric: false, currency: '$',
  }));
  has('N4-3', 'state 1 of 3: crops but no setup cost', savings({}), 'Add your setup costs below');
  has('N4-4', 'state 3 of 3: a real break-even sentence', savings({ beds: 350 }), 'pays for itself in');
}
});

// ═══════════════ N-6: the preservation footnote states its direction correctly
group('the preservation footnote is right about which way it errs - N-6');
safe(() => {
{
  const res = M.computeResults({ peas_shell: 'weekly', corn: 'weekly' }, 4, 'full_year');
  const html = render('PPN', 'PreservationPlanner (N-6)', React.createElement(M.PreservationPlanner, {
    baseResults: res, preservation: { freshPct: 30, methodChoice: {} }, setPreservation() {}, metric: false,
  }));
  hasNot('N6-1', 'the inverted claim is gone', html, 'runs low for dense packs');
  has('N6-2', 'shelling peas are named with the right direction: the jar count reads LOW', html,
    /Shelling peas[\s\S]{0,220}?reads low/);
  has('N6-3', 'and the reason is the basis, not the density', html, 'NCHFP weighs peas in the pod');
  has('N6-4', 'sweet corn is named as in-husk, not as a dense pack', html, /Sweet corn[\s\S]{0,80}?weighs in the husk/);
}
{
  // A true zero at both ends of the slider - N-3 on the surface it was found on.
  const res = M.computeResults({ tomato: 'weekly' }, 4, 'full_year');
  const at = (freshPct) => render('PPZ', `PreservationPlanner (fresh ${freshPct}%)`, React.createElement(M.PreservationPlanner, {
    baseResults: res, preservation: { freshPct, methodChoice: {} }, setPreservation() {}, metric: false,
  }));
  hasNot('N3-1', 'fresh 0% does not print "0.000"', at(0), '0.000');
  hasNot('N3-2', 'and neither does fresh 100%', at(100), '0.000');
  has('N3-3', 'the zero is printed as a zero', at(0), 'fresh 0 ');
}
});

// ══════════ N-2: a CENSUS, not a selector list - every interactive control
//
// The L-3 sweep fixed the four control types that finding named and left 97
// controls under the floor, including the 82 crop rows, because the check that
// followed it asserted two selectors. This one walks EVERY interactive element
// in the rendered markup and fails on any that does not clear 44 px, so a
// control that ships small in future fails here whether or not anyone thought
// to add it.
//
// WHAT THIS MEASURES: the DECLARED box - min-height, or height, or padding plus
// a line box. SSR has no layout engine, so it cannot see a computed width, a
// flex stretch or a font that resolves larger than declared. Unknown is treated
// as FAIL, not as pass: a control whose height cannot be read from its own
// style has to declare one. The pixel census at 375 px lives in the browser
// drive (docs/fixes-2026-09-06-round2.md records the run).
group('every interactive control declares 44 px on a phone - N-2');
safe(() => {
{
  const TAP_MIN = 44;
  // The whole census runs at the phone breakpoint. useMediaQuery reads
  // matchMedia at first render, so this has to be installed before any of the
  // surfaces below are rendered - and restored after, or every later check in
  // this file silently measures a phone.
  const realMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    matches: /max-width:\s*640px/.test(q), media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    onchange: null, dispatchEvent: () => false,
  });
  try {
  // Named exemptions. Each one needs a reason, and the reason has to be about
  // the CONTROL, not about the effort of fixing it.
  const EXEMPT = [
    {
      // WCAG 2.5.8 exempts a link inside a sentence: growing it to 44 px would
      // break the line box of the copyright line it sits in.
      test: (el) => el.tag === 'a' && /href="https:\/\/urban-root\.com"/.test(el.attrs),
      why: 'inline link inside a sentence (WCAG 2.5.8 inline exception)',
    },
    {
      // The 18 px checkbox inside a crop row. The LABEL is the tap target and
      // it is measured; the input is what the label activates.
      test: (el) => el.tag === 'input' && /type="checkbox"/.test(el.attrs) && el.insideBigLabel,
      why: 'checkbox wrapped by a label that clears the floor - the label is the target',
    },
  ];

  const surfaces = [];
  const add = (name, el) => { const html = render('CEN', `census surface ${name}`, el); if (html) surfaces.push([name, html]); };
  add('App', React.createElement(M.default));
  add('SelfSufficiency', React.createElement(M.SelfSufficiencyCalculator, {
    familySize: 4, setFamilySize() {}, goal: 'full_year', setGoal() {},
    selection: M.PRESETS.family_basics.selection, setSelection() {},
    metric: false, producePerPerson: 300, setProducePerPerson() {},
  }));
  add('Soil', React.createElement(M.SoilCalculator, soilProps(false, '$')));
  {
    const res = M.computeResults({ tomato: 'weekly', carrot: 'weekly' }, 4, 'full_year');
    add('CostSavings', React.createElement(M.CostSavingsCalculator, {
      baseResults: res, beds: BEDS, soilState: { mixId: 'classic_60_30_10', mixOverrides: null },
      costSavings: { priceOverrides: {}, setupCosts: { beds: 350 } }, setCostSavings() {}, metric: false, currency: '$',
    }));
    add('Preservation', React.createElement(M.PreservationPlanner, {
      baseResults: res, preservation: { freshPct: 30, methodChoice: {} }, setPreservation() {}, metric: false,
    }));
    add('GrowingPlan', React.createElement(M.GrowingPlanTab, {
      baseResults: res,
      planState: { inputs: { sunExposure: 'full_sun', soilType: 'loamy', waterMethod: 'drip', experience: '1_to_3', goals: ['fresh'], gardenSqFt: null }, plan: null, generatedAt: null, cropFingerprint: '' },
      setPlanState() {}, familySize: 2, hemisphere: 'north',
      plantingState: { mode: 'zone', zone: 7, manualFrost: null, selectedCrops: ['tomato'], referenceYear: 2026, sowMethodChoice: {} },
      metric: false, currency: '$', producePerPerson: 300, setTab() {},
      costSavings: { priceOverrides: {}, setupCosts: {} }, onActivateKey() {},
      generating: false, error: '', longRun: false, loadingIdx: 0,
      onGeneratePlan() {}, setError() {},
    }));
  }
  add('PlantingDates', React.createElement(M.PlantingDateCalculator, plantingProps({})));
  add('Paywall', React.createElement(M.PaywallOverlay, {
    tab: { id: 'growing-plan', label: 'Growing Plan', paid: true },
    keyError: '', prefillKey: '', activating: false,
    onActivate() {}, onClearError() {}, onClearPrefill() {},
  }));
  record('N2-0', 'the census has surfaces to walk', surfaces.length >= 6, `${surfaces.length} surfaces`);

  const px = (s) => { const m = /^(-?[\d.]+)px$/.exec(String(s).trim()); return m ? Number(m[1]) : null; };
  const decl = (style, prop) => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`).exec(style);
    return m ? m[1].trim() : null;
  };
  // A declared height, or null when the style does not settle it.
  function declaredHeight(style) {
    const mh = px(decl(style, 'min-height'));
    if (mh !== null) return mh;
    const h = px(decl(style, 'height'));
    if (h !== null) return h;
    const pad = decl(style, 'padding');
    if (!pad) return null;
    const parts = pad.split(/\s+/).map(px);
    if (parts.some((p) => p === null)) return null;
    const top = parts[0];
    const bottom = parts.length >= 3 ? parts[2] : parts[0];
    // The smallest font this app uses on a control, so the estimate errs
    // toward FAILING an element rather than passing one.
    const fs = px(decl(style, 'font-size')) ?? 12;
    return top + bottom + Math.round(fs * 1.35);
  }

  const findings = [];
  let measured = 0;
  for (const [surface, html] of surfaces) {
    // Label blocks first: a label that wraps a checkbox IS the tap target, and
    // knowing which inputs it covers is what makes the exemption exact.
    const bigLabelInputs = new Set();
    for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
      const style = (m[1].match(/style="([^"]*)"/) || [, ''])[1];
      const inner = m[2];
      if (!/<input\b[^>]*type="(?:checkbox|radio)"/.test(inner)) continue;
      const h = declaredHeight(style);
      measured += 1;
      if (h === null || h < TAP_MIN) {
        findings.push(`${surface}: <label> wrapping a checkbox declares ${h === null ? 'no height' : `${h}px`} - ${style.slice(0, 90)}`);
      } else {
        for (const im of inner.matchAll(/<input\b[^>]*>/g)) bigLabelInputs.add(im[0]);
      }
    }
    for (const m of html.matchAll(/<(button|a|input|select|textarea)\b([^>]*)>/g)) {
      const [whole, tag, attrs] = m;
      if (tag === 'a' && !/\shref=/.test(attrs)) continue;              // an anchor with no href is not a control
      if (tag === 'input' && /type="hidden"/.test(attrs)) continue;
      const el = { tag, attrs, insideBigLabel: bigLabelInputs.has(whole) };
      const ex = EXEMPT.find((e) => e.test(el));
      if (ex) continue;
      const style = (attrs.match(/style="([^"]*)"/) || [, ''])[1];
      const h = declaredHeight(style);
      measured += 1;
      if (h === null || h < TAP_MIN) {
        findings.push(`${surface}: <${tag}> declares ${h === null ? 'no height' : `${h}px`} - ${(attrs.match(/aria-label="([^"]*)"/) || [, ''])[1] || style.slice(0, 90)}`);
      }
    }
  }
  record('N2-1', 'the census actually walked a page full of controls', measured > 150, `${measured} controls measured`);
  record('N2-2', `every interactive control declares at least ${TAP_MIN}px at the phone breakpoint`,
    findings.length === 0, `${findings.length} under the floor:\n      ${[...new Set(findings)].slice(0, 12).join('\n      ')}`);
  // The two families the fix moved, pinned by value so a revert is loud.
  const ss = surfaces.find(([n]) => n === 'SelfSufficiency');
  record('N2-3', 'the 82 crop rows are 44, not 32', ss && /min-height:44px/.test(ss[1]) && !/min-height:32px/.test(ss[1]));
  const app = surfaces.find(([n]) => n === 'App');
  record('N2-4', 'the footer links carry a floor', app && /text-decoration:none;font-size:13px;font-weight:500;padding:4px 0;display:flex;align-items:center;min-height:44px/.test(app[1]));
  } finally {
    globalThis.matchMedia = realMatchMedia;
  }
}
});

// The desktop control for the census: the same rows keep their tighter rhythm
// off the phone breakpoint, so the fix did not just set 44 everywhere.
group('the 44 px floor is a phone rule, not a redesign - N-2');
safe(() => {
{
  const html = render('SSD', 'SelfSufficiencyCalculator (desktop)', React.createElement(M.SelfSufficiencyCalculator, {
    familySize: 4, setFamilySize() {}, goal: 'full_year', setGoal() {},
    selection: M.PRESETS.family_basics.selection, setSelection() {},
    metric: false, producePerPerson: 300, setProducePerPerson() {},
  }));
  has('N2-5', 'a desktop crop row is still 32 px', html, 'min-height:32px');
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
