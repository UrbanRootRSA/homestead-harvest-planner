// tests/load-quarantine.test.mjs
//
// Fleet-sweep MEDIUM 2026-08-17
// (../../docs/fleet-sweep-loadstate-errorboundary-2026-08-17.md, Homestead section):
//
//   loadState(key, fallback) swallows every throw and returns `fallback` with no
//   copy of the raw bytes. On its own that is only a lost read. The amplifier is
//   the persist block in App(): one unconditional effect per persisted key, all
//   of which run after the FIRST render, so every page load rewrites every key
//   from state. One unparseable key therefore has its default written over the
//   user's bytes before they touch anything.
//
// This harness drives the REAL functions out of the shipped source. It never
// hand-copies them: a hand copy goes stale the first time the file moves, and a
// stale copy proves nothing about what ships. Declarations are brace-extracted
// from src/App.jsx at run time and evaluated against a Map-backed localStorage
// stub plus a small hook runtime that mounts and re-renders like React does.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   exit 1 against the unfixed source (the corrupt cases end LOST) = the reproduction.
//   exit 0 once the quarantine seam and the mount skip are both in place.
//
// Extractor and case shape ported from the sibling calculator's port of the same
// fix: Tower-Garden/tower-garden-calc/tests/load-quarantine.test.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = join(HERE, '..', 'src', 'App.jsx');

// ---------------------------------------------------------------- extractor

// Declarations the harness needs in BOTH the broken and the fixed source.
const REQUIRED = [
  'BED_ID_SESSION',
  'bedIdCounter',
  'DEFAULT_BED',
  'persistState',
  'loadState',
];

// Declarations the fix adds. Absent before it, pulled in after it, so the one
// harness runs against both revisions.
const OPTIONAL = [
  'LS_CORRUPT_PREFIX',
  'findQuarantinedCopy',
  'quarantineRaw',
  'usePersistOnChange',
];

