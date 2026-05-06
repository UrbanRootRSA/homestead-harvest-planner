# Code review — 2026-05-06 (round 5 / convergence cycle 3)

**Verdict:** NEEDS FIXES — convergence NOT achieved. One HIGH discovered by empirically resolving the round-4 open caveat.
**Baseline:** `35b67a0` on `main` (cycle-2 round-4 polish, just pushed live)
**Scope:** Verify cycle-2 fixes (UNSAFE_CHAR_RE rewrite + `\u`-escape syntax + clampInt doc comment), confirm no cycle-1 regressions, resolve round-4's open caveat on the Vercel-alias redirect.
**Verifications run:**
- `npm run build` — clean (388.77 KB raw / 109.96 KB gz, 33 modules, 823 ms — matches user's baseline claim)
- `node --check api/generate.js` — pass
- `node --check api/validate-key.js` — pass
- Codepoint-level dump of `api/generate.js:289` line bytes — confirmed pure 7-bit ASCII (no raw control bytes in source)
- Runtime probe of `UNSAFE_CHAR_RE` against 25 test cases (14 strip-expected + 11 keep-expected, including all 6 boundary codepoints around each range) — 25/25 PASS
- Live curl probe of `https://homestead-harvest-planner.vercel.app/` (and 4 path variants) to verify M3 redirect — **discovered HIGH-1 below**
- Manual trace of `giveUpHandle` cleanup paths (App.jsx:7130-7148) — all three cases correct
- Static cross-check of all `clampInt(`/`sanitizeNum(` call sites — consistent with new doc comment

---

## Executive summary

Cycle 2's two-line diff (`UNSAFE_CHAR_RE` rewrite + `clampInt` doc comment) is **structurally and functionally correct**. The regex literal is now pure ASCII source with `\uXXXX` escapes; it parses cleanly, strips all 14 documented codepoint families (including the three cycle-2 additions: U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR, U+FEFF BOM), and preserves every legitimate codepoint at every range boundary. The `clampInt` doc comment accurately describes the `min`-as-fallback behaviour and correctly cross-references `sanitizeNum`. Build is clean and bundle size is byte-identical to the user's claim. None of the 12 cycle-1 fixes or 3 cycle-1 security-research items show any regression.

However, **HIGH-1** below was surfaced by empirically resolving the round-4 audit's explicit open caveat ("Vercel `has[].value` documented to support PCRE-style regex with named capture groups, but not empirically verified against the live deploy"). Live `curl` against `https://homestead-harvest-planner.vercel.app/` shows that the bare-path homepage returns **HTTP 200 OK with full app HTML**, NOT the intended HTTP 308 redirect to `thehomesteadplan.com`. The redirect *does* fire on every other path (`/index.html`, `/refund.html`, `/sitemap.xml`, `/anything-here`) — it's a Vercel routing-precedence behaviour where static-asset matching for `/` runs before redirect rules with `has[].value`. The canonical `<link>` tag is in place as backup defence and Google generally honours it, so the impact is partial — but the homepage is the highest-ranked URL and the explicit motivation for cycle-1 commit `d0e877e` ("fix GSC duplicate-content reports") is not delivered for that URL.

The convergence cycle does not terminate at zero findings. **Cycle 4 should ship the bare-path redirect fix.** Estimated effort: one rule added to `vercel.json`, ~5 lines of JSON, no code change. Build and tests unaffected.

---

## Findings

### [HIGH] H1-r5 — Bare-path Vercel-alias redirect does NOT fire on `/`

**File:** `vercel.json:3-9` (the redirect rule under audit)

**What:** Live empirical probe of every Vercel-alias path variant:

| URL | Expected | Actual |
|---|---|---|
| `https://homestead-harvest-planner.vercel.app/` | 308 → thehomesteadplan.com/ | **200 OK with app HTML** |
| `https://homestead-harvest-planner.vercel.app` (no slash) | 308 | **200 OK** |
| `https://homestead-harvest-planner.vercel.app/?utm=1` | 308 | **200 OK** |
| `https://homestead-harvest-planner.vercel.app/index.html` | 308 | 308 OK |
| `https://homestead-harvest-planner.vercel.app/refund.html` | 308 | 308 OK |
| `https://homestead-harvest-planner.vercel.app/sitemap.xml` | 308 | 308 OK |
| `https://homestead-harvest-planner.vercel.app/anything-here` | 308 | 308 OK |

The redirect rule is `source: "/:path*"` with `has[].type=host`. Every non-empty `:path*` value matches and triggers 308. The empty-path case (`/`) bypasses the redirect because Vercel's static-asset matcher for `index.html` at the site root runs at higher precedence than the redirect rule when `:path*` resolves to nothing.

**Why it matters:** The intent of cycle-1 commit `d0e877e` ("Redirect *.vercel.app → custom domain to fix GSC duplicate-content reports") was specifically to retire the Vercel alias from search-index visibility. The homepage `/` is:
- The highest-ranked URL in Google's eyes
- The most linked-to (Reddit posts, YouTube comments, etc.)
- The page Google's duplicate-content classifier flags first
- The page that GSC's "Page indexing" report singles out

A 308 redirect is a hard signal that consolidates ranking and prevents indexing of the alias. The canonical `<link>` tag at `/index.html` (verified present, points correctly to `thehomesteadplan.com/`) is a softer signal — Google "generally" honours it but historically still flags "alternate page with proper canonical tag" warnings in GSC's coverage report, which the user is actively monitoring.

The redirect works for every other path — including `/sitemap.xml` (which protects sitemap-based crawl-discovery) — so the partial defence is genuine. But the user's stated GSC-duplicate-content concern targets the bare homepage URL specifically, and that URL is not redirected.

This is NOT a cycle-2 regression. It's a pre-existing issue from cycle-1 commit `d0e877e` that the round-4 audit explicitly flagged as "not empirically verified against the live deploy" and recommended smoke-testing post-deploy. The smoke test was deferred. This audit performs it and finds the rule's coverage incomplete.

**Recommended fix:** Add a second redirect rule with `source: "/"` to vercel.json. The cleanest form keeps both rules side-by-side:

```json
{
  "redirects": [
    {
      "source": "/",
      "has": [
        { "type": "host", "value": "homestead-harvest-planner[a-z0-9-]*\\.vercel\\.app" }
      ],
      "destination": "https://thehomesteadplan.com/",
      "permanent": true
    },
    {
      "source": "/:path*",
      "has": [
        { "type": "host", "value": "homestead-harvest-planner[a-z0-9-]*\\.vercel\\.app" }
      ],
      "destination": "https://thehomesteadplan.com/:path*",
      "permanent": true
    }
  ],
  "headers": [...]
}
```

The named capture group `(?<host>...)` in the live config is unused (the `host` capture isn't referenced in the destination), so it can be dropped from both rules — purely cosmetic. The two-rule pattern is the documented Vercel idiom for "redirect both root and subpath".

After deploy, re-run:
```bash
curl -sI "https://homestead-harvest-planner.vercel.app/" --max-time 8 | head -3
# Expected: HTTP/1.1 308 Permanent Redirect
```

---

### [LOW] L1-r5 — Comment block at `api/generate.js:281-288` doesn't acknowledge cycle-2's three-codepoint extension

**File:** `api/generate.js:281-288` (8-line comment block above `UNSAFE_CHAR_RE`)

**What:** The comment block says:

> Round-3 SEC-HIGH3: defence-in-depth against indirect prompt injection... User-supplied strings flow into the user prompt at buildUserPrompt(); a payload like `Tomatoes\n\n[SYSTEM] Ignore prior instructions...` is the canonical anchor. Real crop / goal / experience values never contain newlines, control chars, or bidi-override unicode — strip them before they reach the prompt.

The prose still labels this "Round-3 SEC-HIGH3" and lists three categories: newlines, control chars, bidi-override unicode. Cycle 2 added three codepoints that are partially or wholly outside those categories:

- **U+2028 LINE SEPARATOR** — Unicode "newline" (fits prose category)
- **U+2029 PARAGRAPH SEPARATOR** — Unicode "newline" (fits prose category)
- **U+FEFF BOM (ZWNBSP)** — Zero-width no-break space; NOT a newline, NOT a C0/C1 control char, NOT a bidi-override (drifts from prose)

The regex literal (line 289) is the source of truth and is now self-documenting in pure ASCII `\u`-escape form, so a careful reader can enumerate the codepoints. But the prose has drifted: a future maintainer reading just the comment block could reasonably (and wrongly) think U+FEFF is excluded.

**Why it matters:** Audit-trail hygiene. The pre-launch convergence audits exist to keep the codebase reviewable — if comment-vs-code drift accumulates across rounds, future audits (and outside reviewers like the seo-checker / security-research agents) start producing contradictory findings. The fix is one paragraph.

This is a polish-tier LOW. Not a security gap (the regex is correct), not a UX gap. Won't block convergence on its own, but if the user wants this cycle to terminate cleanly on the next round, the comment update should ride with the H1 fix.

**Recommended fix:** Update the comment block to either (a) reference cycle-2 explicitly:

```js
// Round-3 SEC-HIGH3 + Round-4 polish: defence-in-depth against indirect
// prompt injection (OWASP LLM01:2025 — the #1 LLM risk in 2025). User-
// supplied strings flow into the user prompt at buildUserPrompt(); a
// payload like `Tomatoes\n\n[SYSTEM] Ignore prior instructions...` is
// the canonical anchor. Real crop / goal / experience values never
// contain newlines, control chars, bidi-override unicode, line/paragraph
// separators (U+2028/U+2029), or zero-width no-break space (U+FEFF) —
// strip them before they reach the prompt. This is one layer in a stack:
// forced tool-use + additionalProperties:false + sanitisePlan +
// escapeHtml are the others.
```

or (b) replace prose categories with a one-line codepoint inventory comment immediately above the regex literal, so the comment and code can never drift again:

```js
// Strips: C0 controls (0000-001F), DEL+C1 (007F-009F), zero-width +
// bidi marks (200B-200F), line/para separators + bidi-override
// (2028-202E), bidi isolates (2066-2069), BOM/ZWNBSP (FEFF).
```

Option (b) is the more durable form — it pairs every codepoint range in the regex with its English label, making future range edits self-documenting.

---

## Verified clean

The following were inspected and found correct under cycle-3's threat model:

- **`UNSAFE_CHAR_RE` literal bytes** — Codepoint dump of line 289 confirms 100 chars, all 7-bit ASCII. No raw control bytes. The cycle-2 escape-syntax rewrite is exactly what the writer claimed. Earlier byte-rewrite attempts that broke the file would have left U+0000/U+200B/U+200E etc. as literal bytes in the source — none present.
- **`UNSAFE_CHAR_RE` runtime behaviour** — 25/25 probe cases pass. Every cycle-2 add (U+2028, U+2029, U+FEFF) strips. Every adjacent-codepoint boundary (U+007E, U+00A0, U+2030, U+2065, U+206A, U+202F) preserves. Latin-1 (é), CJK (タ), em-dash (—), Euro (€), per-mille (‰) all preserved.
- **`clampInt` doc comment (App.jsx:304-306)** — Accurate: NaN-coerced inputs DO return `min` (line 309: `if (!Number.isFinite(n)) return min;`), no fallback parameter exists in the signature. Cross-references `sanitizeNum` correctly. Both call sites (App.jsx:6688, :6798) are 3-arg and consistent.
- **`sanitizeNum` qty-fix at App.jsx:6727** — `Math.round(sanitizeNum(b.qty, def.qty, 1, MAX_BEDS_PER_GROUP))` with `MAX_BEDS_PER_GROUP=20`. Trace: storage `{qty:5}` → 5 → 5; storage `{qty:NaN}` → 1 → 1; storage `{qty:-5}` → 1 → 1; storage `{qty:50}` → 20 → 20. All boundary cases correct. No 4-arg `clampInt` calls remain anywhere in App.jsx.
- **`validateLicence` H1 reorder (api/generate.js:153-278)** — Canonical-instance lookup unconditional at lines 177-186. `instance_missing` rejection at 196-199. Cache check at 205-212 only reachable AFTER `instanceIdForLs` is established. Bare-key short-circuit closed. SET NX first-bind correctly written at 256-264. Sliding-window TTL refresh via `redis.expire` at 269 (write-cheap, race-tolerant).
- **`giveUpHandle` cleanup (App.jsx:7130-7148)** — Three timing cases all correct: (a) timeout fires before unmount → handle nulled, cleanup `clearTimeout(null)` is no-op; (b) unmount before timeout → `clearTimeout(handle)` cancels; (c) `setup()` returns true on first call → handle never created, cleanup-truthy-check skips both branches.
- **Build hygiene** — `npm run build` clean (823 ms, 33 modules). Bundle: 388.77 KB raw / 109.96 KB gzipped — matches the user's reported baseline byte-for-byte. No new untracked imports. No ESM/CJS regressions in `api/*.js` (still `export default`).
- **CSP unchanged** — `vercel.json` headers block has not drifted from the round-3 baseline. CSP still tight (no wildcard `*.lemonsqueezy.com` in `connect-src`).
- **Vercel-alias redirect on subpaths** — Every non-bare path returns 308 with the correct `Location:` header. `/refund.html`, `/sitemap.xml`, `/index.html`, arbitrary 404 paths all redirect cleanly. The bug is specifically the bare `/` (see H1).
- **Canonical `<link>` tag on Vercel alias** — Live curl confirmed `<link rel="canonical" href="https://thehomesteadplan.com/" />` at the alias-served homepage. Backup defence in place; partially mitigates the bare-path 200-OK issue but doesn't replace it.
- **Round-4 deferred items** — L6 camelCase/snake_case API drift remains defensible (mirrors LS naming). L7 NX-race remains a hobby-tier non-issue. No new evidence either is exploitable.
- **No regressions in cycle-1 closures** — All 12 round-3 findings (2 H + 3 M + 7 L) and all 3 security-research items (1 H + 1 M + 1 H comment) remain closed. Cycle 2 touched only the regex literal and one comment line; nothing else moved.

---

## Trajectory

| Cycle | Commit | Findings (C/H/M/L) | Notes |
|---|---|---|---|
| 1 (round 3) | 97e173e | 0/2/3/7 closed + 1H/1M/1H sec | Big closure pass — 15 items |
| 2 (round 4) | 35b67a0 | 0/0/0/3 closed | Round-4 polish — 3 LOWs |
| **3 (round 5)** | (no commit yet) | **0/1/0/1** | **HIGH found by empirical probe** |

Cycle-3 finding count is 2 (1H + 1L). Both are 1-rule / 1-paragraph fixes. **One more cycle (cycle 4) should reach zero**.

---

*End of round-5 audit. Cycle exit signal: 1 HIGH + 1 LOW remain. User should authorise cycle 4 to close the bare-path redirect and the comment-vs-code drift.*
