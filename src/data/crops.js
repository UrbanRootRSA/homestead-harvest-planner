// ═══════════════════════════════════════════════════════════════════════════
// The Homestead Plan - Crop database
// ═══════════════════════════════════════════════════════════════════════════
// Single source of truth for every crop the planner knows about. Split out of
// App.jsx so the database can scale past ~100 entries without making the UI
// file unmanageable.
//
// Schema (all fields required unless noted):
//   name                         Display name
//   category                     "leafy" | "root" | "fruiting" | "legume" |
//                                "brassica" | "allium" | "herb" | "other"
//   season                       "warm" | "cool" | "perennial"
//   sowMethod                    "direct" | "transplant" | "either"
//   daysToMaturity               [min, max]  integer days
//   spacingSqFt                  number (Square Foot Gardening standard)
//   yieldPerPlantLbs             [low, high]  conservative-low to realistic-high
//   sunHours                     minimum direct sun hours per day
//   waterNeeds                   "low" | "moderate" | "high"
//   difficulty                   1-5  (1 = easiest)
//   avgConsumptionLbsPerPersonYear  US-centric default; user can override
//   groceryPricePerLb            US retail average (editable at runtime)
//   caloriesPer100g
//   preservation                 Array<"can"|"freeze"|"dehydrate"|"ferment"|
//                                      "root_cellar"|"sauce"|"fresh">
//   startIndoorsWeeks            weeks relative to last spring frost (nullable)
//   transplantWeeks              weeks relative to last spring frost (nullable)
//   directSowWeeks               weeks relative to last spring frost (nullable)
//   harvestStartWeeks            weeks after transplant/sow to first harvest
//   harvestDurationWeeks         how many weeks the harvest window lasts
//
// Optional fields:
//   varieties                    Informational comma-separated list of named
//                                cultivars. Not used in calculations; rendered
//                                in the crop database tab and detail cards.
//   parentCrop                   For variety sub-types (tomato_cherry parents
//                                to tomato). Companion lookups fall back to the
//                                parent when no direct pair is recorded.
//
// Sources: USDA PLANTS, Maryland / Iowa State / Utah State / Texas A&M / NC
// State / Penn State / Clemson / LSU AgCenter extensions, FAO Ecocrop, AVRDC
// World Vegetable Center, Louise Riotte's Carrots Love Tomatoes, Mel
// Bartholomew's Square Foot Gardening, Carleen Madigan's Backyard Homestead.
// All yield numbers err conservative-low.
// ═══════════════════════════════════════════════════════════════════════════

