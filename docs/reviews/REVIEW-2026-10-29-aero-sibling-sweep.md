# Review 2026-10-29: Aero-Calc sibling sweep (five defect shapes)

Verdict: NEEDS FIXES (0 CRITICAL / 0 HIGH / 2 MEDIUM / 10 LOW)
Baseline: `main` at `203ee11` (= live thehomesteadplan.com per CLAUDE.md), working tree clean before and after this review.
Product class: React calculator with a paid LLM plan tab and a static SEO/legal twin set.
Scope: exactly the five shapes named in the Aero-Calc full review of 2026-10-26 (M-1, M-2, L-1, L-2, L-3/L-7) and nothing broader. Standing rulings respected: hardiness zones 1, 2, 12 and 13 stay absent; the shipped `PLAN_SCHEMA` (Homestead/CLAUDE.md section 8) is the schema; the free Self-Sufficiency tab and the Preservation Planner stay zone-agnostic.
Verifications run (read-only, nothing in the repo changed):

- `npm test`: EXIT 0. Nine suites: load-quarantine 8/8, bounds + sanitisers 106/106, paywall mount chain 204/204 across 43 mounts, validate-key limits 57/57, generate licence gate 89/89, plan generation 52/52, analytics redaction 19/19, calc-golden 345/345, render drive 176/176.
- `vite build --outDir <scratchpad>/hs-dist`: EXIT 0 (built into the scratchpad so `dist/` and the tree stayed untouched).
- Headless Chrome (puppeteer-core 25.3.0, Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`) at 375 x 812, DPR 2, mobile emulation, Google Fonts ALLOWED and confirmed loaded (`document.fonts.check` true for Plus Jakarta Sans and DM Serif Display on all 12 pages): every `a`/`button` on the 12 static pages measured; the overflowing element located; the built app driven at 375 and 1280 for the same-tab link behaviour (footer click, Back, forward link).
- The engine lifted out of `src/App.jsx` by the calc-golden extractor and run from node over the scenarios the static pages quote (scratch `hs-engine.mjs`).
- Scratch scripts, outside the repo: `C:\Users\User\AppData\Local\Temp\claude\C--Users-User-ClaudeCodeN8N\48354d6f-6212-47aa-9c87-82d9d76d192e\scratchpad\hs-engine.mjs`, `hs-tap-measure.mjs` (JSON in `hs-tap-measure.json`), `hs-overflow-probe.mjs`, `hs-app-drive.mjs`, `hs-static-serve.mjs`, `homestead-npm-test.log`.

## Shape verdicts in one line each

1. M-1 shape (two state fields for one fact, an export reads the stale one): FINDINGS. M-1 (the downloaded report), L-8 (soil setup cost snapshot), L-9 (fresh share: model vs slider).
2. M-2 shape (static legal twins vs what the code does): FINDINGS. M-2 (privacy twin vs validator/generator), L-10 (copy residue).
3. L-2 shape (same-tab anchors on a stateful screen): FINDING. L-1 (eleven anchors, driven).
4. L-3 and L-7 shapes (static-page tap targets measured; figures vs engine; pins): FINDINGS. L-2, L-3, L-4, L-5, L-6.
5. L-1 shape (imported id trusted into a React key or lookup): ONE FINDING, otherwise clean. L-7 (bed ids). The `typeof === "number"` gate on `generatedAt` admits Infinity but has no consumer before a fresh generation overwrites it.

## Findings, most severe first

### [MEDIUM] M-1: the downloaded HTML report prints the live engine figures (family, crops, yields, harvest months, savings) next to a plan body written for the inputs at generation time, with no stale note in the file and no gate on the Download button (CONFIRMED by trace; M-1 shape)

File: `src/App.jsx:4688-4723` (`engineYields`, `engineHarvest`, `engineSavings` are `useMemo` over the LIVE `baseResults`, `frostDates`, `costSavings`), `:4762-4765` (`fingerprintStale`), `:4840-4848` (`downloadHtml` passes `plan` plus live `familySize`, `zoneStr`, frost strings, `gardenSqFt`, `cropNames`, `engineYields`, `engineHarvest`, `engineSavings`; `fingerprintStale` is not passed and not checked), `:5096-5101` (the on-screen banner "Your crop selection has changed since this plan was generated. Click Regenerate to update."), `:5106-5112` (`PlanRenderer` receives the same mix on screen), `:5665-5675` (`buildPlanReportHtml` meta block prints `familySize`, `zoneStr`, `cropNames` as given; a grep of the builder for "stale", "changed since" or "regenerat" returns nothing).

The defect in one sentence: the plan body and the live calculator state are two representations of one set of facts (household, crops, climate), and the export reads both without saying which half is current.

Failure scenario: a paying customer generates a plan at family size 4 with the Family Basics crops. They open Self-Sufficiency, change the family to 6 and add winter squash, return to Growing Plan. The screen shows the gold banner. They click Download anyway (the button sits inside the rendered plan, under the banner). The saved file's meta block reads "Family: 6" and "Crops (13)", its yield and harvest tables and the savings total are the 6-person, 13-crop figures, and the model's summary, bed layouts, succession table and tips were written for 4 people and 12 crops. The file carries no banner. That file is "the copy the customer keeps" (the comment at `:5680`).

Evidence: code path above; no drive was possible without a licence and an Anthropic call, so this is CONFIRMED by trace, not by effect. The repro for a fixer: stub `/api/generate` to return any valid plan, generate, change `familySize` on the Self-Sufficiency tab, download, open the file and read the meta block against the summary paragraph.

Fix direction (text only): either (a) disable Download while `fingerprintStale` is true and label the button "Regenerate first", or (b) snapshot the engine rows and the meta inputs into `planState` at generation time and render the report (and the on-screen plan) from that snapshot, so one set of inputs produces one document; in both cases pass `fingerprintStale` into `buildPlanReportHtml` and print the same banner sentence into the file when it is true. Pin: one render-drive row that generates, mutates `familySize`, and asserts the report HTML either refuses or carries the stale sentence.

### [MEDIUM] M-2: the public privacy twin describes a validator and generator that do not exist in this form: the device identifier is not hashed and is kept server-side for 30 days, IP addresses drive stored rate-limit counters, Upstash is not named, and "your plans are stored in your browser" is false for the paid plan body; "Last updated 17 April 2026" predates every one of those behaviours (CONFIRMED by reading the twins against the code; M-2 shape)

Files: `public/privacy.html:112` ("Effective 17 April 2026. Last updated 17 April 2026."), `:117`, `:132`, `:136-139`, `:151-154`, `:167`; `public/terms.html:102`, `:108`, `:131`; `public/refund.html:108`; `public/sitemap.xml` (lastmod 2026-05-18 for all three legal pages). Code: `src/App.jsx:920-935` (`validateKeyRemote` sends `key` and the raw LemonSqueezy `instance_id`), `api/validate-key.js:165-186` (`getIp` from `x-real-ip`; `hashKey` = sha256 of the KEY, first 16 hex), `:420` (`rateLimitOK(\`ip:${ip}\`)`, raw IP in the Upstash key name, `RL_IP_WINDOW_SEC` 600 at `:67`), `:239` with `:102` (`hhp:vk:ok:<keyhash>` kept `LICENCE_OK_TTL_SEC` = 30 days), `api/generate.js:874` with `:72` (`ip:${ip}` counter, 1 hour), `:450` with `:255` (`redis.set(instanceBindKey(licenceHash), instanceIdForLs, { ex: INSTANCE_BIND_TTL_SEC })`: the instance id stored IN CLEAR for 30 days), `:219` (`hhp:lk:ok:<keyhash>` 1 hour), `:67` (`hhp:rl:generate:lk:<keyhash>` 24 hours); `index.html:15` (`<script src="https://assets.lemonsqueezy.com/lemon.js" defer>` on every app load).

The drift, word for word:

- privacy.html:132 says the validator receives "Your licence key and a hashed identifier for your device". The client sends the LemonSqueezy instance id unhashed (`App.jsx:930-932`); the server hashes the licence KEY, not the device id, and stores the device id as the clear value of `hhp:instance:<keyhash>` for 30 days (`generate.js:450`). The policy's "Your rights" paragraph (`:167`) says clearing local storage "removes your saved plans, device identifier, and licence key from your device", which is true of the device and silent about the server copy.
- Nothing in privacy.html mentions IP addresses except Google's font logging (`:154`). Both API routes read the caller's IP (`validate-key.js:419`, `generate.js:873`) and write it into a stored counter key for 10 minutes and 1 hour respectively.
- The third-party list (`:150-155`) names LemonSqueezy, Anthropic, Vercel and Google Fonts. Upstash Redis, which holds the licence-key hashes, the device id and the IP counters, is not named. It is provisioned through the Vercel Marketplace (STATUS.md), but it is a separate processor.
- privacy.html:117 says "garden plans - lives in your browser's local storage on your device", `:167` says clearing storage "removes your saved plans", and terms.html:108 says "Your plans are stored in your browser's local storage on your device unless you choose to export them." Since 2026-04-20 the plan body is never written to local storage; only `{inputs, generatedAt, cropFingerprint}` are (`App.jsx:8226-8231`, CLAUDE.md section 12). A reload discards the plan and the customer regenerates. Driven: the built app at `#growing-plan` holds no `hhp_plan_v2` key before a generation.
- privacy.html:136-139, the generation row, says "neither the request nor the response is stored on our servers beyond what is required to deliver it back". True of the plan inputs; the same request also carries the licence key and device id (`generate.js:884-885`), whose hash, id and IP counter are the stored items above. The row lists the inputs but not that the licence key travels with them.
- The date. The plan-body change (2026-04-20), the canonical instance binding (2026-04-27), the per-licence buckets (2026-05-06) and the 30-day known-licence marker (2026-09-06/07) all postdate "Last updated 17 April 2026" on all three legal pages. `sitemap.xml` says 2026-05-18 for the same three pages, so even the metadata disagrees with the page.
- Precision point for the same attorney pass: `lemon.js` is requested from `assets.lemonsqueezy.com` on every load of the app by every visitor (`index.html:15`), before any purchase. The policy frames LemonSqueezy as "payments, licence keys, tax collection" (`:151`), which does not cover a script request that discloses the visitor's IP and user agent on a free visit. Google Fonts IS named here (unlike Aero), so that half is clean.

Why it matters: this is the only privacy policy the product has (the app has no in-app twin; its footer links to `/privacy.html`), it is indexed, linked from every 2026-09-28 page and from `llms.txt:32`, and it omits a persistent server-side device record and IP processing on a product sold from South Africa under POPIA. The "plans are stored" sentence also sets a customer expectation (the plan survives a reload) that the product does not meet, which is the user-facing half of L-1 below.

Fix direction (text only, wording attorney-gated as in Aero R3-5): a "Licence checks" paragraph naming the licence key, the LemonSqueezy-issued device id (kept 30 days on the server), the IP address used in a short-lived counter (10 minutes on validation, 1 hour on generation), and Upstash as the store; correct `:117`, `:167` and terms `:108` to say the plan inputs persist on the device and the plan body is regenerated or downloaded; one sentence on the LemonSqueezy script; move "Last updated" and the sitemap `lastmod` together.

### [LOW] L-1: eleven same-tab anchors on every screen, including one inside the rendered plan, leave the app without a prompt; a reader who comes back through a static page's "Back to the planner" link gets a new document and the generated plan body is gone (CONFIRMED, driven; L-2 shape)

File: `src/App.jsx:7393` (`/about.html`, header), `:7408` (`/blog/`, header), `:7802` (`/blog/`), `:7803` (`/homestead-planning-software/`), `:7822` (`/about.html`), `:7823` (`/contact.html`), `:7824` (`/privacy.html`), `:7825` (`/terms.html`), `:7826` (`/refund.html`) (footer, rendered under every tab), `:5557` (`<a href="/terms.html">Terms</a>` inside `PlanRenderer`, under the generated plan: "Full disclosure: see our Terms"), `:3877` (`href={CHECKOUT_URL}`, opened by the LemonSqueezy overlay handler, not a navigation). The only `target="_blank" rel="noopener noreferrer"` anchor is the Urban Root credit at `:7837`. The `beforeunload` handler at `:4530-4538` revokes the blob URL and sets no `returnValue`, so there is no prompt.

Classification of every anchor in `src/App.jsx` (grep `<a `): 17 hash anchors (`#self-sufficiency`, `#pricing`, `#home`, `#features`, `#how-it-works`, `#faq`, `#planting-dates`, footer calculator links) are in-app routes and keep state; 11 absolute-path anchors listed above navigate in the same tab with no `target`; 1 external anchor opens a new tab; 1 hidden download anchor (`:5115`).

Driven on the built bundle (375 and 1280, `#growing-plan`, zero page errors): set an in-memory marker, click the footer About link: document navigates to `/about.html`. Browser Back: the marker survives (bfcache restored the page). Click About again, then the about page's own "Back to the planner" link (`a.back[href="/"]`): new document, marker gone. The plan body lives only in React state (`planState.plan`, never persisted by design, CLAUDE.md section 12), so the same path discards a generated plan.

Why it matters: regenerating costs one of the 20 daily generations, about $0.06 of Anthropic credit and 20 to 40 seconds (the app's own copy at `:4800`). The inputs persist, so it is one click, but the customer was never told the plan would not survive the link, and the Terms link sits inside the plan itself. Also the user-facing side of M-2's "plans are stored" sentence.

Fix: `target="_blank" rel="noopener noreferrer"` on the eleven anchors (the footer credit already does this), or a `beforeunload` prompt gated on `planState.plan !== null`. One render-drive row asserting every `href^="/"` anchor carries `target="_blank"`.

### [LOW] L-2: on all twelve static pages every link except the CTAs is under the 44 px rule at 375 px; ten of the twelve footers have no padding at all and measure 16 px tall (CONFIRMED, measured with web fonts loaded; L-3 shape)

Files and CSS: `public/homestead-planning-software/index.html:199` (`footer a { display: inline-block; padding: 6px 2px; }`: links 33.4 px tall, e.g. Privacy 48.4 x 33.4, Terms 40.6 x 33.4, Blog 33.1 x 33.4), `:149` (`.crumbs a`: 126 x 16), header brand 217.2 x 39.6, two inline body links 21 px tall; `public/blog/index.html`, the five posts, `public/about.html`, `public/contact.html`, `public/privacy.html`, `public/terms.html`, `public/refund.html`: no `footer a` padding rule anywhere (contact.html:144 sets colour only), footer links 16 px tall (About 38.2 x 16, Privacy 44.4 x 16, Terms 36.6 x 16, Refund policy 84.7 x 16, Blog 29.1 x 16 on about.html); the five posts' `.cta-box a` (`how-many-tomato-plants-family-of-4.html:141-146`, `how-much-soil-for-4x8-raised-bed.html:96`) measures 184.1 x 43.8 (padding 10px 18px on a 14 px font: 0.2 px under); `.related` links 269 to 312 x 21; `.back` "Back to the Blog" 124.6 x 23.8 and "Back to the planner" 144.2 x 22.4 to 23.1; the 17 px header brand on the legal pages and blog index 153.9 x 27.2.

Measured totals: 115 interactive elements across the 12 pages, 94 under 44 px in at least one dimension, 21 pass (the `.cta` buttons at min-height 48 on the landing and about pages, the five blog-index article cards, the contact page's two buttons).

Fix: `footer a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 6px; }` on every static page; `.crumbs a` and the header brand the same rule; `.cta-box a { min-height: 44px; display: inline-flex; align-items: center; }`; `.back { min-height: 44px; display: inline-flex; align-items: center; }`. Body prose links can stay inline. Same leaf-rule shape as the app's L7 header fix at `src/App.jsx:7386-7400`.

### [LOW] L-3: the tomato blog post scrolls sideways at 375 px; its quick-reference table is 425 px wide with no scroll wrapper (CONFIRMED, measured; L-3 shape, mobile floor rule)

File: `public/blog/how-many-tomato-plants-family-of-4.html:123-131` (`table { width: 100%; ... }` with no `min-width` and no `overflow-x` wrapper), `:270-280` (the 6-column "Quick-reference plant counts for a family of 4" table, cells padded 11px 14px at 14.5 px).

Measured: `document.documentElement.scrollWidth` 441 at a 375 px viewport (the table's right edge is 441 px, width 425 px); with mobile emulation on, Chrome widens the layout viewport to 441 px, so a phone shows the whole article zoomed out. The other four posts, the blog index, about, contact and the three legal pages measure 375/375. The landing page's 520 px table sits inside `.tablewrap { overflow-x: auto }` (`index.html:186-187`) and the document stays at 375, which is the pattern to copy.

Fix: wrap both tables in the post (`:208`, `:271`) in the landing page's `.tablewrap`, or set `table { display: block; overflow-x: auto; }` for the post.

### [LOW] L-4: nothing pins the static pages' printed figures to the engine, and the one page whose figures have moved since it was written is the soil post: it says 22 bags where the Soil tab now prints 26 for the same bed (CONFIRMED by running the engine and by grep; L-7 shape)

Files: `public/homestead-planning-software/index.html:231-233` and `public/llms.txt:10` (798 plants, 35.9 %, $815.40); `public/blog/how-much-soil-for-4x8-raised-bed.html:132` ("That works out to 22 bags at the standard 1.5 cu ft bag size"), `:139` ("12 inches deep: 32 cu ft (22 bags)"), `:185` ("1.5 cu ft (standard US) ... 22 bags"), `:188` ("50L sack ... 19 bags"), `:164-172` (the depth table's 50L column: 10, 13, 16, 19, 23, 28, 37); `tests/*.mjs` and `scripts/*.mjs`: zero references to `homestead-planning-software`, `llms.txt`, `public/blog`, `about.html` or `privacy.html`.

Evidence, engine run on the shipped source: Family Basics, family of 4, fresh + preserving, 300 lb: `totalPlants` 798, `rawSelfSufficiencyPct` 35.9167, `computeSavingsRows(...).totalSavings` 815.4. The landing page and `llms.txt` MATCH today, and the preset is the 12 crops the page names (tomatoes, potatoes, carrots, onions, bush beans, lettuce are all in it). Soil, 4 x 8 ft at 12 in, Classic 60/30/10 at default prices: raw 32.0 cu ft, settled 36.8 cu ft, cost incl. settling $187.68. The Soil tab bills bags per component on the settled volume (`src/App.jsx:2208-2235`, `Math.ceil(c.cuftWithSettling / size)`): 1.5 cu ft bags 15 + 8 + 3 = 26 (post: 22); 1 cu ft 23 + 12 + 4 = 39 (post: 32); 2 cu ft 12 + 6 + 2 = 20 (post: 16); 50 L 13 + 7 + 3 = 23 (post: 19). The post's own settling paragraph (`:197`, "36.8 cu ft ... 25 bags at 1.5 cu ft") is on the app's basis; its headline, lede, depth table and bag table are on the raw basis the app abandoned on 2026-09-06 (engineering H-3, CLAUDE.md section 7). The landing page itself promises "bag counts and cost, all including a 15 % settling allowance".

Failure scenario: a reader opens the post, reads "22 bags", taps "Open the calculator" (`href="/#soil"`), enters the same 4 x 8 x 12 bed and reads 26 bags with "incl. settling" beside every figure. Two Urban Root numbers for one bed.

Fix: a tenth suite that reads the landing page, `llms.txt` and the five posts, extracts the figures beside their labels, and compares each to the engine on the stated inputs (the scratch `hs-engine.mjs` is a working start); re-base the soil post's bag figures on the settled volume or label the table "before the 15 % settling allowance".

### [LOW] L-5: the tomato post says its yield table is "the conservative-end planning yields we use across the Homestead Plan database" and then prints a cherry yield 3.3x the database's, and its headline plant counts are not what the calculator returns for the family and goals it names (CONFIRMED against `src/data/crops.js` and the engine; L-7 shape)

File: `public/blog/how-many-tomato-plants-family-of-4.html:206` (the claim), `:213` ("Cherry (Sungold, Sweet 100) 10 lb / plant ... 4 sq ft"), `:214` ("Paste / sauce ... 6 lb / plant ... 3 sq ft"), `:212` ("Determinate slicing ... 5 lb / plant ... 3 sq ft"), `:196-198` and `:270-280` (6 / 14 / 36 plants, 24 / 52 / 120 sq ft for fresh only, fresh + light preserving, full year). Database: `src/data/crops.js:92` `tomato_cherry` `yieldPerPlantLbs: [3, 6]` at 4 sq ft; `:101-104` `tomato_paste` `[5, 8]` at 4 sq ft; `:116` `tomato_determinate` `[5, 7]` at 2.25 sq ft; `:81-83` `tomato` `[8, 12]` at 4 sq ft, 25 lb per person (these two MATCH the post).

Engine, family of 4, frequency weekly: general tomatoes alone 7 / 10 / 13 plants (28 / 40 / 52 sq ft) for fresh only / fresh + preserving / full year; general + cherry + paste selected together 18 / 26 / 34 plants (72 / 104 / 136 sq ft). The post's 6 / 14 / 36 come from its own cherry-at-10-lb and paste-at-6-lb arithmetic, not from the database it cites. The post's CTA (`:258-262`) sends the reader to the calculator "then returns the plant count".

Fix: either change `:206` to say the table is the article's own planning yields and name them as such, or re-cut the table and the quick-reference rows from `CROPS` and let the L-4 suite pin them.

### [LOW] L-6: the companion post tells readers strawberries beside tomatoes are "otherwise no concern" while the in-app checker rates the pair bad (CONFIRMED against `src/data/companions.js`; L-7 shape)

File: `public/blog/companion-planting-for-tomatoes.html:269` ("Strawberries hate tomatoes: appears to be folklore. ... otherwise no concern."). Data: `COMPANIONS` carries `{ a: "strawberry", b: "tomato", rel: "bad", reason: "Share Verticillium wilt and Botrytis; cross-contamination weakens runners." }`.

Also measured against the data: 4 of the post's "12 good neighbours" (marigold, borage, nasturtium, calendula) are not crops the checker knows, so a reader cannot reproduce them in the app; sage is neutral in the data and the post says so (clean); the post's "5 to keep well away" (brassicas, fennel, dill, walnut, corn and potatoes) are all bad in the data where they exist, but the data holds 15 bad pairs for tomato and the post omits seven (sweet potato, kohlrabi, bok choy, rutabaga, blueberry, Jerusalem artichoke, strawberry). The 230 pairings / 82 crops counts on the post, the landing page, about.html and llms.txt MATCH (`COMPANIONS.length` 230, `Object.keys(CROPS).length` 82).

Fix: reword `:269` to match the checker's verdict (the mechanism the post names IS the checker's reason), and let the L-4 suite assert every named pair against `COMPANIONS`.

### [LOW] L-7: the beds loader keeps whatever `id` the stored JSON carries, with no type or uniqueness check, so two beds with one id share one React key and one Length edit or one Remove click acts on both (CONFIRMED by trace; needs a hand-edited `hhp_beds`; L-1 shape)

File: `src/App.jsx:7926-7957` (`{ ...def, ...b, lengthFt: sanitizeNum(...), ... }`: every numeric field is clamped, `shape` is allow-listed, `id` is spread straight from `b`), `:385-388` (`DEFAULT_BED` ids `bed_<session>_<n>`), `:2053` (`<BedEditor key={bed.id} ...>`), `:2004` (`updateBed` maps every bed whose `id === id`), `:1995-1999` (`removeBed` filters every bed with that id and does nothing when the result is empty).

Scenario: `hhp_beds` holds two rect beds with `"id": "x"` (or both `null`). React warns about duplicate keys and reconciles by position; typing a new length into the first card patches both; Remove on one removes both, and with only those two present the filter returns `[]` so `removeBed` silently does nothing. No import feature exists (STATUS.md), so the only door is a hand-edited or corrupted store; the loader otherwise sanitises every field around the id.

The `typeof === "number"` half of the shape: `:8154` (`generatedAt = typeof saved.generatedAt === "number" ? saved.generatedAt : null`) admits `1e999` (JSON parses it to Infinity), negatives and 1e300, but the only readers are the persist effect (`:8226-8231`) and surfaces that render after a fresh `Date.now()` overwrites it (`:8845`), so no visible effect. Clean, noted so it is not re-audited.

Fix: `id: typeof b.id === "string" && b.id.length <= 64 ? b.id : def.id`, then a dedupe pass that re-mints duplicates; one bounds-suite row with two equal ids.

### [LOW] L-8: the Cost Savings setup cost is a snapshot of the Soil tab's total; later bed edits move the Soil bill and not the break-even, and nothing flags the two as different (CONFIRMED by trace; M-1 shape, design choice to confirm)

File: `src/App.jsx:6502-6520` (`soilCostEstimate`, live from `beds` and `soilState`), `:6535` (`fillSoilCost` writes it into `setupCosts`), `:6698` (the button "Use Soil Calculator total ({currency}{soilCostEstimate})" shows the live figure beside the stored one). The break-even months and ROI read the stored copy.

Scenario: the customer clicks the button at $187.68, then adds two beds on the Soil tab ($563.04). Cost Savings still reads break-even on $187.68; the button now says "Use Soil Calculator total ($563)" but no sentence says the stored figure is stale. Same pair-with-no-link shape as Aero M-1, lower stakes (no safety line).

Fix: a one-line note when `setupCosts.soil !== soilCostEstimate` after a prefill ("Soil tab now totals $563; this field holds $188"), or store a `soilFromCalc: true` flag and follow the live total until the field is hand-edited.

### [LOW] L-9: the paid plan's Preservation guide prints the model's fresh share while the Preservation Planner prints the customer's slider, and the prompt never carries the slider or the per-crop method choices (CONFIRMED by trace; M-1 shape)

File: `api/generate.js:647-651` (`freshShare: { type: "string" }`, required), `:809` (sanitised to 32 chars), `:673-700` (`buildUserPrompt` carries no fresh share and no methods); `src/App.jsx:5452-5476` (the plan renders `Fresh: {p.freshShare}` and the model's `preservationMethods`), `:6975-7002` (the Preservation tab sizes jars on `preservation.freshPct`, default 30, and `methodChoice`), `:4542-4550` (`GrowingPlanTab` props: no `preservation`), `:4806-4836` (payload: no fresh share, no methods).

Scenario: the customer sets 50 % fresh and "freeze" for green beans on the Preservation tab, generates a plan: the plan's Preservation guide says "Fresh: 70%" and "can, dehydrate" for green beans. Two paid tabs, one crop, two splits. CLAUDE.md section 5 item 7 describes the guide as "model prose, over the app's jar counts"; the renderer prints no jar counts, so the model's share is the only figure on that card.

Fix: send `freshPct` and the per-crop method choices in the payload and in the prompt, or render the engine's split (`computePreservationForCrop`) on the plan card and keep the model's `note` only; the second keeps the "app owns every number" rule of the 2026-09-06 wave.

### [LOW] L-10: legal and contact copy residue: the old product name survives in the Terms and in both contact buttons, the article is doubled four times, the in-app FAQ's refund sentence contradicts itself and the refund page, and the Terms say "rolling" for a fixed window (CONFIRMED by reading; M-2 shape)

Files: `public/terms.html:115` ("The Homestead Harvest Planner is a one-time purchase that includes a fair-use allowance"), `public/contact.html:175` and `:180` (Gmail and mailto subjects `Homestead%20Harvest%20Planner%20support`); `public/privacy.html:7` (meta description "for the The Homestead Plan"), `:114` ("The The Homestead Plan is designed to work"), `public/terms.html:7`, `:104` ("your use of the The Homestead Plan"), `:106` ("The The Homestead Plan is a browser-based"); `src/App.jsx:3931` (FAQ: "48 hours after purchase, no questions asked, for technical failure or accidental duplicate purchases") against `public/refund.html:111` (conditions, no "no questions asked") and the paywall's unconditional "48-hour refund window" at `:3860` and `:4149`; `public/terms.html:118` ("20 plan generations per rolling 24-hour period") against `api/generate.js:168-170` (`INCR` plus `EXPIRE` on the first hit: a fixed window from the first generation, which is the more generous reading, so nobody is short-changed; wording only).

Fix: find-and-replace the old name and the doubled article; make the FAQ sentence the refund page's sentence; "per 24-hour window" in the Terms.

## Informational, not scored

- I-1 The feed-family post's "Yield per sq ft" table (`public/blog/feed-family-from-backyard-garden.html:168-182`) matches the database's plants-per-sq-ft on all 13 rows and its conservative yield-per-sq-ft on 1 of 13 (tomatoes 2.0). Examples: summer squash 2.5 vs database 0.56, winter squash 3.0 vs 0.5, bush beans 0.7 vs 2.7, kale 2.5 vs 1.5, peppers 1.2 vs 3.0. The post cites external references and does not claim the database, so this is a divergence to know about, not a defect.
- I-2 The zone-7 post's anchors match the engine: last frost 22 March, first frost 5 November (`ZONE_FROST_DATES[7]`, `src/App.jsx:421`), tomatoes indoors late January (engine 25 Jan) and transplanted the first week of April (engine 5 Apr), peppers and onions mid-January (engine 11 Jan), brassicas indoors mid-February (engine 8 Feb) and out in March week 2 (engine 8 Mar). Two dates differ from what the Planting Dates tab prints for zone 7: garlic "October week 1" (`:215`) against the engine's 2 November, and potatoes "around March 22" (`:164`) against the engine's 8 March. The post does not claim those come from the calculator.
- I-3 The landing page's 520 px comparison table scrolls inside its own wrapper and the document stays at 375 px; the 2026-09-28 record checked that page, the blog index and about.html for sideways scroll and did not check the five posts, which is how L-3 survived.
- I-4 `about.html` names a roadmap of unbuilt features; already recorded for Grant in `docs/seo/ai-visibility-2026-09-28.md` item 2. Not re-filed.
- I-5 The validator receives an optional `instance_name` (`api/validate-key.js:427`) that the client never sends; the server mints `browser-<random>` (`:594-596`). No personal data in the LemonSqueezy instance name.

## Verified clean (do not re-audit unless the code changes)

- Shape 5 beyond L-7: every other stored id or key is allow-listed on load: crop selection and frequencies (`:7903-7925`), companion bed and focus (`:8022-8031`), planting crops and sow methods (`:8034-8070`), crop-db filters and sort with `expandedId` reset (`:8071-8092`), price overrides and setup costs with `isStoredNumber` plus range (`:8093-8122`), plan inputs with option allow-lists and a finite-and-clamped `gardenSqFt` (`:8129-8166`), preservation choices against `preservationOptionsFor` (`:8169-8190`). No `key={}` in `src/App.jsx` reads an unvalidated stored id other than `bed.id`.
- Shape 1 beyond M-1, L-8, L-9: `familySize`, `goal`, `selection`, `producePerPerson`, `hemisphere`, `plantingState` are each one state field read by every tab; the plan's `gardenSqFt` override shows a "needs more than you have" banner when the derived area grows past it (`:4427-4475`, `:4683-4686`); the Cost Savings and Preservation tabs compute from live `baseResults`; the plan's frost strings come from the same `getFrostDates` the Planting Dates tab uses.
- Shape 2 beyond M-2, L-10: Anthropic, Vercel and Google Fonts are named with links; the generation row's input list matches the payload's non-licence fields; `currency` is received and deliberately not forwarded to Anthropic (`api/generate.js:549`); analytics `beforeSend` strips only `key` (`src/main.jsx:20-27`); no IP or key appears in any `console.*` call in either API file; the price $39.99, 3 devices and no expiry agree across the paywall, the FAQ, the Terms, the landing page and `llms.txt`.
- Shape 4 figures: 798 / 35.9 % / $815.40 (landing, `llms.txt`), 12 crops in Family Basics, 82 crops, 230 pairings, zones 3 to 11, 30 % path share, 15 % settling, 4 mix presets all match the shipped source. Eleven of twelve static pages have no sideways scroll at 375 px.
- Baseline suites exit 0 and the build exits 0 on `203ee11`.

## Blast radius and siblings to check

- M-1's shape (stale plan body beside live engine rows in an export): FaminePrep renders a model report with engine figures and a download; check whether its download is gated on an input change and whether the file names the inputs it was generated for.
- M-2's shape: Grow Room, Vertica and FaminePrep each store a device or instance id and an IP counter in Upstash; read each `public/privacy.html` for "hashed", for any IP sentence and for Upstash by name. Aero's 2026-10-28 fix added the "Licence checks" paragraph to its static twin; this product has no in-app twin, so the static page is the only copy to fix.
- L-1's shape: the fleet-wide grep is `<a href="/` without `target` in each `App.jsx`; Homestead's eleven are the largest set seen so far because the footer and header render on every tab.
- L-2 and L-3's shapes: every product's 2026-05-18 blog posts were written before the 2026-09-28 wave and were not in that wave's 375 px check; measure the posts, not only the new page.
- L-4 and L-5's shapes: any blog post that quotes bag counts, plant counts or yields "from our database" in a sibling; the 2026-09-06 engineering wave moved figures in all five products.

Read-only review. No file in the repository was created, changed or deleted other than this report.

## Fix record 2026-10-30

Grant: "Ok please push fixes to all". All twelve findings are fixed on branch `fix/sibling-sweep-2026-10-29`, cut from `main` at `203ee11`: thirteen commits plus this record. Nothing is pushed or merged, and the live generation endpoint was never called. Every finding was reproduced before it was fixed. The drives for M-1, L-1, L-8 and L-9 ran on a production build of `203ee11` with `/api/*` stubbed inside the browser and every other off-origin request aborted, then again on the branch's own build. Every new guard was proved red (exit 1) against the pre-fix source and against targeted mutants, then restored. No finding was refuted, so none is marked no_change_needed.

| Finding | Outcome | Commit | Reproduced | Pin, and the proof it can fail |
|---|---|---|---|---|
| M-1 | fixed | `f4cdcd9` | driven: family 4 to 6, Download, the file read "Family: 6" above a summary written for four, no notice | calc-golden M1s-1..6, M1r-1..5; plan-generation M1w-1..6. Four mutants exit 1; both suites exit 1 on `203ee11` |
| M-2 | fixed | `dead742` | read against both handlers | static-pages M2-1..17 (every retention period against the handler constants). Exit 1 on the pre-fix pages; one mutated period exits 1 |
| L-1 | fixed | `9d135ad` | driven: the footer Privacy link moved the app tab to /privacy.html and the plan left the screen | render-drive L1s-1..5, a census of every site-path anchor. Three mutants exit 1; exit 1 on the pre-fix source |
| L-2 | fixed | `f5657db` | measured, 78 controls under 44 px | measured after: 0 under 44 at 375 and at 1280; static-pages L2-1..2. A page without the rule exits 1 |
| L-3 | fixed | `73a9900` | measured, scrollWidth 441 | measured after: 375. The soil post's new six-column table is wrapped too |
| L-4 | fixed | `5af39df` (copy), `2d2e217` (suite) | engine run, 22 bags against 26 | static-pages S-1..21. Exit 1 on the pre-fix page; four mutated soil figures each exit 1 by name; SETTLING_BUFFER 1.2 fails 34 checks |
| L-5 | fixed | `365b342` | engine and crops.js against the page | static-pages T-1..28. Exit 1 on the pre-fix page; three mutated figures each exit 1 by name |
| L-6 | fixed | `f8b2fc2` | data against the page | static-pages C-1..9, every pair the post names. The old sentence exits 1 (C-7) |
| L-7 | fixed | `3f73bee` | through the REAL loader and SoilCalculator's REAL handlers: one Length edit changed both beds, Remove did nothing | bounds L7-1..8. Three mutants exit 1; six of eight fail on the pre-fix source |
| L-8 | fixed | `107b862` | driven: the button read $563 while the field and the break-even held $187.68, no note | bounds L8l-1..4 and L8w-1..2; render-drive L8p-1..4 and L8r-1..5. Five mutants exit 1; both suites exit 1 on the pre-fix source |
| L-9 | fixed | `f73ac5e` | driven: slider at 50, the plan printed the model's "Fresh: 70%" | calc-golden L9l, L9r; render-drive L9s-1..5 through the real GrowingPlanTab; plan-generation L9w-1..2. Five mutants exit 1; all three suites exit 1 on the pre-fix source |
| L-10 | fixed | `f355d5b` | read | static-pages L10-1..6. A restored "rolling" exits 1 |

### The choices the brief left open

- **M-1: a stale notice, not an inputs snapshot.** One top-level predicate, `planIsStale`, now decides "stale" for the on-screen banner and for the download. `buildPlanReportHtml` prints a notice above the details block that says which half of the file is current: the figures follow the live engine, the written advice does not. A snapshot would have printed different numbers in the file than on the screen and the Cost Savings tab, and it would have stored computed figures. With the notice, every number in the file matches the inputs printed beside it and the tabs. The banner and the file now share one sentence, "Your inputs have changed since this plan was generated." The old banner said "Your crop selection has changed", which was false when only the family size had moved.
- **L-8: a mismatch note.** The button records the figure it copied, `costSavings.soilPrefill`. While the field still holds that copy and the Soil total has moved, the tab names both figures and says the break-even and ROI use the old one. A typed figure draws no note. The record survives a reload, and Reset clears it.
- **L-9: print the slider value, not pass it to the prompt.** The screen and the report print the Preservation tab's `freshPct` through one function, `planFreshShareLabel`, with a sentence saying where the share comes from. This keeps the 2026-09-06 rule that the app owns every number, and it needs no server, prompt or schema change. The model's `freshShare` string stays in `PLAN_SCHEMA` (CLAUDE.md section 8 is the shipped schema) and is no longer rendered.
- **L-4: re-based, not relabelled.** Every quantity to buy carries the 15 % allowance, through the engine's own rule. One sentence explains why the Soil tab prints 26 for the Classic mix (it rounds each part up: 15 + 8 + 3), one more than the 25 bags a single product needs.
- **L-5: re-cut from the database.** The yield table is crops.js row for row. The quick answer, the scenarios and the quick-reference table are the calculator's own output for inputs the page names (three types at Weekly), and the page says a newly ticked crop starts on Sometimes.

### Measured, 375 x 812, DPR 2, web fonts loaded

| Control | Before (`203ee11`) | After |
|---|---|---|
| Footer links | 16 px tall on 11 pages, 33.4 on the landing page; "Blog" 29 px wide | 44 x at least 44 |
| Header brand | 27.2 / 39.6 / 40.8 px | 44 |
| "Back to ..." links | 22.4 to 23.8 | 44 |
| Related-guide links | 21 | 44 (two-line entries 54) |
| Post CTA buttons | 43.8 | 44 |
| Breadcrumb, landing "Read more" row | 16, 21 | 44 |
| All controls | 115 elements, 78 under 44 | 117 elements, 0 under 44 (19 inline prose links exempt, WCAG 2.5.8) |
| Tomato post scrollWidth | 441 (tables 425 and 383 px wide) | 375 (both tables scroll in 343 px boxes) |

### Numbers that moved

- **No paid engine figure moved.** SB-3 and SB-4 still pin 35.9167 % and $815.40, and the break-even reads the same field it always did.
- One paid surface changed source: the plan's "Fresh:" share is now the Preservation tab's slider (30 % by default), not the model's string.
- Free static pages moved to the engine's figures. Soil post at 12 in: 22 to 25 bags at 1.5 cu ft, 19 to 21 at 50 L, premium budget $160–$260 to $184–$294. Tomato post: 6 / 14 / 36 plants to 18 / 26 / 34; cherry yield 10 to 3 lb a plant, paste 6 to 5 lb.

### Gates on the branch tip

`npm test`: exit 0 over ten suites. load-quarantine 8, bounds 120 (was 106), paywall mount chain 204, validate-key limits 57, generate licence gate 89, plan generation 60 (was 52), analytics 19, calc-golden 363 (was 345), render drive 195 (was 176), and the new static-pages-figures 157. `npm run build`: exit 0, chunk `assets/index-Caxhn1Ta.js`. That chunk carries "Your inputs have changed since this plan was generated.", "The fresh share is the one set on your Preservation tab", "Your Soil tab now totals" and "Change-of-mind refunds after that window", plus eleven `target:"_blank",rel:"noopener noreferrer"` (the ten path links and the Urban Root credit). It no longer carries "no questions asked" or "Your crop selection has changed". The built static pages carry the M-2, L-4, L-5, L-6 and L-10 copy. The sitemap moves nine `lastmod` dates to 2026-10-30.

### Left on purpose

- `Homestead/CLAUDE.md` sits outside this repo and owes four deltas. Section 5 item 7: the fresh share is now the slider. Section 8: the plan-rate wording says "sliding window" for a fixed one. Section 14: the report prints a stale notice. Section 21: there are now ten suites.
- The paywall's "48-hour refund window" line is unchanged. It is the spec's copy and is not false. Only the FAQ contradicted refund.html.
- The refund policy text and its "Last updated" are unchanged. Only its meta description lost the doubled article.
- The two LemonSqueezy checkout anchors keep opening in the same tab. They open an overlay, their href is the deliberate fallback, and no plan exists behind the paywall. No licence, paywall or CSP code changed, so the live Buy gate is not owed by this branch.
- I-1 to I-5 stay informational. The suite pins only figures a page attributes to the app.
