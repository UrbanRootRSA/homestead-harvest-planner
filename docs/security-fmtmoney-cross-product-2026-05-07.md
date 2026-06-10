# Cross-product fmtMoney self-XSS audit — The Homestead Plan

**Date:** 2026-05-07
**Origin reference:** Aero-Calc v2.3.4, commit `9acd6a6`. Audit doc `repo-clone/docs/security-audit-2026-05-06.md`.
**Threat:** Currency-symbol HTML-escape bypass in PDF/report-export path. Self-XSS bounded.
**Verdict:** **INFO — STRUCTURALLY IMMUNE. No code fix required.**

---

## Summary

The Aero-Calc finding does not reproduce on Homestead. Three independent structural reasons:

1. **No `fmtMoney`/`formatCurrency` helper exists.** Currency is interpolated inline at each call site (e.g. `{currency}{c.cost.toFixed(2)}` for JSX, single template-literal site for HTML report). There is no shared helper that could leak unescaped output across UI vs report paths.
2. **No JSON-import / Load-Design feature.** Grep for `sanitizeState|loadDesign|handleImport|importState|JSON.parse.*import|onImport|FileReader` across `src/` returns zero matches. Homestead does not accept user-pasted state files. The canonical attacker-input path from the threat model is structurally absent.
3. **The PDF/report HTML path already escapes.** App.jsx:4808 emits the currency symbol as `${escapeHtml(plan.savingsEstimate.currency || currency)}`. `escapeHtml` (App.jsx:4654) handles `&` first, then `<`, `>`, `"`, `'` — order-correct.

## Evidence trail

| Finding | Location |
|---|---|
| `CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"]` | App.jsx:3785 |
| LLM response field allowlist-validated | App.jsx:3809 — `CURRENCY_SYMBOLS.includes(raw.savingsEstimate.currency)` |
| PDF/report HTML emit, escaped | App.jsx:4808 |
| `escapeHtml` definition | App.jsx:4654–4662 |
| `CurrencySelect` UI is closed allowlist (5 options) | App.jsx:6305–6311, 6316 |
| `currency` state load from localStorage, length-clamped | App.jsx:6672–6675 |
| No JSON-import code path | grep result: 0 matches |

## What's actually in the call graph

- **JSX consumers** (5 sites: lines 1725, 4518, 5574, 5638, 5759 etc.): React auto-escapes children → safe.
- **HTML report** (1 site: line 4808): wrapped in `escapeHtml(...)` → safe.
- **No third path.** No `Blob`/`downloadFile` writes any other currency-bearing string into HTML.

## Residual observation (defence-in-depth nit, NOT a fix)

The `currency` state load at App.jsx:6674 clamps by `typeof c === "string" && c.length <= 3` rather than allowlist-matching against `CURRENCY_SYMBOLS`. This is the same clamp shape Aero-Calc uses, and it is the condition that *would* make payload injection possible if a JSON-import path were ever added.

Tightening to `CURRENCY_SYMBOLS.includes(c) ? c : "$"` would make the currency state structurally immune at the source rather than only at the emit point. Worth carrying as a hygiene tweak the next time `App.jsx` is touched in this area; not worth a dedicated commit. Filed here as a footnote, not a finding.

## Verification

- All 5 valid symbols (`$ € £ R ¥`) are byte-stable through `escapeHtml` — none contain `< > & " '`, so the function is a no-op on them. UI and report output unchanged.
- Hostile string `"<x>"` flowing through escapeHtml → `&lt;x&gt;` → inert in the downloaded HTML.
- No JSX double-escape risk: JSX consumers don't pass through `escapeHtml` — they receive the raw symbol and React escapes at render.

## Decision

No commit. No code change. Audit doc filed for the cross-product convergence trail.

If Homestead ever ships a "Load Design" / state-import feature in a future iteration, that PR must include a `sanitizeState` helper that validates `currency` against the `CURRENCY_SYMBOLS` allowlist, and this audit's verdict must be re-run.

---

**Cross-product status after this audit:**
- Aero-Calc: **FIXED** at `9acd6a6` (helper-side escape).
- FaminePrep: pending check.
- Grow Room: pending check.
- Homestead: **IMMUNE** — no JSON-import path + report path already escapes.
