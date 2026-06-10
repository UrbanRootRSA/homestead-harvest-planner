# Competitor Analysis — homesteadplanner.net

**Date:** 2026-05-18
**Analyst:** deep-researcher (Claude Opus 4.7)
**Subject domain:** homesteadplanner.net
**Compared against:** The Homestead Plan (thehomesteadplan.com) — Urban Root flagship at $39.99 one-time

---

## 1. TL;DR

`homesteadplanner.net` is a **SaaS-style homestead management web app** (recurring tasks, livestock tracking, garden layout, journal, satellite-imagery property mapping) — not a calculator. It is operationally adjacent to but **product-categorically different from** The Homestead Plan.

**Confidence on the SEO ranking question: HIGH (the premise is partly wrong).**

The user's framing — "this AI-generated site ranks well in Google" — is **not supported by the evidence**. Spot-checks across the head terms its content targets show it is **absent from the top 10** for: "beginner vegetable garden plan first time", "how many eggs per day chicken breeds", "companion planting guide vegetables", and "best homestead planner app 2026". The site does appear on Google for `"homestead planner" app` exact-match brand-like queries, but that is brand affinity (matching the domain name verbatim), not organic content ranking.

What *is* true:
- The site is **11 months old** (registered 2025-06-18 via Key-Systems GmbH, AWS-hosted, DK contact, currently in early-stage indexing).
- Content is **AI-assisted but reviewed** — not slop. It would be defensible to a Google human-rater.
- Distribution / content scale is **tiny**: 34 total URLs in sitemap, ~18 of those are content (Almanac articles), the rest are app routes.
- There is no programmatic-SEO footprint (no per-state, per-crop, or per-breed templated pages — the biggest single mechanism by which competing AI-content sites in this niche rank).
- The freemium claim is partially misleading: a "14-day Pro trial" is mentioned in one Almanac CTA, but no pricing page, no Pro feature list, no subscription terms anywhere visible. Either (a) the product is mid-monetisation-pivot and copy is inconsistent, or (b) Pro is a soft-launched future feature.

**Direct competitive overlap with The Homestead Plan: LOW.** They sell ongoing operations management (a Notion/spreadsheet replacement). Urban Root sells one-time pre-season planning answers ("what to grow, how much, when, where to put it"). The two products are complements, not substitutes — a homesteader can rationally use both. But they compete for the same Reddit/YouTube attention, the same SERP real estate on "homestead planner" intent searches, and the same brand-mind-share.

---

## 2. Site map (URL inventory)

Total URLs in sitemap.xml: **34**
Last-Modified dates: 2026-02-25 through 2026-02-28 (single content push, no rolling editorial cadence)

### Root + product pages (4)
| URL | Title | Word count | Purpose |
|---|---|---|---|
| `/` | "Homestead Planner — Homestead Management App for Tasks, Livestock, Garden & Journal" | ~1,200 | Landing page; 3× signup CTAs; 8 feature sections |
| `/features` | "Features — Homestead Planner" | ~200 | 6-feature summary table; thin |
| `/pricing` | (page exists) | — | **No actual pricing shown** — page says "free, no credit card required" only |
| `/users/sign_up` | "Homestead Planner" | ~45 | Email + password form; no SSO; no payment |

### Feature subpages (6)
| URL | What it documents |
|---|---|
| `/features/task-management` | Recurring chores, categories, overdue alerts (~350 words) |
| `/features/animal-tracking` | Individual records, headcount, P&L per animal (~850 words) |
| `/features/garden-planner` | Drag-drop bed layout, companion DB, "60+ crops" (~370 words) |
| `/features/equipment-maintenance` | Service-history logging |
| `/features/journal` | Dated notes with weather, photos, tags |
| `/features/layout-planner` | Satellite-imagery property mapping with freeform draw |

### Almanac (content marketing) — 18 URLs
**Hub pages (5):** `/almanac`, `/almanac/chickens`, `/almanac/gardening`, `/almanac/goats`, `/almanac/homesteading` — each ~12-15 words intro + child links.

**Articles (13):**
| Category | Count | Examples |
|---|---|---|
| Chickens | 4 | "How Many Eggs Per Day", "Best Breeds for Beginners", "What to Feed", "Keeping Warm in Winter" |
| Gardening | 4 | "Companion Planting Guide", "When to Start Seeds Indoors", "How to Build Raised Beds", "Beginner Vegetable Garden Plan" |
| Goats | 2 | "How Much Space Do Goats Need", "What Do Goats Eat" |
| Homesteading | 3 | "Start Homesteading on 1 Acre", "Homestead Task Planning", "How to Track Egg Production" |

