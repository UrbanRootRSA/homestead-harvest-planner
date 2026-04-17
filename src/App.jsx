import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// ── Theme (T) — Homestead Harvest Planner: Forest & Terracotta ──
// ═══════════════════════════════════════════════════════════════════════════
const T = {
  bg: "#FAF7F2",
  bg2: "#F2EDE4",
  card: "#FEFCF8",
  cardHover: "#F8F4EC",
  border: "#DDD6C8",

  tx: "#2C2418",
  tx2: "#6B5D4F",
  tx3: "#9A8E80",

  primary: "#2D5A27",
  primaryDark: "#1E3E1A",
  primaryBg: "#E6F0E5",

  accent: "#C45D3E",
  accentHover: "#A84830",
  accentBg: "#FBF0EB",

  gold: "#B8942C",
  goldBg: "#FBF6E6",

  success: "#3A7A3A", successBg: "#EBF5EB",
  warning: "#C49A2C", warningBg: "#FBF5E0",
  error: "#B84233", errorBg: "#FBEAE8",

  companionGood: "#3A8A3A",
  companionBad: "#C44444",
  companionNeutral: "#9A9A8A",

  radius: 8,
  radiusLg: 12,
  radiusPill: 24,

  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)",
    md: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
    lg: "0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)",
    accent: "0 4px 16px rgba(196, 93, 62, 0.25)",
  },

  fontDisplay: '"DM Serif Display", Georgia, serif',
  fontBody: '"Plus Jakarta Sans", system-ui, sans-serif',
  fontNum: '"Barlow", "Plus Jakarta Sans", sans-serif',
};

// ═══════════════════════════════════════════════════════════════════════════
// ── localStorage keys ──
// ═══════════════════════════════════════════════════════════════════════════
const LS_FAMILY = "hhp_family";
const LS_CROPS = "hhp_crops";
const LS_METRIC = "hhp_metric";
const LS_CURRENCY = "hhp_currency";
const LS_BEDS = "hhp_beds";
const LS_SOIL = "hhp_soil";
const LS_COMPANION = "hhp_companion";
const LS_HEMISPHERE = "hhp_hemisphere";
const LS_PRODUCE_TARGET = "hhp_produce_target";

// ═══════════════════════════════════════════════════════════════════════════
// ── Conversion constants + USDA baseline ──
// ═══════════════════════════════════════════════════════════════════════════
const SQFT_TO_SQM = 0.0929;
const LB_TO_KG = 0.453592;
const FT_TO_M = 0.3048;
const IN_TO_CM = 2.54;
const CUFT_TO_CUYD = 1 / 27;
const CUFT_TO_L = 28.3168;          // 1 cu ft = 28.3168 liters
const CUFT_TO_CUM = 0.0283168;      // 1 cu ft = 0.0283168 m³
const SETTLING_BUFFER = 1.15;       // +15% to fill soil, settles 10-20% over first few weeks (Cornell, U. Minn Extension)
// Multi-bed raised gardens typically lose 25-35% of footprint to paths.
// Cornell Home Gardening guidance lands at ~30% for walk-between-beds layouts;
// a single SFG grid can be lower (~15-20%) but 30% is the safer default.
const PATH_BUFFER = 1.30;
// USDA ERS per-capita fresh produce consumption ≈ 330 lb/person/year (veg +
// fruit + potatoes). Carleen Madigan's The Backyard Homestead plans 300-400 lb
// per person for full self-sufficiency. UK / South African dietary averages
// land lower (150-200 lb). User can override via the produce-target field in
// the Self-Sufficiency Calculator; this is just the default.
const DEFAULT_PRODUCE_PER_PERSON_LBS = 300;
const MIN_PRODUCE_PER_PERSON_LBS = 50;
const MAX_PRODUCE_PER_PERSON_LBS = 800;