export const CROPS = {
  // ─── Fruiting ──────────────────────────────────────────────────────────
  tomato: {
    name: "Tomatoes (General)", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [60, 85], spacingSqFt: 4, yieldPerPlantLbs: [8, 12],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 25, groceryPricePerLb: 2.50, caloriesPer100g: 18,
    preservation: ["can", "freeze", "dehydrate", "sauce"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 12,
    varieties: "Better Boy, Early Girl, Beefsteak, Brandywine, Cherokee Purple, Mortgage Lifter",
  },
  tomato_cherry: {
    name: "Tomatoes (Cherry)", category: "fruiting", season: "warm", sowMethod: "transplant",
    // Huge fruit count but lower total weight; indeterminate vines.
    daysToMaturity: [55, 75], spacingSqFt: 4, yieldPerPlantLbs: [3, 6],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 4.50, caloriesPer100g: 18,
    preservation: ["dehydrate", "freeze", "sauce", "can"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 9, harvestDurationWeeks: 14,
    varieties: "Sungold, Sweet 100, Sweet Million, Black Cherry, Yellow Pear, Sun Sugar, Matt's Wild",
    parentCrop: "tomato",
  },
  tomato_paste: {
    name: "Tomatoes (Paste)", category: "fruiting", season: "warm", sowMethod: "transplant",
    // Meaty, low-water - preservation/sauce workhorses. Mostly determinate.
    daysToMaturity: [70, 85], spacingSqFt: 4, yieldPerPlantLbs: [5, 8],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 12, groceryPricePerLb: 2.25, caloriesPer100g: 18,
    preservation: ["can", "sauce", "dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 11, harvestDurationWeeks: 6,
    varieties: "San Marzano, Roma VF, Amish Paste, Opalka, Martino's Roma, Speckled Roman",
    parentCrop: "tomato",
  },
  tomato_determinate: {
    name: "Tomatoes (Determinate / Bush)", category: "fruiting", season: "warm", sowMethod: "transplant",
    // Bush habit, concentrated harvest window. Good for containers and canning batches.
    daysToMaturity: [55, 75], spacingSqFt: 2.25, yieldPerPlantLbs: [5, 7],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 15, groceryPricePerLb: 2.50, caloriesPer100g: 18,
    preservation: ["can", "freeze", "sauce"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 9, harvestDurationWeeks: 5,
    varieties: "Celebrity, Bush Early Girl, Patio, Silvery Fir Tree, Mountain Merit, Taxi",
    parentCrop: "tomato",
  },
  bell_pepper: {
    name: "Bell Peppers", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [60, 80], spacingSqFt: 1, yieldPerPlantLbs: [3, 5],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 10, groceryPricePerLb: 3.25, caloriesPer100g: 20,
    preservation: ["freeze", "dehydrate", "can"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 10,
    varieties: "California Wonder, Yolo Wonder, Cubanelle, Jimmy Nardello, Corno di Toro, Purple Beauty",
  },
  hot_pepper: {
    name: "Hot Peppers", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [70, 95], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 4.50, caloriesPer100g: 40,
    preservation: ["dehydrate", "ferment", "can", "freeze"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 11, harvestDurationWeeks: 10,
    varieties: "Jalapeño, Serrano, Habanero, Cayenne, Anaheim, Poblano, Thai, Ghost (Bhut Jolokia)",
  },
  cucumber: {
    name: "Cucumbers", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 70], spacingSqFt: 2, yieldPerPlantLbs: [5, 10],
    sunHours: 7, waterNeeds: "high", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 1.80, caloriesPer100g: 15,
    preservation: ["can", "ferment"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 8,
    varieties: "Marketmore 76, Boston Pickling, Lemon, Armenian, Straight Eight, Suyo Long, Persian",
  },
  zucchini: {
    name: "Zucchini", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [45, 60], spacingSqFt: 9, yieldPerPlantLbs: [6, 10],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 1.60, caloriesPer100g: 17,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 10,
    varieties: "Black Beauty, Cocozelle, Eight Ball, Costata Romanesco, Golden, Round de Nice",
  },
  summer_squash: {
    name: "Summer Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 65], spacingSqFt: 9, yieldPerPlantLbs: [5, 9],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 5, groceryPricePerLb: 1.80, caloriesPer100g: 16,
    preservation: ["freeze", "dehydrate", "can"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 10,
    varieties: "Yellow Crookneck, Pattypan (Scallop), Zephyr, Golden Zucchini, Early Prolific",
  },
  winter_squash: {
    name: "Winter Squash (Mixed)", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [85, 110], spacingSqFt: 16, yieldPerPlantLbs: [8, 20],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 1.40, caloriesPer100g: 45,
    preservation: ["root_cellar", "freeze", "can", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 13, harvestDurationWeeks: 6,
    varieties: "See butternut, acorn, spaghetti, pumpkin for specific types.",
  },
  butternut_squash: {
    name: "Butternut Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [85, 110], spacingSqFt: 16, yieldPerPlantLbs: [8, 15],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 1.20, caloriesPer100g: 45,
    preservation: ["root_cellar", "freeze", "can", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 13, harvestDurationWeeks: 4,
    varieties: "Waltham, Early Butternut, Burpee's Butterbush, Metro PMR",
    parentCrop: "winter_squash",
  },
  acorn_squash: {
    name: "Acorn Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [80, 100], spacingSqFt: 9, yieldPerPlantLbs: [4, 6],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.30, caloriesPer100g: 40,
    preservation: ["root_cellar", "freeze"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 12, harvestDurationWeeks: 4,
    varieties: "Table Queen, Honey Bear, Celebration, Carnival",
    parentCrop: "winter_squash",
  },
  spaghetti_squash: {
    name: "Spaghetti Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [85, 100], spacingSqFt: 9, yieldPerPlantLbs: [4, 6],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.20, caloriesPer100g: 31,
    preservation: ["root_cellar", "freeze"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 12, harvestDurationWeeks: 3,
    varieties: "Tivoli, Small Wonder, Vegetable Spaghetti, Hasta La Pasta",
    parentCrop: "winter_squash",
  },
  pumpkin: {
    name: "Pumpkin", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [95, 120], spacingSqFt: 25, yieldPerPlantLbs: [12, 30],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 0.80, caloriesPer100g: 26,
    preservation: ["root_cellar", "freeze", "can"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 14, harvestDurationWeeks: 4,
    varieties: "Jack Be Little (mini), Sugar Pie (pie), Howden (jack-o-lantern), Cinderella, Atlantic Giant",
    parentCrop: "winter_squash",
  },
  eggplant: {
    name: "Eggplant", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [70, 90], spacingSqFt: 2, yieldPerPlantLbs: [3, 6],
    sunHours: 8, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.40, caloriesPer100g: 25,
    preservation: ["freeze", "dehydrate", "ferment"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 11, harvestDurationWeeks: 10,
    varieties: "Black Beauty, Ichiban (Japanese), Rosa Bianca (Italian), Listada de Gandia, Fairy Tale",
  },
  bitter_melon: {
    name: "Bitter Melon", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [60, 90], spacingSqFt: 4, yieldPerPlantLbs: [3, 8],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.00, caloriesPer100g: 17,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: 3, directSowWeeks: 3,
    harvestStartWeeks: 9, harvestDurationWeeks: 10,
    varieties: "Large Top (Taiwanese), Chinese Green, Indian Green, White Pearl, Hybrid Bada",
  },
  okra: {
    name: "Okra", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 65], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 8, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 4.00, caloriesPer100g: 33,
    preservation: ["freeze", "can", "dehydrate", "ferment"],
    startIndoorsWeeks: -4, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 10,
    varieties: "Clemson Spineless, Red Burgundy, Emerald, Silver Queen, Jambalaya",
  },

  // ─── Leafy ─────────────────────────────────────────────────────────────
  lettuce: {
    name: "Lettuce (Leaf)", category: "leafy", season: "cool", sowMethod: "either",
    // Loose-leaf, cut-and-come-again types. For heading types see lettuce_head.
    daysToMaturity: [30, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 20, groceryPricePerLb: 2.75, caloriesPer100g: 15,
    preservation: ["fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 8,
    varieties: "Black Seeded Simpson, Red Sails, Salad Bowl, Grand Rapids, Lollo Rossa, Oak Leaf",
  },
  lettuce_head: {
    name: "Lettuce (Head)", category: "leafy", season: "cool", sowMethod: "either",
    // Butterhead, romaine, iceberg. Single harvest per plant.
    daysToMaturity: [55, 80], spacingSqFt: 1, yieldPerPlantLbs: [0.7, 1.2],
    sunHours: 4, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 10, groceryPricePerLb: 2.40, caloriesPer100g: 15,
    preservation: ["fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 4,
    varieties: "Buttercrunch, Little Gem, Parris Island Cos (romaine), Iceberg, Winter Density, Tom Thumb",
    parentCrop: "lettuce",
  },
  spinach: {
    name: "Spinach", category: "leafy", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 50], spacingSqFt: 0.11, yieldPerPlantLbs: [0.25, 0.4],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.50, caloriesPer100g: 23,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 6, harvestDurationWeeks: 6,
    varieties: "Bloomsdale Long Standing, Space, Olympia, Tyee, Red Kitten, Giant Nobel",
  },
  kale: {
    name: "Kale", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [55, 75], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 3.20, caloriesPer100g: 49,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 16,
    varieties: "Dwarf Blue Curled, Lacinato (Dinosaur / Tuscan), Red Russian, Winterbor, Redbor",
  },
  swiss_chard: {
    name: "Swiss Chard", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [50, 65], spacingSqFt: 0.25, yieldPerPlantLbs: [1, 2],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.20, caloriesPer100g: 19,
    preservation: ["freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 20,
    varieties: "Bright Lights (rainbow), Fordhook Giant, Ruby Red, Perpetual Spinach, Peppermint Stick",
  },
  collards: {
    name: "Collard Greens", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [60, 85], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 2.80, caloriesPer100g: 32,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 16,
    varieties: "Georgia Southern, Vates, Champion, Morris Heading, Flash",
  },
  arugula: {
    name: "Arugula", category: "leafy", season: "cool", sowMethod: "direct",
    daysToMaturity: [30, 45], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.1, 0.2],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 8.00, caloriesPer100g: 25,
    preservation: ["fresh"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 5, harvestDurationWeeks: 5,
    varieties: "Astro, Roquette, Wild (Sylvetta), Rocket, Apollo, Esmee",
  },
  bok_choy: {
    name: "Bok Choy", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [45, 60], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.50, caloriesPer100g: 13,
    preservation: ["ferment", "freeze"],
    startIndoorsWeeks: -4, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 6,
    varieties: "Joi Choi, Tatsoi, Canton Dwarf, Win-Win, Toy Choi, Black Summer",
  },
  amaranth: {
    name: "Amaranth (Callaloo)", category: "leafy", season: "warm", sowMethod: "either",
    daysToMaturity: [40, 70], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 4.00, caloriesPer100g: 23,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -4, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 6, harvestDurationWeeks: 10,
    varieties: "Red Leaf, Green Leaf, Callaloo (Caribbean), Garnet Red, Hopi Red Dye, Love Lies Bleeding",
  },
  mustard_greens: {
    name: "Mustard Greens", category: "leafy", season: "cool", sowMethod: "either",
    // Fast cool-season green; bolts in heat. Clemson HGIC + UMD.
    daysToMaturity: [40, 60], spacingSqFt: 0.25, yieldPerPlantLbs: [0.4, 0.8],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 3.00, caloriesPer100g: 27,
    preservation: ["freeze", "dehydrate", "ferment"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 6,
    varieties: "Florida Broadleaf, Southern Giant Curled, Red Giant, Green Wave, Mibuna",
  },
  mizuna: {
    name: "Mizuna", category: "leafy", season: "cool", sowMethod: "either",
    // Japanese mustard - feather-cut leaves, cut-and-come-again. Penn State.
    daysToMaturity: [35, 50], spacingSqFt: 0.25, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 8.00, caloriesPer100g: 21,
    preservation: ["fresh", "freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 5, harvestDurationWeeks: 8,
    varieties: "Kyoto Mizuna, Red Kingdom, Early Mizuna, Komatsuna, Ruby Streaks",
  },
  tatsoi: {
    name: "Tatsoi", category: "leafy", season: "cool", sowMethod: "either",
    // Rosette-form Brassica rapa. Cold-hardy to -9°C / 15°F. Johnny's + UMN.
    daysToMaturity: [21, 45], spacingSqFt: 0.25, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 6.00, caloriesPer100g: 15,
    preservation: ["fresh", "freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 5, harvestDurationWeeks: 8,
    varieties: "Standard Tatsoi, Rosie (purple), Savoy, Black Summer",
  },
  endive: {
    name: "Endive / Escarole", category: "leafy", season: "cool", sowMethod: "either",
    // Cichorium endivia. Curly endive (frisée) + broad escarole. UMN + OSU.
    daysToMaturity: [50, 95], spacingSqFt: 1, yieldPerPlantLbs: [0.6, 1.2],
    sunHours: 5, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.20, caloriesPer100g: 17,
    preservation: ["fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 5,
    varieties: "Green Curled Ruffec (endive), Broad-Leaved Batavian (escarole), Tres Fine, Salad King, Natacha",
  },
  sorrel: {
    name: "Sorrel", category: "leafy", season: "perennial", sowMethod: "either",
    // Rumex acetosa - lemony perennial green, 5-year stand. UMN Extension.
    daysToMaturity: [55, 70], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 10.00, caloriesPer100g: 22,
    preservation: ["freeze", "fresh"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 20,
    varieties: "Common Garden (Rumex acetosa), French (Rumex scutatus), Red-Veined (Bloody Dock), Profusion",
  },
  malabar_spinach: {
    name: "Malabar Spinach", category: "leafy", season: "warm", sowMethod: "transplant",
    // Basella alba - tropical vining heat-lover, 27°C+ for growth. UF IFAS + Wisconsin Hort.
    daysToMaturity: [65, 85], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 6, waterNeeds: "high", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 5.00, caloriesPer100g: 19,
    preservation: ["fresh", "freeze"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 14,
    varieties: "Green-stemmed (Basella alba), Red-stemmed (Basella rubra), Mary's Heirloom, Climbing Spinach",
  },

  // ─── Root ──────────────────────────────────────────────────────────────
  carrot: {
    name: "Carrots", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [60, 80], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.1, 0.2],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 1.40, caloriesPer100g: 41,
    preservation: ["root_cellar", "can", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 9, harvestDurationWeeks: 6,
    varieties: "Nantes, Danvers 126, Scarlet Nantes, Imperator, Chantenay, Paris Market, Purple Dragon",
  },
  beet: {
    name: "Beets", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [50, 70], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 2.00, caloriesPer100g: 43,
    preservation: ["can", "root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 6,
    varieties: "Detroit Dark Red, Chioggia (striped), Golden, Bull's Blood, Cylindra, Touchstone Gold",
  },
  radish: {
    name: "Radishes", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [22, 35], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.05, 0.1],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 2.20, caloriesPer100g: 16,
    preservation: ["ferment", "fresh"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 4, harvestDurationWeeks: 4,
    varieties: "Cherry Belle, French Breakfast, Easter Egg, White Icicle, Watermelon, Black Spanish",
  },
  daikon: {
    name: "Daikon Radish", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [50, 70], spacingSqFt: 0.25, yieldPerPlantLbs: [1, 2],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.50, caloriesPer100g: 18,
    preservation: ["ferment", "fresh", "root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
    varieties: "Japanese Long (Minowase), April Cross, Watermelon Radish, Miyashige, Summer Cross",
  },
  potato: {
    name: "Potatoes", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [80, 100], spacingSqFt: 1, yieldPerPlantLbs: [2, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 35, groceryPricePerLb: 1.10, caloriesPer100g: 77,
    preservation: ["root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 14, harvestDurationWeeks: 4,
    varieties: "Yukon Gold (all-purpose), Russet Burbank (baking), Red Pontiac (boiling), Kennebec (storage), Fingerling, Purple Majesty, All Blue",
  },
  sweet_potato: {
    name: "Sweet Potatoes", category: "root", season: "warm", sowMethod: "transplant",
    daysToMaturity: [95, 120], spacingSqFt: 1.33, yieldPerPlantLbs: [2, 4],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 7, groceryPricePerLb: 1.30, caloriesPer100g: 86,
    preservation: ["root_cellar", "can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: 3, directSowWeeks: null,
    harvestStartWeeks: 15, harvestDurationWeeks: 3,
    varieties: "Beauregard, Covington, Jewel, Purple (Stokes), Japanese (Murasaki), Georgia Jet",
  },
  onion: {
    name: "Onions", category: "root", season: "cool", sowMethod: "transplant",
    // Day-length matters: short-day (<35° latitude), long-day (>37° latitude),
    // day-neutral works across zones. Plant the wrong type for your latitude = no bulbs.
    daysToMaturity: [90, 120], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 20, groceryPricePerLb: 1.20, caloriesPer100g: 40,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: -10, transplantWeeks: -3, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 4,
    varieties: "Walla Walla (long-day), Yellow Granex / Vidalia (short-day), Texas Grano (short-day), Candy (day-neutral), Red Wing (long-day), Ailsa Craig",
  },
  turnip: {
    name: "Turnips", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.60, caloriesPer100g: 28,
    preservation: ["root_cellar", "ferment", "can"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 4,
    varieties: "Purple Top White Globe, Hakurei (Japanese salad), Golden Ball, Shogoin, Seven Top (greens)",
  },
  parsnip: {
    name: "Parsnips", category: "root", season: "cool", sowMethod: "direct",
    // Taproot - transplants poorly. Slow to germinate (2-3 weeks). Flavor
    // sweetens after first frost. UK / Northern-European staple.
    daysToMaturity: [100, 130], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 2.40, caloriesPer100g: 75,
    preservation: ["root_cellar", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 18, harvestDurationWeeks: 8,
    varieties: "Hollow Crown, Harris Model, Gladiator (hybrid), All American, Andover",
  },
  rutabaga: {
    name: "Rutabaga (Swede)", category: "root", season: "cool", sowMethod: "direct",
    // Cross between turnip and cabbage; botanically a brassica. UK "swede".
    // Summer-sown for late-fall harvest; improves after frost.
    daysToMaturity: [85, 100], spacingSqFt: 0.25, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 1.20, caloriesPer100g: 37,
    preservation: ["root_cellar", "ferment", "can"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 6,
    harvestStartWeeks: 12, harvestDurationWeeks: 6,
    varieties: "American Purple Top, Laurentian, Joan, Marian, Helenor",
  },
  horseradish: {
    name: "Horseradish", category: "root", season: "perennial", sowMethod: "transplant",
    // Armoracia rusticana - dig roots year 1+, spreads aggressively. USU + UMN + Penn State.
    // Use a buried-bucket bed or expect it to naturalise.
    daysToMaturity: [140, 180], spacingSqFt: 1, yieldPerPlantLbs: [1, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 6.00, caloriesPer100g: 48,
    preservation: ["root_cellar", "ferment", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: -4, directSowWeeks: null,
    harvestStartWeeks: 24, harvestDurationWeeks: 8,
    varieties: "Common (Maliner Kren), Bohemian, Big Top Western, Sass (vigorous)",
  },
  jerusalem_artichoke: {
    name: "Jerusalem Artichoke (Sunchoke)", category: "root", season: "perennial", sowMethod: "direct",
    // Helianthus tuberosus - plant tubers spring, harvest after frost. NCSU + OSU.
    // Allelopathic and invasive - isolate to its own bed.
    daysToMaturity: [110, 150], spacingSqFt: 1, yieldPerPlantLbs: [1, 2.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 4.50, caloriesPer100g: 73,
    preservation: ["root_cellar", "ferment", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 20, harvestDurationWeeks: 12,
    varieties: "Stampede (early), Red Fuseau, White Fuseau, Brazilian, Dwarf Sunray, Jack's Copperclad",
  },
  ginger: {
    name: "Ginger", category: "root", season: "warm", sowMethod: "direct",
    // Zingiber officinale - tropical rhizome, 8-10 month cycle. Container crop below zone 9.
    // Use 5-gal+ pots. Texas A&M + VCE + CTAHR Hawaii.
    daysToMaturity: [240, 300], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 5, waterNeeds: "high", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 4.50, caloriesPer100g: 80,
    preservation: ["freeze", "dehydrate", "ferment", "root_cellar"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 32, harvestDurationWeeks: 4,
    varieties: "Baby Ginger (young), Hawaiian Yellow, Indian Blue Ring, Chinese White, Madagascar",
  },

  // ─── Legume ────────────────────────────────────────────────────────────
  green_beans_bush: {
    name: "Green Beans (Bush)", category: "legume", season: "warm", sowMethod: "direct",
    daysToMaturity: [50, 65], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.40, caloriesPer100g: 31,
    preservation: ["can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 5,
    varieties: "Provider, Blue Lake Bush, Contender, Royal Burgundy, Maxibel (filet), Jade",
  },
  green_beans_pole: {
    name: "Green Beans (Pole)", category: "legume", season: "warm", sowMethod: "direct",
    daysToMaturity: [60, 75], spacingSqFt: 0.25, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.40, caloriesPer100g: 31,
    preservation: ["can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 10,
    varieties: "Kentucky Wonder, Blue Lake Pole, Rattlesnake, Scarlet Runner, Fortex (filet), Cherokee Trail of Tears",
  },
  peas_snap: {
    name: "Snap Peas", category: "legume", season: "cool", sowMethod: "direct",
    daysToMaturity: [55, 70], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.2, 0.3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.00, caloriesPer100g: 42,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
    varieties: "Sugar Snap, Sugar Ann, Super Sugar Snap, Cascadia, Sugar Magnolia",
  },
  peas_shell: {
    name: "Shelling Peas", category: "legume", season: "cool", sowMethod: "direct",
    daysToMaturity: [60, 75], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.08, 0.15],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 3.50, caloriesPer100g: 81,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 10, harvestDurationWeeks: 4,
    varieties: "Lincoln, Green Arrow, Progress #9, Wando (heat-tolerant), Tall Telephone",
  },
  cowpea: {
    name: "Cowpea (Black-Eyed Pea)", category: "legume", season: "warm", sowMethod: "direct",
    daysToMaturity: [60, 90], spacingSqFt: 0.25, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 8, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.00, caloriesPer100g: 336,
    preservation: ["dehydrate", "can", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 6,
    varieties: "California Blackeye #5, Mississippi Silver, Queen Anne, Pinkeye Purple Hull, Zipper Cream",
  },

  // ─── Brassica ──────────────────────────────────────────────────────────
  broccoli: {
    name: "Broccoli", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 80], spacingSqFt: 1, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.60, caloriesPer100g: 34,
    preservation: ["freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
    varieties: "Calabrese, Green Magic, Arcadia, Purple Sprouting, Romanesco, De Cicco",
  },
  cabbage: {
    name: "Cabbage", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 90], spacingSqFt: 1, yieldPerPlantLbs: [2, 4],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 9, groceryPricePerLb: 1.10, caloriesPer100g: 25,
    preservation: ["ferment", "root_cellar"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 4,
    varieties: "Early Jersey Wakefield, Copenhagen Market, Red Acre, Savoy (Perfection), Napa, Brunswick",
  },
  cauliflower: {
    name: "Cauliflower", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 85], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 6, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 2.90, caloriesPer100g: 25,
    preservation: ["freeze", "ferment"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 3,
    varieties: "Snowball, Graffiti (purple), Cheddar (orange), Romanesco, Amazing, Attribute",
  },
  brussels_sprouts: {
    name: "Brussels Sprouts", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [90, 110], spacingSqFt: 2.25, yieldPerPlantLbs: [1.5, 2.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 3.40, caloriesPer100g: 43,
    preservation: ["freeze"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 6,
    varieties: "Long Island Improved, Diablo, Jade Cross, Red Rubine, Churchill, Hestia",
  },
  kohlrabi: {
    name: "Kohlrabi", category: "brassica", season: "cool", sowMethod: "either",
    daysToMaturity: [45, 60], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 2.80, caloriesPer100g: 27,
    preservation: ["root_cellar", "ferment", "fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 4,
    varieties: "Purple Vienna, White Vienna, Kolibri (purple), Gigante (storage), Early White",
  },

  // ─── Allium ────────────────────────────────────────────────────────────
  garlic: {
    name: "Garlic", category: "allium", season: "cool", sowMethod: "direct",
    daysToMaturity: [240, 270], spacingSqFt: 0.11, yieldPerPlantLbs: [0.15, 0.25],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 5.00, caloriesPer100g: 149,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -20,
    harvestStartWeeks: 36, harvestDurationWeeks: 2,
    varieties: "Music (hardneck), Purple Stripe (hardneck), Inchelium Red (softneck), Silverskin, Creole, Rocambole",
  },
  leek: {
    name: "Leeks", category: "allium", season: "cool", sowMethod: "transplant",
    daysToMaturity: [90, 130], spacingSqFt: 0.25, yieldPerPlantLbs: [0.4, 0.7],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.20, caloriesPer100g: 61,
    preservation: ["freeze", "dehydrate", "root_cellar"],
    startIndoorsWeeks: -10, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 16, harvestDurationWeeks: 8,
    varieties: "King Richard, American Flag, Lancelot, Bleu de Solaise (overwinter), Tadorna, Megaton",
  },
  shallot: {
    name: "Shallots", category: "allium", season: "cool", sowMethod: "direct",
    daysToMaturity: [90, 120], spacingSqFt: 0.11, yieldPerPlantLbs: [0.25, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 6.50, caloriesPer100g: 72,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 14, harvestDurationWeeks: 3,
    varieties: "French Red, Dutch Yellow, Ambition, Picasso, Conservor, Grey French",
  },

  // ─── Herb ──────────────────────────────────────────────────────────────
  basil: {
    name: "Basil", category: "herb", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 70], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 16.00, caloriesPer100g: 23,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 12,
    varieties: "Genovese (classic Italian), Thai, Purple (Dark Opal), Lemon, Holy (Tulsi), Globe (dwarf), Cinnamon",
  },
  parsley: {
    name: "Parsley", category: "herb", season: "cool", sowMethod: "either",
    daysToMaturity: [70, 90], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 12.00, caloriesPer100g: 36,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 10, harvestDurationWeeks: 16,
    varieties: "Italian Flat Leaf, Curly (Moss Curled), Hamburg (root parsley), Giant of Italy, Forest Green",
  },
  cilantro: {
    name: "Cilantro", category: "herb", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 55], spacingSqFt: 0.11, yieldPerPlantLbs: [0.15, 0.3],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 14.00, caloriesPer100g: 23,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 5, harvestDurationWeeks: 4,
    varieties: "Santo, Slow Bolt, Calypso, Delfino (fern-leaf), Leisure, Marino",
  },
  dill: {
    name: "Dill", category: "herb", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.2, 0.4],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 12.00, caloriesPer100g: 43,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 8,
    varieties: "Bouquet, Dukat, Fernleaf (dwarf), Mammoth, Superdukat, Hera",
  },
  oregano: {
    name: "Oregano", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [80, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 18.00, caloriesPer100g: 265,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 12, harvestDurationWeeks: 20,
    varieties: "Greek, Italian, Golden, Syrian (Za'atar), Hot & Spicy, Cuban",
  },
  thyme: {
    name: "Thyme", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [75, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 6, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 20.00, caloriesPer100g: 101,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 20,
    varieties: "English (Common), French, Lemon, Creeping (Elfin), Silver Posie, Caraway",
  },
  rosemary: {
    name: "Rosemary", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [80, 120], spacingSqFt: 4, yieldPerPlantLbs: [0.5, 1.5],
    sunHours: 6, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 22.00, caloriesPer100g: 131,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 16, harvestDurationWeeks: 24,
    varieties: "Arp (cold-hardy to zone 6), Tuscan Blue, Hill Hardy, Spice Islands, Blue Boy (dwarf), Prostratus (trailing)",
  },
  mint: {
    name: "Mint", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [60, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 4, waterNeeds: "high", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 16.00, caloriesPer100g: 44,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 20,
    varieties: "Spearmint, Peppermint, Chocolate, Apple, Mojito (Yerba Buena), Moroccan",
  },
  chives: {
    name: "Chives", category: "herb", season: "perennial", sowMethod: "either",
    daysToMaturity: [60, 90], spacingSqFt: 0.25, yieldPerPlantLbs: [0.2, 0.4],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 18.00, caloriesPer100g: 30,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 10, harvestDurationWeeks: 20,
    varieties: "Common, Garlic Chives (Chinese / Jiu cai), Giant Siberian, Staro, Polyvert",
  },
  sage: {
    name: "Sage", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [75, 90], spacingSqFt: 2.25, yieldPerPlantLbs: [0.4, 0.8],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 20.00, caloriesPer100g: 315,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 20,
    varieties: "Common (Garden), Purple, Golden, Pineapple (tender), Tricolor, Berggarten (broad-leaf)",
  },
  tarragon: {
    name: "French Tarragon", category: "herb", season: "perennial", sowMethod: "transplant",
    // True French (Artemisia dracunculus 'Sativa') propagates only by division/cuttings -
    // no seed. Russian tarragon is seed-grown but tasteless. USU + Illinois Extension.
    daysToMaturity: [75, 95], spacingSqFt: 2.25, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 6, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 0.1, groceryPricePerLb: 24.00, caloriesPer100g: 295,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 18,
    varieties: "French (Sativa - true flavour, division only), Russian (seed-grown, mild)",
  },
  marjoram: {
    name: "Sweet Marjoram", category: "herb", season: "perennial", sowMethod: "transplant",
    // Origanum majorana - tender perennial zone 9+; annual elsewhere. Illinois Extension.
    daysToMaturity: [60, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.15, groceryPricePerLb: 20.00, caloriesPer100g: 271,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 18,
    varieties: "Sweet (Origanum majorana), Zaatar, Pot Marjoram (O. onites), Compact",
  },

  // ─── Other ─────────────────────────────────────────────────────────────
  corn: {
    name: "Sweet Corn", category: "other", season: "warm", sowMethod: "direct",
    daysToMaturity: [65, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 9, groceryPricePerLb: 1.20, caloriesPer100g: 86,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 3,
    varieties: "Silver Queen, Bodacious, Country Gentleman (heirloom), Stowell's Evergreen, Golden Bantam, Honey and Cream",
  },
  watermelon: {
    name: "Watermelon", category: "other", season: "warm", sowMethod: "either",
    daysToMaturity: [75, 95], spacingSqFt: 16, yieldPerPlantLbs: [15, 30],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 15, groceryPricePerLb: 0.60, caloriesPer100g: 30,
    preservation: ["fresh"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 11, harvestDurationWeeks: 4,
    varieties: "Crimson Sweet, Sugar Baby, Moon and Stars (heirloom), Yellow Doll, Jubilee, Charleston Grey",
  },
  cantaloupe: {
    name: "Cantaloupe", category: "other", season: "warm", sowMethod: "either",
    daysToMaturity: [75, 90], spacingSqFt: 9, yieldPerPlantLbs: [6, 12],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 0.80, caloriesPer100g: 34,
    preservation: ["fresh", "freeze", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 11, harvestDurationWeeks: 4,
    varieties: "Hale's Best Jumbo, Ambrosia, Charentais (French), Sweet Granite, Minnesota Midget, Athena",
  },
  strawberry: {
    name: "Strawberries", category: "other", season: "perennial", sowMethod: "transplant",
    // Year 2+ yield; most growers pinch year-1 blossoms for root establishment.
    daysToMaturity: [90, 120], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 5, groceryPricePerLb: 3.80, caloriesPer100g: 32,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 40, harvestDurationWeeks: 4,
    varieties: "Honeoye (June-bearing), Chandler (June-bearing), Seascape (everbearing), Albion (everbearing), Ozark Beauty (everbearing), Alpine (wild)",
  },
  asparagus: {
    name: "Asparagus", category: "other", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [365, 730], spacingSqFt: 2, yieldPerPlantLbs: [0.5, 0.75],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 4.00, caloriesPer100g: 20,
    preservation: ["freeze", "can", "ferment"],
    startIndoorsWeeks: null, transplantWeeks: -3, directSowWeeks: null,
    harvestStartWeeks: 60, harvestDurationWeeks: 8,
    varieties: "Mary Washington (heirloom), Jersey Giant, Jersey Knight, Purple Passion, Millennium, Pacific Purple",
  },
  celery: {
    name: "Celery", category: "other", season: "cool", sowMethod: "transplant",
    // Demands steady moisture + cool temps; long season. MSU + USU + OSU.
    daysToMaturity: [100, 140], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 6, waterNeeds: "high", difficulty: 4,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 1.50, caloriesPer100g: 16,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -10, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 16, harvestDurationWeeks: 4,
    varieties: "Tall Utah 52-70, Tango, Golden Self-Blanching, Redventure, Conquistador, Giant Pascal",
  },
  fennel: {
    name: "Florence Fennel (Bulb)", category: "other", season: "cool", sowMethod: "either",
    // Foeniculum vulgare var. azoricum - bolt-prone in heat. UNH + Wisconsin Hort.
    // Allelopathic: isolate from beans, tomato, coriander.
    daysToMaturity: [65, 100], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.00, caloriesPer100g: 31,
    preservation: ["fresh", "freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 10, harvestDurationWeeks: 4,
    varieties: "Zefa Fino, Orion, Preludio, Rondo, Victorio, Mantovano",
  },
  rhubarb: {
    name: "Rhubarb", category: "other", season: "perennial", sowMethod: "transplant",
    // Plant crowns year 1, NO harvest year 1, light year 2, full year 3+. UMN + Iowa State.
    // Requires winter dormancy (≥500 hours below 4°C / 40°F); struggles in zones 8+ summer heat.
    daysToMaturity: [365, 730], spacingSqFt: 9, yieldPerPlantLbs: [2, 4],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 4.00, caloriesPer100g: 21,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -4, directSowWeeks: null,
    harvestStartWeeks: 60, harvestDurationWeeks: 8,
    varieties: "Victoria, Canada Red, MacDonald, Crimson Cherry, Riverside Giant, Glaskin's Perpetual",
  },
  globe_artichoke: {
    name: "Globe Artichoke", category: "other", season: "perennial", sowMethod: "transplant",
    // Cynara cardunculus var. scolymus - perennial zones 7+, annual strategy elsewhere.
    // UMass Amherst + Cornell + Texas A&M. ~0.4 lb/head × 6 heads = 2-3 lb/plant.
    daysToMaturity: [90, 180], spacingSqFt: 9, yieldPerPlantLbs: [1.5, 3],
    sunHours: 7, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.50, caloriesPer100g: 47,
    preservation: ["freeze", "can", "ferment"],
    startIndoorsWeeks: -10, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 24, harvestDurationWeeks: 8,
    varieties: "Green Globe, Imperial Star (annual), Violetta (purple), Tavor, Emerald, Northern Star (cold-hardy)",
  },
  blueberry: {
    name: "Blueberries", category: "other", season: "perennial", sowMethod: "transplant",
    // Year 3: ~0.5 lb/bush; year 4: 1-2 lb; peak 8-10 yr: 10+ lb. NCSU + Cornell + Clemson.
    // Requires acidic soil (pH 4.5-5.5). Plant 2+ varieties for cross-pollination.
    daysToMaturity: [730, 1095], spacingSqFt: 16, yieldPerPlantLbs: [2, 6],
    sunHours: 7, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 6.00, caloriesPer100g: 57,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -6, directSowWeeks: null,
    harvestStartWeeks: 100, harvestDurationWeeks: 5,
    varieties: "Bluecrop (highbush), Duke (early), Elliott (late), Tifblue (rabbiteye), Pink Lemonade, Top Hat (dwarf), Patriot (cold-hardy)",
  },
  raspberry: {
    name: "Raspberries", category: "other", season: "perennial", sowMethod: "transplant",
    // Summer-bearing vs everbearing/primocane split. 2-3 ft spacing in hedgerow.
    // Cornell Berry + OSU + PSU. Home conservative 1.5-3 lb/plant established.
    daysToMaturity: [365, 730], spacingSqFt: 4, yieldPerPlantLbs: [1.5, 3],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 8.00, caloriesPer100g: 52,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -6, directSowWeeks: null,
    harvestStartWeeks: 52, harvestDurationWeeks: 6,
    varieties: "Heritage (everbearing), Caroline (everbearing), Latham (summer), Boyne (cold-hardy), Fall Gold, Jewel (black), Anne (yellow)",
  },
  blackberry: {
    name: "Blackberries", category: "other", season: "perennial", sowMethod: "transplant",
    // Erect, semi-erect, trailing types. NCSU + OSU. 10-20 lb commercial; 5-10 home.
    daysToMaturity: [365, 730], spacingSqFt: 9, yieldPerPlantLbs: [5, 10],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 7.00, caloriesPer100g: 43,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -6, directSowWeeks: null,
    harvestStartWeeks: 52, harvestDurationWeeks: 5,
    varieties: "Chester (thornless semi-erect), Triple Crown (thornless), Navaho (erect thornless), Ouachita, Marionberry (trailing), Prime-Ark Freedom",
  },
};

// Category display order + labels (used in grouping + bar chart)
export const CATEGORIES = [
  { id: "leafy",    label: "Leafy greens",    color: "#5E8A4E" },
  { id: "root",     label: "Root vegetables", color: "#A67A42" },
  { id: "fruiting", label: "Fruiting",        color: "#C45D3E" },
  { id: "legume",   label: "Legumes",         color: "#8C9A3A" },
  { id: "brassica", label: "Brassicas",       color: "#4E7A6E" },
  { id: "allium",   label: "Alliums",         color: "#6E5A8A" },
  { id: "herb",     label: "Herbs",           color: "#3A7A3A" },
  { id: "other",    label: "Other",           color: "#B8942C" },
];

// Variety sub-types fall back to their parent crop for companion lookups.
// e.g. tomato_cherry + basil has no direct entry but resolves via parent tomato.
export const CROP_SYNONYMS = Object.fromEntries(
  Object.entries(CROPS)
    .filter(([, crop]) => crop.parentCrop)
    .map(([id, crop]) => [id, crop.parentCrop])
);