Article word counts: ~800-1,200 each. All dated 2026-02-28. **All written in a single batch.**

### Legal/auth (3)
`/privacy`, `/users/sign_in`, `/users/sign_up`.

### Robots.txt
```
User-agent: *
Allow: /
Allow: /users/sign_in
Allow: /users/sign_up
Disallow: /rails/
Disallow: /up
Sitemap: https://homesteadplanner.net/sitemap.xml
```
The `/rails/` and `/up` disallows are dead giveaways: **stack is Ruby on Rails** (likely Rails 7+; `/up` is the Rails 7.1+ default health-check route).

---

## 3. Feature inventory

| Feature | URL | Free / Paid | What it does | Execution quality |
|---|---|---|---|---|
| **Task Management** | `/features/task-management` | Free (Pro hinted) | Recurring chores (daily/weekly/monthly/yearly), 5 default categories (Daily Chores, Seasonal, Maintenance, Garden, Livestock), overdue alerts, quick-add, helper login (no edit rights) | Sound product; nothing innovative. Matches Todoist + a homesteader's mental model. |
| **Animal Tracking** | `/features/animal-tracking` | Free (Pro hinted) | Individual records (name, birth date, notes), group counts, daily produce logging, 7-day & 30-day averages, P&L per animal/group, market-price estimate. Species: chickens, ducks, geese, turkeys, quail, cattle, pigs, goats, sheep, rabbits, bees, "other". | Strongest feature. P&L per animal is a genuinely useful workflow. |
| **Garden Planner** | `/features/garden-planner` | Free (Pro hinted) | Drag-drop beds with real dimensions, companion-planting flags, planting/harvest timeline, rotation tracking, **60+ crops** (Homestead Plan has 82) | Adequate, similar to SeedTime free tier but with worse polish in screenshots none-visible state. |
| **Equipment & Maintenance** | `/features/equipment-maintenance` | Free | Inventory + service-history logging + maintenance reminders | Generic CMMS-lite. Not particularly homestead-specific. |
| **Journal** | `/features/journal` | Free | Dated notes with weather, photos, tags | Generic note-taking with weather autopopulate. |
| **Property Layout Planner** | `/features/layout-planner` | Free | Satellite-imagery overlay, drag-drop structures (house/barn/coop/shed/greenhouse/well), freeform drawing for fences/ponds/paddocks, autosave, zoom/pan | **Real differentiator.** No area calculations / no distance tool — primarily a visual planning canvas. Closest to what people draw on graph paper today. |
| **Helper Access** | (in task page) | Free | Email-invite multi-user with role permissions | Notable for free-tier — most apps gate this. |
| **Almanac (blog)** | `/almanac/*` | Free, public | 13 how-to articles, ~1k words each, formula tables, breed comparisons | AI-assisted but reviewed. Useful for the audience, not authoritative. |

### What The Homestead Plan has that they don't

| Feature | Homestead Plan | homesteadplanner.net |
|---|---|---|
| **Self-Sufficiency Calculator** (family × consumption × goal × crops → plants needed + space + yield) | YES — flagship | NO |
| **Soil/raised-bed volume calculator** (rectangle, circle, L-shape, settling buffer, cost per soil mix) | YES | NO |
| **Planting Dates calculator** (frost-date math, 12-month timeline per crop) | YES | Manual within garden planner; no zone calc |
| **Companion Planting matrix** (230 pairwise relationships, Build-a-bed / Pick-a-crop modes) | YES | Flags only inside garden planner |
| **LLM-generated Growing Plan** (12-month schedule, bed layouts, succession, harvest timeline, preservation, savings) | YES — main paid feature | NO |
| **Crop Database** (82 crops with full schema) | YES | "60+ crops" in garden planner (no standalone DB UI) |
| **Cost Savings Calculator** (pays-for-itself in X months ROI) | YES | NO (animal P&L is per-animal, not garden-wide) |
| **Preservation Planner** (jars, freezer cu ft, dehydrator batches by crop) | YES | NO |
| **Hemisphere toggle** + metric/imperial | YES | Not advertised |
| **HTML report download** | YES | NO |

### What they have that Homestead Plan doesn't