// Slice one top-level declaration out of the source by name. Tracks string,
// template, line-comment and block-comment state so a brace or semicolon inside
// a comment or a string cannot end the slice early. Regex literals are walked as
// plain characters, which is safe for every declaration listed above (the only
// one present is /[:.]/g, which carries no quote or brace).
function sliceDecl(src, name) {
  const re = new RegExp(`^(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const isFn = src.startsWith('function', start);
  let i = start;
  let depth = 0;
  let mode = 'code';
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
    // inside a string or template literal
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; i += 1; continue; }
    i += 1;
  }
  throw new Error(`unterminated declaration while extracting: ${name}`);
}

// Windows checkouts hold CRLF. Normalise before any offset arithmetic so the
// extractor, the block slice and the reported positions agree with the file.
const SRC = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// Every localStorage key constant, read straight from the source so the harness
// cannot drift from it.
const LS_VALUES = {};
for (const m of SRC.matchAll(/^const (LS_[A-Z0-9_]+) = "([^"]+)";/gm)) LS_VALUES[m[1]] = m[2];

// The persist block, sliced by the comments that bracket it. Both markers are
// untouched by the fix, so the slice survives it.
const BLOCK_START = '// Persist settings';
const BLOCK_END = '// If a long-lived browser session crosses Jan 1';
const blockFrom = SRC.indexOf(BLOCK_START);
const blockTo = SRC.indexOf(BLOCK_END);
if (blockFrom === -1 || blockTo === -1 || blockTo < blockFrom) {
  console.error('could not locate the persist block in src/App.jsx; the harness is out of step with the source');
  process.exit(1);
}
const BLOCK = SRC.slice(blockFrom, blockTo);

// Which keys the block actually persists, in source order. Picks up a 16th key
// automatically if someone adds one.
const PERSISTED = [];
for (const m of BLOCK.matchAll(/(?:persistState|usePersistOnChange)\(\s*(LS_[A-Z0-9_]+)/g)) {
  if (!PERSISTED.includes(m[1])) PERSISTED.push(m[1]);
}
if (PERSISTED.length === 0) {
  console.error('the persist block names no LS_ keys; the harness is out of step with the source');
  process.exit(1);
}

function buildModule() {
  const picked = [];
  for (const name of REQUIRED) {
    const text = sliceDecl(SRC, name);
    if (!text) throw new Error(`required declaration not found in source: ${name}`);
    picked.push({ name, text, at: SRC.indexOf(text) });
  }
  const present = [];
  for (const name of OPTIONAL) {
    const text = sliceDecl(SRC, name);
    if (text) { picked.push({ name, text, at: SRC.indexOf(text) }); present.push(name); }
  }
  // Emit in source order so a const that feeds another const keeps its order.
  picked.sort((a, b) => a.at - b.at);

  const loadText = picked.find((p) => p.name === 'loadState').text;
  if (!loadText.includes('localStorage.getItem')) {
    throw new Error('extracted loadState does not read localStorage; the extractor is out of step with the source');
  }

  // Hand back everything extracted, so probing a declaration the unfixed source
  // does not have is a miss rather than a ReferenceError.
  const body = `${picked.map((p) => p.text).join('\n\n')}\n\nreturn { ${picked.map((p) => p.name).join(', ')} };\n`;
  const make = new Function('localStorage', 'console', 'useRef', 'useEffect', body);
  return { make, fixPresent: present };
}

// ------------------------------------------------------------ storage stub

function makeStorage(seed, opts) {
  const map = new Map(Object.entries(seed || {}));
  const full = opts && opts.full;
  return {
    // length + key(i) mirror the real Storage interface, which is how the
    // loader looks for a copy it has already taken.
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    // full:true models a browser that refuses every write (quota exhausted,
    // Safari private mode). The rescue copy fails, so nothing may be lost.
    setItem: (k, v) => {
      if (full) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
  };
}

// ------------------------------------------------------------ hook runtime

// Enough of React to mount a component body and re-render it: stable hook cells
// by call order, dep comparison, effects flushed after the commit. `strict`
// models StrictMode, which double-invokes the render body and then unmounts and
// re-mounts every effect. main.jsx wraps <App/> in StrictMode, so a first-write
// guard that a second effect run can spend is a guard that does not hold.
function makeHookRuntime() {
  const cells = [];
  let idx = 0;
  let registered = [];
  let changed = [];
  let mounted = false;

  const useRef = (initial) => {
    const i = idx++;
    if (!cells[i]) cells[i] = { ref: { current: initial } };
    return cells[i].ref;
  };
  const useEffect = (fn, deps) => {
    const i = idx++;
    const prev = cells[i];
    const depsChanged = !prev || !prev.seen || !deps || !prev.deps
      || deps.length !== prev.deps.length
      || deps.some((d, j) => !Object.is(d, prev.deps[j]));
    cells[i] = { seen: true, deps };
    registered.push(fn);
    if (depsChanged) changed.push(fn);
  };

  function render(body, opts) {
    const strict = Boolean(opts && opts.strict);
    idx = 0; registered = []; changed = [];
    body();
    if (strict) { idx = 0; registered = []; changed = []; body(); }
    const all = registered.slice();
    const dirty = changed.slice();
    const isMount = !mounted;
    mounted = true;
    for (const fn of (isMount ? all : dirty)) fn();
    // StrictMode's dev-only remount: every effect runs a second time.
    if (strict && isMount) for (const fn of all) fn();
  }

  return { useRef, useEffect, render };
}

// ----------------------------------------------------------------- fixtures

const { make, fixPresent } = buildModule();
const quietConsole = { warn: () => {}, error: () => {}, log: () => {} };
const CORRUPT_PREFIX = 'hhp.corrupt.';
const failures = [];

// One browser tab: a storage stub, a hook runtime, and the real declarations
// evaluated against both. usePersistOnChange closes over useRef/useEffect, so
// the runtime has to be handed in when the module is built, not afterwards.
function tab(store) {
  const rt = makeHookRuntime();
  const api = make(store, quietConsole, rt.useRef, rt.useEffect);
  return { api, rt };
}

// Stand-in state for the keys whose initializers live inside App() and cannot be
// brace-extracted. The sanitizers those initializers run were verified clean by
// the sweep and are not what this harness tests: what it tests is whether the
// DEFAULT is allowed to reach storage. `hhp_beds` uses the real DEFAULT_BED so
// the headline case writes exactly the bytes the app would write.
function defaultFor(api, lsName) {
  if (lsName === 'LS_BEDS') return [api.DEFAULT_BED()];
  return { __default: lsName };
}

// One page load: every slice reads through the real loadState (the lazy state
// initializers), then the first render commits and the persist block runs.
function boot(api, rt, opts) {
  const state = {};
  for (const lsName of PERSISTED) {
    const loaded = api.loadState(LS_VALUES[lsName], null);
    state[lsName] = loaded == null ? defaultFor(api, lsName) : loaded;
  }
  rt.render(() => {
    for (const lsName of PERSISTED) persist(api, rt, LS_VALUES[lsName], state[lsName]);
  }, opts);
  return state;
}

// The persist mechanism as shipped. After the fix that is the real hook; before
// it, the exact one-line effect the source carries at the persist block.
function persist(api, rt, key, value) {
  if (api.usePersistOnChange) { api.usePersistOnChange(key, value); return; }
  rt.useEffect(() => { api.persistState(key, value); }, [value]);
}

function scan(store, raw) {
  return store.keys().filter((k) => store.getItem(k) === raw);
}

const rows = [];
function row(label, live, quarantined, verdict) {
  rows.push({ label, live, quarantined, verdict });
}

// ------------------------------------------------- 1. the reported repro
// "DevTools, set hhp_beds to { (unparseable), reload, and confirm the key now
// holds one default bed and the user's bed groups are gone with no warning."

{
  const RAW = '{';
  const store = makeStorage({ [LS_VALUES.LS_BEDS]: RAW });
  const { api, rt } = tab(store);
  const state = boot(api, rt);

  const live = store.getItem(LS_VALUES.LS_BEDS);
  const copies = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));
  const bytesSurvive = scan(store, RAW).length > 0;
  const stateIsDefault = Array.isArray(state.LS_BEDS) && state.LS_BEDS.length === 1;

  row('hhp_beds = "{" (the reported repro)',
    live === RAW ? 'untouched' : 'REWRITTEN',
    copies.length ? copies[0] : '(none)',
    bytesSurvive ? 'recoverable' : 'LOST');

  if (!stateIsDefault) failures.push('repro: the slice did not fall back to its default, so the case is not set up as reported');
  if (!bytesSurvive) failures.push("repro: the user's original bytes are readable NOWHERE after one page load");
  if (live !== RAW) failures.push(`repro: ${LS_VALUES.LS_BEDS} was rewritten by the first-render persist pass (now ${JSON.stringify(String(live).slice(0, 60))})`);
  if (copies.length === 0) failures.push(`repro: no ${CORRUPT_PREFIX}${LS_VALUES.LS_BEDS}.* copy was written`);
  if (copies.length > 0 && !copies[0].startsWith(`${CORRUPT_PREFIX}${LS_VALUES.LS_BEDS}.`)) {
    failures.push(`repro: quarantine key ${copies[0]} does not name the key it came from, so support cannot ask for it`);
  }
}

// ------------------------------------------- 2. every persisted key at once
// The skip has to cover ALL of them, not the first one. Distinct bytes per key
// so the de-dupe cannot collapse them into one copy.

{
  const seeds = {};
  const raws = {};
  for (const lsName of PERSISTED) {
    raws[lsName] = `{"${LS_VALUES[lsName]}":`;
    seeds[LS_VALUES[lsName]] = raws[lsName];
  }
  const store = makeStorage(seeds);
  const { api, rt } = tab(store);
  boot(api, rt);

  let lost = 0;
  let rewritten = 0;
  for (const lsName of PERSISTED) {
    if (scan(store, raws[lsName]).length === 0) lost += 1;
    if (store.getItem(LS_VALUES[lsName]) !== raws[lsName]) rewritten += 1;
  }
  const copies = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));
  row(`all ${PERSISTED.length} persisted keys unparseable`,
    rewritten ? `${rewritten} REWRITTEN` : 'all untouched',
    `${copies.length} copies`,
    lost ? `${lost} LOST` : 'all recoverable');

  if (lost) failures.push(`all-keys: ${lost} of ${PERSISTED.length} keys had their bytes destroyed by one page load`);
  if (rewritten) failures.push(`all-keys: ${rewritten} of ${PERSISTED.length} live keys were rewritten by the first-render persist pass`);
  if (copies.length !== PERSISTED.length) {
    failures.push(`all-keys: ${copies.length} quarantine copies for ${PERSISTED.length} corrupt keys`);
  }
}

// ------------------------------------------------------ 3. control: clean load
// Valid stored data must load unchanged, must not be quarantined, and a real
// edit after mount must still persist. Without this the fix could read as
// "stopped writing at all".

{
  const stored = [{ ...{}, id: 'bed_x', shape: 'rect', lengthFt: 12, widthFt: 4, depthIn: 12, diameterFt: 4, outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3, qty: 2 }];
  const RAW = JSON.stringify(stored);
  const store = makeStorage({ [LS_VALUES.LS_BEDS]: RAW });
  const { api, rt } = tab(store);
  const state = boot(api, rt);

  const afterMount = store.getItem(LS_VALUES.LS_BEDS);
  const copies = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));

  // the user drags a bed from 12 ft to 16 ft
  const edited = [{ ...state.LS_BEDS[0], lengthFt: 16 }];
  const next = { ...state, LS_BEDS: edited };
  rt.render(() => {
    for (const lsName of PERSISTED) persist(api, rt, LS_VALUES[lsName], next[lsName]);
  });
  const afterEdit = store.getItem(LS_VALUES.LS_BEDS);

  row('control: valid data + a post-mount edit',
    afterMount === RAW ? 'untouched on mount' : 'rewritten on mount',
    copies.length ? copies[0] : '(none)',
    afterEdit === JSON.stringify(edited) ? 'edit persisted' : 'EDIT LOST');

  if (state.LS_BEDS.length !== 1 || state.LS_BEDS[0].lengthFt !== 12) {
    failures.push('control: valid stored data did not load');
  }
  if (copies.length) failures.push(`control: a quarantine copy was written for readable data (${copies[0]})`);
  if (afterEdit !== JSON.stringify(edited)) {
    failures.push('control: a real edit after mount did NOT persist; the mount skip is swallowing user writes');
  }
}

// --------------------------------------- 4. control: clean load under StrictMode
// main.jsx renders <App/> inside StrictMode, so the mount effects run twice in
// development. A guard a second run can spend is a guard that does not hold.

{
  const RAW = '{';
  const store = makeStorage({ [LS_VALUES.LS_BEDS]: RAW });
  const { api, rt } = tab(store);
  const state = boot(api, rt, { strict: true });

  const live = store.getItem(LS_VALUES.LS_BEDS);
  const bytesSurvive = scan(store, RAW).length > 0;

  // and a real edit still lands
  const next = { ...state, LS_BEDS: [{ ...api.DEFAULT_BED(), lengthFt: 20 }] };
  rt.render(() => {
    for (const lsName of PERSISTED) persist(api, rt, LS_VALUES[lsName], next[lsName]);
  });
  const afterEdit = store.getItem(LS_VALUES.LS_BEDS);

  row('StrictMode double mount, corrupt key',
    live === RAW ? 'untouched' : 'REWRITTEN',
    scan(store, RAW).filter((k) => k.startsWith(CORRUPT_PREFIX))[0] || '(none)',
    bytesSurvive ? 'recoverable' : 'LOST');

  if (!bytesSurvive) failures.push('strict: the bytes were destroyed by the StrictMode double mount');
  if (live !== RAW) failures.push('strict: the second effect run spent the mount skip and rewrote the live key');
  if (afterEdit !== JSON.stringify(next.LS_BEDS)) {
    failures.push('strict: a real edit after the double mount did NOT persist');
  }
}

// ------------------------------------------------- 5. nothing stored at all
// A fresh install must not quarantine anything and must not be held back from
// its first genuine write.

{
  const store = makeStorage({});
  const { api, rt } = tab(store);
  const state = boot(api, rt);
  const copies = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));
  const afterMount = store.getItem(LS_VALUES.LS_BEDS);

  const next = { ...state, LS_BEDS: [{ ...api.DEFAULT_BED(), lengthFt: 9 }] };
  rt.render(() => {
    for (const lsName of PERSISTED) persist(api, rt, LS_VALUES[lsName], next[lsName]);
  });
  const afterEdit = store.getItem(LS_VALUES.LS_BEDS);

  row('fresh install: nothing stored',
    afterMount === null ? 'still absent on mount' : 'defaults written on mount',
    copies.length ? copies[0] : '(none)',
    afterEdit === JSON.stringify(next.LS_BEDS) ? 'edit persisted' : 'EDIT LOST');

  if (copies.length) failures.push(`fresh install: quarantined something on an empty store (${copies[0]})`);
  if (afterEdit !== JSON.stringify(next.LS_BEDS)) failures.push('fresh install: the first real edit did NOT persist');
}

// ---------------------------------------------- 6. storage refuses every write
// If the rescue copy cannot be written, the original must be left exactly where
// it is. Shift-Fit src/storage.js:424-425.

{
  const RAW = '{';
  const store = makeStorage({ [LS_VALUES.LS_BEDS]: RAW }, { full: true });
  const { api, rt } = tab(store);
  let threw = null;
  try { boot(api, rt); } catch (e) { threw = e; }

  const live = store.getItem(LS_VALUES.LS_BEDS);
  row('storage full: rescue copy cannot be written',
    live === RAW ? 'untouched' : 'REWRITTEN',
    '(none possible)',
    live === RAW ? 'recoverable' : 'LOST');

  if (threw) failures.push(`storage full: the load threw ${threw.message} instead of degrading`);
  if (live !== RAW) failures.push('storage full: the original was disturbed even though no copy could be written');
}

// --------------------------------------------------------- 7. repeated reloads
// The live key keeps its unreadable bytes, so the loader runs again on every
// reload. It must not stack one copy per reload: that walks the origin into its
// quota, and persistState swallows quota errors, so the user would see their
// real edits quietly stop saving with no error at all.

{
  const RAW = '{"beds":[{"shape":"rect"';
  const store = makeStorage({ [LS_VALUES.LS_BEDS]: RAW });
  for (let i = 0; i < 5; i += 1) {
    const { api, rt } = tab(store);
    boot(api, rt);
  }
  const copies = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));
  row('five reloads of the same unreadable key',
    store.getItem(LS_VALUES.LS_BEDS) === RAW ? 'untouched' : 'REWRITTEN',
    `${copies.length} copies`,
    scan(store, RAW).length ? 'recoverable' : 'LOST');

  if (fixPresent.length && copies.length !== 1) {
    failures.push(`repeated reloads: ${copies.length} quarantine copies written, expected 1`);
  }
}

// ------------------------------------------------------- 8. source-shape guard
// Runtime proof covers the mechanism the harness drives. This covers the block
// itself: after the fix no persisted key may go through a bare effect, or the
// next key someone adds inherits the bug.

if (fixPresent.includes('usePersistOnChange')) {
  const bare = (BLOCK.match(/useEffect\(/g) || []).length;
  const direct = (BLOCK.match(/persistState\(/g) || []).length;
  if (bare) failures.push(`persist block: ${bare} bare useEffect( call(s) remain; every persisted key must go through usePersistOnChange`);
  if (direct) failures.push(`persist block: ${direct} direct persistState( call(s) remain outside the guarded hook`);
}

// --------------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => r.label.length));
console.log(`\nloadState quarantine + mount-skip probe  (fix decls present: ${fixPresent.length ? fixPresent.join(', ') : 'NONE - unfixed source'})`);
console.log(`persisted keys found in the block: ${PERSISTED.length}\n`);
console.log(`${'case'.padEnd(w)}  ${'live key AFTER load'.padEnd(22)}  ${'quarantine'.padEnd(46)}  bytes`);
console.log('-'.repeat(w + 78));
for (const r of rows) {
  console.log(`${r.label.padEnd(w)}  ${r.live.padEnd(22)}  ${String(r.quarantined).padEnd(46)}  ${r.verdict}`);
}
console.log('');

if (failures.length) {
  console.error(`FAILED ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`load-quarantine: ${rows.length}/${rows.length} cases OK, no stored bytes were destroyed.`);
process.exit(0);
