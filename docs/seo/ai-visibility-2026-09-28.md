# AI and search visibility, 2026-09-28

Source brief: `Downloads/CLAUDE-CODE-BRIEF-ai-search-visibility-boost-2026-09-28.md`, wave D.
Gaps named in the brief: "Category software absent; name confusion".
Branch: `feat/ai-search-visibility-2026-09-28`. Not pushed, not merged, not deployed.

## What changed

1. New page `public/homestead-planning-software/index.html`, served at
   `https://thehomesteadplan.com/homestead-planning-software/`. The Urban Root hub links to this exact slug.
   It answers "homestead planning software" and "garden and self-sufficiency planner".
   Sections: what it answers, a worked example, free calculators against the paid plan, who it is for, how the numbers are made, the name, questions.
2. The page names the product "The Homestead Plan" in the title, the H1 area, the schema and a section called "The name". It does not name any other company or product.
3. New file `public/llms.txt`. It gives a fact list, the worked example with its assumptions, and the page index for AI crawlers.
4. `public/sitemap.xml`: the new URL is added. `lastmod` is 2026-09-28 for the new page, `about.html` and `/blog/`.
5. `public/blog/index.html` and `public/about.html` link to the new page, in the body and in the footer.
6. `src/App.jsx`: the app footer "Learn" column links to the new page.
7. `index.html`: the noscript block now names the paid tier and links to the new page, About and the blog. The `WebApplication` creator URL was `https://thehomesteadplan.com/`. It is now `https://urban-root.com/`, and a `publisher` is added. `about.html` gets the same URL correction.

## Structured data on the new page

Organization (Urban Root), WebApplication with Offer 39.99 USD, WebPage, BreadcrumbList and FAQPage.
The FAQPage holds the five questions that the page shows as text. The JSON answers match the visible answers word for word.
There is no `aggregateRating` and no review markup.

## Where each figure comes from

The worked example uses the planner's first-load settings. These are the settings that goldens `SB-1` to `SB-4` in `tests/calc-golden.test.mjs` pin.

| Figure | Assumptions | Pin |
|---|---|---|
| 798 plants | Family Basics preset (12 crops), family of 4, goal `fresh_preserving`, 300 lb per person per year | `SB-1` |
| 35.9 % self-sufficiency | same, on the conservative yield | `SB-3` (35.9167 %) |
| $815.40 a year | same, default grocery prices (BLS average retail, retrieved July 2026), capped at what the household would buy | `SB-4`, also `MED-1.8` |

Other claims and their sources:

| Claim | Source |
|---|---|
| 82 crops, 230 pairings | `CROPS` and `COMPANIONS` lengths in `src/data/` |
| USDA zones 3 to 11, manual frost dates, hemisphere shift of 6 months | `ZONE_FROST_DATES`; spec section 4 |
| 30 % of the footprint for paths, 15 % settling allowance | `PATH_SHARE_OF_FOOTPRINT`, `SETTLING_BUFFER` |
| Harvest timeline, yields and savings come from the engine, not the model | spec section 5 and section 8 (`PLAN_SCHEMA`) |
| Licence on up to 3 devices, no expiry | spec section 1 and section 17 |
| Source list | `about.html` and spec section 6 |

## Serving checks

- `vercel.json` has redirects for Vercel aliases only and no catch-all rewrite, so Vercel serves the static `index.html`.
- The CSP allows the inline `<style>` block and Google Fonts. The page loads no script. The JSON-LD block is data and does not execute.
- `vite.config.js` already has the dev-only `publicDirectoryIndex` shim, so `npm run dev` serves the page at the trailing-slash URL.

## robots.txt

`public/robots.txt` allows every user agent and disallows only `/api/`.
It names no AI crawler. GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and Google-Extended are therefore allowed.
This branch does not change the policy.

## Gates

- `npm test`: exit 0. 9 suites: load-quarantine 8, bounds 106, paywall mount chain 204, validate-key limits 57, generate licence gate 89, plan generation 52, analytics redaction 19, calc-golden 345, render drive 176.
- `npm run build`: exit 0. `dist/homestead-planning-software/index.html` and `dist/llms.txt` exist.
- The JSON-LD in the built home, new page and about page parses.
- Headless Chrome at 375 px and 1280 px: no sideways scroll on the new page, the blog index or the about page.

## Open for Grant

1. Merge and push `main` to deploy. Then ask the Chief of Staff to request indexing for the new URL and to resubmit `https://thehomesteadplan.com/sitemap.xml`.
2. `about.html` has a "roadmap" section that names three features that are not built (a satellite layout overlay, altitude canning adjustments, a crop-rotation engine). An AI answer can repeat these as features. The choice is to keep, reword or remove the section.
3. The home landing page and its FAQ JSON-LD name competitor products. The new page does not. This branch leaves the home page as it is.
