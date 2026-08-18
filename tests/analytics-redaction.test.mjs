// tests/analytics-redaction.test.mjs
//
// Fleet-sweep audit 2026-08-18 (../docs/audit-sweep-families-2026-08-18.md),
// finding M-1: the licence key in `?key=` reaches the Vercel Web Analytics
// pageview beacon.
//
// Three measured facts made it reachable: no `beforeSend` was registered, the
// tracker keeps the query string verbatim unless a `route` prop is supplied
// (none is), and the strip in src/App.jsx lands after a network round-trip -
// 1.25 s of exposure, measured on the live site.
//
// This suite drives the REAL redaction out of src/main.jsx: the function is
// brace-extracted from the shipped source at run time, never hand-copied, and
// the wiring is asserted separately, because a correct function that is not
// passed to <Analytics> changes nothing at all.
//
// Run: npm test          Judge by the EXIT CODE, not by the printed rows.
//   Against the pre-fix source every case fails, including the wiring check.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = process.env.HHP_MAIN_SRC || join(HERE, '..', 'src', 'main.jsx');
// Windows checkouts hold CRLF. Normalise before any offset arithmetic.
const SRC = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

const FN_NAME = 'redactLicenceKey';

// ---------------------------------------------------------------- extractor
// Same walker as tests/paywall-mount-chain.test.mjs: tracks string, template,
// line-comment and block-comment state so a brace inside either cannot end the
// slice early.
function sliceDecl(src, name) {
  const re = new RegExp(`^(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const isFn = src.startsWith('function', start) || src.startsWith('async function', start);
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
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; i += 1; continue; }
    i += 1;
  }
  throw new Error(`unterminated declaration while extracting: ${name}`);
}

const failures = [];
const rows = [];
function check(id, label, cond, detail) {
  rows.push({ id, label, verdict: cond ? 'ok' : 'FAIL' });
  if (!cond) failures.push(`${id}: ${label}${detail ? ` - ${detail}` : ''}`);
}
function group(label) { rows.push({ id: '', label: `-- ${label}`, verdict: '' }); }

// A failed extraction must become a failing CHECK, never a thrown exception -
// an exception hides every case below it and turns a red control into one line
// that proves nothing.
const TEXT = sliceDecl(SRC, FN_NAME);
let redact = () => '__NOT_EXTRACTED__';
if (TEXT) {
  redact = new Function(`${TEXT}\nreturn ${FN_NAME};`)();
}

const KEY = 'AAAAAAAA-1111-2222-3333-MYOWNLICENCE';
const SITE = 'https://thehomesteadplan.com';

group(`the redaction itself (${FN_NAME} in ${SRC_PATH})`);

check('M-1.0', `${FN_NAME} exists in the analytics mount file`, Boolean(TEXT),
  TEXT ? '' : 'no such declaration - every case below is measuring nothing');

{
  // The headline case: the URL a customer lands on straight from the purchase
  // email. The key must not reach the beacon.
  const ev = { type: 'pageview', url: `${SITE}/?key=${KEY}` };
  const out = redact(ev);
  const url = String(out?.url || '');
  check('M-1.1', 'the licence key is gone from the tracked URL',
    out !== null && typeof out === 'object' && !url.includes(KEY) && !/[?&]key=/.test(url), JSON.stringify(out));
  check('M-1.2', 'and the rest of the URL survives',
    url === `${SITE}/`, JSON.stringify(url));
  check('M-1.3', 'and the event is still sent, not dropped', out !== null && out !== undefined, JSON.stringify(out));
  check('M-1.4', 'and the original event object is not mutated',
    ev.url === `${SITE}/?key=${KEY}`, JSON.stringify(ev.url));
}

{
  // Over-stripping is its own defect: Growroom's audit flagged exactly that.
  // Campaign parameters and the hash are legitimate analytics data.
  const out = redact({ type: 'pageview', url: `${SITE}/?utm_source=email&key=${KEY}&utm_medium=receipt#growing-plan` });
  const url = String(out?.url || '');
  check('M-1.5', 'utm parameters are kept',
    url.includes('utm_source=email') && url.includes('utm_medium=receipt'), JSON.stringify(url));
  check('M-1.6', 'the hash is kept', url.endsWith('#growing-plan'), JSON.stringify(url));
  check('M-1.7', 'and the key is still gone', !url.includes(KEY), JSON.stringify(url));
}

{
  // The overwhelmingly common event: no key at all. This path must be a no-op,
  // or one bad edit in here takes the whole product's analytics down.
  const ev = { type: 'pageview', url: `${SITE}/?utm_source=reddit#soil` };
  const out = redact(ev);
  check('M-1.8', 'an event with no key passes through untouched', out === ev, JSON.stringify(out));
}

{
  // A parameter that merely CONTAINS "key" is not the licence key.
  const ev = { type: 'pageview', url: `${SITE}/?monkey=1&keyboard=2` };
  const out = redact(ev);
  check('M-1.9', 'a parameter that only contains "key" is left alone',
    String(out?.url || '').includes('monkey=1') && String(out?.url || '').includes('keyboard=2'), JSON.stringify(out?.url));
}

{
  // A future SDK version could hand over a path-only URL. Parsing must not
  // throw on it (that would drop every pageview), and the shape must come back
  // the way it went in.
  const out = redact({ type: 'pageview', url: `/?key=${KEY}&utm_source=email` });
  const url = String(out?.url || '');
  check('M-1.10', 'a path-only URL is redacted, not dropped',
    out !== null && !url.includes(KEY) && url.includes('utm_source=email'), JSON.stringify(out));
  check('M-1.11', 'and stays path-only', url.startsWith('/') , JSON.stringify(url));
}

{
  // The property that matters on any malformed URL is not WHICH way it fails -
  // it is that the key never leaves the page. A garbled value that still parses
  // against the base gets stripped and sent; one that cannot be parsed at all
  // is dropped. Assert the property, then pin each mechanism.
  const garbled = redact({ type: 'pageview', url: `ht!tp:// broken ?key=${KEY}` });
  check('M-1.12', 'a garbled URL still loses the key',
    garbled === null || !String(garbled?.url || '').includes(KEY), JSON.stringify(garbled));

  // A scheme with an empty host is genuinely unparseable even against a base
  // (ERR_INVALID_URL), which is the branch that must fail closed.
  const unparseable = redact({ type: 'pageview', url: `http://?key=${KEY}` });
  check('M-1.12b', 'a URL that cannot be parsed at all is dropped, not forwarded',
    unparseable === null, JSON.stringify(unparseable));
}

{
  // Missing / malformed event objects must not throw inside the tracker.
  let threw = null;
  try { redact(undefined); redact({}); redact({ url: null }); } catch (e) { threw = e?.message || String(e); }
  check('M-1.13', 'a malformed event cannot throw inside the tracker', threw === null, String(threw));
}

group('the wiring: a redaction that is not passed to <Analytics> changes nothing');

{
  // The Analytics element, sliced out of the same file. The prop has to be
  // there and it has to name this function.
  const at = SRC.indexOf('Analytics,');
  const call = at === -1 ? '' : SRC.slice(at, at + 400);
  check('M-1.14', '<Analytics> is mounted with props, not null',
    at !== -1 && !/Analytics,\s*null/.test(call), call.slice(0, 120));
  check('M-1.15', 'and the props carry beforeSend',
    /beforeSend/.test(call), call.slice(0, 200));
  check('M-1.16', `and beforeSend is ${FN_NAME}`,
    new RegExp(`beforeSend\\s*:\\s*${FN_NAME}\\b`).test(call), call.slice(0, 200));
}

{
  // The mechanism this fix depends on: the installed SDK only registers a hook
  // when the prop exists. An upgrade that renames it would silently reopen the
  // finding, so pin it where the dependency actually lives.
  const dist = join(HERE, '..', 'node_modules', '@vercel', 'analytics', 'dist', 'react', 'index.mjs');
  if (!existsSync(dist)) {
    rows.push({ id: 'M-1.17', label: 'the installed SDK reads props.beforeSend', verdict: 'skipped (no node_modules)' });
  } else {
    const mod = readFileSync(dist, 'utf8');
    check('M-1.17', 'the installed SDK still reads props.beforeSend', mod.includes('beforeSend'),
      'the analytics SDK no longer mentions beforeSend - re-read its docs before trusting this redaction');
  }
}

// --------------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => `${r.id} ${r.label}`.length));
console.log(`\nanalytics redaction probe  (source: ${SRC_PATH})`);
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
console.log(`analytics redaction: ${cases}/${cases} checks OK.`);
process.exit(0);
