// ═══════════════════════════════════════════════════════════════════════════
// The Homestead Plan - Companion Planting database
// ═══════════════════════════════════════════════════════════════════════════
// Pairwise relationships documented by university extensions (WVU, UMN,
// Cornell, NC State, UC IPM, Maryland, Utah State), Louise Riotte's
// Carrots Love Tomatoes, Mel Bartholomew's Square Foot Gardening, and
// peer-reviewed allelopathy literature. Neutral pairs are NOT listed.
//
// Each entry: { a, b, rel: "good"|"bad", reason: "≤ one sentence mechanism" }.
// Alphabetical order in the data file isn't required - the runtime lookup
// map normalises order so either argument order returns the same result.
//
// Variety sub-types (e.g. tomato_cherry) fall back to their parent via
// CROP_SYNONYMS from crops.js, so companion data stays DRY.
// ═══════════════════════════════════════════════════════════════════════════

import { CROP_SYNONYMS } from "./crops.js";

export const COMPANIONS = [
  // Tomato
  { a: "basil", b: "tomato", rel: "good", reason: "Basil volatiles (eugenol, linalool) repel thrips, aphids, hornworms." },
  { a: "carrot", b: "tomato", rel: "good", reason: "Root-depth stacking: carrot taproot goes deep, tomato roots spread shallow." },
  { a: "parsley", b: "tomato", rel: "good", reason: "Parsley flowers attract hoverflies and parasitoid wasps that prey on aphids." },
  { a: "chives", b: "tomato", rel: "good", reason: "Allium volatiles mask tomato scent from aphids; flowers bring pollinators." },
  { a: "asparagus", b: "tomato", rel: "good", reason: "Asparagus roots exude asparagusic acid, toxic to root-knot nematodes." },
  { a: "lettuce", b: "tomato", rel: "good", reason: "Lettuce uses shade under tomato canopy without root competition." },
  { a: "garlic", b: "tomato", rel: "good", reason: "Sulfur compounds from garlic deter spider mites and aphids on tomato foliage." },
  { a: "onion", b: "tomato", rel: "good", reason: "Onion scent deters aphids and hornworm moths; different root depths." },
  { a: "rosemary", b: "tomato", rel: "good", reason: "Rosemary's camphor deters whiteflies and hornworm moths from tomato foliage." },
  { a: "broccoli", b: "tomato", rel: "bad", reason: "Both heavy feeders competing for nitrogen and calcium; brassicas stunt tomato." },
  { a: "cabbage", b: "tomato", rel: "bad", reason: "Heavy-feeder competition; cabbage allelochemicals reduce tomato vigor." },
  { a: "cauliflower", b: "tomato", rel: "bad", reason: "Heavy-feeder brassica competing for nitrogen; stunts tomato." },
  { a: "brussels_sprouts", b: "tomato", rel: "bad", reason: "Large brassica shades tomato and competes for nitrogen." },
  { a: "kohlrabi", b: "tomato", rel: "bad", reason: "Brassica heavy feeder; stunts tomato in shared bed (WVU Extension)." },
  { a: "corn", b: "tomato", rel: "bad", reason: "Share Helicoverpa zea (corn earworm / tomato fruitworm) populations." },
  { a: "potato", b: "tomato", rel: "bad", reason: "Share Phytophthora infestans (late blight); cross-infection devastates both." },
  { a: "dill", b: "tomato", rel: "bad", reason: "Mature dill releases coumarin that inhibits tomato seedling growth." },
  { a: "sweet_potato", b: "tomato", rel: "bad", reason: "Shared Fusarium and nematode pressure; sweet potato vines smother tomato base." },

  // Peppers
  { a: "basil", b: "bell_pepper", rel: "good", reason: "Basil VOCs disrupt pepper-seeking aphids and thrips; 10-20% yield lift reported." },
  { a: "basil", b: "hot_pepper", rel: "good", reason: "Basil essential oils mask pepper volatiles that aphids use to locate hosts." },
  { a: "bell_pepper", b: "onion", rel: "good", reason: "Onion sulfur compounds repel aphids and thrips; non-competing roots." },
  { a: "hot_pepper", b: "onion", rel: "good", reason: "Allium volatiles deter pepper aphids without crowding." },
  { a: "bell_pepper", b: "carrot", rel: "good", reason: "Carrot tops shade pepper root zone, conserving moisture." },
  { a: "bell_pepper", b: "parsley", rel: "good", reason: "Parsley umbels attract ladybugs and lacewings that eat pepper aphids." },
  { a: "eggplant", b: "hot_pepper", rel: "good", reason: "Hot pepper root exudates suppress Fusarium wilt that attacks eggplant." },
  { a: "bell_pepper", b: "spinach", rel: "good", reason: "Spinach fills cool-season gap below peppers; shallow roots don't compete." },
  { a: "bell_pepper", b: "broccoli", rel: "bad", reason: "Brassica and Solanaceae compete for calcium; worsens blossom-end rot." },
  { a: "bell_pepper", b: "cabbage", rel: "bad", reason: "Heavy-feeder brassica reduces pepper fruit set." },
  { a: "bell_pepper", b: "kohlrabi", rel: "bad", reason: "Brassica competition for nitrogen and calcium reduces pepper vigor." },
  { a: "broccoli", b: "hot_pepper", rel: "bad", reason: "Heavy-feeder brassica reduces pepper yield; shared flea beetle pressure." },

  // Eggplant
  { a: "eggplant", b: "green_beans_bush", rel: "good", reason: "Bush beans fix nitrogen for eggplant and repel Colorado potato beetle." },
  { a: "basil", b: "eggplant", rel: "good", reason: "Basil deters flea beetles and thrips that chew holes in eggplant foliage." },
  { a: "eggplant", b: "thyme", rel: "good", reason: "Thyme attracts parasitic wasps targeting eggplant flea beetle larvae." },
  { a: "dill", b: "eggplant", rel: "good", reason: "Dill flowers attract beneficial insects that prey on eggplant pests." },
  { a: "eggplant", b: "potato", rel: "bad", reason: "Share Colorado potato beetle and Verticillium wilt; cross-infestation accelerates." },

  // Cucumber
  { a: "cucumber", b: "radish", rel: "good", reason: "Radish pungent scent deters striped cucumber beetle; radishes mature early." },
  { a: "cucumber", b: "dill", rel: "good", reason: "Dill umbels attract hoverflies and parasitic wasps targeting cucumber aphids." },
  { a: "corn", b: "cucumber", rel: "good", reason: "Cornstalks provide living trellis for cucumber vines; shade reduces heat stress." },
  { a: "cucumber", b: "green_beans_pole", rel: "good", reason: "Pole beans fix nitrogen for cucumber; share trellis infrastructure." },
  { a: "cucumber", b: "green_beans_bush", rel: "good", reason: "Bush beans provide nitrogen to cucumbers without competing for trellis space." },
  { a: "cucumber", b: "oregano", rel: "good", reason: "Oregano repels cucumber beetles and attracts pollinators for fruit set." },
  { a: "cucumber", b: "peas_snap", rel: "good", reason: "Peas fix nitrogen and finish before cucumber sprawls to occupy space." },
  { a: "cucumber", b: "lettuce", rel: "good", reason: "Lettuce fills understory before cucumber canopy closes." },
  { a: "cucumber", b: "potato", rel: "bad", reason: "Share blight susceptibility; potato depletes potassium cucumber needs." },
  { a: "cucumber", b: "sage", rel: "bad", reason: "Sage aromatic oils inhibit cucumber vine growth and reduce fruit set." },
  { a: "cucumber", b: "mint", rel: "bad", reason: "Mint's menthone affects microtubules in neighbours; cucumber vines stunt." },
  { a: "cucumber", b: "sweet_potato", rel: "bad", reason: "Sweet potato steals potassium; sprawling vines tangle uncontrollably." },

  // Squash family (Three Sisters etc.)
  { a: "corn", b: "winter_squash", rel: "good", reason: "Three Sisters: squash leaves shade soil, retain moisture, suppress weeds." },
  { a: "green_beans_pole", b: "winter_squash", rel: "good", reason: "Three Sisters: beans fix nitrogen, squash provides living mulch for bean roots." },
  { a: "corn", b: "zucchini", rel: "good", reason: "Zucchini leaves shade corn root zone; corn provides partial shade for fruit." },
  { a: "corn", b: "summer_squash", rel: "good", reason: "Summer squash shades soil for corn; different root depths avoid competition." },
  { a: "radish", b: "zucchini", rel: "good", reason: "Radish repels squash vine borer and cucumber beetle that attack zucchini." },
  { a: "radish", b: "summer_squash", rel: "good", reason: "Radish deters squash bug and cucumber beetle; matures before squash sprawls." },
  { a: "radish", b: "winter_squash", rel: "good", reason: "Radish trap-crops flea beetles and deters squash bugs early in the season." },
  { a: "oregano", b: "zucchini", rel: "good", reason: "Oregano repels squash bugs and draws bees for zucchini pollination." },
  { a: "oregano", b: "summer_squash", rel: "good", reason: "Oregano aroma repels squash bugs and attracts pollinators." },
  { a: "potato", b: "winter_squash", rel: "bad", reason: "Heavy-feeder competition and shared soil-borne disease risk." },
  { a: "potato", b: "zucchini", rel: "bad", reason: "Heavy-feeder competition; potato harvest disturbs shallow squash roots." },
  { a: "potato", b: "summer_squash", rel: "bad", reason: "Nutrient competition and shared disease risk with potato family." },
  { a: "sweet_potato", b: "winter_squash", rel: "bad", reason: "Aggressive vines compete for space; tangled vines impossible at harvest." },
  { a: "sweet_potato", b: "zucchini", rel: "bad", reason: "Sweet potato outcompetes zucchini for space and nutrients." },

  // Carrot
  { a: "carrot", b: "onion", rel: "good", reason: "Onion scent repels carrot rust fly (classic Riotte pairing)." },
  { a: "carrot", b: "leek", rel: "good", reason: "Leek sulfur volatiles deter carrot rust fly; carrot tops shade leek shaft." },
  { a: "carrot", b: "garlic", rel: "good", reason: "Garlic sulfur scent confuses carrot rust fly egg-laying." },
  { a: "carrot", b: "shallot", rel: "good", reason: "Shallot allium volatiles mask carrot scent from rust fly." },
  { a: "carrot", b: "chives", rel: "good", reason: "Chive sulfur oils repel carrot rust fly and aphids." },
  { a: "carrot", b: "lettuce", rel: "good", reason: "Lettuce fills row gaps; shallow roots don't compete with taproot." },
  { a: "carrot", b: "rosemary", rel: "good", reason: "Rosemary camphor deters carrot rust fly per extension pairings." },
  { a: "carrot", b: "sage", rel: "good", reason: "Sage aromatic oils repel carrot rust fly; woody herb doesn't crowd roots." },
  { a: "carrot", b: "radish", rel: "good", reason: "Radish breaks soil compaction and harvests before carrots fill in." },
  { a: "carrot", b: "peas_snap", rel: "good", reason: "Peas fix nitrogen for carrot tops; pea trellis casts light shade in heat." },
  { a: "carrot", b: "dill", rel: "bad", reason: "Dill cross-pollinates with carrot (both Apiaceae) making bitter seed." },
  { a: "carrot", b: "parsley", rel: "bad", reason: "Share carrot rust fly and aphid pressure; Apiaceae allelopathy." },
  { a: "carrot", b: "cilantro", rel: "bad", reason: "Apiaceae cross-pollination risk and shared pest vulnerability." },

  // Beet
  { a: "beet", b: "onion", rel: "good", reason: "Onion repels leaf miners that damage beet greens." },
  { a: "beet", b: "garlic", rel: "good", reason: "Garlic deters aphids and leaf miners on beet tops." },
  { a: "beet", b: "lettuce", rel: "good", reason: "Lettuce shades beet soil, conserving moisture for root development." },
  { a: "beet", b: "cabbage", rel: "good", reason: "Beet adds magnesium and potassium that cabbage draws on heavily." },
  { a: "beet", b: "broccoli", rel: "good", reason: "Beet greens contribute minerals; different root depths avoid competition." },
  { a: "beet", b: "kohlrabi", rel: "good", reason: "Non-competing root zones; shared cool-season timing." },
  { a: "beet", b: "green_beans_bush", rel: "good", reason: "Bush beans fix nitrogen for beet greens without shading crowns." },
  { a: "beet", b: "green_beans_pole", rel: "bad", reason: "Pole beans suppress beet growth (West Coast Seeds, Mother Earth News)." },
  { a: "beet", b: "swiss_chard", rel: "bad", reason: "Same genus Beta vulgaris; share leaf miner and cercospora pressure." },

  // Radish
  { a: "lettuce", b: "radish", rel: "good", reason: "Lettuce shades radish soil, preventing bolt; radish breaks compaction." },
  { a: "radish", b: "spinach", rel: "good", reason: "Radish repels spinach leaf miner and flea beetle." },
  { a: "arugula", b: "radish", rel: "good", reason: "Radish breaks soil compaction for arugula; similar short cycle." },
  { a: "peas_snap", b: "radish", rel: "good", reason: "Peas fix nitrogen for radish greens; matched cool-season cycles." },
  { a: "peas_shell", b: "radish", rel: "good", reason: "Peas provide nitrogen boost; quick radish harvest clears bed." },
  { a: "kale", b: "radish", rel: "good", reason: "Radish trap-crops flea beetles away from kale leaves." },
  { a: "collards", b: "radish", rel: "good", reason: "Radish lures flea beetles off collards; quick harvest before fill-in." },

  // Alliums
  { a: "garlic", b: "strawberry", rel: "good", reason: "Garlic sulfur volatiles deter spider mites and aphids on strawberries." },
  { a: "cabbage", b: "garlic", rel: "good", reason: "Garlic scent repels cabbage moth (Cornell-documented reduction in worm damage)." },
  { a: "broccoli", b: "garlic", rel: "good", reason: "Garlic volatiles deter cabbage aphid and moth oviposition on broccoli." },
  { a: "onion", b: "strawberry", rel: "good", reason: "Onion scent masks strawberry volatiles, reducing slug and aphid attraction." },
  { a: "leek", b: "onion", rel: "good", reason: "Compatible alliums; leek's longer stems don't compete with onion bulb layer." },
  { a: "garlic", b: "green_beans_bush", rel: "bad", reason: "Allicin suppresses bean Rhizobium; Cornell showed 37% pod reduction within 12 inches." },
  { a: "garlic", b: "green_beans_pole", rel: "bad", reason: "Allicin from garlic roots inhibits nitrogen-fixing nodules on pole beans." },
  { a: "garlic", b: "peas_snap", rel: "bad", reason: "Sulfur compounds disrupt Rhizobium colonisation in pea roots." },
  { a: "garlic", b: "peas_shell", rel: "bad", reason: "Allium allicin suppresses pea nodulation; 20-40% yield reduction documented." },
  { a: "green_beans_bush", b: "onion", rel: "bad", reason: "Diallyl disulfide suppresses Rhizobium; bean biomass drops 20-40% within 12 inches." },
  { a: "green_beans_pole", b: "onion", rel: "bad", reason: "Allium sulfur compounds inhibit bean nitrogen-fixing bacteria." },
  { a: "onion", b: "peas_snap", rel: "bad", reason: "Onion allelochemicals suppress pea Rhizobium; stunted vines and poor pod set." },
  { a: "onion", b: "peas_shell", rel: "bad", reason: "Sulfur volatiles disrupt pea nodulation; reduced harvest consistently observed." },
  { a: "green_beans_bush", b: "leek", rel: "bad", reason: "Leek allium compounds inhibit Rhizobium in bean root nodules." },
  { a: "green_beans_pole", b: "leek", rel: "bad", reason: "Leek sulfur compounds suppress nitrogen-fixing bacteria on pole beans." },
  { a: "leek", b: "peas_snap", rel: "bad", reason: "Leek allicin inhibits pea nitrogen fixation in shared bed." },
  { a: "leek", b: "peas_shell", rel: "bad", reason: "Allium volatiles from leeks disrupt pea Rhizobium colonisation." },
  { a: "chives", b: "green_beans_bush", rel: "bad", reason: "Chive allicin suppresses bean nitrogen fixation, milder but real." },
  { a: "chives", b: "peas_snap", rel: "bad", reason: "Chives release sulfur compounds that inhibit pea Rhizobium nodulation." },
  { a: "asparagus", b: "garlic", rel: "bad", reason: "Allium family inhibits asparagus spear growth (classic Riotte avoidance)." },
  { a: "asparagus", b: "onion", rel: "bad", reason: "Onion suppresses asparagus growth; avoid shared beds." },
  { a: "green_beans_bush", b: "shallot", rel: "bad", reason: "Shallot allium sulfur compounds inhibit bean Rhizobium nodulation." },
  { a: "peas_snap", b: "shallot", rel: "bad", reason: "Allium compounds from shallot suppress pea nitrogen fixation." },

  // Leafy greens
  { a: "arugula", b: "lettuce", rel: "good", reason: "Shared cool-season conditions and matched harvest cycles." },
  { a: "arugula", b: "spinach", rel: "good", reason: "Matched cool-season timing; shallow roots fill bed without competition." },
  { a: "lettuce", b: "spinach", rel: "good", reason: "Shallow-rooted cool-season pair; spinach adds iron lettuce uses." },
  { a: "kale", b: "spinach", rel: "good", reason: "Kale canopy shades spinach and delays bolt." },
  { a: "basil", b: "lettuce", rel: "good", reason: "Basil repels aphids that attack lettuce; shares warm-season transition." },
  { a: "chives", b: "lettuce", rel: "good", reason: "Chive flowers attract hoverflies that eat lettuce aphids." },
  { a: "cilantro", b: "spinach", rel: "good", reason: "Cilantro umbels attract ladybugs and lacewings that eat spinach aphids." },
  { a: "cilantro", b: "lettuce", rel: "good", reason: "Cilantro attracts lacewings and parasitic wasps targeting lettuce aphids." },
  { a: "arugula", b: "carrot", rel: "good", reason: "Arugula fills row gaps and harvests before carrots mature." },
  { a: "lettuce", b: "mint", rel: "bad", reason: "Mint menthone suppresses neighbour root development; aggressive rhizomes crowd." },

  // Brassicas
  { a: "cabbage", b: "dill", rel: "good", reason: "Dill umbels attract Trichogramma wasps that parasitize cabbage worm eggs." },
  { a: "broccoli", b: "dill", rel: "good", reason: "Dill flowers host parasitic wasps targeting cabbage aphid and looper." },
  { a: "cauliflower", b: "dill", rel: "good", reason: "Dill attracts beneficial wasps that eat imported cabbageworm." },
  { a: "brussels_sprouts", b: "dill", rel: "good", reason: "Dill umbels feed Trichogramma that parasitize cabbage moth eggs." },
  { a: "cabbage", b: "sage", rel: "good", reason: "Sage volatiles repel cabbage moth and black flea beetle on cabbage." },
  { a: "broccoli", b: "sage", rel: "good", reason: "Sage repels cabbage moth from broccoli; masking documented by extensions." },
  { a: "cabbage", b: "rosemary", rel: "good", reason: "Rosemary camphor masks brassica scent from cabbage moth and looper." },
  { a: "broccoli", b: "rosemary", rel: "good", reason: "Rosemary deters cabbage moth oviposition on broccoli heads." },
  { a: "cabbage", b: "thyme", rel: "good", reason: "Thyme repels cabbage moth; low-growing herb doesn't shade cabbage." },
  { a: "broccoli", b: "thyme", rel: "good", reason: "Thyme deters cabbage aphid and whitefly on broccoli." },
  { a: "cabbage", b: "oregano", rel: "good", reason: "Oregano repels cabbage moth and attracts pollinators." },
  { a: "broccoli", b: "oregano", rel: "good", reason: "Oregano volatiles repel cabbage looper from broccoli foliage." },
  { a: "cabbage", b: "onion", rel: "good", reason: "Onion scent repels cabbage maggot fly (UMN-documented reduction)." },
  { a: "broccoli", b: "onion", rel: "good", reason: "Onion sulfur compounds deter cabbage root maggot and aphid." },
  { a: "cauliflower", b: "onion", rel: "good", reason: "Onion volatiles repel cabbage maggot fly from cauliflower roots." },
  { a: "brussels_sprouts", b: "onion", rel: "good", reason: "Onion scent deters cabbage moth and root maggot." },
  { a: "kohlrabi", b: "onion", rel: "good", reason: "Onion volatiles repel cabbage maggot without shading kohlrabi stem." },
  { a: "broccoli", b: "potato", rel: "good", reason: "Different root zones; mutual flavour improvement per extension." },
  { a: "cabbage", b: "potato", rel: "good", reason: "Compatible root depths and mutual flavour improvement documented." },
  { a: "cabbage", b: "strawberry", rel: "bad", reason: "Strawberry stunted near brassicas; shared aphid and slug pressure." },
  { a: "broccoli", b: "strawberry", rel: "bad", reason: "Brassica cruciferous compounds inhibit strawberry runners and fruit." },
  { a: "cauliflower", b: "strawberry", rel: "bad", reason: "Brassica root exudates stunt strawberry growth." },
  { a: "brussels_sprouts", b: "strawberry", rel: "bad", reason: "Cruciferous compounds inhibit strawberry vigor; shared pest pressure." },
  { a: "kohlrabi", b: "strawberry", rel: "bad", reason: "Brassica allelochemicals stunt strawberry growth in shared bed." },

  // Legumes
  { a: "corn", b: "green_beans_pole", rel: "good", reason: "Three Sisters: corn trellises pole beans; beans fix nitrogen corn needs." },
  { a: "corn", b: "green_beans_bush", rel: "good", reason: "Bush beans fix nitrogen for corn's heavy demand." },
  { a: "corn", b: "peas_snap", rel: "good", reason: "Peas fix nitrogen for corn; finish before corn fills canopy." },
  { a: "corn", b: "peas_shell", rel: "good", reason: "Peas enrich soil nitrogen for corn before corn shade dominates." },
  { a: "green_beans_bush", b: "potato", rel: "good", reason: "Mutual pest defence: beans repel Colorado potato beetle, potato repels bean beetle." },
  { a: "green_beans_pole", b: "potato", rel: "good", reason: "Pole beans fix nitrogen for potato foliage and deter Colorado potato beetle." },
  { a: "carrot", b: "green_beans_bush", rel: "good", reason: "Beans fix nitrogen for carrot tops; different root depths." },
  { a: "carrot", b: "green_beans_pole", rel: "good", reason: "Pole bean nitrogen feeds carrot tops; non-competing root zones." },
  { a: "peas_snap", b: "turnip", rel: "good", reason: "Peas fix nitrogen for turnip greens; turnip repels aphids off pea vines." },
  { a: "peas_shell", b: "turnip", rel: "good", reason: "Peas enrich nitrogen; turnip acts as aphid deterrent for pea vines." },
  { a: "green_beans_bush", b: "turnip", rel: "good", reason: "Bush beans add nitrogen for turnip top growth; matched cool-season timing." },

  // Potato
  { a: "cilantro", b: "potato", rel: "good", reason: "Cilantro flowers attract beneficial insects that prey on Colorado potato beetle." },

  // Strawberry
  { a: "spinach", b: "strawberry", rel: "good", reason: "Spinach saponins deter strawberry pests; matched cool-season timing." },
  { a: "lettuce", b: "strawberry", rel: "good", reason: "Lettuce shades strawberry runners; harvests before strawberries fruit." },
  { a: "strawberry", b: "thyme", rel: "good", reason: "Thyme repels worms and attracts pollinators that boost strawberry set." },
  { a: "potato", b: "strawberry", rel: "bad", reason: "Share Verticillium and Phytophthora; 5-year rotation recommended." },
  { a: "strawberry", b: "tomato", rel: "bad", reason: "Share Verticillium wilt and Botrytis; cross-contamination weakens runners." },

  // Asparagus
  { a: "asparagus", b: "parsley", rel: "good", reason: "Parsley leaves repel asparagus beetle when interplanted." },
  { a: "asparagus", b: "basil", rel: "good", reason: "Basil deters asparagus beetle (well-documented in extension guides)." },
  { a: "asparagus", b: "dill", rel: "good", reason: "Dill attracts parasitic wasps that target asparagus beetle larvae." },

  // Herbs
  { a: "basil", b: "mint", rel: "bad", reason: "Mint essential oils suppress basil growth; both compete for moisture." },
  { a: "mint", b: "parsley", rel: "bad", reason: "Mint rhizomes overrun parsley; menthone inhibits root development." },
  { a: "chives", b: "mint", rel: "bad", reason: "Mint aggressive spread smothers chive clumps; allelopathic interference." },
  { a: "mint", b: "strawberry", rel: "bad", reason: "Mint rhizomes overrun strawberry runners; menthone inhibits fruit development." },
  { a: "mint", b: "rosemary", rel: "bad", reason: "Incompatible moisture needs; mint crowds rosemary's dry preference." },

  // Melons
  { a: "oregano", b: "watermelon", rel: "good", reason: "Oregano flowers attract bees required for watermelon pollination." },
  { a: "cantaloupe", b: "oregano", rel: "good", reason: "Oregano attracts pollinators for cantaloupe fruit set; repels beetles." },
  { a: "cantaloupe", b: "radish", rel: "good", reason: "Radish trap-crops cucumber beetle off cantaloupe vines." },
  { a: "radish", b: "watermelon", rel: "good", reason: "Radish repels cucumber beetle that vectors bacterial wilt in melons." },
  { a: "cantaloupe", b: "corn", rel: "good", reason: "Corn shelters cantaloupe vines from wind; afternoon shade reduces scald." },
  { a: "corn", b: "watermelon", rel: "good", reason: "Corn shelters watermelon from wind; different root depths coexist." },
  { a: "cantaloupe", b: "potato", rel: "bad", reason: "Potato digging disrupts cantaloupe shallow roots; shared fungal disease risk." },
  { a: "potato", b: "watermelon", rel: "bad", reason: "Heavy-feeder competition; potato harvest damages watermelon roots." },

  // Regional additions
  { a: "basil", b: "okra", rel: "good", reason: "Basil volatiles deter aphids and stink bugs off okra pods." },
  { a: "green_beans_bush", b: "okra", rel: "good", reason: "Bush beans fix nitrogen for okra's heavy summer feeding." },
  { a: "okra", b: "peas_snap", rel: "good", reason: "Early peas finish before okra sprawls; nitrogen handoff to warm-season okra." },
  { a: "bok_choy", b: "tomato", rel: "bad", reason: "Brassica competes for calcium; worsens tomato blossom-end rot." },
  { a: "bok_choy", b: "onion", rel: "good", reason: "Onion scent repels cabbage maggot fly and flea beetles from bok choy." },
  { a: "bok_choy", b: "dill", rel: "good", reason: "Dill umbels attract Trichogramma wasps that parasitize cabbage worm eggs on bok choy." },
  { a: "bok_choy", b: "strawberry", rel: "bad", reason: "Brassica root exudates stunt strawberry; shared aphid pressure." },
  { a: "cucumber", b: "daikon", rel: "good", reason: "Daikon trap-crops striped cucumber beetle and breaks soil compaction." },
  { a: "daikon", b: "zucchini", rel: "good", reason: "Daikon deters squash bug and cucumber beetle while breaking subsoil for squash roots." },
  { a: "carrot", b: "cowpea", rel: "good", reason: "Cowpea fixes nitrogen for carrot tops; heat-tolerant where regular peas fail." },
  { a: "corn", b: "cowpea", rel: "good", reason: "Three-Sisters analog: cowpea fixes nitrogen, corn trellises the vining types." },
  { a: "cowpea", b: "onion", rel: "bad", reason: "Allium volatiles suppress cowpea Rhizobium; reduces nitrogen fixation and pod set." },
  { a: "cowpea", b: "garlic", rel: "bad", reason: "Garlic allicin inhibits cowpea nitrogen-fixing nodules." },
  { a: "amaranth", b: "corn", rel: "good", reason: "Amaranth attracts predatory beetles that eat corn earworm eggs; similar upright habit." },
  { a: "amaranth", b: "onion", rel: "good", reason: "Onion deters aphids off amaranth leaves; amaranth adds biomass without shading." },
  { a: "bitter_melon", b: "onion", rel: "good", reason: "Onion scent masks bitter melon from cucumber beetle and aphids." },
  { a: "basil", b: "bitter_melon", rel: "good", reason: "Basil volatiles deter aphids and thrips that attack bitter melon vines." },
  { a: "bitter_melon", b: "potato", rel: "bad", reason: "Potato depletes potassium needed for bitter melon fruit set; shared wilt susceptibility." },

  // Parsnip + Rutabaga (new root crops)
  { a: "onion", b: "parsnip", rel: "good", reason: "Onion scent deters carrot rust fly which also attacks parsnip (same Apiaceae family)." },
  { a: "garlic", b: "parsnip", rel: "good", reason: "Garlic sulfur volatiles confuse carrot rust fly from parsnip foliage." },
  { a: "lettuce", b: "parsnip", rel: "good", reason: "Lettuce harvests before slow-growing parsnip fills in; shallow roots don't compete." },
  { a: "parsnip", b: "radish", rel: "good", reason: "Radish marks slow-to-germinate parsnip rows and breaks soil for taproot." },
  { a: "carrot", b: "parsnip", rel: "bad", reason: "Both Apiaceae; share carrot rust fly and leaf blight pressure." },
  { a: "dill", b: "parsnip", rel: "bad", reason: "Dill cross-pollinates with parsnip (both Apiaceae) making bitter seed." },
  { a: "onion", b: "rutabaga", rel: "good", reason: "Onion volatiles deter cabbage maggot and flea beetle from rutabaga." },
  { a: "beet", b: "rutabaga", rel: "good", reason: "Beet adds minerals that rutabaga draws on; different root depths coexist." },
  { a: "dill", b: "rutabaga", rel: "good", reason: "Dill umbels attract parasitic wasps that target rutabaga cabbage worms." },
  { a: "rutabaga", b: "strawberry", rel: "bad", reason: "Brassica root exudates stunt strawberry growth; shared slug pressure." },
  { a: "rutabaga", b: "tomato", rel: "bad", reason: "Brassica and Solanaceae compete for calcium; both heavy feeders." },

  // New-crop companions (2026-04 expansion)
  // Fennel - allelopathic to most crops (UNH, UC Master Gardeners)
  { a: "fennel", b: "tomato", rel: "bad", reason: "Fennel root exudates stunt tomato growth; isolate fennel outside the main bed." },
  { a: "fennel", b: "green_beans_bush", rel: "bad", reason: "Fennel allelopathy inhibits bean germination and nodulation in shared beds." },
  { a: "cilantro", b: "fennel", rel: "bad", reason: "Fennel and cilantro suppress each other's germination; neither sets quality seed nearby." },
  { a: "fennel", b: "kohlrabi", rel: "bad", reason: "Fennel allelopathy stunts kohlrabi stem swelling (West Coast Seeds, extension compilations)." },
  { a: "dill", b: "fennel", rel: "bad", reason: "Apiaceae cross-pollination produces bitter seed on both; avoid shared beds." },

  // Celery - leafy-shade + allium masking (UMN Extension)
  { a: "celery", b: "onion", rel: "good", reason: "Onion scent deters celery leaf-tier and aphids; different root depths coexist." },
  { a: "celery", b: "leek", rel: "good", reason: "Leek volatiles repel celery leaf miner; upright habits don't shade each other." },
  { a: "cabbage", b: "celery", rel: "good", reason: "Celery aromatic oils repel cabbage moth; mutual flavour improvement per UMN." },

  // Horseradish - classic potato defender (Mother Earth News + extension reviews)
  { a: "horseradish", b: "potato", rel: "good", reason: "Horseradish at potato-patch corners deters Colorado potato beetle and builds disease resistance." },
  { a: "cabbage", b: "horseradish", rel: "bad", reason: "Both Brassicaceae - share flea beetle and cabbage worm; rotate separately." },

  // Rhubarb - cabbage-compatible perennial corner (extension roundup, Cornell)
  { a: "cabbage", b: "rhubarb", rel: "good", reason: "Rhubarb broad leaves deter cabbage whites; mutual flavour pairing long-documented." },
  { a: "broccoli", b: "rhubarb", rel: "good", reason: "Rhubarb repels cabbage moth from broccoli heads; perennial edge-of-bed pairing." },

  // Blueberry - acid soil neighbours + pest masking (NCSU, Cornell Berry)
  { a: "blueberry", b: "strawberry", rel: "good", reason: "Both acidic-soil perennials; strawberry shades blueberry root zone without competing for nutrients." },
  { a: "blueberry", b: "thyme", rel: "good", reason: "Thyme ground cover retains soil moisture and repels Japanese beetle from blueberry foliage." },
  { a: "blueberry", b: "tomato", rel: "bad", reason: "Tomato prefers pH 6.5 while blueberry needs pH 4.5-5.2; shared bed forces a compromise that weakens both." },

  // Raspberry / Blackberry - bramble patch rules (NCSU Rubus portal, Cornell Berries)
  { a: "blackberry", b: "raspberry", rel: "bad", reason: "Share Verticillium wilt and raspberry cane borer; 50 ft separation or rotation recommended." },
  { a: "garlic", b: "raspberry", rel: "good", reason: "Garlic sulfur volatiles deter raspberry cane borer and Japanese beetle from brambles." },
  { a: "blackberry", b: "chives", rel: "good", reason: "Chive flowers attract pollinators and allium scent repels aphid vectors of cane blight." },

  // Jerusalem artichoke - isolate (NCSU Extension, Ohioline)
  { a: "jerusalem_artichoke", b: "tomato", rel: "bad", reason: "Tall sunchoke shades tomato and releases allelopathic compounds; dedicate a separate bed." },

  // Globe artichoke - tall perennial, benefits from understory herbs (UMass Amherst)
  { a: "globe_artichoke", b: "peas_snap", rel: "good", reason: "Peas fix nitrogen for artichoke's heavy-feeder crowns; finish before artichoke canopy closes." },

  // Malabar spinach - tropical climber (UF IFAS)
  { a: "basil", b: "malabar_spinach", rel: "good", reason: "Basil deters aphids off Malabar vines; shared heat-loving season and water needs." },
];