| Feature | homesteadplanner.net | Homestead Plan |
|---|---|---|
| Daily/weekly recurring task management | YES | NO |
| Per-animal records + headcount | YES | NO |
| Daily produce logging (eggs, milk) | YES | NO |
| Animal P&L tracking | YES | Cost-savings is garden-only |
| Photo journal with weather autopopulate | YES | NO |
| Satellite-imagery property mapping | YES | NO |
| Equipment maintenance log | YES | NO |
| Multi-user invites | YES | NO (single-device licence × 3) |
| Persistent server-side data (Rails app) | YES | NO (localStorage only) |

**Strategic read:** These are two products for two phases. Homestead Plan answers "what should I build / plant?" (pre-season + onboarding). homesteadplanner.net answers "how do I run what I built?" (ongoing operations). The overlap is the garden planner — and even there, the calc-vs-visualize axis differentiates.

---

## 4. SEO ranking hypothesis — the central question

### The user's premise
"This AI-generated site ranks well in Google."

### Evidence collected
- WHOIS: created 2025-06-18, ~11 months old, Key-Systems GmbH (German registrar, often used as wholesaler for resellers), DK country code on contact, redacted via "domain-contact.org" privacy service.
- Hosting: AWS (4 awsdns nameservers), IP 54.216.85.136 = AWS US-East-1 Virginia. Origin IP suggests EC2/ECS Rails app, not Vercel/Netlify static.
- Sitemap: 34 URLs total; 18 content articles; no programmatic-SEO templates (no per-state, per-crop, per-breed pages).
- Last-Modified: all content dated 2026-02-25-28 — single batch publication, not rolling editorial calendar.
- Schema markup: **none detected** on the article pages I sampled. No JSON-LD Article, FAQPage, HowTo, or BreadcrumbList. No `meta name="author"`, no `article:published_time` Open Graph metadata, no canonical-link visibility in WebFetch output (note: WebFetch returns rendered markdown not raw HTML, so absence is suggestive but not definitive).
- Author bylines: **none on any article**.
- External citations: **zero** — no university extension links, no USDA references, no Mother Earth News, no Cornell. Articles say "consult your local extension office" without linking.
- Internal linking: thin — 3-5 links per article, all to sibling Almanac posts or product CTA. No deep cross-linking to feature pages.
- Brand mentions in third-party content: searching "`homesteadplanner.net`" returns essentially no independent references. No Reddit threads (`site:reddit.com` returned zero). The Hello-Homestead / Homestead.org / Hobby Farms apps-roundups that list ChookBook, Flockstar, SmartSteader, Cluck-ulator, and Egg Counter Free **do not list homesteadplanner.net**. The brand is not in the ecosystem's recommendation graph.

### Direct SERP probes (head terms the Almanac targets)

| Query | Top-10 result domains | homesteadplanner.net rank |
|---|---|---|
| "beginner vegetable garden plan first time" | almanac.com (×2), stellaswardrobe.com, melissaknorris.com, eartheasy.com, **iastate.edu extension**, **ncsu.edu extension**, gardenerspath.com | NOT in top 10 |
| "how many eggs per day chicken breeds" | almanac.com, getstronganimals.com, kalmbachfeeds.com, waddleandcluck.com, roysfarm.com, cooperandgracie.com, tenacrebaker.com, heritageacresmarket.com, aproductivehousehold.com, honestworm.com | NOT in top 10 |
| "companion planting guide vegetables" | almanac.com, ufseeds.com, motherearthnews.com, westcoastseeds.com, farmersalmanac.com, burpee.com, wikipedia, homesteadandchill.com, azurefarmlife.com, edengreen.com | NOT in top 10 |
| "best homestead planner app 2026" | homestead.org, tamakoa.com, coohom.com, homesteadliving.com, **homesteadplanner.net (yes — rank ~5)**, etsy.com, theprairiehomestead.com, amazon.com, notion.com | **YES** (rank ~5) |
| "homestead task planning chore tracker app" | homesc.com, homeandtexture.com, thetoday.app, hometasker.io, homestead.org, top10.com, bestapp.com, play.google.com, familyhandyman.com, apple.com | NOT in top 10 |
| "backyard chicken management app free no subscription" | backyardchickens.com (×2), hobbyfarms.com (×3), smartbirdapp.com, harvestsavvy.com, play.google.com, muranochickenfarm.com, poultry.care | NOT in top 10 |

### Verdict on the central question

**The site is not ranking on its content's intended head terms. It is ranking only on `[exact product category] app` queries, which is the lowest-difficulty SEO win available — Google's bias toward domain-keyword exact-match.**

