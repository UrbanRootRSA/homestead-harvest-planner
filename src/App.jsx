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

// ═══════════════════════════════════════════════════════════════════════════
// ── Conversion constants + USDA baseline ──
// ═══════════════════════════════════════════════════════════════════════════
const SQFT_TO_SQM = 0.0929;
const LB_TO_KG = 0.453592;
const PATH_BUFFER = 1.20; // 20% extra for paths + margins
// USDA MyPlate suggests ~2.5 cups of veg/day (~165 lb/person/year). Homesteaders
// typically plan higher to cover root storage, preservation losses, and a wider
// variety of crops (fruits, herbs, and greens above the minimum). 200 lb/person
// is a reasonable whole-food annual target for the "family veg + fruit" denominator.
const ANNUAL_PRODUCE_PER_PERSON_LBS = 200;

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
    daysToMaturity: [90, 120], spacingSqFt: 1, yieldPerPlantLbs: [0.5, 1],
    sunHours: 7, waterNeeds: "moderate", difficulty: 2,
    avgConsumptionLbsPerPersonYear: 5, groceryPricePerLb: 3.80, caloriesPer100g: 32,
    preservation: ["freeze", "can", "dehydrate"],
    startIndoorsWeeks: null, transplantWeeks: -2, directSowWeeks: null,
    harvestStartWeeks: 40, harvestDurationWeeks: 4,
  },
};

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
const GOAL_MULTIPLIER = {
  fresh_only: 0.4,
  fresh_preserving: 0.7,
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
  { id: "soil",             label: "Soil",            paid: false, live: false, blurb: "Raised-bed volume, soil mix breakdown, and bag estimates." },
  { id: "companion",        label: "Companion",       paid: false, live: false, blurb: "Which crops grow well together, which ones fight." },
  { id: "planting-dates",   label: "Planting Dates",  paid: false, live: false, blurb: "Start indoors, transplant, direct sow, and harvest windows for your zone." },
  { id: "growing-plan",     label: "Growing Plan",    paid: true,  live: false, blurb: "AI-generated personalized growing plan for your garden." },
  { id: "crops",            label: "Crop Database",   paid: true,  live: false, blurb: "Complete data for every crop, searchable and sortable." },
  { id: "cost-savings",     label: "Cost Savings",    paid: true,  live: false, blurb: "Grocery savings, setup costs, ROI, and break-even timeline." },
  { id: "preservation",     label: "Preservation",    paid: true,  live: false, blurb: "How to can, freeze, dehydrate, and store your harvest." },
];

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
function computeResults(selectedMap, familySize, goalKey) {
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
    const [yieldLow] = crop.yieldPerPlantLbs;
    const plantsNeeded = yieldLow > 0 ? Math.ceil(annualNeedLbs / yieldLow) : 0;
    const spaceSqFt = plantsNeeded * crop.spacingSqFt;
    const expectedYieldLbs = plantsNeeded * yieldLow;

    perCrop.push({
      cropId, crop, annualNeedLbs, plantsNeeded, spaceSqFt, expectedYieldLbs, frequency,
    });
    totalSpaceSqft += spaceSqFt;
    totalPlants += plantsNeeded;
    totalYieldLbs += expectedYieldLbs;
    categorySpaceMap[crop.category] = (categorySpaceMap[crop.category] || 0) + spaceSqFt;
  }

  const totalSpaceWithBuffer = totalSpaceSqft * PATH_BUFFER;
  const householdTarget = ANNUAL_PRODUCE_PER_PERSON_LBS * familySize * goalMult;
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

// ═══════════════════════════════════════════════════════════════════════════
// ── Self-Sufficiency Calculator (Tab 1 / hero) ──
// ═══════════════════════════════════════════════════════════════════════════
function SelfSufficiencyCalculator({
  familySize, setFamilySize,
  goal, setGoal,
  selection, setSelection,
  metric,
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  const results = useMemo(
    () => computeResults(selection, familySize, goal),
    [selection, familySize, goal]
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
function AppHeader({ metric, setMetric, currency, setCurrency }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
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
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
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

        {/* Metric toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div role="radiogroup" aria-label="Unit system" style={{
            display: "flex", background: T.bg2, borderRadius: T.radiusPill,
            padding: 4, fontSize: 13, fontFamily: T.fontBody,
          }}>
            {["imperial", "metric"].map((u) => {
              const active = (u === "metric") === metric;
              return (
                <button key={u} type="button" role="radio" aria-checked={active}
                  onClick={() => setMetric(u === "metric")}
                  style={{
                    padding: "0 18px", minHeight: 44, minWidth: 44, border: "none",
                    cursor: "pointer",
                    background: active ? T.card : "transparent",
                    color: active ? T.tx : T.tx2,
                    fontWeight: active ? 700 : 500,
                    borderRadius: T.radiusPill,
                    boxShadow: active ? T.shadow.sm : "none",
                  }}>
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

  // Persist settings
  useEffect(() => { persistState(LS_METRIC, metric); }, [metric]);
  useEffect(() => { persistState(LS_CURRENCY, currency); }, [currency]);
  useEffect(() => { persistState(LS_FAMILY, familySize); }, [familySize]);
  useEffect(() => { persistState(LS_CROPS, selection); }, [selection]);

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
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.tx,
      fontFamily: T.fontBody, fontSize: 16,
    }}>
      <GlobalStyles />

      <AppHeader metric={metric} setMetric={setMetric}
        currency={currency} setCurrency={setCurrency} />

      <TabBar tab={tab} setTab={changeTab} />

      <main id="main-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "home" && <HomeView {...calcProps} />}
        {tab === "self-sufficiency" && (
          <section style={{
            padding: "clamp(32px, 5vw, 64px) clamp(16px, 4vw, 48px)",
          }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <h1 style={{
                margin: "0 0 24px", fontFamily: T.fontDisplay,
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, color: T.tx,
              }}>
                Self-Sufficiency Calculator
              </h1>
              <SelfSufficiencyCalculator {...calcProps} />
            </div>
          </section>
        )}
        {tab !== "home" && tab !== "self-sufficiency" && (
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
