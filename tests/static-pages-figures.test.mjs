// tests/static-pages-figures.test.mjs
//
// L-4 (Aero sibling sweep 2026-10-29, docs/reviews/REVIEW-2026-10-29-aero-sibling-sweep.md):
// nothing pinned the static pages' printed figures to the engine, and one page had already
// drifted: the soil post said 22 bags where the Soil tab prints 26 for the same bed. L-5 and
// L-6 were the same shape (a tomato table "from our database" that was not, and a companion
// verdict the checker contradicts). This suite reads the pages a reader sees and compares
// every figure that claims to come from the app, its crop table or its companion data with
// the shipped source. It also pins the legal pages' retention periods to the two API
// handlers (M-2), the copy residue L-10 removed, and the 44 px rule L-2 added.
//
// House idiom (tests/calc-golden.test.mjs): the engine is the SHIPPED text of src/App.jsx,
// brace-extracted at run time and evaluated in a sandbox. Nothing here re-implements a
// formula: every expected value comes out of computeResults, computeSoilResults,
// computeSavingsRows, the crop table or the companion data. Each figure is located by the
// words around it; a figure that cannot be found throws, so a removed or reworded figure
// turns the run red instead of quietly shortening it. Pages the review found clean and that
// quote no app figure (the feed-family post's external yield table, I-1) are not pinned.
//
// Run: npm test          Judge by the EXIT CODE and the completion line, never the counts.
//
// CONTROL: every input can be pointed at another revision, and each override PRINTS so a
// green run can never mean anything other than "the shipped files passed":
//   HHP_PAGES_DIR=<a copy of public/>   HHP_INDEX_SRC=<a copy of index.html>
//   HHP_APP_SRC=<App.jsx>   HHP_GENERATE_SRC=<generate.js>   HHP_VALIDATE_SRC=<validate-key.js>

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APP_PATH = process.env.HHP_APP_SRC || join(ROOT, 'src', 'App.jsx');
const PAGES_DIR = process.env.HHP_PAGES_DIR || join(ROOT, 'public');
const INDEX_PATH = process.env.HHP_INDEX_SRC || join(ROOT, 'index.html');
const GEN_PATH = process.env.HHP_GENERATE_SRC || join(ROOT, 'api', 'generate.js');
const VK_PATH = process.env.HHP_VALIDATE_SRC || join(ROOT, 'api', 'validate-key.js');
for (const [name, path] of [['HHP_APP_SRC', APP_PATH], ['HHP_PAGES_DIR', PAGES_DIR], ['HHP_INDEX_SRC', INDEX_PATH],
  ['HHP_GENERATE_SRC', GEN_PATH], ['HHP_VALIDATE_SRC', VK_PATH]]) {
  if (process.env[name]) console.log(`[control run] ${name}=${path}`);
}