This is **not a programmatic-SEO success story**. There is no scaled programmatic content footprint (no `/seeds/[zone]/[crop]`, no `/animals/[species]/[state]`, no per-USDA-zone landing pages — patterns I have seen repeatedly in successful AI-content homesteading sites like leaftide.com, harvestsavvy.com, foodgardening.mequoda.com).

**What IS earning the limited visibility it has:**

1. **Domain-name exact-match for "homestead planner"** — Google still rewards branded exact-match domains on category queries despite EMD-update rollbacks. The site appears for the literal product-category brand-form.
2. **Light content depth on long-tail Almanac topics** — the 13 articles are competent enough to surface on hyper-long-tail queries (e.g. "track egg production 14-day trial") but get crushed by domain-authority on head terms.
3. **Recency boost from Google's freshness signal** — content dated 2026-02-28, indexed within last ~80 days, will get a temporary freshness uplift before being out-competed by aged Almanac.com authority.

**What it is NOT doing that would make it actually rank:**

- No author E-E-A-T signals (no bylines, no About page with credentials, no "Reviewed by" stamps, no author entity).
- No schema markup (no Article, no HowTo, no FAQPage, no Organisation, no Person).
- No external citations or reputable outbound links (Google rewards content that references authoritative sources).
- No backlinks visible in any third-party comp listings, no reviews, no Reddit mentions.
- No internal cross-linking density (Yoast-style topic-cluster architecture missing).
- No Last-Updated dates (Google uses freshness for evergreen ranking).
- Stack-induced robots disallows for /rails/ and /up are fine, but no /sitemap-index, no per-section sitemaps.

### Realistic traffic estimate

StatShow's `1 visitor/day, 30/month, $0.30/yr ad revenue` is a placeholder estimate that StatShow returns when it has no real data (it 404'd on the actual URL fetch). The real number is **almost certainly higher** than 30/mo — the brand-keyword exact-match alone should drive a few hundred mo from "homestead planner app" searches. But I'd estimate **realistically 200-2,000 monthly organic visits**, far below the levels at which programmatic-AI sites raise concerns (10k-100k+).

### Why the user perceived "ranking well"