export const COMPANION_GROUPINGS = [
  { label: "Three Sisters", crops: ["corn", "green_beans_pole", "winter_squash"],
    note: "Traditional Haudenosaunee polyculture. Corn trellises beans, beans fix nitrogen, squash shades soil." },
  { label: "Carrot + allium bed", crops: ["carrot", "onion", "leek", "lettuce"],
    note: "Alliums repel carrot rust fly; lettuce fills row gaps; root-depth stacking avoids competition." },
  { label: "Salad + herbs bed", crops: ["lettuce", "spinach", "arugula", "basil", "cilantro"],
    note: "Quick cool-season rotations. Herbs attract beneficials and mask greens from aphids." },
  { label: "Tomato patch", crops: ["tomato", "basil", "parsley", "carrot", "chives"],
    note: "Basil deters hornworm and thrips; parsley and chives attract parasitic wasps; carrot uses deep root zone." },
  { label: "Brassica guild", crops: ["broccoli", "cabbage", "dill", "onion", "thyme"],
    note: "Dill draws Trichogramma wasps (parasitize cabbage worm eggs); onion repels root maggot; thyme masks scent." },
  { label: "Cucumber trellis bed", crops: ["cucumber", "corn", "radish", "green_beans_pole", "dill"],
    note: "Corn trellises cucumber and pole beans; radish repels striped cucumber beetle; dill attracts wasps." },
  { label: "Pepper + eggplant bed", crops: ["bell_pepper", "eggplant", "basil", "green_beans_bush", "oregano"],
    note: "Bush beans fix nitrogen and repel Colorado potato beetle; basil masks pepper VOCs from aphids." },
  { label: "Melon patch", crops: ["watermelon", "cantaloupe", "oregano", "radish", "corn"],
    note: "Oregano attracts pollinators; radish trap-crops cucumber beetle; corn shelters vines from wind." },
];

// O(1)-ish lookup keyed on "a|b" with alphabetical order. Variety sub-types
// (e.g. tomato_cherry) fall back to their parent via CROP_SYNONYMS so the
// companion data stays DRY across variety splits.
const COMPANION_MAP = (() => {
  const m = new Map();
  for (const c of COMPANIONS) {
    const [x, y] = c.a < c.b ? [c.a, c.b] : [c.b, c.a];
    m.set(`${x}|${y}`, { rel: c.rel, reason: c.reason });
  }
  return m;
})();

export function getCompanion(a, b) {
  const A = CROP_SYNONYMS[a] || a;
  const B = CROP_SYNONYMS[b] || b;
  if (A === B) return null;
  const [x, y] = A < B ? [A, B] : [B, A];
  return COMPANION_MAP.get(`${x}|${y}`) || null;
}