// ═══════════════════════════════════════════════════════════════════════════
// ── Crop database (v1 seed — 20 crops covering all categories) ──
// All numbers averaged across USDA zones 5–8, conservative yield range.
// ═══════════════════════════════════════════════════════════════════════════
const CROPS = {
  // Fruiting (4)
  tomato: {
    name: "Tomatoes", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [60, 85], spacingSqFt: 4, yieldPerPlantLbs: [8, 12],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 25, groceryPricePerLb: 2.50, caloriesPer100g: 18,
    preservation: ["can", "freeze", "dehydrate", "sauce"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 12,
  },
  bell_pepper: {
    name: "Bell Peppers", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [60, 80], spacingSqFt: 1, yieldPerPlantLbs: [3, 5],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 10, groceryPricePerLb: 3.25, caloriesPer100g: 20,
    preservation: ["freeze", "dehydrate", "can"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 10,
  },
  cucumber: {
    name: "Cucumbers", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 70], spacingSqFt: 2, yieldPerPlantLbs: [5, 10],
    sunHours: 7, waterNeeds: "high", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 1.80, caloriesPer100g: 15,
    preservation: ["can", "ferment"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 8,
  },
  zucchini: {
    name: "Zucchini", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [45, 60], spacingSqFt: 9, yieldPerPlantLbs: [6, 10],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 1.60, caloriesPer100g: 17,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 10,
  },

  // Leafy (3)
  lettuce: {
    name: "Lettuce", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [30, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 20, groceryPricePerLb: 2.75, caloriesPer100g: 15,
    preservation: ["fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 8,
  },
  spinach: {
    name: "Spinach", category: "leafy", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 50], spacingSqFt: 0.11, yieldPerPlantLbs: [0.25, 0.4],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.50, caloriesPer100g: 23,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 6, harvestDurationWeeks: 6,
  },
  kale: {
    name: "Kale", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [55, 75], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 3.20, caloriesPer100g: 49,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 16,
  },

  // Root (4)
  carrot: {
    name: "Carrots", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [60, 80], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.1, 0.2],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 1.40, caloriesPer100g: 41,
    preservation: ["root_cellar", "can", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 9, harvestDurationWeeks: 6,
  },
  beet: {
    name: "Beets", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [50, 70], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 2.00, caloriesPer100g: 43,
    preservation: ["can", "root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 6,
  },
  potato: {
    name: "Potatoes", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [80, 100], spacingSqFt: 1, yieldPerPlantLbs: [2, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 35, groceryPricePerLb: 1.10, caloriesPer100g: 77,
    preservation: ["root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 14, harvestDurationWeeks: 4,
  },
  onion: {
    name: "Onions", category: "root", season: "cool", sowMethod: "transplant",
    daysToMaturity: [90, 120], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 20, groceryPricePerLb: 1.20, caloriesPer100g: 40,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: -10, transplantWeeks: -3, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 4,
  },

  // Legume (2)
  green_beans_bush: {
    name: "Green Beans (Bush)", category: "legume", season: "warm", sowMethod: "direct",
    daysToMaturity: [50, 65], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.40, caloriesPer100g: 31,
    preservation: ["can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 5,
  },
  peas_snap: {
    name: "Snap Peas", category: "legume", season: "cool", sowMethod: "direct",
    daysToMaturity: [55, 70], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.2, 0.3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.00, caloriesPer100g: 42,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
  },

  // Brassica (2)
  broccoli: {
    name: "Broccoli", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 80], spacingSqFt: 1, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.60, caloriesPer100g: 34,
    preservation: ["freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
  },
  cabbage: {
    name: "Cabbage", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 90], spacingSqFt: 1, yieldPerPlantLbs: [2, 4],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 9, groceryPricePerLb: 1.10, caloriesPer100g: 25,
    preservation: ["ferment", "root_cellar"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 4,
  },

  // Allium (1)
  garlic: {
    name: "Garlic", category: "allium", season: "cool", sowMethod: "direct",
    daysToMaturity: [240, 270], spacingSqFt: 0.11, yieldPerPlantLbs: [0.15, 0.25],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 5.00, caloriesPer100g: 149,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -20,
    harvestStartWeeks: 36, harvestDurationWeeks: 2,
  },

  // Herb (3)
  basil: {
    name: "Basil", category: "herb", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 70], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 16.00, caloriesPer100g: 23,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 12,
  },
  parsley: {
    name: "Parsley", category: "herb", season: "cool", sowMethod: "either",
    daysToMaturity: [70, 90], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.5, groceryPricePerLb: 12.00, caloriesPer100g: 36,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 10, harvestDurationWeeks: 16,
  },
  cilantro: {
    name: "Cilantro", category: "herb", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 55], spacingSqFt: 0.11, yieldPerPlantLbs: [0.15, 0.3],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 14.00, caloriesPer100g: 23,
    preservation: ["freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 5, harvestDurationWeeks: 4,
  },

  // Other (1)
  strawberry: {
    name: "Strawberries", category: "other", season: "perennial", sowMethod: "transplant",
    // Year 2+ yield; most growers pinch year-1 blossoms for root establishment.
    daysToMaturity: [90, 120], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 5, groceryPricePerLb: 3.80, caloriesPer100g: 32,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 40, harvestDurationWeeks: 4,
  },

  // ─── Session 2 expansion: additional 28 crops ──────────────────────────
  // Fruiting (4 new)
  hot_pepper: {
    name: "Hot Peppers", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [70, 95], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 4.50, caloriesPer100g: 40,
    preservation: ["dehydrate", "ferment", "can", "freeze"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 11, harvestDurationWeeks: 10,
  },
  summer_squash: {
    name: "Summer Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [50, 65], spacingSqFt: 9, yieldPerPlantLbs: [5, 9],
    sunHours: 8, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 5, groceryPricePerLb: 1.80, caloriesPer100g: 16,
    preservation: ["freeze", "dehydrate", "can"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 7, harvestDurationWeeks: 10,
  },
  winter_squash: {
    name: "Winter Squash", category: "fruiting", season: "warm", sowMethod: "either",
    daysToMaturity: [85, 110], spacingSqFt: 16, yieldPerPlantLbs: [8, 20],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 1.40, caloriesPer100g: 45,
    preservation: ["root_cellar", "freeze", "can", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 13, harvestDurationWeeks: 6,
  },
  eggplant: {
    name: "Eggplant", category: "fruiting", season: "warm", sowMethod: "transplant",
    daysToMaturity: [70, 90], spacingSqFt: 2, yieldPerPlantLbs: [3, 6],
    sunHours: 8, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.40, caloriesPer100g: 25,
    preservation: ["freeze", "dehydrate", "ferment"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 11, harvestDurationWeeks: 10,
  },

  // Leafy (3 new)
  swiss_chard: {
    name: "Swiss Chard", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [50, 65], spacingSqFt: 0.25, yieldPerPlantLbs: [1, 2],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 3.20, caloriesPer100g: 19,
    preservation: ["freeze"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 20,
  },
  collards: {
    name: "Collard Greens", category: "leafy", season: "cool", sowMethod: "either",
    daysToMaturity: [60, 85], spacingSqFt: 1, yieldPerPlantLbs: [1.5, 3],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 3, groceryPricePerLb: 2.80, caloriesPer100g: 32,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 8, harvestDurationWeeks: 16,
  },
  arugula: {
    name: "Arugula", category: "leafy", season: "cool", sowMethod: "direct",
    daysToMaturity: [30, 45], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.1, 0.2],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 8.00, caloriesPer100g: 25,
    preservation: ["fresh"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 5, harvestDurationWeeks: 5,
  },

  // Root (3 new)
  radish: {
    name: "Radishes", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [22, 35], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.05, 0.1],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 2.20, caloriesPer100g: 16,
    preservation: ["ferment", "fresh"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 4, harvestDurationWeeks: 4,
  },
  sweet_potato: {
    name: "Sweet Potatoes", category: "root", season: "warm", sowMethod: "transplant",
    // Slips transplanted AFTER last frost. Not related to regular potatoes.
    daysToMaturity: [95, 120], spacingSqFt: 1.33, yieldPerPlantLbs: [2, 4],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 7, groceryPricePerLb: 1.30, caloriesPer100g: 86,
    preservation: ["root_cellar", "can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: 3, directSowWeeks: null,
    harvestStartWeeks: 15, harvestDurationWeeks: 3,
  },
  turnip: {
    name: "Turnips", category: "root", season: "cool", sowMethod: "direct",
    daysToMaturity: [40, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.3, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.60, caloriesPer100g: 28,
    preservation: ["root_cellar", "ferment", "can"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 4,
  },

  // Legume (2 new)
  green_beans_pole: {
    name: "Green Beans (Pole)", category: "legume", season: "warm", sowMethod: "direct",
    daysToMaturity: [60, 75], spacingSqFt: 0.25, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 7, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 6, groceryPricePerLb: 2.40, caloriesPer100g: 31,
    preservation: ["can", "freeze", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 10,
  },
  peas_shell: {
    name: "Shelling Peas", category: "legume", season: "cool", sowMethod: "direct",
    // Yield is SHELLED weight (~1/3 pod weight).
    daysToMaturity: [60, 75], spacingSqFt: 0.0625, yieldPerPlantLbs: [0.08, 0.15],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 3.50, caloriesPer100g: 81,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 10, harvestDurationWeeks: 4,
  },

  // Brassica (3 new)
  cauliflower: {
    name: "Cauliflower", category: "brassica", season: "cool", sowMethod: "transplant",
    daysToMaturity: [60, 85], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 6, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 4, groceryPricePerLb: 2.90, caloriesPer100g: 25,
    preservation: ["freeze", "ferment"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 3,
  },
  brussels_sprouts: {
    name: "Brussels Sprouts", category: "brassica", season: "cool", sowMethod: "transplant",
    // Long season; flavor improves after frost.
    daysToMaturity: [90, 110], spacingSqFt: 2.25, yieldPerPlantLbs: [1.5, 2.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 3,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 3.40, caloriesPer100g: 43,
    preservation: ["freeze"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 6,
  },
  kohlrabi: {
    name: "Kohlrabi", category: "brassica", season: "cool", sowMethod: "either",
    daysToMaturity: [45, 60], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 2.80, caloriesPer100g: 27,
    preservation: ["root_cellar", "ferment", "fresh"],
    startIndoorsWeeks: -6, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 7, harvestDurationWeeks: 4,
  },

  // Allium (2 new)
  leek: {
    name: "Leeks", category: "allium", season: "cool", sowMethod: "transplant",
    daysToMaturity: [90, 130], spacingSqFt: 0.25, yieldPerPlantLbs: [0.4, 0.7],
    sunHours: 6, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.20, caloriesPer100g: 61,
    preservation: ["freeze", "dehydrate", "root_cellar"],
    startIndoorsWeeks: -10, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 16, harvestDurationWeeks: 8,
  },
  shallot: {
    name: "Shallots", category: "allium", season: "cool", sowMethod: "direct",
    // Cluster-forming; each bulb yields 4-10 bulbs at wide spacing.
    daysToMaturity: [90, 120], spacingSqFt: 0.11, yieldPerPlantLbs: [0.25, 0.5],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 6.50, caloriesPer100g: 72,
    preservation: ["root_cellar", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -4,
    harvestStartWeeks: 14, harvestDurationWeeks: 3,
  },

  // Herb (7 new)
  dill: {
    name: "Dill", category: "herb", season: "cool", sowMethod: "direct",
    // Bolts fast in heat; succession plant for continuous harvest.
    daysToMaturity: [40, 60], spacingSqFt: 0.11, yieldPerPlantLbs: [0.2, 0.4],
    sunHours: 6, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 12.00, caloriesPer100g: 43,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 8,
  },
  oregano: {
    name: "Oregano", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [80, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 18.00, caloriesPer100g: 265,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 12, harvestDurationWeeks: 20,
  },
  thyme: {
    name: "Thyme", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [75, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 6, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 20.00, caloriesPer100g: 101,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 20,
  },
  rosemary: {
    name: "Rosemary", category: "herb", season: "perennial", sowMethod: "transplant",
    // Perennial zone 7+; overwinter indoors in zone 5-6.
    daysToMaturity: [80, 120], spacingSqFt: 4, yieldPerPlantLbs: [0.5, 1.5],
    sunHours: 6, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 22.00, caloriesPer100g: 131,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -10, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 16, harvestDurationWeeks: 24,
  },
  mint: {
    name: "Mint", category: "herb", season: "perennial", sowMethod: "transplant",
    // WARNING: mint is invasive via runners. Contain in a pot or buried barrier.
    daysToMaturity: [60, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.75, 1.5],
    sunHours: 4, waterNeeds: "high", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.3, groceryPricePerLb: 16.00, caloriesPer100g: 44,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -6, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 10, harvestDurationWeeks: 20,
  },
  chives: {
    name: "Chives", category: "herb", season: "perennial", sowMethod: "either",
    daysToMaturity: [60, 90], spacingSqFt: 0.25, yieldPerPlantLbs: [0.2, 0.4],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 18.00, caloriesPer100g: 30,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -8, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 10, harvestDurationWeeks: 20,
  },
  sage: {
    name: "Sage", category: "herb", season: "perennial", sowMethod: "transplant",
    daysToMaturity: [75, 90], spacingSqFt: 2.25, yieldPerPlantLbs: [0.4, 0.8],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 0.2, groceryPricePerLb: 20.00, caloriesPer100g: 315,
    preservation: ["dehydrate", "freeze"],
    startIndoorsWeeks: -8, transplantWeeks: 2, directSowWeeks: null,
    harvestStartWeeks: 14, harvestDurationWeeks: 20,
  },

  // Other (4 new)
  corn: {
    name: "Sweet Corn", category: "other", season: "warm", sowMethod: "direct",
    // Needs a BLOCK planting (4x4 minimum) for wind pollination.
    daysToMaturity: [65, 90], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 9, groceryPricePerLb: 1.20, caloriesPer100g: 86,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 3,
  },
  watermelon: {
    name: "Watermelon", category: "other", season: "warm", sowMethod: "either",
    daysToMaturity: [75, 95], spacingSqFt: 16, yieldPerPlantLbs: [15, 30],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 15, groceryPricePerLb: 0.60, caloriesPer100g: 30,
    preservation: ["fresh"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 11, harvestDurationWeeks: 4,
  },
  cantaloupe: {
    name: "Cantaloupe", category: "other", season: "warm", sowMethod: "either",
    daysToMaturity: [75, 90], spacingSqFt: 9, yieldPerPlantLbs: [6, 12],
    sunHours: 8, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 8, groceryPricePerLb: 0.80, caloriesPer100g: 34,
    preservation: ["fresh", "freeze", "dehydrate"],
    startIndoorsWeeks: -3, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 11, harvestDurationWeeks: 4,
  },
  asparagus: {
    name: "Asparagus", category: "other", season: "perennial", sowMethod: "transplant",
    // PERENNIAL: year 1 ~0.2 lb/plant (do NOT harvest), year 2 light, year 3+ full.
    daysToMaturity: [365, 730], spacingSqFt: 2, yieldPerPlantLbs: [0.5, 0.75],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 4.00, caloriesPer100g: 20,
    preservation: ["freeze", "can", "ferment"],
    startIndoorsWeeks: null, transplantWeeks: -3, directSowWeeks: null,
    harvestStartWeeks: 60, harvestDurationWeeks: 8,
  },

  // ─── Regional additions: crops important outside North America ─────────
  // Sources: LSU AgCenter (okra), Clemson Extension, Utah State Extension,
  // FAO Ecocrop, Penn State (amaranth, cowpea), AVRDC World Vegetable Center.
  okra: {
    name: "Okra", category: "fruiting", season: "warm", sowMethod: "either",
    // Southern US + West African staple. Heat-loving, drought-tolerant.
    daysToMaturity: [50, 65], spacingSqFt: 1, yieldPerPlantLbs: [1, 2],
    sunHours: 8, waterNeeds: "low", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 4.00, caloriesPer100g: 33,
    preservation: ["freeze", "can", "dehydrate", "ferment"],
    startIndoorsWeeks: -4, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 8, harvestDurationWeeks: 10,
  },
  bok_choy: {
    name: "Bok Choy", category: "leafy", season: "cool", sowMethod: "either",
    // East Asian brassica. Fast-growing cool-season cut-and-come-again.
    daysToMaturity: [45, 60], spacingSqFt: 0.25, yieldPerPlantLbs: [0.5, 1],
    sunHours: 4, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.50, caloriesPer100g: 13,
    preservation: ["ferment", "freeze"],
    startIndoorsWeeks: -4, transplantWeeks: -2, directSowWeeks: -2,
    harvestStartWeeks: 6, harvestDurationWeeks: 6,
  },
  daikon: {
    name: "Daikon Radish", category: "root", season: "cool", sowMethod: "direct",
    // East Asian long radish. Summer-sown for fall harvest in most zones.
    daysToMaturity: [50, 70], spacingSqFt: 0.25, yieldPerPlantLbs: [1, 2],
    sunHours: 5, waterNeeds: "moderate", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 1.50, caloriesPer100g: 18,
    preservation: ["ferment", "fresh", "root_cellar"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 9, harvestDurationWeeks: 4,
  },
  cowpea: {
    name: "Cowpea (Black-Eyed Pea)", category: "legume", season: "warm", sowMethod: "direct",
    // West African + Southern US staple. Heat-tolerant where regular peas fail.
    daysToMaturity: [60, 90], spacingSqFt: 0.25, yieldPerPlantLbs: [0.3, 0.6],
    sunHours: 8, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 2, groceryPricePerLb: 2.00, caloriesPer100g: 336,
    preservation: ["dehydrate", "can", "freeze"],
    startIndoorsWeeks: null, transplantWeeks: null, directSowWeeks: 2,
    harvestStartWeeks: 10, harvestDurationWeeks: 6,
  },
  amaranth: {
    name: "Amaranth (Callaloo)", category: "leafy", season: "warm", sowMethod: "either",
    // Dual-purpose leaf + grain. Caribbean / African / Indian staple. Heat-tolerant.
    daysToMaturity: [40, 70], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 6, waterNeeds: "low", difficulty: 1,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 4.00, caloriesPer100g: 23,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -4, transplantWeeks: 2, directSowWeeks: 2,
    harvestStartWeeks: 6, harvestDurationWeeks: 10,
  },
  bitter_melon: {
    name: "Bitter Melon", category: "fruiting", season: "warm", sowMethod: "either",
    // South + Southeast Asian vining crop. Needs trellis and warm nights.
    daysToMaturity: [60, 90], spacingSqFt: 4, yieldPerPlantLbs: [3, 8],
    sunHours: 8, waterNeeds: "high", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 1, groceryPricePerLb: 3.00, caloriesPer100g: 17,
    preservation: ["freeze", "dehydrate"],
    startIndoorsWeeks: -6, transplantWeeks: 3, directSowWeeks: 3,
    harvestStartWeeks: 9, harvestDurationWeeks: 10,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ── Companion planting database ──
// ~135 pairwise relationships documented by university extensions (WVU, UMN,
// Cornell, NC State, UC IPM), Louise Riotte's Carrots Love Tomatoes, and peer-
// reviewed allelopathy literature. Neutral pairs are NOT listed. Each entry:
// { a, b, rel: "good"|"bad", reason: "≤ one sentence, specific mechanism" }.
// Lookup helpers normalise order, so either {a:"tomato",b:"basil"} or
// {a:"basil",b:"tomato"} returns the same result.
// ═══════════════════════════════════════════════════════════════════════════
const COMPANIONS = [
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
  { a: "eggplant", b: "green_beans_bush", rel: "good", reason: "Bush beans protect eggplant from Colorado potato beetle; add nitrogen." },
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
  { a: "bitter_melon", b: "basil", rel: "good", reason: "Basil volatiles deter aphids and thrips that attack bitter melon vines." },
  { a: "bitter_melon", b: "potato", rel: "bad", reason: "Potato depletes potassium needed for bitter melon fruit set; shared wilt susceptibility." },
];

const COMPANION_GROUPINGS = [
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

// O(1)-ish lookup helpers for the matrix — build a hash keyed on "a|b" with a<b.
const COMPANION_MAP = (() => {
  const m = new Map();
  for (const c of COMPANIONS) {
    const [x, y] = c.a < c.b ? [c.a, c.b] : [c.b, c.a];
    m.set(`${x}|${y}`, { rel: c.rel, reason: c.reason });
  }
  return m;
})();
function getCompanion(a, b) {
  if (a === b) return null;
  const [x, y] = a < b ? [a, b] : [b, a];
  return COMPANION_MAP.get(`${x}|${y}`) || null;
}

// Category display order + labels (used in grouping + bar chart)
const CATEGORIES = [
  { id: "leafy",    label: "Leafy greens", color: "#5E8A4E" },
  { id: "root",     label: "Root vegetables", color: "#A67A42" },
  { id: "fruiting", label: "Fruiting", color: "#C45D3E" },
  { id: "legume",   label: "Legumes", color: "#8C9A3A" },
  { id: "brassica", label: "Brassicas", color: "#4E7A6E" },
  { id: "allium",   label: "Alliums", color: "#6E5A8A" },
  { id: "herb",     label: "Herbs", color: "#3A7A3A" },
  { id: "other",    label: "Other", color: "#B8942C" },
];

// ═══════════════════════════════════════════════════════════════════════════
// ── Goal + frequency multipliers ──
// ═══════════════════════════════════════════════════════════════════════════
// goalMult scales per-crop annual need. Fresh-only eaters still consume as much
// in-season as year-round families, so 0.5 is more realistic than 0.33 (four-
// month season ÷ 12). The denominator uses a full-year target regardless of
// goal so "100%" honestly means "you'd cover a year's produce".
const GOAL_MULTIPLIER = {
  fresh_only: 0.5,
  fresh_preserving: 0.75,
  full_year: 1.0,
};
const GOAL_OPTIONS = [
  { id: "fresh_only",       label: "Fresh eating only",      sub: "Summer months" },
  { id: "fresh_preserving", label: "Fresh + some preserving",sub: "Summer + stored" },
  { id: "full_year",        label: "Full year self-sufficiency", sub: "Grow it all" },
];

const FREQUENCY_FACTOR = {
  rarely: 0.25,
  sometimes: 0.5,
  weekly: 1.0,
  almost_daily: 1.5,
};
const FREQUENCY_OPTIONS = [
  { id: "rarely",       label: "Rarely" },
  { id: "sometimes",    label: "Sometimes" },
  { id: "weekly",       label: "Weekly" },
  { id: "almost_daily", label: "Almost daily" },
];

// ═══════════════════════════════════════════════════════════════════════════
// ── Quick-start presets ──
// ═══════════════════════════════════════════════════════════════════════════
const PRESETS = {
  salad_garden: {
    label: "Salad Garden",
    sub: "Small, high-impact",
    selection: {
      lettuce: "weekly", spinach: "sometimes", kale: "sometimes",
      tomato: "weekly", cucumber: "sometimes",
      basil: "sometimes", parsley: "rarely",
    },
  },
  family_basics: {
    label: "Family Basics",
    sub: "Medium, balanced",
    selection: {
      tomato: "weekly", bell_pepper: "weekly", cucumber: "weekly", zucchini: "sometimes",
      lettuce: "weekly", kale: "sometimes",
      carrot: "weekly", potato: "weekly", onion: "weekly",
      green_beans_bush: "weekly", broccoli: "sometimes",
      basil: "sometimes",
    },
  },
  full_homestead: {
    label: "Full Homestead",
    sub: "Large, year-round",
    selection: Object.keys(CROPS).reduce((acc, k) => {
      acc[k] = "weekly";
      return acc;
    }, {}),
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ── Tabs ──
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: "home",             label: "Home",            paid: false, live: true,  blurb: "" },
  { id: "self-sufficiency", label: "Self-Sufficiency",paid: false, live: true,  blurb: "" },
  { id: "soil",             label: "Soil",            paid: false, live: true,  blurb: "Raised-bed volume, soil mix breakdown, and bag estimates." },
  { id: "companion",        label: "Companion",       paid: false, live: true,  blurb: "Which crops grow well together, which ones fight." },
  { id: "planting-dates",   label: "Planting Dates",  paid: false, live: false, blurb: "Start indoors, transplant, direct sow, and harvest windows for your zone." },
  { id: "growing-plan",     label: "Growing Plan",    paid: true,  live: false, blurb: "AI-generated personalized growing plan for your garden." },
  { id: "crops",            label: "Crop Database",   paid: true,  live: false, blurb: "Complete data for every crop, searchable and sortable." },
  { id: "cost-savings",     label: "Cost Savings",    paid: true,  live: false, blurb: "Grocery savings, setup costs, ROI, and break-even timeline." },
  { id: "preservation",     label: "Preservation",    paid: true,  live: false, blurb: "How to can, freeze, dehydrate, and store your harvest." },
];

// ═══════════════════════════════════════════════════════════════════════════
// ── Soil calculator constants ──
// Two canonical mixes (60/30/10 from extension services, Mel's Mix from
// Square Foot Gardening) plus a lower-cost economy blend and a Custom option.
// Default prices reflect late-2026 US retail (Home Depot / Lowe's / Amazon).
// ═══════════════════════════════════════════════════════════════════════════
const BED_SHAPES = [
  { id: "rect",   label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "lshape", label: "L-Shape" },
];

const SOIL_MIXES = [
  {
    id: "classic_60_30_10",
    label: "Classic (60/30/10)",
    sub: "Extension-service raised-bed standard",
    components: [
      { key: "topsoil", label: "Topsoil",      pct: 0.60, pricePerCuFt: 3.50 },
      { key: "compost", label: "Compost",      pct: 0.30, pricePerCuFt: 7.00 },
      { key: "sand",    label: "Coarse sand",  pct: 0.10, pricePerCuFt: 9.00 },
    ],
  },
  {
    id: "mels_mix",
    label: "Mel's Mix (1:1:1)",
    sub: "Classic Square-Foot Gardening recipe",
    components: [
      { key: "compost", label: "Blended compost",     pct: 1 / 3, pricePerCuFt: 7.00 },
      { key: "peat",    label: "Peat moss or coir",   pct: 1 / 3, pricePerCuFt: 5.00 },
      { key: "verm",    label: "Coarse vermiculite",  pct: 1 / 3, pricePerCuFt: 12.00 },
    ],
  },
  {
    id: "economy_40_40_20",
    label: "Economy (40/40/20)",
    sub: "Lower cost, commercial bag-blend style",
    components: [
      { key: "topsoil", label: "Topsoil",     pct: 0.40, pricePerCuFt: 3.50 },
      { key: "compost", label: "Compost",     pct: 0.40, pricePerCuFt: 7.00 },
      { key: "sand",    label: "Coarse sand", pct: 0.20, pricePerCuFt: 9.00 },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    sub: "Set your own ratios and prices",
    components: [
      { key: "a", label: "Component A", pct: 0.50, pricePerCuFt: 5.00 },
      { key: "b", label: "Component B", pct: 0.30, pricePerCuFt: 5.00 },
      { key: "c", label: "Component C", pct: 0.20, pricePerCuFt: 5.00 },
    ],
  },
];

// US retail bag sizes. Metric (L) threaded through the unit toggle below.
const BAG_SIZES_CUFT = [1, 1.5, 2];
const BAG_SIZES_L = [40, 50, 75]; // common UK/AU/ZA compost and topsoil bag sizes

const DEFAULT_BED = () => ({
  id: `bed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  shape: "rect",
  // stored internally as feet and inches regardless of metric toggle
  lengthFt: 8, widthFt: 4, depthIn: 12,
  diameterFt: 4,
  outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3,
  qty: 1,
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Utilities ──
// ═══════════════════════════════════════════════════════════════════════════
const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const fmtInt = (n) => {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
};

const fmtDecimal = (n, d = 1) => {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
};

const fmtRange = (arr, unit = "") => {
  if (!Array.isArray(arr) || arr.length !== 2) return "—";
  const [a, b] = arr;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  if (a === b) return `${a}${unit}`;
  return `${a}${unit}–${b}${unit}`;
};

function persistState(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    // Quota exceeded, sandboxed iframe, or disabled storage. Log once per key
    // per session so we leave a breadcrumb without spamming the console.
    console.warn(`[hhp] Could not persist "${key}":`, err?.message || err);
    return false;
  }
}
function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Hooks ──
// ═══════════════════════════════════════════════════════════════════════════
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function useCountUp(target, duration = 800) {
  const [display, setDisplay] = useState(Number.isFinite(target) ? target : 0);
  const frameRef = useRef(null);
  useEffect(() => {
    // Hold the last good display value when target is transiently invalid,
    // so the UI doesn't glitch 0 → N every time a derived calc returns NaN.
    if (!Number.isFinite(target)) return;
    const start = Number.isFinite(display) ? display : 0;
    const diff = target - start;
    if (Math.abs(diff) < 0.01) { setDisplay(target); return; }
    const startTime = performance.now();
    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      setDisplay(start + diff * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return display;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Shared components ──
// ═══════════════════════════════════════════════════════════════════════════

// — Counter —
function Counter({ value, onChange, min = 0, max, label }) {
  const safe = Number.isFinite(value) ? value : min;
  const atMin = safe <= min;
  const atMax = max != null && safe >= max;
  const btnStyle = (disabled) => ({
    minWidth: 44, minHeight: 44, borderRadius: 10,
    background: T.card, border: `1.5px solid ${T.border}`,
    fontSize: 22, fontWeight: 600, color: T.tx,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontFamily: T.fontBody,
    transition: "all 0.15s ease",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button type="button" disabled={atMin}
        onClick={() => onChange(Math.max(min, safe - 1))}
        style={btnStyle(atMin)} aria-label={`Decrease ${label}`}>−</button>
      <span style={{
        fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
        fontSize: 24, fontWeight: 700, minWidth: 40, textAlign: "center", color: T.tx,
      }}>{Number.isFinite(value) ? value : "—"}</span>
      <button type="button" disabled={atMax}
        onClick={() => onChange(Math.min(max ?? Infinity, safe + 1))}
        style={btnStyle(atMax)} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

// — Field (decimal-friendly numeric input) —
// Local string state lets the user type "0", ".", "5" naturally. We only commit
// on blur / Enter, and we clamp to [min, max] there. Never use `parseFloat||0`.
function Field({ label, value, onChange, unit, min = 0, max = 9999, step = 0.1, disabled, placeholder }) {
  const [raw, setRaw] = useState(() =>
    Number.isFinite(value) ? String(value) : ""
  );
  const inputRef = useRef(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setRaw(Number.isFinite(value) ? String(value) : "");
    }
  }, [value]);

  const commit = () => {
    if (raw.trim() === "") {
      onChange(Number.isFinite(min) ? min : 0);
      setRaw(String(Number.isFinite(min) ? min : 0));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setRaw(Number.isFinite(value) ? String(value) : "");
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    onChange(clamped);
    setRaw(String(clamped));
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.tx2, fontFamily: T.fontBody }}>
        {label}{unit ? ` (${unit})` : ""}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); inputRef.current?.blur(); } }}
        aria-label={label}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          fontSize: 16,
          fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          background: disabled ? T.bg2 : T.card,
          color: T.tx,
          border: `1.5px solid ${T.border}`,
          borderRadius: T.radius,
          padding: "12px 14px",
          minHeight: 48,
          width: "100%",
          opacity: disabled ? 0.7 : 1,
          outline: "none",
        }}
      />
    </label>
  );
}

// — PillSelect (for goal, frequency; segmented control) —
function PillSelect({ options, value, onChange, size = "md", ariaLabel }) {
  const padding = size === "sm" ? "8px 14px" : "10px 18px";
  const fontSize = size === "sm" ? 13 : 15;
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: 4,
        background: T.bg2, borderRadius: T.radiusPill,
      }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button key={opt.id} type="button" role="radio" aria-checked={active}
            onClick={() => onChange(opt.id)}
            style={{
              flex: "1 1 auto", minHeight: size === "sm" ? 40 : 44,
              padding, fontSize, fontWeight: active ? 700 : 500,
              fontFamily: T.fontBody, color: active ? "#FEFCF8" : T.tx2,
              background: active ? T.primary : "transparent",
              border: "none", borderRadius: T.radiusPill, cursor: "pointer",
              transition: "all 0.18s ease", whiteSpace: "nowrap",
            }}>
            <span style={{ display: "block" }}>{opt.label}</span>
            {opt.sub && (
              <span style={{
                display: "block", fontSize: 11, fontWeight: 400, marginTop: 2,
                color: active ? "rgba(254, 252, 248, 0.78)" : T.tx3,
              }}>
                {opt.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// — LockIcon —
function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// — CountUpNumber —
function CountUpNumber({ value, decimals = 0, size = 64, color = T.primary, unit }) {
  const display = useCountUp(Number.isFinite(value) ? value : 0);
  const text = Number.isFinite(value)
    ? (decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString())
    : "—";
  return (
    <span style={{
      fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
      fontWeight: 700, fontSize: size, color, lineHeight: 1,
    }}>
      {text}{unit ? <span style={{ fontSize: size * 0.4, marginLeft: 4, color: T.tx2 }}>{unit}</span> : null}
    </span>
  );
}

// — CategoryBar (horizontal stacked bar of space per category) —
function CategoryBar({ categorySpaceMap, totalSpaceSqft, metric }) {
  const entries = CATEGORIES
    .map((c) => ({ ...c, space: categorySpaceMap[c.id] || 0 }))
    .filter((c) => c.space > 0);
  const maxSpace = totalSpaceSqft > 0 ? totalSpaceSqft : 1;
  const unit = metric ? "m²" : "sq ft";
  const conv = metric ? SQFT_TO_SQM : 1;
  if (entries.length === 0) {
    return (
      <p style={{ color: T.tx3, fontSize: 14, margin: 0, fontStyle: "italic" }}>
        Select crops to see your space breakdown.
      </p>
    );
  }
  return (
    <div>
      <div style={{
        display: "flex", height: 24, borderRadius: T.radius,
        overflow: "hidden", background: T.bg2,
      }}>
        {entries.map((e) => (
          <div key={e.id}
            title={`${e.label}: ${(e.space * conv).toFixed(1)} ${unit}`}
            style={{
              width: `${(e.space / maxSpace) * 100}%`,
              background: e.color,
              transition: "width 0.4s ease",
            }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 12 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.tx2 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: e.color, display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>{e.label}</span>
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums", color: T.tx3 }}>
              {(e.space * conv).toFixed(1)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Core calculation ──
// ═══════════════════════════════════════════════════════════════════════════
function computeResults(selectedMap, familySize, goalKey, producePerPersonLbs = DEFAULT_PRODUCE_PER_PERSON_LBS) {
  const goalMult = GOAL_MULTIPLIER[goalKey] ?? 0.7;
  const perCrop = [];
  let totalSpaceSqft = 0;
  let totalPlants = 0;
  let totalYieldLbs = 0;
  const categorySpaceMap = {};

  for (const [cropId, frequency] of Object.entries(selectedMap)) {
    const crop = CROPS[cropId];
    if (!crop || !frequency) continue;
    const freqMult = FREQUENCY_FACTOR[frequency] ?? 0.5;
    const annualNeedLbs = crop.avgConsumptionLbsPerPersonYear * familySize * goalMult * freqMult;
    const [yieldLow, yieldHigh] = crop.yieldPerPlantLbs;
    // Plan plant count from the LOW end of the yield range (conservative).
    const plantsNeeded = yieldLow > 0 ? Math.ceil(annualNeedLbs / yieldLow) : 0;
    const spaceSqFt = plantsNeeded * crop.spacingSqFt;
    // Display yield using the MIDPOINT so the headline % isn't systematically
    // under-reported on high-variance crops (tomatoes, squash, peppers).
    const yieldMid = (yieldLow + yieldHigh) / 2;
    const expectedYieldLbs = plantsNeeded * yieldMid;
    const expectedYieldLow = plantsNeeded * yieldLow;
    const expectedYieldHigh = plantsNeeded * yieldHigh;

    perCrop.push({
      cropId, crop, annualNeedLbs, plantsNeeded, spaceSqFt,
      expectedYieldLbs, expectedYieldLow, expectedYieldHigh, frequency,
    });
    totalSpaceSqft += spaceSqFt;
    totalPlants += plantsNeeded;
    totalYieldLbs += expectedYieldLbs;
    categorySpaceMap[crop.category] = (categorySpaceMap[crop.category] || 0) + spaceSqFt;
  }

  const totalSpaceWithBuffer = totalSpaceSqft * PATH_BUFFER;
  // Denominator uses a full-year baseline (no goalMult) so the KPI honestly
  // represents "% of a household's annual produce". Numerator honors the user's
  // chosen goal via plantsNeeded sizing.
  const householdTarget = producePerPersonLbs * familySize;
  const rawSelfSufficiencyPct = householdTarget > 0
    ? (totalYieldLbs / householdTarget) * 100
    : 0;
  const selfSufficiencyPct = Math.min(100, rawSelfSufficiencyPct);

  return {
    perCrop,
    totalSpaceSqft: totalSpaceWithBuffer,
    totalSpaceRaw: totalSpaceSqft,
    totalPlants,
    totalYieldLbs,
    householdTarget,
    selfSufficiencyPct,
    rawSelfSufficiencyPct,
    categorySpaceMap,
  };
}

// — ProduceTargetField (editable household produce-per-person baseline) —
// The denominator of the self-sufficiency %. 300 lb/person/year is US-centric
// (USDA ERS) — UK households eat closer to 180 lb, ZA subsistence diets vary
// widely. Letting the user override keeps the KPI honest across regions.
function ProduceTargetField({ value, onChange, metric, isMobile }) {
  const displayUnit = metric ? "kg" : "lb";
  const displayValue = metric ? Number((value * LB_TO_KG).toFixed(1)) : value;
  const min = metric ? MIN_PRODUCE_PER_PERSON_LBS * LB_TO_KG : MIN_PRODUCE_PER_PERSON_LBS;
  const max = metric ? MAX_PRODUCE_PER_PERSON_LBS * LB_TO_KG : MAX_PRODUCE_PER_PERSON_LBS;
  const commit = (v) => {
    const asLbs = metric ? v / LB_TO_KG : v;
    onChange(Math.max(MIN_PRODUCE_PER_PERSON_LBS, Math.min(MAX_PRODUCE_PER_PERSON_LBS, asLbs)));
  };
  return (
    <div style={{
      display: "grid", gap: 12, alignItems: "end",
      gridTemplateColumns: isMobile ? "1fr" : "minmax(240px, 320px) 1fr",
    }}>
      <Field label={`Annual produce per person (${displayUnit})`}
        unit={displayUnit}
        value={displayValue} onChange={commit}
        min={Math.round(min)} max={Math.round(max)} step={10} />
      <p style={{
        margin: isMobile ? "-4px 0 0" : "0 0 12px",
        fontSize: 13, color: T.tx3, lineHeight: 1.5,
      }}>
        Default 300&nbsp;lb/person (USDA fresh-produce average). UK households
        average closer to 180&nbsp;lb; full-homestead targets run 400+.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Self-Sufficiency Calculator (Tab 1 / hero) ──
// ═══════════════════════════════════════════════════════════════════════════
function SelfSufficiencyCalculator({
  familySize, setFamilySize,
  goal, setGoal,
  selection, setSelection,
  metric,
  producePerPerson, setProducePerPerson,
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  const results = useMemo(
    () => computeResults(selection, familySize, goal, producePerPerson),
    [selection, familySize, goal, producePerPerson]
  );

  const applyPreset = useCallback((presetKey) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setSelection({ ...preset.selection });
  }, [setSelection]);

  const toggleCrop = useCallback((cropId) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[cropId]) delete next[cropId];
      else next[cropId] = "sometimes";
      return next;
    });
  }, [setSelection]);

  const setCropFrequency = useCallback((cropId, frequency) => {
    setSelection((prev) => ({ ...prev, [cropId]: frequency }));
  }, [setSelection]);

  const cropsByCategory = useMemo(() => {
    const map = {};
    for (const [cropId, crop] of Object.entries(CROPS)) {
      if (!map[crop.category]) map[crop.category] = [];
      map[crop.category].push({ cropId, ...crop });
    }
    return map;
  }, []);

  const unitArea = metric ? "m²" : "sq ft";
  const unitMass = metric ? "kg" : "lbs";
  const areaConv = metric ? SQFT_TO_SQM : 1;
  const massConv = metric ? LB_TO_KG : 1;

  return (
    <section aria-label="Self-Sufficiency Calculator" style={{
      background: T.card,
      border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg,
      padding: isMobile ? 20 : 32,
      boxShadow: T.shadow.lg,
    }}>
      {/* ───── Inputs ───── */}
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
        <div>
          <label style={labelStyle}>Family size</label>
          <Counter value={familySize} onChange={setFamilySize}
            min={1} max={12} label="family size" />
        </div>
        <div>
          <label style={labelStyle}>Goal level</label>
          <PillSelect options={GOAL_OPTIONS} value={goal} onChange={setGoal}
            ariaLabel="Goal level" />
        </div>
      </div>

      {/* ───── Quick-start presets ───── */}
      <div style={{ marginTop: 24 }}>
        <label style={labelStyle}>Quick start</label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <button key={key} type="button" onClick={() => applyPreset(key)}
              style={{
                textAlign: "left", padding: "14px 16px",
                background: T.bg2, border: `1.5px solid ${T.border}`,
                borderRadius: T.radius, cursor: "pointer",
                fontFamily: T.fontBody,
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.cardHover; e.currentTarget.style.borderColor = T.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.bg2; e.currentTarget.style.borderColor = T.border; }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{p.label}</div>
              <div style={{ fontSize: 13, color: T.tx3, marginTop: 2 }}>{p.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ───── Produce target (editable baseline) ───── */}
      <div style={{ marginTop: 24 }}>
        <ProduceTargetField
          value={producePerPerson} onChange={setProducePerPerson}
          metric={metric} isMobile={isMobile} />
      </div>

      {/* ───── Crop selection ───── */}
      <div style={{ marginTop: 32 }}>
        <label style={labelStyle}>What will you grow?</label>
        <div style={{ display: "grid", gap: 18 }}>
          {CATEGORIES.filter((cat) => cropsByCategory[cat.id]?.length).map((cat) => (
            <div key={cat.id}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: T.tx2,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, display: "inline-block" }} />
                {cat.label}
              </div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)" }}>
                {cropsByCategory[cat.id].map(({ cropId, name }) => {
                  const selected = Boolean(selection[cropId]);
                  return (
                    <div key={cropId}
                      style={{
                        padding: "10px 12px", borderRadius: T.radius,
                        background: selected ? T.primaryBg : T.bg,
                        border: `1.5px solid ${selected ? T.primary : T.border}`,
                        transition: "all 0.18s ease",
                      }}>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                        minHeight: 32,
                      }}>
                        <input type="checkbox" checked={selected}
                          onChange={() => toggleCrop(cropId)}
                          style={{ width: 18, height: 18, cursor: "pointer", accentColor: T.primary }}
                          aria-label={name} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{name}</span>
                      </label>
                      {selected && (
                        <div style={{ marginTop: 8 }}>
                          <PillSelect options={FREQUENCY_OPTIONS}
                            value={selection[cropId]}
                            onChange={(f) => setCropFrequency(cropId, f)}
                            size="sm"
                            ariaLabel={`Consumption frequency for ${name}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ───── Results ───── */}
      <div style={{ marginTop: 40 }} aria-live="polite">
        <div style={{
          padding: isMobile ? 20 : 32,
          borderRadius: T.radiusLg,
          background: `linear-gradient(180deg, ${T.primaryBg} 0%, ${T.bg2} 100%)`,
          border: `1.5px solid ${T.border}`,
          textAlign: "center",
        }}>
          <div style={eyebrowStyle}>Your self-sufficiency</div>
          <div style={{ marginTop: 8 }}>
            <CountUpNumber value={results.selfSufficiencyPct}
              decimals={0} size={isMobile ? 56 : 80} unit="%" />
          </div>
          <p style={{
            margin: "12px auto 0", maxWidth: 480,
            fontSize: 15, color: T.tx2, lineHeight: 1.5,
          }}>
            You'd grow about {Math.round(results.selfSufficiencyPct)}% of your family's fresh
            produce needs from the crops you've selected.
            {results.rawSelfSufficiencyPct > 110 && (
              <span style={{ display: "block", marginTop: 6, color: T.primary, fontWeight: 600 }}>
                That's more than your household needs. Extra can go to neighbors,
                preserves, or next year's seed stock.
              </span>
            )}
          </p>
        </div>

        {/* Totals row */}
        <div style={{
          marginTop: 20, display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12,
        }}>
          <MiniStat label="Plants to grow" value={results.totalPlants} unit="plants" />
          <MiniStat label="Garden space (incl. paths)"
            value={results.totalSpaceSqft * areaConv}
            decimals={1} unit={unitArea} />
          <MiniStat label="Estimated yield" value={results.totalYieldLbs * massConv}
            decimals={0} unit={unitMass} />
        </div>

        {/* Category breakdown */}
        <div style={{ marginTop: 24 }}>
          <div style={eyebrowStyle}>Crop area by category</div>
          <div style={{ marginTop: 10 }}>
            <CategoryBar
              categorySpaceMap={results.categorySpaceMap}
              totalSpaceSqft={results.totalSpaceRaw}
              metric={metric} />
          </div>
          <p style={{ marginTop: 10, fontSize: 12, color: T.tx3, lineHeight: 1.5 }}>
            Totals above include 20% extra for paths and margins. The bar shows
            crop area only.
          </p>
        </div>

        {/* Per-crop breakdown */}
        {results.perCrop.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={eyebrowStyle}>Per crop</div>
            <div style={{
              marginTop: 12, display: "grid", gap: 10,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            }}>
              {results.perCrop.map((pc) => (
                <CropBreakdownCard key={pc.cropId} result={pc}
                  metric={metric} areaConv={areaConv} massConv={massConv}
                  unitArea={unitArea} unitMass={unitMass} />
              ))}
            </div>
          </div>
        )}

        <p style={{
          marginTop: 20, fontSize: 13, color: T.tx3, lineHeight: 1.5,
        }}>
          Yields vary by soil, weather, variety, and management. These are conservative
          planning estimates. Adjust as you learn your garden.
        </p>
      </div>
    </section>
  );
}

const labelStyle = {
  display: "block", fontSize: 15, fontWeight: 600, color: T.tx2,
  marginBottom: 10, fontFamily: T.fontBody,
};
const eyebrowStyle = {
  fontSize: 12, fontWeight: 700, color: T.tx2,
  letterSpacing: "0.08em", textTransform: "uppercase",
  fontFamily: T.fontBody,
};

function MiniStat({ label, value, unit, decimals = 0 }) {
  const display = useCountUp(Number.isFinite(value) ? value : 0);
  const text = Number.isFinite(value)
    ? (decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString())
    : "—";
  const readable = Number.isFinite(value) ? `${text} ${unit}` : `${unit} not available`;
  return (
    <div role="group" aria-label={`${label}: ${readable}`} style={{
      padding: "16px 18px", borderRadius: T.radius,
      background: T.card, border: `1.5px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 12, color: T.tx3, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div aria-hidden="true" style={{
        marginTop: 6, fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
        fontSize: 28, fontWeight: 700, color: T.tx,
      }}>
        {text}
        <span style={{ fontSize: 28 * 0.4, color: T.tx3, fontWeight: 500, marginLeft: 4 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

function CropBreakdownCard({ result, metric, areaConv, massConv, unitArea, unitMass }) {
  const { crop, plantsNeeded, spaceSqFt, expectedYieldLbs } = result;
  return (
    <div className="ur-crop-card" style={{
      padding: "14px 16px", borderRadius: T.radius,
      background: T.card, border: `1.5px solid ${T.border}`,
      transition: "background 0.18s ease, border-color 0.18s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx }}>{crop.name}</div>
        <div style={{
          fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          fontSize: 22, fontWeight: 700, color: T.primary,
        }}>{fmtInt(plantsNeeded)}<span style={{ fontSize: 12, color: T.tx3, marginLeft: 4, fontWeight: 500 }}>plants</span></div>
      </div>
      <div style={{
        marginTop: 8, display: "grid", gap: "4px 14px",
        gridTemplateColumns: "auto 1fr", fontSize: 13, color: T.tx2,
      }}>
        <span style={{ color: T.tx3 }}>Space</span>
        <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
          {(spaceSqFt * areaConv).toFixed(1)} {unitArea}
        </span>
        <span style={{ color: T.tx3 }}>Yield</span>
        <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
          ~{(expectedYieldLbs * massConv).toFixed(0)} {unitMass}/yr
        </span>
        <span style={{ color: T.tx3 }}>Maturity</span>
        <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
          {fmtRange(crop.daysToMaturity)} days
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Soil Calculator (Tab 2) ──
// ═══════════════════════════════════════════════════════════════════════════
function computeBedVolumeCuFt(bed) {
  const depthIn = Math.max(0, bed.depthIn || 0);
  if (bed.shape === "rect") {
    const l = Math.max(0, bed.lengthFt || 0);
    const w = Math.max(0, bed.widthFt || 0);
    return (l * w * depthIn) / 12;
  }
  if (bed.shape === "circle") {
    const d = Math.max(0, bed.diameterFt || 0);
    const r = d / 2;
    return (Math.PI * r * r * depthIn) / 12;
  }
  if (bed.shape === "lshape") {
    const ol = bed.outerLengthFt || 0;
    const ow = bed.outerWidthFt || 0;
    const cl = bed.cutoutLengthFt || 0;
    const cw = bed.cutoutWidthFt || 0;
    // Guard: cutout must be strictly smaller than outer, otherwise the L is invalid
    if (ol <= cl || ow <= cw || cl < 0 || cw < 0) return 0;
    const area = ol * ow - cl * cw;
    return (area * depthIn) / 12;
  }
  return 0;
}

function computeSoilResults(beds, mix) {
  let totalCuFt = 0;
  let hasInvalidLShape = false;
  const perBed = [];
  for (const bed of beds) {
    const oneBedCuFt = computeBedVolumeCuFt(bed);
    if (bed.shape === "lshape" && oneBedCuFt === 0) {
      const cl = bed.cutoutLengthFt || 0;
      const cw = bed.cutoutWidthFt || 0;
      const ol = bed.outerLengthFt || 0;
      const ow = bed.outerWidthFt || 0;
      if (cl >= ol || cw >= ow) hasInvalidLShape = true;
    }
    const qty = Math.max(0, Math.floor(bed.qty || 0));
    const subtotal = oneBedCuFt * qty;
    totalCuFt += subtotal;
    perBed.push({ bed, oneBedCuFt, subtotal });
  }

  const components = (mix.components || []).map((c) => {
    const cuft = totalCuFt * c.pct;
    return {
      ...c,
      cuft,
      bags1: Math.ceil(cuft / 1),
      bags1_5: Math.ceil(cuft / 1.5),
      bags2: Math.ceil(cuft / 2),
      cost: cuft * (c.pricePerCuFt || 0),
    };
  });
  const totalCost = components.reduce((s, c) => s + c.cost, 0);
  return {
    totalCuFt,
    totalCuFtWithSettling: totalCuFt * SETTLING_BUFFER,
    cuYd: totalCuFt / 27,
    components,
    totalCost,
    perBed,
    hasInvalidLShape,
  };
}

function SoilCalculator({ beds, setBeds, mixId, setMixId, mixOverrides, setMixOverrides, metric, currency }) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  // Resolve active mix + apply user price/pct overrides if Custom selected
  const activeMix = useMemo(() => {
    const base = SOIL_MIXES.find((m) => m.id === mixId) || SOIL_MIXES[0];
    if (mixId !== "custom" || !mixOverrides) return base;
    return {
      ...base,
      components: base.components.map((c) => ({
        ...c,
        pct: mixOverrides.pcts?.[c.key] ?? c.pct,
        pricePerCuFt: mixOverrides.prices?.[c.key] ?? c.pricePerCuFt,
      })),
    };
  }, [mixId, mixOverrides]);

  // For non-custom mixes, still allow editable prices (US retail varies regionally).
  const priceOverrides = mixOverrides?.prices || {};
  const effectiveMix = useMemo(() => ({
    ...activeMix,
    components: activeMix.components.map((c) => ({
      ...c,
      pricePerCuFt: priceOverrides[c.key] ?? c.pricePerCuFt,
    })),
  }), [activeMix, priceOverrides]);

  const results = useMemo(() => computeSoilResults(beds, effectiveMix), [beds, effectiveMix]);

  const addBed = () => setBeds([...beds, DEFAULT_BED()]);
  const removeBed = (id) => setBeds(beds.filter((b) => b.id !== id).length ? beds.filter((b) => b.id !== id) : beds);
  const updateBed = (id, patch) => setBeds(beds.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const setComponentPrice = (key, value) => {
    setMixOverrides({
      ...(mixOverrides || {}),
      prices: { ...(mixOverrides?.prices || {}), [key]: value },
    });
  };
  const setComponentPct = (key, value) => {
    setMixOverrides({
      ...(mixOverrides || {}),
      pcts: { ...(mixOverrides?.pcts || {}), [key]: value },
    });
  };

  const unitVol = metric ? "L" : "cu ft";
  const volConv = metric ? CUFT_TO_L : 1;
  const cuYdLine = metric
    ? `${(results.totalCuFt * CUFT_TO_CUM).toFixed(2)} m³`
    : `${results.cuYd.toFixed(2)} cu yd`;

  return (
    <section aria-label="Soil Calculator" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* ───── Mix selection ───── */}
      <label style={labelStyle}>Soil mix recipe</label>
      <PillSelect
        options={SOIL_MIXES.map((m) => ({ id: m.id, label: m.label, sub: m.sub }))}
        value={mixId} onChange={setMixId} ariaLabel="Soil mix recipe" />

      {/* ───── Beds ───── */}
      <div style={{ marginTop: 32 }}>
        <label style={labelStyle}>Your beds</label>
        <div style={{ display: "grid", gap: 16 }}>
          {beds.map((bed, i) => (
            <BedEditor key={bed.id} bed={bed} index={i}
              onChange={(patch) => updateBed(bed.id, patch)}
              onRemove={beds.length > 1 ? () => removeBed(bed.id) : null}
              isMobile={isMobile} metric={metric} />
          ))}
        </div>
        <button type="button" onClick={addBed}
          style={{
            marginTop: 14, padding: "12px 20px", minHeight: 44,
            background: "transparent", border: `1.5px dashed ${T.primary}`,
            color: T.primary, borderRadius: T.radiusPill, cursor: "pointer",
            fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
          }}>
          + Add another bed
        </button>
      </div>

      {/* ───── Component editor ───── */}
      <div style={{ marginTop: 32 }}>
        <label style={labelStyle}>Soil components and prices (per {unitVol})</label>
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
        }}>
          {effectiveMix.components.map((c) => {
            const displayPrice = metric
              ? Number(((priceOverrides[c.key] ?? c.pricePerCuFt) / CUFT_TO_L).toFixed(3))
              : priceOverrides[c.key] ?? c.pricePerCuFt;
            const commitPrice = (v) => {
              const cuftPrice = metric ? v * CUFT_TO_L : v;
              setComponentPrice(c.key, Math.max(0, cuftPrice));
            };
            const pctValue = Number(((mixOverrides?.pcts?.[c.key] ?? c.pct) * 100).toFixed(1));
            return (
              <div key={c.key} style={{
                padding: 14, borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 8 }}>{c.label}</div>
                {mixId === "custom" ? (
                  <div style={{ marginBottom: 10 }}>
                    <Field label="Share of mix" unit="%"
                      value={pctValue}
                      onChange={(v) => setComponentPct(c.key, v / 100)}
                      min={0} max={100} step={1} />
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.tx2, marginBottom: 10 }}>
                    <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {(c.pct * 100).toFixed(0)}%
                    </span>{" "}of mix
                  </div>
                )}
                <Field label={`Price per ${unitVol}`} unit={currency}
                  value={displayPrice}
                  onChange={commitPrice}
                  min={0} max={999} step={0.1} />
              </div>
            );
          })}
        </div>
        {mixId === "custom" && (
          <p style={{ fontSize: 12, color: T.tx3, marginTop: 8 }}>
            Custom ratios don't auto-normalize. If they don't sum to 100%, the calculator
            uses your numbers as written.
          </p>
        )}
      </div>

      {/* ───── Results ───── */}
      <div style={{ marginTop: 40 }} aria-live="polite">
        <div style={{
          padding: isMobile ? 20 : 32,
          borderRadius: T.radiusLg,
          background: `linear-gradient(180deg, ${T.primaryBg} 0%, ${T.bg2} 100%)`,
          border: `1.5px solid ${T.border}`,
          textAlign: "center",
        }}>
          <div style={eyebrowStyle}>Total soil needed</div>
          <div style={{ marginTop: 8 }}>
            <CountUpNumber value={results.totalCuFt * volConv}
              decimals={1} size={isMobile ? 48 : 72} unit={unitVol} />
          </div>
          <p style={{ margin: "10px auto 0", fontSize: 14, color: T.tx2 }}>
            {cuYdLine} · or{" "}
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {(results.totalCuFtWithSettling * volConv).toFixed(1)} {unitVol}
            </span>{" "}
            with 15% settling buffer
          </p>
          {results.hasInvalidLShape && (
            <p role="alert" style={{
              margin: "12px auto 0", padding: "8px 12px", maxWidth: 440,
              background: T.errorBg, color: T.error, borderRadius: T.radius,
              fontSize: 13, fontWeight: 600,
            }}>
              One L-shape bed has a cutout as big as or bigger than the outer rectangle.
              Shrink the cutout or it won't compute.
            </p>
          )}
        </div>

        {/* Totals row */}
        <div style={{
          marginTop: 20, display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12,
        }}>
          <MiniStat label="Number of beds" value={beds.reduce((s, b) => s + (b.qty || 0), 0)} unit="beds" />
          <MiniStat label={`Volume (${metric ? "m³" : "cu yd"})`}
            value={metric ? results.totalCuFt * CUFT_TO_CUM : results.cuYd}
            decimals={2} unit={metric ? "m³" : "cu yd"} />
          <MiniStat label="Estimated cost" value={results.totalCost}
            decimals={2} unit={currency} />
        </div>

        {/* Per-component breakdown */}
        <div style={{ marginTop: 24 }}>
          <div style={eyebrowStyle}>Breakdown by component</div>
          <div style={{
            marginTop: 12, display: "grid", gap: 10,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          }}>
            {results.components.map((c) => {
              const bagSizes = metric ? BAG_SIZES_L : BAG_SIZES_CUFT;
              const bagUnit = metric ? "L" : "cu ft";
              const cuftOrL = metric ? c.cuft * CUFT_TO_L : c.cuft;
              return (
                <div key={c.key} style={{
                  padding: "14px 16px", borderRadius: T.radius,
                  background: T.card, border: `1.5px solid ${T.border}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{c.label}</div>
                    <div style={{
                      fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                      fontSize: 20, fontWeight: 700, color: T.primary,
                    }}>
                      {cuftOrL.toFixed(1)}
                      <span style={{ fontSize: 12, color: T.tx3, fontWeight: 500, marginLeft: 4 }}>{bagUnit}</span>
                    </div>
                  </div>
                  <div style={{
                    marginTop: 8, display: "grid", gap: "4px 14px",
                    gridTemplateColumns: "auto 1fr", fontSize: 13, color: T.tx2,
                  }}>
                    {bagSizes.map((size) => {
                      const bags = Math.ceil(cuftOrL / size);
                      return (
                        <React.Fragment key={size}>
                          <span style={{ color: T.tx3 }}>{size} {bagUnit} bags</span>
                          <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
                            {bags}
                          </span>
                        </React.Fragment>
                      );
                    })}
                    <span style={{ color: T.tx3 }}>Subtotal</span>
                    <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
                      {currency}{c.cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p style={{ marginTop: 20, fontSize: 13, color: T.tx3, lineHeight: 1.5 }}>
          Soil typically settles 10–20% over the first few waterings. The "with settling
          buffer" figure adds 15%. Bag counts round up, so plan to have a little extra.
        </p>
      </div>
    </section>
  );
}

function BedEditor({ bed, index, onChange, onRemove, isMobile, metric }) {
  // Display-side unit conversion — internal storage stays imperial.
  const dLen = metric ? FT_TO_M : 1;
  const dDepth = metric ? IN_TO_CM : 1;
  const unitLen = metric ? "m" : "ft";
  const unitDepth = metric ? "cm" : "in";
  const commitLen = (raw) => (metric ? raw / FT_TO_M : raw);
  const commitDepth = (raw) => (metric ? raw / IN_TO_CM : raw);

  return (
    <div style={{
      padding: 16, borderRadius: T.radius,
      background: T.bg2, border: `1.5px solid ${T.border}`,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 10, marginBottom: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.tx2 }}>Bed {index + 1}</div>
        {onRemove && (
          <button type="button" onClick={onRemove}
            aria-label={`Remove bed ${index + 1}`}
            style={{
              padding: "6px 12px", minHeight: 40, border: "none",
              background: "transparent", color: T.error, cursor: "pointer",
              fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
              borderRadius: T.radiusPill,
            }}>
            Remove
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx2, marginBottom: 6 }}>Shape</div>
        <PillSelect options={BED_SHAPES} value={bed.shape}
          onChange={(v) => onChange({ shape: v })} size="sm"
          ariaLabel={`Bed ${index + 1} shape`} />
      </div>

      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(140px, 1fr))",
      }}>
        {bed.shape === "rect" && (
          <>
            <Field label="Length" unit={unitLen}
              value={Number((bed.lengthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ lengthFt: commitLen(v) })}
              min={0.5} max={100} step={0.5} />
            <Field label="Width" unit={unitLen}
              value={Number((bed.widthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ widthFt: commitLen(v) })}
              min={0.5} max={50} step={0.5} />
          </>
        )}
        {bed.shape === "circle" && (
          <Field label="Diameter" unit={unitLen}
            value={Number((bed.diameterFt * dLen).toFixed(2))}
            onChange={(v) => onChange({ diameterFt: commitLen(v) })}
            min={0.5} max={50} step={0.5} />
        )}
        {bed.shape === "lshape" && (
          <>
            <Field label="Outer length" unit={unitLen}
              value={Number((bed.outerLengthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ outerLengthFt: commitLen(v) })}
              min={1} max={100} step={0.5} />
            <Field label="Outer width" unit={unitLen}
              value={Number((bed.outerWidthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ outerWidthFt: commitLen(v) })}
              min={1} max={50} step={0.5} />
            <Field label="Cutout length" unit={unitLen}
              value={Number((bed.cutoutLengthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ cutoutLengthFt: commitLen(v) })}
              min={0} max={99} step={0.5} />
            <Field label="Cutout width" unit={unitLen}
              value={Number((bed.cutoutWidthFt * dLen).toFixed(2))}
              onChange={(v) => onChange({ cutoutWidthFt: commitLen(v) })}
              min={0} max={49} step={0.5} />
          </>
        )}
        <Field label="Depth" unit={unitDepth}
          value={Number((bed.depthIn * dDepth).toFixed(1))}
          onChange={(v) => onChange({ depthIn: commitDepth(v) })}
          min={4} max={48} step={1} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx2, marginBottom: 6 }}>
            How many like this?
          </div>
          <Counter value={bed.qty || 1}
            onChange={(v) => onChange({ qty: Math.max(1, Math.min(20, v)) })}
            min={1} max={20} label={`bed ${index + 1} quantity`} />
        </div>
      </div>

      {bed.shape === "lshape" && (
        <p style={{ fontSize: 12, color: T.tx3, marginTop: 10, lineHeight: 1.5 }}>
          Cutout is measured from one corner of the outer rectangle. It must be strictly
          smaller than the outer dimensions.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Companion Planting Checker (Tab 3) ──
// ═══════════════════════════════════════════════════════════════════════════
function CompanionChecker({ selectedIds, setSelectedIds, focusCropId, setFocusCropId }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [mode, setMode] = useState("bed");  // "bed" | "crop"

  const cropOptions = useMemo(() => {
    return Object.entries(CROPS)
      .map(([id, c]) => ({ id, name: c.name, category: c.category }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const cropsByCategory = useMemo(() => {
    const map = {};
    for (const [cropId, crop] of Object.entries(CROPS)) {
      if (!map[crop.category]) map[crop.category] = [];
      map[crop.category].push({ cropId, ...crop });
    }
    return map;
  }, []);

  const toggleCrop = (id) => {
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  // Mode "crop" — a single focus crop, show all its good/bad companions in the full DB
  const focusCrop = focusCropId && CROPS[focusCropId] ? focusCropId : "tomato";
  const focusGood = useMemo(() => {
    const out = [];
    for (const [id] of Object.entries(CROPS)) {
      if (id === focusCrop) continue;
      const rel = getCompanion(focusCrop, id);
      if (rel?.rel === "good") out.push({ id, ...rel });
    }
    return out.sort((a, b) => CROPS[a.id].name.localeCompare(CROPS[b.id].name));
  }, [focusCrop]);
  const focusBad = useMemo(() => {
    const out = [];
    for (const [id] of Object.entries(CROPS)) {
      if (id === focusCrop) continue;
      const rel = getCompanion(focusCrop, id);
      if (rel?.rel === "bad") out.push({ id, ...rel });
    }
    return out.sort((a, b) => CROPS[a.id].name.localeCompare(CROPS[b.id].name));
  }, [focusCrop]);

  // Mode "bed" — matrix + conflicts among selected
  const conflicts = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < selectedIds.length; i++) {
      for (let j = i + 1; j < selectedIds.length; j++) {
        const rel = getCompanion(selectedIds[i], selectedIds[j]);
        if (rel?.rel === "bad") {
          pairs.push({ a: selectedIds[i], b: selectedIds[j], reason: rel.reason });
        }
      }
    }
    return pairs;
  }, [selectedIds]);

  const benefits = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < selectedIds.length; i++) {
      for (let j = i + 1; j < selectedIds.length; j++) {
        const rel = getCompanion(selectedIds[i], selectedIds[j]);
        if (rel?.rel === "good") {
          pairs.push({ a: selectedIds[i], b: selectedIds[j], reason: rel.reason });
        }
      }
    }
    return pairs;
  }, [selectedIds]);

  return (
    <section aria-label="Companion Planting Checker" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* Mode toggle */}
      <label style={labelStyle}>How do you want to check?</label>
      <PillSelect
        options={[
          { id: "bed",  label: "Build a bed", sub: "Test a group of crops" },
          { id: "crop", label: "Pick a crop", sub: "See its friends and foes" },
        ]}
        value={mode} onChange={setMode} ariaLabel="Companion check mode" />

      {mode === "bed" && (
        <>
          <div style={{ marginTop: 28 }}>
            <label style={labelStyle}>Pick the crops you want to plant together</label>
            <div style={{ display: "grid", gap: 16 }}>
              {CATEGORIES.filter((cat) => cropsByCategory[cat.id]?.length).map((cat) => (
                <div key={cat.id}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: T.tx2,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, display: "inline-block" }} />
                    {cat.label}
                  </div>
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 6,
                  }}>
                    {cropsByCategory[cat.id].map(({ cropId, name }) => {
                      const active = selectedIds.includes(cropId);
                      return (
                        <button key={cropId} type="button"
                          onClick={() => toggleCrop(cropId)}
                          aria-pressed={active}
                          style={{
                            padding: "8px 14px", minHeight: 40,
                            fontSize: 13, fontWeight: active ? 700 : 500,
                            background: active ? T.primary : T.bg,
                            color: active ? "#FEFCF8" : T.tx,
                            border: `1.5px solid ${active ? T.primary : T.border}`,
                            borderRadius: T.radiusPill, cursor: "pointer",
                          }}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Matrix */}
          {selectedIds.length >= 2 && (
            <div style={{ marginTop: 32, overflowX: "auto" }}>
              <div style={eyebrowStyle}>Compatibility matrix</div>
              <div style={{ marginTop: 10 }}>
                <CompatibilityMatrix ids={selectedIds} />
              </div>
              <p style={{ fontSize: 12, color: T.tx3, marginTop: 10 }}>
                Hover or tap a cell for the reason. Blank cells are documented as neutral.
              </p>
            </div>
          )}

          {/* Warnings + benefits */}
          <div style={{ marginTop: 28, display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
            <CompanionList title="Conflicts to watch" tone="bad" pairs={conflicts}
              empty="No documented conflicts in this bed." />
            <CompanionList title="Beneficial pairings" tone="good" pairs={benefits}
              empty="Add more crops to see beneficial pairings." />
          </div>

          {/* Tested bed recipes */}
          <div style={{ marginTop: 32 }}>
            <div style={eyebrowStyle}>Or try a tested bed</div>
            <div style={{
              marginTop: 12, display: "grid", gap: 12,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            }}>
              {COMPANION_GROUPINGS.map((g) => (
                <button key={g.label} type="button"
                  onClick={() => setSelectedIds([...g.crops])}
                  style={{
                    textAlign: "left", padding: 14, borderRadius: T.radius,
                    background: T.bg2, border: `1.5px solid ${T.border}`,
                    cursor: "pointer", fontFamily: T.fontBody,
                  }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>
                    {g.crops.map((id) => CROPS[id]?.name || id).join(" · ")}
                  </div>
                  <div style={{ fontSize: 13, color: T.tx2, marginTop: 6, lineHeight: 1.5 }}>{g.note}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === "crop" && (
        <>
          <div style={{ marginTop: 28 }}>
            <label style={labelStyle}>Choose a crop</label>
            <select
              value={focusCrop}
              onChange={(e) => setFocusCropId(e.target.value)}
              aria-label="Focus crop"
              style={{
                fontSize: 16, fontFamily: T.fontBody,
                background: T.card, color: T.tx,
                border: `1.5px solid ${T.border}`,
                borderRadius: T.radius, padding: "12px 16px",
                minHeight: 48, width: "100%", maxWidth: 360,
              }}>
              {cropOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div style={{
            marginTop: 28, display: "grid", gap: 18,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          }}>
            <CompanionList
              title={`Grows well with ${CROPS[focusCrop].name}`}
              tone="good"
              pairs={focusGood.map((g) => ({ a: focusCrop, b: g.id, reason: g.reason }))}
              empty="No documented beneficial companions in the database yet." />
            <CompanionList
              title={`Avoid near ${CROPS[focusCrop].name}`}
              tone="bad"
              pairs={focusBad.map((g) => ({ a: focusCrop, b: g.id, reason: g.reason }))}
              empty="No documented conflicts. Treat the rest as neutral." />
          </div>
        </>
      )}
    </section>
  );
}

function CompatibilityMatrix({ ids }) {
  // Render as a square grid. Headers omitted on the diagonal.
  const cellSize = 44;
  return (
    <div style={{ display: "inline-block", minWidth: "100%" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <thead>
          <tr>
            <th style={{ width: cellSize, height: cellSize }} aria-hidden="true" />
            {ids.map((id) => (
              <th key={id} scope="col"
                style={{
                  width: cellSize, height: 100,
                  fontSize: 11, fontWeight: 600, color: T.tx2,
                  fontFamily: T.fontBody, whiteSpace: "nowrap",
                  transform: "rotate(-60deg)", transformOrigin: "center",
                  padding: 0,
                }}>
                <div style={{ display: "inline-block" }}>{CROPS[id]?.name || id}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((row) => (
            <tr key={row}>
              <th scope="row" style={{
                fontSize: 12, fontWeight: 600, color: T.tx2, fontFamily: T.fontBody,
                textAlign: "right", paddingRight: 8, whiteSpace: "nowrap",
              }}>
                {CROPS[row]?.name || row}
              </th>
              {ids.map((col) => {
                if (row === col) {
                  return <td key={col} style={{
                    width: cellSize, height: cellSize,
                    background: T.border, borderRadius: 4, opacity: 0.4,
                  }} />;
                }
                const rel = getCompanion(row, col);
                const bg = rel?.rel === "good" ? T.companionGood
                  : rel?.rel === "bad" ? T.companionBad
                  : T.bg2;
                const title = rel ? rel.reason : "No documented interaction.";
                return (
                  <td key={col}
                    title={title}
                    aria-label={`${CROPS[row]?.name} and ${CROPS[col]?.name}: ${rel?.rel || "neutral"}. ${title}`}
                    style={{
                      width: cellSize, height: cellSize,
                      background: bg, borderRadius: 4,
                      cursor: rel ? "help" : "default",
                    }} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompanionList({ title, tone, pairs, empty }) {
  const borderColor = tone === "bad" ? T.companionBad : tone === "good" ? T.companionGood : T.border;
  const toneBg = tone === "bad" ? T.errorBg : tone === "good" ? T.successBg : T.bg2;
  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radius, padding: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: borderColor }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>{title}</span>
      </div>
      {pairs.length === 0 ? (
        <p style={{ fontSize: 13, color: T.tx3, fontStyle: "italic", margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {pairs.map((p, i) => (
            <li key={i} style={{
              padding: 10, borderRadius: T.radius,
              background: toneBg, border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>
                {CROPS[p.a]?.name || p.a} + {CROPS[p.b]?.name || p.b}
              </div>
              <div style={{ fontSize: 12, color: T.tx2, marginTop: 4, lineHeight: 1.5 }}>
                {p.reason}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Landing hero wrapper + Home tab content ──
// ═══════════════════════════════════════════════════════════════════════════
function HomeView(props) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  return (
    <>
      {/* Hero */}
      <section style={{
        background: `linear-gradient(180deg, ${T.bg} 0%, ${T.bg2} 100%)`,
        paddingTop: isMobile ? 32 : 64,
        paddingBottom: isMobile ? 32 : 48,
        paddingLeft: "clamp(16px, 4vw, 48px)",
        paddingRight: "clamp(16px, 4vw, 48px)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              display: "inline-block", padding: "6px 14px", borderRadius: T.radiusPill,
              background: T.goldBg, color: T.gold,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Free. No account. Pay once, use forever.
            </div>
            <h1 style={{
              margin: 0, fontFamily: T.fontDisplay,
              fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1,
              color: T.tx, fontWeight: 400,
            }}>
              Know exactly what to grow
            </h1>
            <p style={{
              margin: "20px auto 0", maxWidth: 580,
              fontSize: isMobile ? 16 : 18, lineHeight: 1.6, color: T.tx2,
            }}>
              Plan your homestead garden based on what your family actually eats.
              Tell us your family size and the crops you'll grow, get instant plant counts,
              space, and yield estimates.
            </p>
          </div>

          {/* The calculator, immediately usable */}
          <div style={{ marginTop: isMobile ? 28 : 40 }}>
            <SelfSufficiencyCalculator {...props} />
          </div>
        </div>
      </section>

      {/* Placeholder landing sections, fleshed out in later sessions */}
      <LandingPlaceholder id="features" title="More free calculators"
        blurb="Soil volume, companion planting, and planting dates. Coming this week." />
      <LandingPlaceholder id="how-it-works" title="How it works"
        blurb="Pick your crops. See your plan. Plant with confidence." bg={T.bg2} />
      <LandingPlaceholder id="pricing" title="Pay once, use forever"
        blurb="Full growing plan, crop database, cost savings, and preservation planner. $19.99 one-time." />
      <LandingPlaceholder id="faq" title="FAQ"
        blurb="Common questions about the planner." bg={T.bg2} />
    </>
  );
}

function LandingPlaceholder({ id, title, blurb, bg }) {
  return (
    <section id={id} style={{
      background: bg || T.bg,
      padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px)",
      scrollMarginTop: 80,
    }}>
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          margin: 0, fontFamily: T.fontDisplay,
          fontSize: "clamp(1.5rem, 3vw, 2.25rem)", fontWeight: 400, color: T.tx,
        }}>
          {title}
        </h2>
        <p style={{
          margin: "16px auto 0", maxWidth: 560,
          fontSize: 16, color: T.tx2, lineHeight: 1.6,
        }}>
          {blurb}
        </p>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Coming Soon (non-live tabs) ──
// ═══════════════════════════════════════════════════════════════════════════
function ComingSoon({ tab }) {
  return (
    <section style={{
      padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px)",
      background: T.bg,
    }}>
      <div style={{
        maxWidth: 560, margin: "0 auto", textAlign: "center",
        padding: 40, borderRadius: T.radiusLg,
        background: T.card, border: `1.5px solid ${T.border}`,
        boxShadow: T.shadow.md,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: T.radiusPill,
          background: T.goldBg, color: T.gold,
          fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Coming soon
        </div>
        <h2 style={{
          margin: 0, fontFamily: T.fontDisplay,
          fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 400, color: T.tx,
        }}>
          {tab.label}
        </h2>
        <p style={{
          margin: "14px auto 0", maxWidth: 420,
          fontSize: 15, color: T.tx2, lineHeight: 1.6,
        }}>
          {tab.blurb}
        </p>
        <a href="#self-sufficiency"
          onClick={(e) => { e.preventDefault(); window.location.hash = "self-sufficiency"; }}
          style={{
            display: "inline-block", marginTop: 24,
            padding: "12px 22px", borderRadius: T.radiusPill,
            background: T.primary, color: "#FEFCF8",
            fontFamily: T.fontBody, fontSize: 15, fontWeight: 600,
            textDecoration: "none", cursor: "pointer",
          }}>
          Back to the free calculator
        </a>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── App chrome (header, tab nav, footer) ──
// ═══════════════════════════════════════════════════════════════════════════
function AppHeader({ metric, setMetric, currency, setCurrency, hemisphere, setHemisphere }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const pillBtnStyle = (active) => ({
    padding: "0 14px", minHeight: 40, minWidth: 44, border: "none", cursor: "pointer",
    background: active ? T.card : "transparent",
    color: active ? T.tx : T.tx2,
    fontWeight: active ? 700 : 500,
    borderRadius: T.radiusPill,
    boxShadow: active ? T.shadow.sm : "none",
    fontFamily: T.fontBody, fontSize: 13,
  });
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "rgba(250, 247, 242, 0.92)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: `12px clamp(16px, 4vw, 48px)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        {/* Logo / title */}
        <a href="#home"
          onClick={(e) => { e.preventDefault(); window.location.hash = "home"; }}
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: T.primary, color: T.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 400,
          }}>H</span>
          <span style={{
            fontFamily: T.fontDisplay, fontSize: isMobile ? 16 : 18,
            color: T.tx, fontWeight: 400,
          }}>
            {isMobile ? "Homestead" : "Homestead Harvest Planner"}
          </span>
        </a>

        {/* Hemisphere + Metric toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div role="radiogroup" aria-label="Hemisphere" title="Used for planting-date calculations when the Planting Dates tab ships"
            style={{
              display: "flex", background: T.bg2, borderRadius: T.radiusPill,
              padding: 3,
            }}>
            {[
              { id: "north", short: "N", long: "Northern" },
              { id: "south", short: "S", long: "Southern" },
            ].map((h) => {
              const active = hemisphere === h.id;
              return (
                <button key={h.id} type="button" role="radio" aria-checked={active}
                  aria-label={`${h.long} hemisphere`}
                  onClick={() => setHemisphere(h.id)}
                  style={pillBtnStyle(active)}>
                  {isMobile ? h.short : h.long}
                </button>
              );
            })}
          </div>

          <div role="radiogroup" aria-label="Unit system" style={{
            display: "flex", background: T.bg2, borderRadius: T.radiusPill, padding: 3,
          }}>
            {["imperial", "metric"].map((u) => {
              const active = (u === "metric") === metric;
              return (
                <button key={u} type="button" role="radio" aria-checked={active}
                  onClick={() => setMetric(u === "metric")}
                  style={pillBtnStyle(active)}>
                  {u === "metric" ? "Metric" : "Imperial"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = TABS; // show every tab, including Home, so there's always a visible selection
  const btnRefs = useRef([]);
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.id === tab));

  const focusTab = (idx) => {
    const clamped = (idx + tabs.length) % tabs.length;
    const el = btnRefs.current[clamped];
    if (el) el.focus();
    setTab(tabs[clamped].id);
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); focusTab(activeIdx + 1); break;
      case "ArrowLeft":  e.preventDefault(); focusTab(activeIdx - 1); break;
      case "Home":       e.preventDefault(); focusTab(0); break;
      case "End":        e.preventDefault(); focusTab(tabs.length - 1); break;
      default: break;
    }
  };

  return (
    <nav role="tablist" aria-label="Planner sections"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      style={{ background: T.bg2, borderBottom: `1px solid ${T.border}` }}>
      <div className="ur-tab-scroller" style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "10px clamp(12px, 4vw, 48px)",
        display: "flex", gap: 6, overflowX: "auto",
      }}>
        {tabs.map((t, i) => {
          const active = tab === t.id;
          return (
            <button key={t.id}
              ref={(el) => (btnRefs.current[i] = el)}
              role="tab" aria-selected={active} aria-controls="main-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              style={{
                padding: "0 16px", minHeight: 44,
                fontSize: 14, fontWeight: active ? 700 : 500, fontFamily: T.fontBody,
                color: active ? "#FEFCF8" : T.tx2,
                background: active ? T.primary : "transparent",
                border: `1.5px solid ${active ? T.primary : "transparent"}`,
                borderRadius: T.radiusPill, cursor: "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 6,
                opacity: t.live || active ? 1 : 0.72,
                transition: "all 0.15s ease",
              }}>
              {t.label}
              {!t.live && (
                <span aria-label="coming soon" style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "2px 6px", borderRadius: 999,
                  background: active ? "rgba(255,255,255,0.2)" : T.goldBg,
                  color: active ? "#FEFCF8" : T.gold,
                }}>Soon</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TabPageShell({ title, blurb, children }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  return (
    <section style={{
      padding: "clamp(32px, 5vw, 64px) clamp(16px, 4vw, 48px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{
          margin: 0, fontFamily: T.fontDisplay,
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, color: T.tx,
        }}>
          {title}
        </h1>
        {blurb && (
          <p style={{
            margin: "12px 0 28px", maxWidth: 640,
            fontSize: isMobile ? 15 : 17, color: T.tx2, lineHeight: 1.55,
          }}>
            {blurb}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

function AppFooter() {
  return (
    <footer style={{
      background: T.bg2, borderTop: `1px solid ${T.border}`,
      padding: "32px clamp(16px, 4vw, 48px)",
      color: T.tx2, fontSize: 13, textAlign: "center",
    }}>
      <div>
        Homestead Harvest Planner · by{" "}
        <a href="#home" style={{ color: T.primary, textDecoration: "none", fontWeight: 600 }}>Urban Root</a>
      </div>
      <div style={{ marginTop: 6, color: T.tx3 }}>
        Session 1 preview. Soil calculator, companion checker, and planting dates coming soon.
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Main App ──
// ═══════════════════════════════════════════════════════════════════════════
const VALID_TABS = TABS.map((t) => t.id);

export default function App() {
  // Tab routing
  const [tab, setTab] = useState("home");

  // Global prefs
  const [metric, setMetric] = useState(() => loadState(LS_METRIC, false) === true);
  const [currency, setCurrency] = useState(() => {
    const c = loadState(LS_CURRENCY, "$");
    return typeof c === "string" && c.length <= 3 ? c : "$";
  });
  const [hemisphere, setHemisphere] = useState(() => {
    const h = loadState(LS_HEMISPHERE, "north");
    return h === "south" ? "south" : "north";
  });
  const [producePerPerson, setProducePerPerson] = useState(() => {
    const raw = loadState(LS_PRODUCE_TARGET, DEFAULT_PRODUCE_PER_PERSON_LBS);
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_PRODUCE_PER_PERSON_LBS;
    return Math.max(MIN_PRODUCE_PER_PERSON_LBS, Math.min(MAX_PRODUCE_PER_PERSON_LBS, n));
  });

  // Calculator state
  const [familySize, setFamilySize] = useState(() =>
    clampInt(loadState(LS_FAMILY, 4), 1, 12));
  const [goal, setGoal] = useState("fresh_preserving");
  const [selection, setSelection] = useState(() => {
    const saved = loadState(LS_CROPS, null);
    if (saved && typeof saved === "object") {
      // Sanitize: only known crops, only known frequencies
      const clean = {};
      for (const [k, v] of Object.entries(saved)) {
        if (CROPS[k] && FREQUENCY_FACTOR[v]) clean[k] = v;
      }
      if (Object.keys(clean).length > 0) return clean;
    }
    return { ...PRESETS.family_basics.selection };
  });

  // Soil Calculator state
  const [beds, setBeds] = useState(() => {
    const saved = loadState(LS_BEDS, null);
    if (Array.isArray(saved) && saved.length > 0) {
      // Sanitize shape + numeric fields; drop entries missing a shape
      const valid = saved
        .filter((b) => b && BED_SHAPES.some((s) => s.id === b.shape))
        .map((b) => ({ ...DEFAULT_BED(), ...b }));
      if (valid.length > 0) return valid;
    }
    return [DEFAULT_BED()];
  });
  const [soilState, setSoilState] = useState(() => {
    const saved = loadState(LS_SOIL, null);
    const validMixId = SOIL_MIXES.some((m) => m.id === saved?.mixId) ? saved.mixId : "classic_60_30_10";
    const overrides = (saved?.mixOverrides && typeof saved.mixOverrides === "object") ? saved.mixOverrides : null;
    return { mixId: validMixId, mixOverrides: overrides };
  });
  const setMixId = (id) => setSoilState((s) => ({ ...s, mixId: id }));
  const setMixOverrides = (overrides) => setSoilState((s) => ({ ...s, mixOverrides: overrides }));

  // Companion Checker state
  const [companionSelection, setCompanionSelection] = useState(() => {
    const saved = loadState(LS_COMPANION, null);
    if (Array.isArray(saved?.bed)) {
      const valid = saved.bed.filter((id) => CROPS[id]);
      if (valid.length > 0) return { bed: valid, focus: CROPS[saved.focus] ? saved.focus : "tomato" };
    }
    return { bed: ["tomato", "basil", "carrot", "onion"], focus: "tomato" };
  });
  const setCompanionBed = (ids) => setCompanionSelection((s) => ({ ...s, bed: ids }));
  const setCompanionFocus = (id) => setCompanionSelection((s) => ({ ...s, focus: id }));

  // Persist settings
  useEffect(() => { persistState(LS_METRIC, metric); }, [metric]);
  useEffect(() => { persistState(LS_CURRENCY, currency); }, [currency]);
  useEffect(() => { persistState(LS_FAMILY, familySize); }, [familySize]);
  useEffect(() => { persistState(LS_CROPS, selection); }, [selection]);
  useEffect(() => { persistState(LS_BEDS, beds); }, [beds]);
  useEffect(() => { persistState(LS_SOIL, soilState); }, [soilState]);
  useEffect(() => { persistState(LS_COMPANION, companionSelection); }, [companionSelection]);
  useEffect(() => { persistState(LS_HEMISPHERE, hemisphere); }, [hemisphere]);
  useEffect(() => { persistState(LS_PRODUCE_TARGET, producePerPerson); }, [producePerPerson]);

  // Hash routing: mount-only init + back/forward
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && VALID_TABS.includes(hash)) setTab(hash);
    const onPop = (e) => {
      const stateTab = e.state?.tab;
      const hashTab = window.location.hash.slice(1) || "home";
      const next = VALID_TABS.includes(stateTab)
        ? stateTab
        : (VALID_TABS.includes(hashTab) ? hashTab : "home");
      setTab(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Tab change: update hash + scroll to top
  const changeTab = useCallback((id) => {
    if (!VALID_TABS.includes(id)) return;
    setTab(id);
    if (window.location.hash.slice(1) !== id) {
      window.history.pushState({ tab: id }, "", `#${id}`);
    }
    window.scrollTo(0, 0);
  }, []);

  // Resolve active tab data. If state ever desyncs (corrupt hash, schema change)
  // snap back to Home so `ComingSoon` never renders with a stale blurb.
  const activeTab = useMemo(() => {
    return TABS.find((x) => x.id === tab) || TABS[0];
  }, [tab]);
  useEffect(() => {
    if (!VALID_TABS.includes(tab)) setTab("home");
  }, [tab]);

  const calcProps = {
    familySize, setFamilySize,
    goal, setGoal,
    selection, setSelection,
    metric,
    producePerPerson, setProducePerPerson,
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.tx,
      fontFamily: T.fontBody, fontSize: 16,
    }}>
      <GlobalStyles />

      <AppHeader metric={metric} setMetric={setMetric}
        currency={currency} setCurrency={setCurrency}
        hemisphere={hemisphere} setHemisphere={setHemisphere} />

      <TabBar tab={tab} setTab={changeTab} />

      <main id="main-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "home" && <HomeView {...calcProps} />}
        {tab === "self-sufficiency" && (
          <TabPageShell
            title="Self-Sufficiency Calculator"
            blurb="Plan the right number of plants for your family based on what you'll eat and how.">
            <SelfSufficiencyCalculator {...calcProps} />
          </TabPageShell>
        )}
        {tab === "soil" && (
          <TabPageShell
            title="Raised Bed Soil Calculator"
            blurb="Measure your beds, pick a soil recipe, get the volume and bag counts you actually need.">
            <SoilCalculator
              beds={beds} setBeds={setBeds}
              mixId={soilState.mixId} setMixId={setMixId}
              mixOverrides={soilState.mixOverrides} setMixOverrides={setMixOverrides}
              metric={metric} currency={currency} />
          </TabPageShell>
        )}
        {tab === "companion" && (
          <TabPageShell
            title="Companion Planting Checker"
            blurb="See which crops help each other and which ones fight in the same bed.">
            <CompanionChecker
              selectedIds={companionSelection.bed}
              setSelectedIds={setCompanionBed}
              focusCropId={companionSelection.focus}
              setFocusCropId={setCompanionFocus} />
          </TabPageShell>
        )}
        {tab !== "home" && tab !== "self-sufficiency" && tab !== "soil" && tab !== "companion" && (
          <ComingSoon tab={activeTab} />
        )}
      </main>

      <AppFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Global styles (media queries, keyframes, scrollbar hiding) ──
// ═══════════════════════════════════════════════════════════════════════════
function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: ${T.fontBody};
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      a { color: inherit; }
      button:focus-visible,
      a:focus-visible,
      input:focus-visible,
      [role="radio"]:focus-visible,
      [role="tab"]:focus-visible {
        outline: 2px solid ${T.accent};
        outline-offset: 2px;
      }
      /* Hide horizontal tab scrollbar visually while keeping scroll */
      .ur-tab-scroller { scrollbar-width: none; -ms-overflow-style: none; }
      .ur-tab-scroller::-webkit-scrollbar { display: none; }

      /* Subtle hover on per-crop breakdown cards */
      .ur-crop-card:hover {
        background: ${T.cardHover};
        border-color: ${T.tx3};
      }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 640px) {
        /* iOS-zoom guard: every text input at 16px on mobile */
        input, select, textarea { font-size: 16px !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}