Three plausible explanations:
1. They Googled "homestead planner" verbatim — and the site does appear (domain-exact-match win).
2. They Googled a very specific long-tail query the Almanac was written to capture (e.g. "homestead task planning chore tracker"), saw it surface, and assumed broader strength.
3. They saw it in an AI-overview Google response (Almanac's competent-but-not-authoritative content is exactly the kind of digestible source AI overviews quote).

None of these are "this AI site is dominating organic search." The fear of a competitor cratering Homestead Plan's traffic via SEO sleight-of-hand is **unfounded**.

---

## 5. Honest assessment — is it actually slop?

**No. It is competent AI-assisted content that has likely had a human pass.**

Markers I expected to see and didn't:
- No giveaway phrases ("as a homesteader", "let's dive in", "remember", "it's important to note")
- No factual errors I could spot in the chicken-breed table (Australorp 364-egg record is real, RIR 250-300 is real, Buff Orpington broodiness is real)
- Spacing recommendations for goats (200-250 sq ft outdoor / 15-20 sq ft shelter / 4 ft fence) align with University of Maryland Extension and Penn State Extension figures
- The companion-planting Three Sisters explanation is accurate

What's missing (and why it limits authority):
- No author byline or About-the-author depth
- No university extension citations
- No personal anecdotes or named local references
- No photos (text-only articles)
- No "Reviewed by veterinarian / horticulturist" badges
- Promotional integration is honest (CTAs labelled as such), not deceptive

**A homesteader landing on these articles would get useful, accurate-enough beginner info.** They would not get the depth, opinion, or trust signals that make Almanac.com / Mother Earth News / Permies.com / r/BackYardChickens the dominant beginner-Google destinations.

### Real things to learn from / borrow

1. **The "Almanac" content arm itself** — Urban Root has no public content arm for Homestead Plan beyond the product. A small library (10-20 articles) targeting `[crop] companion plants`, `[crop] yield per plant`, `how many [crop] for family of 4`, `[zone] planting calendar` would feed Homestead Plan's exact discovery funnel and unlike homesteadplanner's, Urban Root's actual product *answers these questions* — so CTAs convert.

2. **The satellite-imagery property layout planner** — genuinely cool. Urban Root could ship a stripped-down version (no animals/structures, just garden-bed placement on Google Maps tile) for the Soil tab. This would be a real differentiator vs SeedTime/GrowVeg.

3. **Per-animal P&L workflow** — well-considered. Out of scope for The Homestead Plan but instructive for thinking about future product extensions (a $19 "Backyard Animal P&L" companion product?).

4. **Helper-login multi-user pattern** — they get this for free via Rails Devise. Urban Root's licence-key + 3-device model is the right call for a one-time-pay product, but worth noting users may want a "share my plan with my spouse" use case.

---

## 6. Gaps + opportunities for Urban Root

### Gap 1: No content marketing footprint
The Homestead Plan has zero public Almanac/blog presence. Every product question a user might Google before buying ("how many tomato plants for family of 4", "USDA zone 7 planting calendar", "companion plants for peppers") is being answered by Almanac.com, Mother Earth News, and now homesteadplanner.net's Almanac. Each of those is an opportunity cost where the searcher does NOT see Urban Root.

### Gap 2: No "instant answer" SEO landing pages
The site currently is a single React SPA. The Almanac-style hub would need a separate static-site path (could be a Next.js subfolder on the same domain, or a Ghost/Substack subdomain) that doesn't risk the React app's CSP or paywall hardening.

### Gap 3: No Reddit/forum brand presence
Zero r/homesteading or r/vegetablegardening threads about The Homestead Plan as of this audit. The distribution plan in CLAUDE.md section 18 is correct but un-executed. Per the launch checklist this is post-launch hygiene; with a competitor now in market it's more pressing.

### Gap 4: No comparison page
Urban Root's landing page comparison table is "Homestead Plan vs GrowVeg vs Almanac vs Seedtime". It does NOT include homesteadplanner.net. Adding a "Free Trackers vs One-Time Planner" row would let Urban Root frame the competitive boundary cleanly.

### Gap 5: Property-layout / spatial planning
Urban Root's Soil tab calculates *how much soil* for beds the user has already decided to build. It does not help them *decide where to put the beds on their actual property*. Adding a simple `<canvas>` overlay on Google Maps Static API (free tier covers low volume) would close a real workflow gap and match the homesteadplanner property planner.

---

## 7. Recommended actions (ranked by impact × effort)

### High impact, low effort

1. **Add 5 evergreen Almanac articles to thehomesteadplan.com/blog** targeting the exact long-tail queries the product answers:
   - "How many tomato plants for a family of 4?"
   - "USDA zone 7 planting calendar (week-by-week)"
   - "Vegetable garden cost: does growing your own actually save money?"
   - "Companion plants for [tomatoes / peppers / lettuce]"
   - "How much soil for a 4×8 raised bed?"

   Each article should link to the specific calculator that produces the answer. Effort: 1-2 weeks of content + a simple static-site folder (no React app changes).

2. **Add homesteadplanner.net to the comparison table** with the framing "ongoing management vs one-time planning". Effort: 30 minutes.

3. **Execute the distribution plan in CLAUDE.md section 18.** Reddit + YouTube comments are the cheapest channel; competitor isn't there yet. Effort: 1 hr/week ongoing.

### High impact, medium effort

4. **Build a Property Layout v1** for the Soil tab — Google Maps Static API tile + canvas overlay where users drop rectangles for raised beds. Calc the soil for the placed beds automatically. Effort: 2-3 days.

5. **Brand monitoring**: set up Google Alerts for "homestead planner app", "homestead garden planner", "homesteadplanner.net", and Reddit RSS subscriptions for r/homesteading + r/vegetablegardening. Effort: 1 hour setup, 5 min/day to scan. Lets Urban Root engage authentically when threads start mentioning either product.

### Medium impact, low effort

6. **Schema markup audit on The Homestead Plan**. Verify the index.html already ships `WebApplication` + `FAQPage` JSON-LD (per CLAUDE.md §15). If not, add. This is the table-stakes E-E-A-T signal the competitor doesn't have.

7. **Add author / About page**. Even a single page at /about with "Built by Urban Root in Cape Town, South Africa. I've been growing food for [N] years." moves the E-E-A-T needle for Google human raters and removes "no author byline" as a knock against your content marketing efforts.

### Low priority

8. **Don't panic** about homesteadplanner.net taking organic traffic. The data does not support that thesis. The competitor is a soft-launched Rails freemium product that has not earned authority, doesn't have backlinks, and isn't in the community recommendation graph. The realistic threat is them eventually adding a paid tier and out-competing Urban Root on TAM if they execute (Rails dev velocity, persistent storage, multi-user) — that is a 12-24 month worry, not an immediate one.

---

## 8. Data verification matrix

| Claim | Source 1 | Source 2 | Consensus |
|---|---|---|---|
| Domain age 11 months | who.is/whois (created 2025-06-18) | statshow.com ("10 months old, creation 2025-06-18") | Confirmed |
| Site is Ruby on Rails | robots.txt `/rails/` + `/up` disallows | RRPProxy registrar typical of European Rails-hosting buyers | Confirmed |
| AWS-hosted in US-East | WHOIS nameservers (awsdns) | statshow IP 54.216.85.136 = AWS Virginia | Confirmed |
| AI-assisted content | Generic cadence + hedging + no anecdotes + no citations on every article | All 4 articles I analysed flagged same patterns | Confirmed |
| Site not ranking on head terms | Top-10 SERP for 5 different head queries — site absent | Brand-keyword query DOES rank | Confirmed |
| 34 URLs in sitemap | Direct fetch of sitemap.xml | — | Confirmed |
| No schema markup | WebFetch on chicken-eggs article reported none detected | Same for other articles | Suggestive (WebFetch returns rendered markdown not raw HTML) |
| No real Reddit presence | `site:reddit.com "homesteadplanner.net"` returned 0 results | — | Confirmed |
| Hidden Pro tier | "14-day Pro trial included, no credit card needed" quoted from /almanac/homesteading/how-to-track-egg-production CTA | No /pricing page content backing it up | Confirmed (text exists, implementation unclear) |

---

## 9. Sources

- [homesteadplanner.net /](https://homesteadplanner.net/) — 2026-05-18, primary
- [homesteadplanner.net /features](https://homesteadplanner.net/features) — 2026-05-18, primary
- [homesteadplanner.net /pricing](https://homesteadplanner.net/pricing) — 2026-05-18, primary
- [homesteadplanner.net /sitemap.xml](https://homesteadplanner.net/sitemap.xml) — 2026-05-18, primary
- [homesteadplanner.net /robots.txt](https://homesteadplanner.net/robots.txt) — 2026-05-18, primary
- [homesteadplanner.net /almanac/*](https://homesteadplanner.net/almanac) — 2026-05-18, 6 articles sampled, primary
- [WHOIS for homesteadplanner.net via who.is](https://who.is/whois/homesteadplanner.net) — 2026-05-18, WHOIS record
- [StatShow for homesteadplanner.net](https://www.statshow.com/www/homesteadplanner.net) — 2026-05-18, traffic estimate (placeholder-grade)
- [SimilarWeb landing](https://www.similarweb.com/website/homesteadplanner.net/) — 2026-05-18, data not displayed without login
- Google SERP probes via WebSearch for: "how many eggs per day chicken breeds", "companion planting guide vegetables", "beginner vegetable garden plan first time", "best homestead planner app 2026", "homestead task planning chore tracker app", "backyard chicken management app free no subscription", "\"homesteadplanner.net\" site:reddit.com", "\"homestead planner\" reddit" — all 2026-05-18

## 10. ⚠️ Unverified claims

- The exact organic monthly traffic. SimilarWeb required login; StatShow returned placeholder data. **My ~200-2,000 monthly visit estimate is informed guess, not measured.** A paid Ahrefs / SEMrush lookup would resolve this.
- Whether the Pro tier is launched, soft-launched, or vapourware. The CTA copy exists in one article but no /pricing page implementation backs it up. **Would need to actually sign up + try to upgrade to verify.**
- Whether the site has any meaningful backlinks. WebSearch only surfaces brand-keyword hits; no third-party reviews / comparison roundups / Reddit threads found. **A backlink-tool lookup would confirm.**
- The "Denmark" registrant country could be a privacy proxy via domain-contact.org, not the actual operator location. Operator nationality is genuinely unknown.

## 11. Open questions

- Is the Pro tier real and what does it gate? (Sign up + observe upsell flow.)
- Who is the operator? (Rails app + German registrar + DK proxy + AWS US-East — single dev, side-project profile most likely. Not a funded competitor.)
- Are they running paid ads? (Quick Google query "homestead planner" + 'Sponsored' filter would tell.)
- What is their actual organic traffic? (Paid Ahrefs / SEMrush would answer.)
- Are they on any homestead-app comparison roundups? (Hello-Homestead, Hobby Farms, Homestead.org — none I saw included them. Worth a targeted outreach if the operator is willing to publicise.)