const failures = [];
const rows = [];
function check(id, label, ok, detail) {
  rows.push({ id, label, verdict: ok ? 'ok' : 'FAIL' });
  if (!ok) failures.push(`${id}: ${label}${detail !== undefined ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }
// A figure that cannot be found throws inside its group. The group then fails as a
// named row and the rest of the run continues: red, with a count, never shorter.
function safe(fn) {
  try { fn(); } catch (e) { check('E', `a group stopped early: ${e?.message}`, false); }
}
// A case that throws would skip the completion line the exit-code contract depends on.
process.on('exit', (code) => {
  if (code !== 0 && !failures.length) console.error(`\nstatic-pages-figures: THREW after ${rows.length} rows. The run is incomplete.`);
});

// ---------------------------------------------------------------- extractor
// Ported from tests/calc-golden.test.mjs: steps over strings, nested template literals,
// comments and regex literals, so a brace inside any of them cannot end a slice early.
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
    if (c === '\n') return i + 1;
    if (c === '/' && !inClass) { j += 1; while (j < src.length && /[a-z]/.test(src[j])) j += 1; return j; }
    j += 1;
  }
  return i + 1;
}
function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) return j + 1; j += 1; }
  return src.length;
}
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
  const m = new RegExp(`^(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`, 'm').exec(src);
  if (!m) return null;
  return walk(src, m.index, src.startsWith('function', m.index) || src.startsWith('async function', m.index));
}

// ------------------------------------------------------------- the shipped engine
const APP_SRC = readFileSync(APP_PATH, 'utf8').replace(/\r\n/g, '\n');
const { CROPS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'crops.js')).href);
const { COMPANIONS, getCompanion } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'companions.js')).href);
const NAMES = [
  'CUFT_TO_L', 'CUFT_TO_CUM', 'CUFT_TO_CUYD', 'IN_TO_CM', 'SETTLING_BUFFER',
  'PATH_SHARE_OF_FOOTPRINT', 'PATH_BUFFER', 'DEFAULT_PRODUCE_PER_PERSON_LBS',
  'GOAL_MULTIPLIER', 'FREQUENCY_FACTOR', 'PRESETS', 'BAG_SIZES_CUFT', 'BAG_SIZES_L',
  'ZONE_FROST_DATES', 'computeResults', 'computeSavingsRows', 'SOIL_MIXES',
  'computeBedVolumeCuFt', 'computeSoilResults', 'SAUCE_QUART_LBS', 'magnitudeDecimals',
  'PRICE_USD', 'FAQ_ITEMS',
];
const missing = NAMES.filter((n) => !sliceDecl(APP_SRC, n));
if (missing.length) {
  console.error(`static-pages-figures: declarations not found in ${APP_PATH}: ${missing.join(', ')}`);
  process.exit(1);
}
const picked = NAMES.map((n) => { const text = sliceDecl(APP_SRC, n); return { n, text, at: APP_SRC.indexOf(text) }; })
  .sort((a, b) => a.at - b.at);
const E = new Function('CROPS', 'COMPANIONS', `${picked.map((p) => p.text).join('\n\n')}\nreturn { ${NAMES.join(', ')} };`)(CROPS, COMPANIONS);

// The two API handlers' retention constants, read off the source the same way.
function constantsOf(path) {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const out = {};
  for (const m of src.matchAll(/^const ([A-Z][A-Z0-9_]+) = ([0-9][0-9 *]*);/gm)) {
    out[m[1]] = new Function(`return (${m[2]});`)();
  }
  return { src, k: out };
}
const GEN = constantsOf(GEN_PATH);
const VK = constantsOf(VK_PATH);

// ------------------------------------------------------------------- the pages
const ENTITIES = { '&amp;': '&', '&middot;': '·', '&nbsp;': ' ', '&times;': '×', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&ndash;': '–', '&lt;': '<', '&gt;': '>' };
const decode = (s) => s.replace(/&[a-z#0-9]+;/g, (e) => ENTITIES[e] ?? e);
const strip = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const pageCache = new Map();
function page(rel) {
  if (!pageCache.has(rel)) {
    const html = readFileSync(join(PAGES_DIR, rel), 'utf8').replace(/\r\n/g, '\n');
    pageCache.set(rel, { html, text: strip(html) });
  }
  return pageCache.get(rel);
}
// One figure by the words around it. The pattern must match exactly once.
function grab(rel, re, what) {
  const hits = [...page(rel).text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
  if (hits.length !== 1) throw new Error(`${rel}: "${what}" matched ${hits.length} times (want exactly 1): ${re}`);
  return hits[0];
}
// The body rows of the one table whose header matches, as arrays of cell text.
function tableRows(rel, headRe) {
  const tables = [...page(rel).html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const found = tables.filter((t) => headRe.test(strip((/<thead>[\s\S]*?<\/thead>/.exec(t) || [''])[0])));
  if (found.length !== 1) throw new Error(`${rel}: ${found.length} tables have a header matching ${headRe}`);
  const body = (/<tbody>([\s\S]*?)<\/tbody>/.exec(found[0]) || [])[1] || '';
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]).trim()));
}
const same = (id, label, got, want) => check(id, label, String(got) === String(want), `page ${got}, source ${want}`);

// The worked example every product surface quotes: the first-load settings.
const FB = E.PRESETS.family_basics.selection;
const fb = E.computeResults(FB, 4, 'fresh_preserving', E.DEFAULT_PRODUCE_PER_PERSON_LBS);
const fbSavings = E.computeSavingsRows(fb.perCrop, {}).totalSavings;
const zones = Object.keys(E.ZONE_FROST_DATES).map(Number);
const pct = (x) => String(Math.round(x * 100));

// ════════════════════════════════════════ landing page, llms.txt, about
group('the landing page, llms.txt and about.html quote the shipped engine');
safe(() => {
  const L = 'homestead-planning-software/index.html';
  same('LP-1', 'plants to grow on the first-load settings', grab(L, /\b(\d[\d,]*) plants to grow/, 'plants')[1], fb.totalPlants);
  same('LP-2', 'self-sufficiency on the conservative yield', grab(L, /(\d+\.\d) % self-sufficiency/, 'pct')[1], fb.rawSelfSufficiencyPct.toFixed(1));
  same('LP-3', 'savings a year on the default prices', grab(L, /\$(\d[\d,]*\.\d\d) a year in groceries/, 'savings')[1],
    fbSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  same('LP-4', 'the Family Basics preset has the crop count it names', grab(L, /Family Basics preset \((\d+) crops/, 'preset size')[1], Object.keys(FB).length);
  const named = { tomatoes: 'tomato', potatoes: 'potato', carrots: 'carrot', onions: 'onion', 'bush beans': 'green_beans_bush', lettuce: 'lettuce' };
  const list = grab(L, /among them ([a-z ,]+?) and ([a-z ]+?)\)/, 'named crops');
  const names = [...list[1].split(',').map((s) => s.trim()), list[2].trim()];
  check('LP-5', `the six crops it names are all in the preset (${names.join(', ')})`,
    names.length === 6 && names.every((n) => named[n] && FB[named[n]]), names.filter((n) => !(named[n] && FB[named[n]])).join(', '));
  same('LP-6', 'the default produce per person', grab(L, /the default (\d+) lb of produce per person/, 'produce')[1], E.DEFAULT_PRODUCE_PER_PERSON_LBS);
  same('LP-7', 'the path share of the footprint', grab(L, /about (\d+) % of the footprint for paths/, 'paths')[1], pct(E.PATH_SHARE_OF_FOOTPRINT));
  same('LP-8', 'the number of soil-mix presets', grab(L, /(\d+) mix presets/, 'mixes')[1], E.SOIL_MIXES.length);
  same('LP-9', 'the settling allowance', grab(L, /including a (\d+) % settling allowance/, 'settling')[1], pct(E.SETTLING_BUFFER - 1));
  const pairs = grab(L, /(\d+) sourced pairings across (\d+) crops/, 'pairings');
  check('LP-10', 'companion pairings and crops', Number(pairs[1]) === COMPANIONS.length && Number(pairs[2]) === Object.keys(CROPS).length,
    `page ${pairs[1]}/${pairs[2]}, data ${COMPANIONS.length}/${Object.keys(CROPS).length}`);
  const z = grab(L, /harvest windows for USDA zones (\d+) to (\d+)/, 'zones');
  check('LP-11', 'the pre-loaded USDA zones', Number(z[1]) === Math.min(...zones) && Number(z[2]) === Math.max(...zones), `page ${z[1]}-${z[2]}`);
  same('LP-12', 'the crop database size', grab(L, /All (\d+) crops with yields/, 'db size')[1], Object.keys(CROPS).length);
  same('LP-13', 'the price', grab(L, /a one-time \$(\d+\.\d\d) payment/, 'price')[1], E.PRICE_USD);

  const T = 'llms.txt';
  same('LT-1', 'llms.txt: plants', grab(T, /: (\d+) plants, /, 'plants')[1], fb.totalPlants);
  same('LT-2', 'llms.txt: self-sufficiency', grab(T, /(\d+\.\d) % self-sufficiency/, 'pct')[1], fb.rawSelfSufficiencyPct.toFixed(1));
  same('LT-3', 'llms.txt: savings', grab(T, /\$(\d[\d,]*\.\d\d) a year in displaced/, 'savings')[1],
    fbSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  same('LT-4', 'llms.txt: preset size', grab(T, /Family Basics preset of (\d+) crops/, 'preset')[1], Object.keys(FB).length);
  const lp = grab(T, /\((\d+) pairings, (\d+) crops\)/, 'pairings');
  check('LT-5', 'llms.txt: pairings and crops', Number(lp[1]) === COMPANIONS.length && Number(lp[2]) === Object.keys(CROPS).length, `${lp[1]}/${lp[2]}`);
  const lz = grab(T, /USDA zones (\d+) to (\d+)/, 'zones');
  check('LT-6', 'llms.txt: zones', Number(lz[1]) === Math.min(...zones) && Number(lz[2]) === Math.max(...zones), `${lz[1]}-${lz[2]}`);
  same('LT-7', 'llms.txt: database size', grab(T, /an (\d+)-crop database/, 'db')[1], Object.keys(CROPS).length);
  same('LT-8', 'llms.txt: produce per person', grab(T, /(\d+) lb of produce per person per year/, 'produce')[1], E.DEFAULT_PRODUCE_PER_PERSON_LBS);
  same('LT-9', 'llms.txt: price', grab(T, /A one-time \$(\d+\.\d\d) USD licence/, 'price')[1], E.PRICE_USD);

  const A = 'about.html';
  const ap = grab(A, /(\d+) pairwise relationships across (\d+) crops/, 'pairings');
  check('AB-1', 'about: pairings and crops', Number(ap[1]) === COMPANIONS.length && Number(ap[2]) === Object.keys(CROPS).length, `${ap[1]}/${ap[2]}`);
  const az = grab(A, /USDA zones (\d+)–(\d+) with frost dates/, 'zones');
  check('AB-2', 'about: zones', Number(az[1]) === Math.min(...zones) && Number(az[2]) === Math.max(...zones), `${az[1]}-${az[2]}`);
  same('AB-3', 'about: the default produce figure', grab(A, /USDA's (\d+)-lb-per-person-per-year figure/, 'produce')[1], E.DEFAULT_PRODUCE_PER_PERSON_LBS);
});

// ════════════════════════════════════════ the soil post (L-4)
group('the soil post bills the settled volume, the way the Soil tab does - L-4');
safe(() => {
  const S = 'blog/how-much-soil-for-4x8-raised-bed.html';
  const bed = (depthIn) => ({ shape: 'rect', lengthFt: 8, widthFt: 4, depthIn, qty: 1 });
  // One product, through the engine: a single component at 100 % bills the whole settled volume.
  const ONE = { id: 'one', components: [{ key: 'all', label: 'all', pct: 1, pricePerCuFt: 0 }] };
  const buyCuFt = (d) => E.computeSoilResults([bed(d)], ONE).components[0].cuftWithSettling;
  const raw = (d) => E.computeBedVolumeCuFt(bed(d));
  const bagsCuFt = (d, size) => Math.ceil(buyCuFt(d) / size);
  const bagsL = (d, litres) => Math.ceil((buyCuFt(d) * E.CUFT_TO_L) / litres);
  const trim1 = (x) => String(Number(x.toFixed(1)));

  const lede = grab(S, /holds (\d+) cubic feet of soil, or about ([\d.]+) cubic metres \. Buy (\d+)% more, because fresh soil settles: ([\d.]+) cubic feet , which is (\d+) bags at the standard 1\.5 cu ft bag size\. Budget \$(\d+)–\$(\d+) if you are buying premium bagged mix/, 'lede');
  same('S-1', 'lede: the bed volume', lede[1], raw(12));
  same('S-2', 'lede: the bed volume in cubic metres', lede[2], (raw(12) * E.CUFT_TO_CUM).toFixed(2));
  same('S-3', 'lede: the settling allowance', lede[3], pct(E.SETTLING_BUFFER - 1));
  same('S-4', 'lede: the volume to buy', lede[4], trim1(buyCuFt(12)));
  same('S-5', 'lede: 1.5 cu ft bags to buy (was 22 on the raw volume)', lede[5], bagsCuFt(12, 1.5));

  for (const [i, d] of [6, 8, 10, 12, 18].entries()) {
    const m = grab(S, new RegExp(`(?<!\\d)${d} inches deep → ([\\d.]+) cu ft \\((\\d+) bags`), `tldr ${d} in`);
    check(`S-6.${i + 1}`, `quick reference ${d} in: bed volume and bags to buy`, m[1] === trim1(raw(d)) && Number(m[2]) === bagsCuFt(d, 1.5),
      `page ${m[1]} / ${m[2]}, engine ${trim1(raw(d))} / ${bagsCuFt(d, 1.5)}`);
  }
  const f = grab(S, /32 × ([\d.]+) = ([\d.]+) cu ft/, 'formula');
  check('S-7', 'the formula paragraph multiplies by the settling buffer', Number(f[1]) === E.SETTLING_BUFFER && f[2] === trim1(buyCuFt(12)), `${f[1]} / ${f[2]}`);

  const vol = tableRows(S, /Bed volume \(cu ft\)/);
  const DEPTHS = [6, 8, 10, 12, 15, 18, 24];
  check('S-8', 'the volume table has one row per depth', vol.length === DEPTHS.length, `${vol.length} rows`);
  DEPTHS.forEach((d, i) => {
    const want = [`${d} in (${Math.round(d * E.IN_TO_CM)} cm)`, raw(d).toFixed(1), buyCuFt(d).toFixed(1),
      (buyCuFt(d) * E.CUFT_TO_CUYD).toFixed(2), (buyCuFt(d) * E.CUFT_TO_CUM).toFixed(2), String(bagsL(d, 50))];
    check(`S-9.${i + 1}`, `volume table, ${d} in`, JSON.stringify(vol[i]) === JSON.stringify(want), `page ${JSON.stringify(vol[i])}, engine ${JSON.stringify(want)}`);
  });
  same('S-10', 'the "cannot buy N bags" example is the 12 in figure at 50 L', grab(S, /you cannot buy ([\d.]+) bags/, 'note')[1],
    ((buyCuFt(12) * E.CUFT_TO_L) / 50).toFixed(1));

  const bags = tableRows(S, /Bag size/);
  const BAGS = [...E.BAG_SIZES_CUFT.map((s) => ({ label: `${s} cu ft`, cu: s.toFixed(s % 1 ? 1 : 1), n: bagsCuFt(12, s) })),
    ...E.BAG_SIZES_L.map((l) => ({ label: `${l}L sack`, cu: (l / E.CUFT_TO_L).toFixed(2), n: bagsL(12, l) }))];
  check('S-11', 'the bag table has a row for every bag size the Soil tab offers', bags.length === BAGS.length, `${bags.length} rows`);
  BAGS.forEach((b, i) => {
    const r = bags[i] || [];
    check(`S-12.${i + 1}`, `bag table, ${b.label}`, (r[0] || '').startsWith(b.label) && r[1] === b.cu && r[2] === `${b.n} bags`,
      `page ${JSON.stringify(r)}, engine ${b.cu} / ${b.n} bags`);
  });
  same('S-13', 'the bag table header names the volume to buy', grab(S, /For a 4×8 bed at 12" \(([\d.]+) cu ft to buy\) 1 cu ft/, 'bag table header')[1], trim1(buyCuFt(12)));
  const short = grab(S, /Buying (\d+) bags when you need ([\d.]+) is/, 'round-up example');
  check('S-14', 'the round-up example is the 1.5 cu ft figure', Number(short[1]) === Math.floor(buyCuFt(12) / 1.5) && short[2] === (buyCuFt(12) / 1.5).toFixed(1),
    `${short[1]} / ${short[2]}`);
  const sp = grab(S, /that is ([\d.]+) cu ft\. Round up to (\d+) cu ft, or (\d+) bags at 1\.5 cu ft/, 'settling paragraph');
  check('S-15', 'the settling paragraph', sp[1] === trim1(buyCuFt(12)) && Number(sp[2]) === Math.ceil(buyCuFt(12)) && Number(sp[3]) === bagsCuFt(12, 1.5),
    `${sp[1]} / ${sp[2]} / ${sp[3]}`);
  const classic = E.computeSoilResults([bed(12)], E.SOIL_MIXES.find((m) => m.id === 'classic_60_30_10'));
  const per = classic.components.map((c) => Math.ceil(c.cuftWithSettling / 1.5));
  const pc = grab(S, /this bed comes to (\d+) bags of (\w+), (\d+) of (\w+) and (\d+) of ([\w ]+?) at 1\.5 cu ft: (\d+) bags, one more than the (\d+) a single bagged product needs/, 'per-component');
  check('S-16', `the Classic mix per part, as the Soil tab rounds it (${per.join(' + ')})`,
    [pc[1], pc[3], pc[5]].map(Number).join() === per.join() && [pc[2], pc[4], pc[6]].join() === classic.components.map((c) => c.label.toLowerCase()).join(),
    `page ${pc[1]} ${pc[2]}, ${pc[3]} ${pc[4]}, ${pc[5]} ${pc[6]}`);
  check('S-17', 'and the totals beside it', Number(pc[7]) === per.reduce((a, b) => a + b, 0) && Number(pc[8]) === bagsCuFt(12, 1.5)
    && Number(pc[7]) - Number(pc[8]) === 1, `${pc[7]} vs ${pc[8]}`);

  const cost = tableRows(S, /Cost per cu ft/);
  check('S-18', 'the cost table has its five rows', cost.length === 5, `${cost.length} rows`);
  cost.forEach((r, i) => {
    const m = /^\$([\d.]+)–\$([\d.]+)$/.exec(r[1] || '');
    const t = /^\$(\d+)–\$(\d+)$/.exec(r[2] || '');
    const want = m ? [Math.round(buyCuFt(12) * Number(m[1])), Math.round(buyCuFt(12) * Number(m[2]))] : null;
    check(`S-19.${i + 1}`, `cost table "${r[0]}": the price range times the volume to buy`, !!(m && t) && Number(t[1]) === want[0] && Number(t[2]) === want[1],
      `page ${r[2]}, engine ${want ? `$${want[0]}–$${want[1]}` : 'n/a'}`);
  });
  const premium = cost.find((r) => /raised bed mix/.test(r[0])) || [];
  check('S-20', 'the lede budget is the "raised bed mix" row', premium[2] === `$${lede[6]}–$${lede[7]}`, `lede $${lede[6]}–$${lede[7]}, row ${premium[2]}`);
  same('S-21', 'the bulk break-even depth on the settled basis', grab(S, /about what one 4×8 bed at (\d+) inches deep needs/, 'break-even')[1],
    Math.round((27 / E.SETTLING_BUFFER / 32) * 12));
});

// ════════════════════════════════════════ the tomato post (L-5)
group('the tomato post quotes the crop table and the calculator - L-5');
safe(() => {
  const P = 'blog/how-many-tomato-plants-family-of-4.html';
  const IDS = ['tomato', 'tomato_determinate', 'tomato_cherry', 'tomato_paste'];
  const yields = tableRows(P, /Conservative yield/);
  check('T-1', 'the yield table has one row per tomato crop', yields.length === IDS.length, `${yields.length} rows`);
  IDS.forEach((id, i) => {
    const c = CROPS[id];
    const want = [c.name, `${c.yieldPerPlantLbs[0]} lb / plant`, `${c.yieldPerPlantLbs[1]} lb`, `${c.spacingSqFt} sq ft`];
    const got = (yields[i] || []).slice(1);
    check(`T-2.${i + 1}`, `yield table row is the database row for ${c.name}`, JSON.stringify(got) === JSON.stringify(want),
      `page ${JSON.stringify(got)}, crops.js ${JSON.stringify(want)}`);
  });

  const SEL = { tomato: 'weekly', tomato_cherry: 'weekly', tomato_paste: 'weekly' };
  const GOALS = ['fresh_only', 'fresh_preserving', 'full_year'];
  const R = Object.fromEntries(GOALS.map((g) => [g, E.computeResults(SEL, 4, g)]));
  const crop = (g, id) => R[g].perCrop.find((r) => r.cropId === id);
  const n = (g, id) => crop(g, id).plantsNeeded;

  // The quick answer.
  const TLDR = { fresh_only: 'Fresh eating only', fresh_preserving: 'Fresh \\+ some preserving', full_year: 'Full-year self-sufficiency' };
  GOALS.forEach((g, i) => {
    const m = grab(P, new RegExp(`${TLDR[g]} \\([^)]*\\): (\\d+) plants (?:minimum )?\\((\\d+) slicing, (\\d+) cherry, (\\d+) paste\\)`), `tldr ${g}`);
    const want = [R[g].totalPlants, n(g, 'tomato'), n(g, 'tomato_cherry'), n(g, 'tomato_paste')];
    check(`T-3.${i + 1}`, `quick answer, ${g}: the calculator's counts`, m.slice(1, 5).map(Number).join() === want.join(), `page ${m.slice(1, 5).join('/')}, engine ${want.join('/')}`);
  });
  const quarts60 = 60;
  const pastePerQuart = E.SAUCE_QUART_LBS / CROPS.tomato_paste.yieldPerPlantLbs[0];
  same('T-4', 'a 60-quart sauce year in paste plants', grab(P, /A true 60-quart sauce year takes (\d+) paste plants/, '60 qt')[1], quarts60 * pastePerQuart);
  const lede = grab(P, /The answer runs from (\d+) plants to more than (\d+) ,/, 'lede');
  check('T-5', 'the lede runs from the smallest calculator answer to past the 60-quart year',
    Number(lede[1]) === E.computeResults({ tomato: 'weekly' }, 4, 'fresh_only').totalPlants && Number(lede[2]) === quarts60 * pastePerQuart, `${lede[1]} / ${lede[2]}`);

  // Where the numbers come from.
  const base = grab(P, /(\d+) pounds of slicing tomatoes per person per year , fresh-equivalent, before processing losses\. For a family of four, that is (\d+) pounds total/, 'base');
  check('T-6', 'the base consumption and the family-of-4 total', Number(base[1]) === CROPS.tomato.avgConsumptionLbsPerPersonYear
    && Number(base[2]) === crop('full_year', 'tomato').annualNeedLbs, `${base[1]} / ${base[2]}`);
  const add = grab(P, /the calculator adds (\d+) and (\d+) pounds per person for them/, 'cherry and paste');
  check('T-7', 'cherry and paste consumption per person', Number(add[1]) === CROPS.tomato_cherry.avgConsumptionLbsPerPersonYear
    && Number(add[2]) === CROPS.tomato_paste.avgConsumptionLbsPerPersonYear, `${add[1]} / ${add[2]}`);
  check('T-8', 'the goal and frequency words match the multipliers', E.GOAL_MULTIPLIER.fresh_only === 0.5 && E.GOAL_MULTIPLIER.fresh_preserving === 0.75
    && E.FREQUENCY_FACTOR.weekly === 1 && E.FREQUENCY_FACTOR.sometimes === 0.5
    && /fresh-only goal plans half of each amount and fresh \+ some preserving three quarters\. Weekly plans the full amount for a type, and Sometimes, the setting a newly ticked crop starts on, plans half/.test(page(P).text),
    JSON.stringify([E.GOAL_MULTIPLIER, E.FREQUENCY_FACTOR.weekly, E.FREQUENCY_FACTOR.sometimes]));
  check('T-9', 'and a newly ticked crop does start on Sometimes', /else next\[cropId\] = "sometimes";/.test(APP_SRC), 'toggleCrop default changed');

  // The three scenarios: each bullet is plants x the database's low yield.
  const bullet = (re, what) => grab(P, re, what);
  const lineCheck = (id, g, cropId, label, re) => {
    const m = bullet(re, label);
    const c = crop(g, cropId);
    const want = [c.plantsNeeded, c.crop.yieldPerPlantLbs[0], c.expectedYieldLow];
    check(id, `${label}: plants x low yield`, m.slice(1, 4).map(Number).join() === want.join(), `page ${m.slice(1, 4).join(' x ')}, engine ${want.join(' x ')}`);
    return c;
  };
  const tgt = grab(P, /Target: (\d+) lb of slicing tomatoes across .*? plus (\d+) lb of cherry tomatoes and (\d+) lb of paste tomatoes/, 'scenario 1 targets');
  check('T-10', 'scenario 1 targets are the calculator\'s fresh-only needs', [tgt[1], tgt[2], tgt[3]].map(Number).join()
    === ['tomato', 'tomato_cherry', 'tomato_paste'].map((id) => crop('fresh_only', id).annualNeedLbs).join(), `${tgt[1]}/${tgt[2]}/${tgt[3]}`);
  lineCheck('T-11.1', 'fresh_only', 'tomato', 'scenario 1 slicing', /(\d+) indeterminate slicing plants × (\d+) lb = (\d+) lb\. Pick/);
  lineCheck('T-11.2', 'fresh_only', 'tomato_cherry', 'scenario 1 cherry', /(\d+) cherry plants × (\d+) lb = (\d+) lb\. Cherry tomatoes/);
  lineCheck('T-11.3', 'fresh_only', 'tomato_paste', 'scenario 1 paste', /(\d+) paste plants × (\d+) lb = (\d+) lb, for salsa/);
  const t1 = grab(P, /Total: (\d+) plants, (\d+) square feet of bed , (\d+) lb at the conservative yield against a (\d+) lb target/, 'scenario 1 total');
  const f0 = R.fresh_only;
  check('T-12', 'scenario 1 totals', [t1[1], t1[2], t1[3], t1[4]].map(Number).join()
    === [f0.totalPlants, f0.totalSpaceRaw, f0.totalYieldConservativeLbs, f0.perCrop.reduce((s, r) => s + r.annualNeedLbs, 0)].join(), t1.slice(1, 5).join('/'));

  same('T-13', 'pounds of paste per sauce quart is the app\'s own', grab(P, /takes about (\d+) pounds of fresh paste tomatoes/, 'per quart')[1], E.SAUCE_QUART_LBS);
  const q25 = grab(P, /(\d+) quarts of sauce = (\d+) lb of paste tomatoes/, '25 quarts');
  check('T-14', '25 quarts in pounds', Number(q25[2]) === Number(q25[1]) * E.SAUCE_QUART_LBS, q25.slice(1, 3).join('/'));
  lineCheck('T-15.1', 'fresh_preserving', 'tomato', 'scenario 2 slicing', /(\d+) slicing plants × (\d+) lb = (\d+) lb fresh \(everyday/);
  lineCheck('T-15.2', 'fresh_preserving', 'tomato_cherry', 'scenario 2 cherry', /(\d+) cherry plants × (\d+) lb = (\d+) lb \(snacks, pasta/);
  const p2 = lineCheck('T-15.3', 'fresh_preserving', 'tomato_paste', 'scenario 2 paste', /(\d+) paste plants × (\d+) lb = (\d+) lb \(about \d+ quarts/);
  same('T-16', 'scenario 2 paste in sauce quarts', grab(P, /\(about (\d+) quarts of sauce in the freezer\)/, 'qt')[1], p2.expectedYieldLow / E.SAUCE_QUART_LBS);
  const t2 = grab(P, /the calculator's answer for this goal: (\d+) plants, (\d+) sq ft of bed \. A true (\d+)-quart pantry takes (\d+) paste plants on their own \((\d+) lb at (\d+) lb per plant\)/, 'scenario 2 total');
  check('T-17', 'scenario 2 totals and the 25-quart pantry', Number(t2[1]) === R.fresh_preserving.totalPlants && Number(t2[2]) === R.fresh_preserving.totalSpaceRaw
    && Number(t2[5]) === Number(t2[3]) * E.SAUCE_QUART_LBS && Number(t2[4]) === Number(t2[5]) / CROPS.tomato_paste.yieldPerPlantLbs[0]
    && Number(t2[6]) === CROPS.tomato_paste.yieldPerPlantLbs[0], t2.slice(1, 7).join('/'));
  const real = grab(P, /(\d+) plants, ~(\d+) sq ft \((\d+) slicing, (\d+) cherry, (\d+) paste, using the per-type spacing above\)/, 'real sauce supply');
  const realArea = Number(real[3]) * CROPS.tomato.spacingSqFt + Number(real[4]) * CROPS.tomato_cherry.spacingSqFt + Number(real[5]) * CROPS.tomato_paste.spacingSqFt;
  check('T-18', 'the "real sauce supply" combination adds up', Number(real[3]) === n('fresh_preserving', 'tomato') && Number(real[4]) === n('fresh_preserving', 'tomato_cherry')
    && Number(real[5]) === Number(t2[4]) && Number(real[1]) === Number(real[3]) + Number(real[4]) + Number(real[5]) && Number(real[2]) === realArea, real.slice(1, 6).join('/'));

  const q100 = grab(P, /(\d+) quarts of sauce × (\d+) lb \/ quart = (\d+) lb of paste tomatoes \. At (\d+) lb per plant conservative yield, that is (\d+) paste plants/, '100 quarts');
  check('T-19', '100 quarts in pounds and plants', Number(q100[2]) === E.SAUCE_QUART_LBS && Number(q100[3]) === Number(q100[1]) * E.SAUCE_QUART_LBS
    && Number(q100[4]) === CROPS.tomato_paste.yieldPerPlantLbs[0] && Number(q100[5]) === Number(q100[3]) / Number(q100[4]), q100.slice(1, 6).join('/'));
  const settle = grab(P, /settle for (\d+)–(\d+) quarts and (\d+)–(\d+) paste plants/, 'settle range');
  check('T-20', 'the 60-80 quart range in plants', Number(settle[3]) === Number(settle[1]) * pastePerQuart && Number(settle[4]) === Number(settle[2]) * pastePerQuart, settle.slice(1, 5).join('/'));
  lineCheck('T-21.1', 'full_year', 'tomato', 'scenario 3 slicing', /(\d+) slicing plants × (\d+) lb = (\d+) lb fresh \(heavy/);
  lineCheck('T-21.2', 'full_year', 'tomato_cherry', 'scenario 3 cherry', /(\d+) cherry plants × (\d+) lb = (\d+) lb \(snacks, dehydrated/);
  const p3 = lineCheck('T-21.3', 'full_year', 'tomato_paste', 'scenario 3 paste', /(\d+) paste plants × (\d+) lb = (\d+) lb → roughly \d+ quarts/);
  same('T-22', 'scenario 3 paste in sauce quarts', grab(P, /→ roughly (\d+) quarts of sauce/, 'qt')[1], p3.expectedYieldLow / E.SAUCE_QUART_LBS);
  const t3 = grab(P, /For a realistic full year: (\d+) plants minimum, (\d+) sq ft of bed \. .*? scale paste to (\d+) plants: (\d+) plants in all/, 'scenario 3 total');
  check('T-23', 'scenario 3 totals and the 60-quart scale-up', Number(t3[1]) === R.full_year.totalPlants && Number(t3[2]) === R.full_year.totalSpaceRaw
    && Number(t3[3]) === quarts60 * pastePerQuart && Number(t3[4]) === n('full_year', 'tomato') + n('full_year', 'tomato_cherry') + Number(t3[3]), t3.slice(1, 5).join('/'));
  const slicers = grab(P, /(\d+) indeterminate slicers will not give you sauce\. They will give you (\d+) lb/, 'slicers');
  same('T-24', '40 slicers at the database low yield', slicers[2], Number(slicers[1]) * CROPS.tomato.yieldPerPlantLbs[0]);

  // The quick-reference table: the calculator, row for row, printed as the tab prints it.
  const ref = tableRows(P, /Garden space incl\. paths/);
  const LABEL = { fresh_only: 'Fresh eating only', fresh_preserving: 'Fresh + some preserving', full_year: 'Full year self-sufficiency' };
  check('T-25', 'the quick-reference table has one row per goal', ref.length === GOALS.length, `${ref.length} rows`);
  GOALS.forEach((g, i) => {
    const r = R[g];
    const want = [LABEL[g], n(g, 'tomato'), n(g, 'tomato_cherry'), n(g, 'tomato_paste'), r.totalPlants,
      `${r.totalSpaceRaw} sq ft`, `${r.totalSpaceSqft.toFixed(E.magnitudeDecimals(r.totalSpaceSqft))} sq ft`].map(String);
    check(`T-26.${i + 1}`, `quick reference, ${g}`, JSON.stringify(ref[i]) === JSON.stringify(want), `page ${JSON.stringify(ref[i])}, engine ${JSON.stringify(want)}`);
  });
  same('T-27', 'the path share quoted beside the table', grab(P, /paths and margins at about (\d+)% of the total footprint/, 'paths')[1], pct(E.PATH_SHARE_OF_FOOTPRINT));
  const pantry = grab(P, /swaps the full-year row's (\d+) paste plants for (\d+): (\d+) plants and (\d+) sq ft of crop area/, 'pantry row');
  const fy = R.full_year;
  check('T-28', 'the 60-quart pantry line', Number(pantry[1]) === n('full_year', 'tomato_paste') && Number(pantry[2]) === quarts60 * pastePerQuart
    && Number(pantry[3]) === fy.totalPlants - Number(pantry[1]) + Number(pantry[2])
    && Number(pantry[4]) === fy.totalSpaceRaw + (Number(pantry[2]) - Number(pantry[1])) * CROPS.tomato_paste.spacingSqFt, pantry.slice(1, 5).join('/'));
});

// ════════════════════════════════════════ the companion post (L-6)
group('the companion post agrees with the in-app checker on every pair it names - L-6');
safe(() => {
  const C = 'blog/companion-planting-for-tomatoes.html';
  const html = page(C).html;
  const verdict = (id) => getCompanion(id, 'tomato')?.rel || 'neutral';
  const cards = (kind) => [...html.matchAll(new RegExp(`<div class="companion-card ${kind}">\\s*<h3>([\\s\\S]*?)<span`, 'g'))].map((m) => strip(m[1]).trim());
  const good = cards('good');
  const bad = cards('bad');
  const title = grab(C, /Companion planting for tomatoes: (\d+) good neighbours and (\d+) to avoid\. By/, 'title');
  check('C-1', 'the title counts the cards on the page', Number(title[1]) === good.length && Number(title[2]) === bad.length, `title ${title[1]}/${title[2]}, cards ${good.length}/${bad.length}`);
  // Each card mapped to the checker's crop ids. null = not a crop the checker knows, so
  // it cannot contradict the page; that fact is asserted too, against the crop table.
  const GOOD = { Basil: ['basil'], Parsley: ['parsley'], Carrots: ['carrot'], 'Marigolds (French, Tagetes patula )': null, Garlic: ['garlic'],
    Chives: ['chives'], Borage: null, Nasturtium: null, Asparagus: ['asparagus'], Lettuce: ['lettuce'], Sage: ['sage'], Calendula: null };
  const BAD = { 'Brassicas (cabbage, broccoli, cauliflower, Brussels sprouts)': ['cabbage', 'broccoli', 'cauliflower', 'brussels_sprouts'],
    Fennel: ['fennel'], 'Mature dill': ['dill'], 'Walnut trees (within ~50 feet)': null, 'Corn and potatoes': ['corn', 'potato'] };
  const known = (word) => Object.entries(CROPS).some(([id, c]) => id.includes(word) || c.name.toLowerCase().includes(word));
  for (const [list, map, rel] of [[good, GOOD, 'good'], [bad, BAD, 'bad']]) {
    for (const name of list) {
      const ids = map[name];
      if (ids === undefined) { check(`C-2 ${name}`, `the ${rel} card "${name}" is mapped in this suite`, false, 'a new card needs a row here'); continue; }
      if (ids === null) {
        const word = name.split(/[ (]/)[0].toLowerCase().replace(/s$/, '');
        check(`C-3 ${word}`, `"${name}" is not a crop the checker knows, so it cannot contradict the page`, !known(word), `${word} found in the crop table`);
        continue;
      }
      if (name === 'Sage') {
        check('C-4 sage', 'sage: the page says the checker scores it neutral, and it does',
          verdict('sage') === 'neutral' && /scores tomato and sage as neutral/.test(page(C).text), verdict('sage'));
        continue;
      }
      const v = ids.map(verdict);
      check(`C-5 ${ids.join('+')}`, `"${name}" is a ${rel} card and the checker says ${v.join(', ')}`, v.every((x) => x === rel), v.join(', '));
    }
  }
  const straw = grab(C, /"Strawberries hate tomatoes" : ([^"]*?)(?= "Roses love tomatoes")/, 'strawberry bullet')[1];
  check('C-6', 'strawberries: the checker rates the pair bad', verdict('strawberry') === 'bad', verdict('strawberry'));
  check('C-7', 'and the page says to keep them apart, never "no concern"', /rates the pair as one to avoid/.test(straw) && !/no concern/i.test(straw), straw.slice(0, 120));
  check('C-8', 'basil: "plant them together anyway" matches a good verdict', verdict('basil') === 'good' && /plant them together anyway/.test(page(C).text));
  const cta = grab(C, /(\d+) pairings across (\d+) crops/, 'CTA counts');
  check('C-9', 'the CTA counts', Number(cta[1]) === COMPANIONS.length && Number(cta[2]) === Object.keys(CROPS).length, `${cta[1]}/${cta[2]}`);
});

// ════════════════════════════════════════ the zone-7 post
group('the zone 7 post quotes the dates the Planting Dates tab pre-loads');
safe(() => {
  const Z = 'blog/usda-zone-7-vegetable-planting-calendar.html';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const z7 = E.ZONE_FROST_DATES[7];
  const ls = `${MONTHS[z7.lastSpring.m - 1]} ${z7.lastSpring.d}`;
  const ff = `${MONTHS[z7.firstFall.m - 1]} ${z7.firstFall.d}`;
  const pre = grab(Z, /the Planting Dates calculator pre-loads for Zone 7: (\w+ \d+) last frost, (\w+ \d+) first frost/, 'pre-loads');
  check('Z-1', `the pre-loaded zone 7 frost dates (${ls}, ${ff})`, pre[1] === ls && pre[2] === ff, `${pre[1]} / ${pre[2]}`);
  const tl = grab(Z, /last spring frost around (\w+ \d+) and first fall frost around (\w+ \d+) /, 'quick reference');
  check('Z-2', 'the quick reference quotes the same dates', tl[1] === ls && tl[2] === ff, `${tl[1]} / ${tl[2]}`);
  const days = Math.round((Date.UTC(2026, z7.firstFall.m - 1, z7.firstFall.d) - Date.UTC(2026, z7.lastSpring.m - 1, z7.lastSpring.d)) / 86400000);
  same('Z-3', `"roughly N weeks" is the whole weeks between them (${days} days)`, grab(Z, /giving roughly (\d+) weeks of frost-free growing/, 'weeks')[1], Math.floor(days / 7));
  const zz = grab(Z, /handles USDA zones (\d+) through (\d+) with frost dates pre-loaded/, 'zones');
  check('Z-4', 'the zone range', Number(zz[1]) === Math.min(...zones) && Number(zz[2]) === Math.max(...zones), `${zz[1]}-${zz[2]}`);
});

// ════════════════════════════════════════ legal pages and copy (M-2, L-10)
group('the legal pages state what the two API handlers do - M-2');
safe(() => {
  const PV = 'privacy.html';
  const t = page(PV).text;
  const minutes = (s) => s / 60;
  const hours = (s) => s / 3600;
  const days = (s) => s / 86400;
  check('M2-1', 'the validator\'s IP counter period', new RegExp(`Your IP address is kept in a request counter for ${minutes(VK.k.RL_IP_WINDOW_SEC)} minutes`).test(t), `RL_IP_WINDOW_SEC ${VK.k.RL_IP_WINDOW_SEC}`);
  check('M2-2', 'the validator\'s failed-check counter period', new RegExp(`in a failed-check counter for ${hours(VK.k.RL_LICENCE_WINDOW_SEC)} hour`).test(t), `RL_LICENCE_WINDOW_SEC ${VK.k.RL_LICENCE_WINDOW_SEC}`);
  check('M2-3', 'the validator\'s "confirmed" marker period', new RegExp(`for ${days(VK.k.LICENCE_OK_TTL_SEC)} days from the last confirmation`).test(t), `LICENCE_OK_TTL_SEC ${VK.k.LICENCE_OK_TTL_SEC}`);
  check('M2-4', 'the generator\'s device binding period', new RegExp(`your device identifier, as it is, as the one device this licence generates plans from, for ${days(GEN.k.INSTANCE_BIND_TTL_SEC)} days`).test(t), `INSTANCE_BIND_TTL_SEC ${GEN.k.INSTANCE_BIND_TTL_SEC}`);
  check('M2-5', 'the generator\'s "valid" marker and plan counter', new RegExp(`"licence valid" marker for ${hours(GEN.k.LICENCE_CACHE_TTL_SEC)} hour and in a plan counter for ${hours(GEN.k.RL_LICENCE_WINDOW_SEC)} hours`).test(t),
    `LICENCE_CACHE_TTL_SEC ${GEN.k.LICENCE_CACHE_TTL_SEC}, RL_LICENCE_WINDOW_SEC ${GEN.k.RL_LICENCE_WINDOW_SEC}`);
  check('M2-6', 'the generator\'s IP counter period', new RegExp(`your IP address in a request counter for ${hours(GEN.k.RL_IP_WINDOW_SEC)} hour\\.`).test(t), `RL_IP_WINDOW_SEC ${GEN.k.RL_IP_WINDOW_SEC}`);
  check('M2-7', 'the daily allowance', new RegExp(`the allowance of ${GEN.k.RL_LICENCE_MAX} plans a day`).test(t) && GEN.k.RL_LICENCE_WINDOW_SEC === 86400, `RL_LICENCE_MAX ${GEN.k.RL_LICENCE_MAX}`);
  // The two diagnostic peeks at a reply the handler could not read (not hashKey's slice).
  const peeks = [...GEN.src.matchAll(/(?:\.then\(\(t\) => t|JSON\.stringify\(data\))\.slice\(0, (\d+)\)/g)].map((m) => Number(m[1]));
  check('M2-8', 'the server-log peek length', peeks.length === 2 && peeks.every((p) => p === peeks[0]) && new RegExp(`the first ${peeks[0]} characters of that reply`).test(t), peeks.join(','));
  check('M2-9', 'the key is hashed the way the page says (shortened SHA-256)', /createHash\("sha256"\)[\s\S]{0,80}\.slice\(0, 16\)/.test(VK.src) && /createHash\("sha256"\)[\s\S]{0,80}\.slice\(0, 16\)/.test(GEN.src)
    && /shortened SHA-256 hash/.test(t));
  check('M2-10', 'the device identifier is called what it is: sent as it is, not hashed', /sent as they are \(not hashed\)/.test(t) && !/hashed identifier for your device/.test(t));
  check('M2-11', 'Upstash is named, with its policy', /Upstash - the database that holds the short-lived records/.test(t) && /upstash\.com\/trust\/privacy\.pdf/.test(page(PV).html));
  check('M2-12', 'the checkout script on every visit is disclosed', /loads LemonSqueezy's checkout script from assets\.lemonsqueezy\.com on every visit/.test(t));
  check('M2-13', 'the plan body is not called stored', /The generated plan itself is not stored anywhere/.test(t) && !/saved plans/.test(t));
  // The newest behaviour the page describes is the 30-day "confirmed" marker (2026-09-07).
  const up = /Last updated (\d{1,2}) (\w+) (\d{4})\./.exec(t);
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const upDate = up ? Date.UTC(Number(up[3]), MONTH.indexOf(up[2]), Number(up[1])) : NaN;
  check('M2-14', '"Last updated" is no older than the newest behaviour it describes (2026-09-07)', upDate >= Date.UTC(2026, 8, 7), up ? up[0] : 'no date');
  check('M2-15', 'and the page carries the attorney marker', /the attorney confirms the wording/.test(page(PV).html));
  const TM = 'terms.html';
  check('M2-16', 'terms: plans are not said to be stored in the browser', !/Your plans are stored in your browser/.test(page(TM).text) && /A generated plan is not stored anywhere/.test(page(TM).text));
  check('M2-17', 'terms: the licence key and device id are said to travel with the request', /also carries your licence key and device identifier, which our server checks with LemonSqueezy and does not pass to Anthropic/.test(page(TM).text));
});

group('copy residue stays gone - L-10');
safe(() => {
  const ALL = ['homestead-planning-software/index.html', 'blog/index.html', 'blog/how-many-tomato-plants-family-of-4.html',
    'blog/usda-zone-7-vegetable-planting-calendar.html', 'blog/how-much-soil-for-4x8-raised-bed.html', 'blog/companion-planting-for-tomatoes.html',
    'blog/feed-family-from-backyard-garden.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund.html', 'llms.txt'];
  const indexHtml = readFileSync(INDEX_PATH, 'utf8');
  const oldName = ALL.filter((p) => /Harvest Planner|Harvest%20Planner/i.test(page(p).html));
  check('L10-1', 'no page uses the old product name, in text or in a mail subject', oldName.length === 0 && !/Harvest Planner/i.test(indexHtml), oldName.join(', '));
  const doubled = ALL.filter((p) => /\bthe the homestead plan\b/i.test(page(p).html));
  check('L10-2', 'no page doubles the article', doubled.length === 0 && !/\bthe the homestead plan\b/i.test(indexHtml), doubled.join(', '));
  const terms = page('terms.html').text;
  const q = /limited to (\d+) plan generations per 24-hour window\. The window starts with the first plan generated in it/.exec(terms);
  check('L10-3', 'the Terms quota is the limiter\'s: a fixed window from the first plan', !!q && Number(q[1]) === GEN.k.RL_LICENCE_MAX
    && GEN.k.RL_LICENCE_WINDOW_SEC === 86400 && !/rolling/i.test(terms) && /if \(count === 1\) await redis\.expire\(key, windowSec\);/.test(GEN.src), q ? q[1] : 'quota sentence not found');
  const refundSummary = /Quick summary\. (Full refunds within 48 hours of purchase for technical failure or accidental duplicate purchases\.)/.exec(page('refund.html').text);
  const faq = E.FAQ_ITEMS.find((f) => /refund/i.test(f.q));
  const ld = /"name": "What's the refund policy\?",\s*"acceptedAnswer": \{\s*"@type": "Answer",\s*"text": "([^"]+)"/.exec(indexHtml);
  check('L10-4', 'the in-app FAQ opens with the refund page\'s own sentence', !!refundSummary && !!faq && faq.a.startsWith(refundSummary[1]), faq ? faq.a.slice(0, 90) : 'no refund FAQ');
  check('L10-5', 'and never says "no questions asked"', !!faq && !/no questions asked/i.test(faq.a));
  check('L10-6', 'index.html\'s FAQPage JSON-LD carries the same answer', !!ld && !!faq && ld[1] === faq.a, ld ? ld[1].slice(0, 90) : 'JSON-LD refund answer not found');
});

group('every static page keeps the 44 px tap-target rule - L-2');
safe(() => {
  const PAGES = ['homestead-planning-software/index.html', 'blog/index.html', 'blog/how-many-tomato-plants-family-of-4.html',
    'blog/usda-zone-7-vegetable-planting-calendar.html', 'blog/how-much-soil-for-4x8-raised-bed.html', 'blog/companion-planting-for-tomatoes.html',
    'blog/feed-family-from-backyard-garden.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund.html'];
  const RULE = /\.brand, \.back, footer a, \.crumbs a, \.related a, \.cta-box a, \.more a \{\s*display: inline-flex; align-items: center; min-height: 44px;\s*\}\s*\.brand, \.back, footer a \{ justify-content: center; min-width: 44px; \}/;
  const without = PAGES.filter((p) => !RULE.test(page(p).html));
  check('L2-1', `all ${PAGES.length} pages declare the rule the 375 px measurement verified`, without.length === 0, without.join(', '));
  check('L2-2', 'the landing page\'s "Read more" row is marked as a link row', /<p class="more"[^>]*>Read more:/.test(page('homestead-planning-software/index.html').html));
});

// ------------------------------------------------------------------- report
const width = Math.max(...rows.map((r) => r.label.length)) + 2;
console.log('\nStatic pages against the engine  (Aero sibling sweep 2026-10-29)\n');
for (const r of rows) {
  if (!r.verdict) { console.log(`\n${r.label}`); continue; }
  console.log(`${r.id.padEnd(16)} ${r.label.padEnd(width)} ${r.verdict}`);
}
const total = rows.filter((r) => r.verdict).length;
console.log(`\nstatic-pages-figures: ${total - failures.length}/${total} checks OK.`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('static-pages-figures: complete, all checks passed');
