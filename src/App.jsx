import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CROPS, CATEGORIES } from "./data/crops.js";
import { COMPANIONS, COMPANION_GROUPINGS, getCompanion } from "./data/companions.js";
// COMPANIONS kept in the import surface for the future Crop Database tab.

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
  // tx3 was #9A8E80 — measured ~2.6:1 on bg2 and ~3.2:1 on card, sub-AA for
  // 12-13px secondary text. Darkened to #7A6E5F to clear 4.5:1 on both
  // surfaces while staying clearly subordinate to tx2. Audit #79.
  tx3: "#7A6E5F",

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

  // Translucent white overlay for chips sitting on a primary-coloured surface
  // (e.g. the "Soon" chip inside an active tab button). Tokenised so no raw
  // rgba values escape into the component tree.
  onPrimaryOverlay: "rgba(254, 252, 248, 0.2)",
  onPrimaryDim: "rgba(254, 252, 248, 0.78)",  // dimmed text on primary surface

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
const LS_PLANTING = "hhp_planting";
const LS_CROP_DB = "hhp_crop_db";
const LS_COST_SAVINGS = "hhp_cost_savings";
const LS_PRESERVATION = "hhp_preservation";
const LS_PLAN = "hhp_plan";

// Paywall storage (Session 4). hhp_paid is NOT read on mount — state machine
// is paid:false / validating:true until the server confirms. See engineering-
// patterns.md §8. hhp_pending is the Checkout.Success timestamp for the 48-h
// grace window that covers the delay between payment and key-email delivery.
const LS_KEY = "hhp_key";
const LS_INSTANCE = "hhp_instance";
const LS_PENDING = "hhp_pending";
const GRACE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CHECKOUT_URL = "https://thehomesteadplan.lemonsqueezy.com/checkout/buy/ee15261e-d919-4650-9c84-fb6bbf10eca2";
const PRICE_USD = "19.99";

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
  { id: "self-sufficiency", label: "Self-Sufficiency",paid: false, live: true,  blurb: "Tell us what your family eats. Get plant counts, garden space, and self-sufficiency % instantly." },
  { id: "soil",             label: "Soil",            paid: false, live: true,  blurb: "Raised-bed volume, soil mix breakdown, and bag estimates." },
  { id: "companion",        label: "Companion",       paid: false, live: true,  blurb: "Which crops grow well together, which ones fight." },
  { id: "planting-dates",   label: "Planting Dates",  paid: false, live: true,  blurb: "Start indoors, transplant, direct sow, and harvest windows for your zone." },
  { id: "growing-plan",     label: "Growing Plan",    paid: true,  live: true,  blurb: "Personalised month-by-month growing plan for your garden." },
  { id: "crops",            label: "Crop Database",   paid: true,  live: true,  blurb: "Complete data for every crop, searchable and sortable." },
  { id: "cost-savings",     label: "Cost Savings",    paid: true,  live: true,  blurb: "Grocery savings, setup costs, ROI, and break-even timeline." },
  { id: "preservation",     label: "Preservation",    paid: true,  live: true,  blurb: "How to can, freeze, dehydrate, and store your harvest." },
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

// Module-level counter guarantees unique ids even when two beds are created
// in the same millisecond (e.g. rapid preset import). Beats Date.now()+random.
let bedIdCounter = 0;
const DEFAULT_BED = () => ({
  id: `bed_${++bedIdCounter}`,
  shape: "rect",
  // stored internally as feet and inches regardless of metric toggle
  lengthFt: 8, widthFt: 4, depthIn: 12,
  diameterFt: 4,
  outerLengthFt: 8, outerWidthFt: 6, cutoutLengthFt: 4, cutoutWidthFt: 3,
  qty: 1,
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Planting date tables (USDA zones, Northern hemisphere reference) ──
// Extension-service midpoints. Southern hemisphere flips all dates by 6 months.
// User can override per their hyperlocal frost history via manual entry.
// ═══════════════════════════════════════════════════════════════════════════
const ZONE_FROST_DATES = {
  3:  { lastSpring: { m: 5,  d: 15 }, firstFall: { m: 9,  d: 15 } },
  4:  { lastSpring: { m: 5,  d: 1  }, firstFall: { m: 10, d: 1  } },
  5:  { lastSpring: { m: 4,  d: 15 }, firstFall: { m: 10, d: 15 } },
  6:  { lastSpring: { m: 4,  d: 1  }, firstFall: { m: 10, d: 30 } },
  7:  { lastSpring: { m: 3,  d: 22 }, firstFall: { m: 11, d: 5  } },
  8:  { lastSpring: { m: 3,  d: 10 }, firstFall: { m: 11, d: 15 } },
  9:  { lastSpring: { m: 2,  d: 15 }, firstFall: { m: 12, d: 1  } },
  10: { lastSpring: { m: 2,  d: 1  }, firstFall: { m: 12, d: 15 } },
  11: { lastSpring: { m: 1,  d: 15 }, firstFall: { m: 12, d: 31 } },
};

const PLANTING_DATE_DEFAULT_CROPS = [
  "tomato", "bell_pepper", "cucumber", "lettuce", "kale",
  "carrot", "potato", "onion", "green_beans_bush", "basil",
];

// ═══════════════════════════════════════════════════════════════════════════
// ── Utilities ──
// ═══════════════════════════════════════════════════════════════════════════
const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

// Sanitise any numeric field loaded from localStorage / import. Returns the
// fallback when the value isn't a finite number, otherwise clamps to [min, max].
// Use this for every numeric field in every schema loader — a single corrupt
// entry spread into a defaults object otherwise cascades NaN through every
// downstream calculation.
const sanitizeNum = (v, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
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

// Lightly tints a hex color to use as a card background. Keeps the crop
// selector legible across 8 category colours — pure primary tint worked
// for one green theme; per-category tints need a consistent ~12% alpha.
const hexToRgba = (hex, alpha = 0.12) => {
  if (typeof hex !== "string") return `rgba(0,0,0,${alpha})`;
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
};

const fmtRange = (arr, unit = "") => {
  if (!Array.isArray(arr) || arr.length !== 2) return "—";
  const [a, b] = arr;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  if (a === b) return `${a}${unit}`;
  return `${a}${unit}–${b}${unit}`;
};

// Maturity formatter that knows about perennials. Berry / rhubarb /
// artichoke crops carry `daysToMaturity: [730, 1095]` meaning 2-3 years
// to first productive harvest — rendering that as "730-1095 days"
// alongside annual rows like "60-90 days" reads as broken. For perennials,
// convert to integer-year ranges (round half-up) so the UI stays readable.
// Annuals pass through to fmtRange unchanged.
const fmtMaturity = (daysRange, season) => {
  if (season !== "perennial") return `${fmtRange(daysRange)} days`;
  if (!Array.isArray(daysRange) || daysRange.length !== 2) return "Perennial";
  const [lo, hi] = daysRange;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "Perennial";
  const yrLo = Math.max(1, Math.round(lo / 365));
  const yrHi = Math.max(yrLo, Math.round(hi / 365));
  if (yrLo === yrHi) return `Year ${yrLo}+`;
  return `Year ${yrLo}–${yrHi}+`;
};

// — Planting date helpers —
// All dates use the numeric Date constructor and setDate for offsets (never
// epoch-ms arithmetic; that breaks across DST). Single anchor = lastSpring.
function monthDayToDate(md, year) {
  return new Date(year, md.m - 1, md.d);
}
function addWeeks(date, weeks) {
  if (!date || weeks == null) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}
function shiftMonths(date, months) {
  if (!date) return null;
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDate(date, refYear) {
  if (!date || !Number.isFinite(date.getTime())) return "—";
  const y = date.getFullYear();
  const base = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  return refYear && y !== refYear ? `${base}, ${y}` : base;
}
function dayOfYear(date, refYear) {
  if (!date) return null;
  const jan1 = new Date(refYear, 0, 1);
  return (date - jan1) / 86400000; // can be negative or > 365 if cross-year
}

function getFrostDates(mode, zone, hemisphere, manualFrost, referenceYear) {
  if (mode === "manual") {
    const ls = parseIsoDate(manualFrost?.lastSpring);
    const ff = parseIsoDate(manualFrost?.firstFall);
    if (!ls || !ff) return null;
    return { lastSpring: ls, firstFall: ff, source: "manual" };
  }
  const base = ZONE_FROST_DATES[zone];
  if (!base) return null;
  let ls = monthDayToDate(base.lastSpring, referenceYear);
  let ff = monthDayToDate(base.firstFall, referenceYear);
  if (hemisphere === "south") {
    ls = shiftMonths(ls, 6);
    ff = shiftMonths(ff, 6);
  }
  return { lastSpring: ls, firstFall: ff, source: "zone" };
}

function parseIsoDate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  // Round-trip check: JS silently normalises Feb 30 to Mar 2. Reject that.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}
function toIsoDate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Per-crop planting windows. Anchor-picker priority (per engineering-verifier):
// user's sowMethod choice > crop.sowMethod default > transplant > direct sow.
// harvestStartWeeks measured from whichever anchor ends up active.
function computePlantingDates(crop, frostDates, sowMethodOverride = null) {
  const out = {
    startIndoors: null, transplant: null, directSow: null,
    harvestStart: null, harvestEnd: null, anchorMethod: null,
    frostRiskAtHarvest: false,
  };
  if (!crop || !frostDates) return out;
  const { lastSpring, firstFall } = frostDates;

  if (crop.startIndoorsWeeks != null) out.startIndoors = addWeeks(lastSpring, crop.startIndoorsWeeks);
  if (crop.transplantWeeks   != null) out.transplant   = addWeeks(lastSpring, crop.transplantWeeks);
  if (crop.directSowWeeks    != null) out.directSow    = addWeeks(lastSpring, crop.directSowWeeks);

  const method = sowMethodOverride || crop.sowMethod;
  let anchor = null;
  if (method === "transplant" && out.transplant) {
    anchor = out.transplant; out.anchorMethod = "transplant";
  } else if (method === "direct" && out.directSow) {
    anchor = out.directSow;  out.anchorMethod = "direct";
  } else if (method === "either") {
    if (out.transplant) { anchor = out.transplant; out.anchorMethod = "transplant"; }
    else if (out.directSow) { anchor = out.directSow; out.anchorMethod = "direct"; }
  }
  if (!anchor) {
    if (out.transplant)   { anchor = out.transplant;   out.anchorMethod = "transplant"; }
    else if (out.directSow)   { anchor = out.directSow;   out.anchorMethod = "direct"; }
    else if (out.startIndoors) { anchor = out.startIndoors; out.anchorMethod = "indoors"; }
  }

  if (anchor && crop.harvestStartWeeks != null) {
    out.harvestStart = addWeeks(anchor, crop.harvestStartWeeks);
    if (crop.harvestDurationWeeks != null) {
      out.harvestEnd = addWeeks(out.harvestStart, crop.harvestDurationWeeks);
    }
  }

  // First-frost warning: warm-season crop whose harvest extends past first fall frost
  if (crop.season === "warm" && out.harvestEnd && firstFall && out.harvestEnd > firstFall) {
    out.frostRiskAtHarvest = true;
  }

  return out;
}

// Split a [start, end] date range into segments relative to a reference year.
// offYear: -1 = before refYear, 0 = within refYear, +1 = after refYear.
// Used by the timeline renderer so cross-year phases (garlic, asparagus) split
// into two edge-bars instead of being silently clipped.
function splitRange(start, end, refYear) {
  if (!start || !end || end < start) return [];
  const yearStart = new Date(refYear, 0, 1);
  const yearEnd   = new Date(refYear + 1, 0, 1); // exclusive
  const segments = [];
  if (end < yearStart) {
    segments.push({ start, end, offYear: -1 });
  } else if (start >= yearEnd) {
    segments.push({ start, end, offYear: +1 });
  } else if (start < yearStart && end >= yearStart && end < yearEnd) {
    segments.push({ start, end: new Date(refYear - 1, 11, 31), offYear: -1 });
    segments.push({ start: yearStart, end, offYear: 0 });
  } else if (start >= yearStart && start < yearEnd && end >= yearEnd) {
    segments.push({ start, end: new Date(refYear, 11, 31), offYear: 0 });
    segments.push({ start: new Date(refYear + 1, 0, 1), end, offYear: +1 });
  } else {
    segments.push({ start, end, offYear: 0 });
  }
  return segments;
}

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
function clearLS(key) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

// POST licence key to our serverless validator. Returns:
//   { valid: true,  instance_id: string|null }
//   { valid: false, error: string, retry_activation?: boolean }
// Never throws — network failures resolve to { valid: false, error: ... } so
// the caller can simply branch on `valid`.
async function validateKeyRemote(key, instanceId) {
  try {
    const resp = await fetch("/api/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: String(key || "").trim(),
        instance_id: instanceId ? String(instanceId) : undefined,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (typeof data !== "object" || data === null) {
      return { valid: false, error: "Unexpected response from licence server." };
    }
    return data;
  } catch (e) {
    return { valid: false, error: "Can't reach the licence server. Check your connection and try again." };
  }
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
          // Intentionally no outline override — let the global :focus-visible
          // rule render the Urban Root accent ring. Inline outline:none here
          // broke keyboard navigation (WCAG 2.4.7).
        }}
      />
    </label>
  );
}

// — PillSelect (for goal, frequency; segmented control) —
// activeColor: optional override for the active-pill background. Used by
// the crop-selector frequency controls to tint each pill to its category
// (leafy green, root amber, etc.) instead of the default primary green.
function PillSelect({ options, value, onChange, size = "md", ariaLabel, activeColor }) {
  const padding = size === "sm" ? "8px 14px" : "10px 18px";
  const fontSize = size === "sm" ? 13 : 15;
  const btnRefs = useRef([]);

  // Arrow-key navigation for the radiogroup (per WAI-ARIA authoring practices).
  // Unlike the tablist, activating a radio option is cheap (no scroll, no route
  // change), so arrow keys both move focus AND select.
  const onKeyDown = (e) => {
    const currentIdx = btnRefs.current.findIndex((el) => el === document.activeElement);
    const activeIdx = currentIdx >= 0 ? currentIdx : options.findIndex((o) => o.id === value);
    let next = activeIdx;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown": next = (activeIdx + 1 + options.length) % options.length; break;
      case "ArrowLeft":
      case "ArrowUp":   next = (activeIdx - 1 + options.length) % options.length; break;
      case "Home":      next = 0; break;
      case "End":       next = options.length - 1; break;
      default: return;
    }
    e.preventDefault();
    const el = btnRefs.current[next];
    if (el) el.focus();
    onChange(options[next].id);
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: 4,
        background: T.bg2, borderRadius: T.radiusPill,
      }}>
      {options.map((opt, i) => {
        const active = value === opt.id;
        return (
          <button key={opt.id} type="button" role="radio" aria-checked={active}
            ref={(el) => (btnRefs.current[i] = el)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.id)}
            style={{
              flex: "1 1 auto", minHeight: size === "sm" ? 40 : 44,
              padding, fontSize, fontWeight: active ? 700 : 500,
              fontFamily: T.fontBody, color: active ? "#FEFCF8" : T.tx2,
              background: active ? (activeColor || T.primary) : "transparent",
              border: "none", borderRadius: T.radiusPill, cursor: "pointer",
              transition: "all 0.18s ease", whiteSpace: "nowrap",
            }}>
            <span style={{ display: "block" }}>{opt.label}</span>
            {opt.sub && (
              <span style={{
                display: "block", fontSize: 11, fontWeight: 400, marginTop: 2,
                color: active ? T.onPrimaryDim : T.tx3,
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

// — BrandMark (inline SVG so the logo doesn't fall back to system font) —
function BrandMark({ size = 32 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: Math.max(6, Math.round(size / 4)),
      background: T.primary,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62}
        role="img" aria-label="Homestead Harvest Planner logo">
        {/* Stylised "H" — two verticals and a crossbar, evoking raised beds */}
        <rect x="7"  y="5"  width="3.5" height="22" rx="1" fill={T.bg} />
        <rect x="21.5" y="5" width="3.5" height="22" rx="1" fill={T.bg} />
        <rect x="7"  y="14.5" width="18" height="3" rx="1" fill={T.bg} />
        {/* Small "sprout" accent above the crossbar */}
        <path d="M16 8 C 16 6, 17.5 5, 19 5 C 17.5 6, 17 7.5, 17 9 Z"
          fill={T.gold} />
      </svg>
    </span>
  );
}

// — CountUpNumber —
// Shared text formatter for animated count-up displays. Used by CountUpNumber
// and MiniStat — extracts the "NaN → em-dash, else format" rule so the two
// components can't drift apart.
function formatCountUp(display, value, decimals = 0) {
  if (!Number.isFinite(value)) return "—";
  return decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString();
}

function CountUpNumber({ value, decimals = 0, size = 64, color = T.primary, unit }) {
  const display = useCountUp(Number.isFinite(value) ? value : 0);
  const text = formatCountUp(display, value, decimals);
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
      <Field label="Annual produce per person"
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
      {/* Family size stays compact; goal level gets the whole remaining row
          so three labelled cards fit cleanly without the pill-row wrap that
          previously forced "Fresh + some preserving" onto a second line. */}
      <div style={{
        display: "grid", gap: 24,
        gridTemplateColumns: isMobile ? "1fr" : "minmax(180px, 240px) 1fr",
        alignItems: "start",
      }}>
        <div>
          <label style={labelStyle}>Family size</label>
          <Counter value={familySize} onChange={setFamilySize}
            min={1} max={12} label="family size" />
        </div>
        <div>
          <label style={labelStyle}>Goal level</label>
          <div role="radiogroup" aria-label="Goal level"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
              gap: 10,
            }}>
            {GOAL_OPTIONS.map((opt) => {
              const active = goal === opt.id;
              return (
                <button key={opt.id} type="button" role="radio" aria-checked={active}
                  onClick={() => setGoal(opt.id)}
                  style={{
                    textAlign: "left", padding: "12px 14px", minHeight: 64,
                    background: active ? T.primary : T.bg2,
                    color: active ? "#FEFCF8" : T.tx,
                    border: `1.5px solid ${active ? T.primary : T.border}`,
                    borderRadius: T.radius,
                    cursor: "pointer", transition: "all 0.18s ease",
                    fontFamily: T.fontBody,
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>
                    {opt.label}
                  </div>
                  <div style={{
                    fontSize: 12, marginTop: 4,
                    color: active ? "rgba(254,252,248,0.78)" : T.tx3,
                  }}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
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
                  // Selected state borrows the category colour (leafy green,
                  // root amber, fruiting terracotta, etc.) so the selection
                  // matches the section's dot/eyebrow. One-colour-fits-all
                  // previously read as "all crops are green leafy things".
                  return (
                    <div key={cropId}
                      style={{
                        padding: "10px 12px", borderRadius: T.radius,
                        background: selected ? hexToRgba(cat.color, 0.14) : T.bg,
                        border: `1.5px solid ${selected ? cat.color : T.border}`,
                        transition: "all 0.18s ease",
                      }}>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                        minHeight: 32,
                      }}>
                        <input type="checkbox" checked={selected}
                          onChange={() => toggleCrop(cropId)}
                          style={{ width: 18, height: 18, cursor: "pointer", accentColor: cat.color }}
                          aria-label={name} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{name}</span>
                      </label>
                      {selected && (
                        <div style={{ marginTop: 8 }}>
                          <PillSelect options={FREQUENCY_OPTIONS}
                            value={selection[cropId]}
                            onChange={(f) => setCropFrequency(cropId, f)}
                            size="sm"
                            activeColor={cat.color}
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
        {results.totalSpaceSqft > 0 && results.totalSpaceSqft < 10 && (
          <p style={{ marginTop: 8, fontSize: 12, color: T.tx3, lineHeight: 1.5, fontStyle: "italic" }}>
            That's small enough to fit in a single container, window box, or
            corner of a raised bed. Cut-and-come-again greens and herbs
            genuinely thrive at this scale.
          </p>
        )}

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
            Totals above include {Math.round((PATH_BUFFER - 1) * 100)}% extra for
            paths and margins. The bar shows crop area only.
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
// Visually-hidden but reachable by screen readers. Used for aria-live regions
// that mirror an animated visual element (the visual is aria-hidden so SRs
// don't read every interpolated frame).
const srOnlyStyle = {
  position: "absolute", width: 1, height: 1,
  padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
};

function MiniStat({ label, value, unit, decimals = 0 }) {
  const display = useCountUp(Number.isFinite(value) ? value : 0);
  const text = formatCountUp(display, value, decimals);
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
          {fmtMaturity(crop.daysToMaturity, crop.season)}
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

  // Price + percentage overrides are nested by mixId so editing prices in
  // Classic doesn't bleed into Mel's Mix (and vice versa). Custom's a/b/c
  // keys stay scoped to Custom, too.
  const mixPriceOverrides = mixOverrides?.prices?.[mixId] || {};
  const mixPctOverrides   = mixOverrides?.pcts?.[mixId]   || {};

  // Resolve active mix + apply user pct overrides if Custom selected.
  const activeMix = useMemo(() => {
    const base = SOIL_MIXES.find((m) => m.id === mixId) || SOIL_MIXES[0];
    if (mixId !== "custom") return base;
    return {
      ...base,
      components: base.components.map((c) => ({
        ...c,
        pct: mixPctOverrides[c.key] ?? c.pct,
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixId, JSON.stringify(mixPctOverrides)]);

  // Price overrides apply to every mix (US retail varies regionally).
  const effectiveMix = useMemo(() => ({
    ...activeMix,
    components: activeMix.components.map((c) => ({
      ...c,
      pricePerCuFt: mixPriceOverrides[c.key] ?? c.pricePerCuFt,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activeMix, JSON.stringify(mixPriceOverrides)]);

  const results = useMemo(() => computeSoilResults(beds, effectiveMix), [beds, effectiveMix]);

  const addBed = () => setBeds([...beds, DEFAULT_BED()]);
  const removeBed = (id) => {
    // Keep at least one bed in the list so the calculator always has inputs.
    const next = beds.filter((b) => b.id !== id);
    if (next.length > 0) setBeds(next);
  };
  const updateBed = (id, patch) => setBeds(beds.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const setComponentPrice = (key, value) => {
    setMixOverrides({
      ...(mixOverrides || {}),
      prices: {
        ...(mixOverrides?.prices || {}),
        [mixId]: { ...((mixOverrides?.prices || {})[mixId] || {}), [key]: value },
      },
    });
  };
  const setComponentPct = (key, value) => {
    setMixOverrides({
      ...(mixOverrides || {}),
      pcts: {
        ...(mixOverrides?.pcts || {}),
        [mixId]: { ...((mixOverrides?.pcts || {})[mixId] || {}), [key]: value },
      },
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
              ? Number(((mixPriceOverrides[c.key] ?? c.pricePerCuFt) / CUFT_TO_L).toFixed(3))
              : mixPriceOverrides[c.key] ?? c.pricePerCuFt;
            const commitPrice = (v) => {
              const cuftPrice = metric ? v * CUFT_TO_L : v;
              setComponentPrice(c.key, Math.max(0, cuftPrice));
            };
            const pctValue = Number(((mixPctOverrides[c.key] ?? c.pct) * 100).toFixed(1));
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
            <p role="status" aria-live="polite" style={{
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
              padding: "8px 14px", minHeight: 44, border: "none",
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
            onChange={(v) => onChange({ qty: v })}
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
                            padding: "10px 14px", minHeight: 44,
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
  // Render as a square grid. Rotated column headers need vertical headroom on
  // narrow viewports — we reserve 108 px and let long labels clip via
  // overflow:hidden rather than bleed into the previous section.
  const cellSize = 44;
  const headerHeight = 108;
  return (
    <div style={{ display: "inline-block", minWidth: "100%", paddingTop: 4 }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <thead>
          <tr>
            <th style={{ width: cellSize, height: headerHeight }} aria-hidden="true" />
            {ids.map((id) => (
              <th key={id} scope="col"
                style={{
                  width: cellSize, height: headerHeight,
                  fontSize: 11, fontWeight: 600, color: T.tx2,
                  fontFamily: T.fontBody, whiteSpace: "nowrap",
                  padding: 0, verticalAlign: "bottom",
                  overflow: "hidden",
                }}>
                <div style={{
                  display: "inline-block",
                  transform: "rotate(-55deg)", transformOrigin: "left bottom",
                  paddingLeft: cellSize / 2,
                  maxWidth: 110,
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {CROPS[id]?.name || id}
                </div>
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
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} style={{
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
// ── Planting Date Calculator (Tab 4) ──
// ═══════════════════════════════════════════════════════════════════════════
const PHASE_COLORS = {
  indoors: "#B8B0A0",  // warm grey for indoor start
  grow:    "#8BA888",  // muted green for growing
  harvest: "#C45D3E",  // terracotta for harvest window
};

function PlantingDateCalculator({ plantingState, setPlantingState, hemisphere }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const { mode, zone, manualFrost, selectedCrops, referenceYear, sowMethodChoice } = plantingState;

  const update = (patch) => setPlantingState({ ...plantingState, ...patch });

  const frostDates = useMemo(
    () => getFrostDates(mode, zone, hemisphere, manualFrost, referenceYear),
    [mode, zone, hemisphere, manualFrost, referenceYear]
  );
  // When manual dates are entered, anchor the timeline on the year of lastSpring
  // so the 12-month strip matches what the user typed. Otherwise the chart
  // silently goes empty (dates in 2024, timeline rendering 2026).
  const effectiveReferenceYear = useMemo(() => {
    if (mode === "manual" && frostDates?.lastSpring) {
      return frostDates.lastSpring.getFullYear();
    }
    return referenceYear;
  }, [mode, frostDates, referenceYear]);

  const toggleCrop = (id) => {
    const next = selectedCrops.includes(id)
      ? selectedCrops.filter((x) => x !== id)
      : [...selectedCrops, id];
    update({ selectedCrops: next });
  };

  const setCropSowMethod = (cropId, method) => {
    update({ sowMethodChoice: { ...sowMethodChoice, [cropId]: method } });
  };

  const cropsByCategory = useMemo(() => {
    const map = {};
    for (const [cropId, crop] of Object.entries(CROPS)) {
      if (!map[crop.category]) map[crop.category] = [];
      map[crop.category].push({ cropId, ...crop });
    }
    return map;
  }, []);

  // Compute planting dates for each selected crop
  const perCropDates = useMemo(() => {
    if (!frostDates) return [];
    return selectedCrops
      .filter((id) => CROPS[id])
      .map((id) => {
        const crop = CROPS[id];
        const override = sowMethodChoice[id];
        const dates = computePlantingDates(crop, frostDates, override);
        return { cropId: id, crop, dates };
      });
  }, [selectedCrops, frostDates, sowMethodChoice]);

  return (
    <section aria-label="Planting Date Calculator" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* Mode + location */}
      <label style={labelStyle}>Where will you plant?</label>
      <PillSelect
        options={[
          { id: "zone",   label: "Pick your zone",   sub: "USDA hardiness zone 3-11" },
          { id: "manual", label: "Enter frost dates",sub: "Hyperlocal or non-US" },
        ]}
        value={mode} onChange={(v) => update({ mode: v })}
        ariaLabel="Location input method" />

      {mode === "zone" && (
        <div style={{ marginTop: 20 }}>
          <ZonePicker value={zone} onChange={(v) => update({ zone: v })} hemisphere={hemisphere} />
          <p style={{ marginTop: 8, fontSize: 12, color: T.tx3, lineHeight: 1.5 }}>
            Your actual frost dates can vary by ±2 weeks based on elevation, proximity to water,
            and urban heat. Use the manual option below if you know your local dates.
          </p>
        </div>
      )}

      {mode === "manual" && (
        <div style={{
          marginTop: 16, display: "grid", gap: 12,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        }}>
          <ManualDateField
            label="Last spring frost" value={manualFrost?.lastSpring}
            onChange={(v) => update({ manualFrost: { ...(manualFrost || {}), lastSpring: v } })}
            referenceYear={referenceYear} />
          <ManualDateField
            label="First fall frost" value={manualFrost?.firstFall}
            onChange={(v) => update({ manualFrost: { ...(manualFrost || {}), firstFall: v } })}
            referenceYear={referenceYear} />
        </div>
      )}

      {/* Frost date summary */}
      {frostDates && (
        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: T.radius,
          background: T.bg2, border: `1.5px solid ${T.border}`,
          display: "flex", flexWrap: "wrap", gap: "4px 18px", alignItems: "baseline",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx2 }}>
            Last spring frost:
          </span>
          <span style={{
            fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
            fontSize: 15, fontWeight: 700, color: T.tx,
          }}>
            {formatDate(frostDates.lastSpring, effectiveReferenceYear)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx2 }}>
            First fall frost:
          </span>
          <span style={{
            fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
            fontSize: 15, fontWeight: 700, color: T.tx,
          }}>
            {formatDate(frostDates.firstFall, effectiveReferenceYear)}
          </span>
          <span style={{ fontSize: 12, color: T.tx3, marginLeft: "auto" }}>
            {hemisphere === "south" ? "Southern" : "Northern"} hemisphere
          </span>
        </div>
      )}

      {/* Crop selection */}
      <div style={{ marginTop: 32 }}>
        <label style={labelStyle}>Which crops are you planting?</label>
        <div style={{ display: "grid", gap: 14 }}>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {cropsByCategory[cat.id].map(({ cropId, name }) => {
                  const active = selectedCrops.includes(cropId);
                  return (
                    <button key={cropId} type="button"
                      onClick={() => toggleCrop(cropId)}
                      aria-pressed={active}
                      style={{
                        padding: "10px 14px", minHeight: 44,
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

      {/* Results */}
      {frostDates && perCropDates.length > 0 && (
        <div style={{ marginTop: 40 }} aria-live="polite">
          <div style={eyebrowStyle}>Your planting calendar</div>
          <div style={{ marginTop: 14 }}>
            <PlantingTimelineChart
              rows={perCropDates} referenceYear={effectiveReferenceYear} />
          </div>

          <div style={{ ...eyebrowStyle, marginTop: 32 }}>Per crop</div>
          <div style={{
            marginTop: 12, display: "grid", gap: 10,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          }}>
            {perCropDates.map(({ cropId, crop, dates }) => (
              <CropDatesCard key={cropId}
                cropId={cropId} crop={crop} dates={dates}
                sowMethodOverride={sowMethodChoice[cropId]}
                onSowMethodChange={(m) => setCropSowMethod(cropId, m)}
                referenceYear={effectiveReferenceYear} />
            ))}
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: T.tx3, lineHeight: 1.55 }}>
            Dates are planning estimates from extension-service averages. Soil temperature,
            microclimate, and variety all shift the actual windows. Watch your local weather
            and harden off transplants for 5-7 days before they go in the ground.
          </p>
        </div>
      )}

      {!frostDates && (() => {
        // Show which piece is still missing so the user knows what to fill in
        // instead of "something's not working." Only relevant in manual mode.
        let hint = "Enter both frost dates (or pick a zone) to see your planting calendar.";
        if (mode === "manual") {
          const hasSpring = Boolean(parseIsoDate(manualFrost?.lastSpring));
          const hasFall = Boolean(parseIsoDate(manualFrost?.firstFall));
          if (hasSpring && !hasFall) hint = "Add your first fall frost date to see the calendar.";
          else if (!hasSpring && hasFall) hint = "Add your last spring frost date to see the calendar.";
          else if (!hasSpring && !hasFall) hint = "Enter both frost dates above. The timeline renders automatically once they're valid.";
        }
        return (
          <p role="alert" style={{
            marginTop: 24, padding: 16, borderRadius: T.radius,
            background: T.warningBg, color: T.tx,
            fontSize: 14, lineHeight: 1.5,
          }}>
            {hint}
          </p>
        );
      })()}
    </section>
  );
}

function ZonePicker({ value, onChange, hemisphere }) {
  // Build label text for each zone showing its frost dates in the user's hemisphere.
  const refYear = new Date().getFullYear();
  const opts = Object.keys(ZONE_FROST_DATES).map((k) => Number(k));
  return (
    <div>
      <div style={{
        fontSize: 14, fontWeight: 600, color: T.tx2,
        marginBottom: 6, fontFamily: T.fontBody,
      }}>
        USDA hardiness zone
      </div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="USDA hardiness zone"
        style={{
          fontSize: 16, fontFamily: T.fontBody,
          background: T.card, color: T.tx,
          border: `1.5px solid ${T.border}`,
          borderRadius: T.radius, padding: "12px 16px",
          minHeight: 48, width: "100%", maxWidth: 480,
        }}>
        {opts.map((z) => {
          const f = getFrostDates("zone", z, hemisphere, null, refYear);
          return (
            <option key={z} value={z}>
              Zone {z}: last frost {formatDate(f.lastSpring)}, first frost {formatDate(f.firstFall)}
            </option>
          );
        })}
      </select>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: T.tx3, lineHeight: 1.5 }}>
        These are United States Department of Agriculture hardiness zones.
        UK (RHS), Australian, and South African zone systems don't map 1:1,
        so non-US gardeners will get a better result from the "Enter frost
        dates" option below.
      </p>
    </div>
  );
}

function ManualDateField({ label, value, onChange, referenceYear }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.tx2, fontFamily: T.fontBody }}>
        {label}
      </span>
      <input type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          fontSize: 16, fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          background: T.card, color: T.tx,
          border: `1.5px solid ${T.border}`,
          borderRadius: T.radius, padding: "12px 14px",
          minHeight: 48, width: "100%",
        }} />
    </label>
  );
}

function PlantingTimelineChart({ rows, referenceYear }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const rowHeight = 52;
  const labelWidth = isMobile ? 96 : 132;
  const totalDays = 365;
  const monthLabels = SHORT_MONTHS;

  const phaseFor = (start, end, color) => {
    const segments = splitRange(start, end, referenceYear);
    return segments.map((seg, i) => {
      if (seg.offYear !== 0 || !seg.start || !seg.end) return null;
      const leftDay = Math.max(0, dayOfYear(seg.start, referenceYear));
      const rightDay = Math.min(totalDays, dayOfYear(seg.end, referenceYear));
      const widthDays = Math.max(0, rightDay - leftDay);
      if (widthDays <= 0) return null;
      return {
        leftPct: (leftDay / totalDays) * 100,
        widthPct: (widthDays / totalDays) * 100,
        color,
        key: `${color}-${i}`,
      };
    }).filter(Boolean);
  };

  const edgeIndicators = (dates) => {
    // Show pills at the left/right edge for out-of-year phases (garlic etc).
    const results = [];
    const earliest = [dates.startIndoors, dates.transplant, dates.directSow].filter(Boolean).sort((a, b) => a - b)[0];
    const latest = dates.harvestEnd;
    if (earliest && earliest < new Date(referenceYear, 0, 1)) {
      results.push({ side: "left", label: `${formatDate(earliest, referenceYear)}` });
    }
    if (latest && latest >= new Date(referenceYear + 1, 0, 1)) {
      results.push({ side: "right", label: `${formatDate(latest, referenceYear)}` });
    }
    return results;
  };

  return (
    <div style={{
      background: T.bg2, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 14 : 20,
      overflow: "hidden",
    }}>
      {/* Month axis */}
      <div style={{
        display: "flex", fontSize: 11, fontWeight: 600, color: T.tx3,
        textTransform: "uppercase", letterSpacing: "0.06em",
        paddingLeft: labelWidth, marginBottom: 8,
      }}>
        {monthLabels.map((m, i) => (
          <div key={m} style={{ flex: 1, textAlign: i === 0 ? "left" : "center" }}>
            {isMobile ? m.charAt(0) : m}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(({ cropId, crop, dates }) => {
          // Perennials (berries, rhubarb, asparagus, artichoke, sunchoke,
          // horseradish, sorrel, tarragon, marjoram) don't fit a one-year
          // timeline — harvest lags planting by 12-36 months. Render a
          // distinct "plant once" row instead of a confusing year-1 green
          // bar with no harvest. Audit #4 (795c2ae).
          const isPerennial = crop.season === "perennial";
          const indoorsBars = !isPerennial && dates.startIndoors && dates.transplant
            ? phaseFor(dates.startIndoors, dates.transplant, PHASE_COLORS.indoors)
            : [];
          const sowBase = dates.anchorMethod === "transplant" ? dates.transplant : dates.directSow;
          const growBars = !isPerennial && sowBase && dates.harvestStart
            ? phaseFor(sowBase, dates.harvestStart, PHASE_COLORS.grow)
            : [];
          const harvestBars = !isPerennial && dates.harvestStart && dates.harvestEnd
            ? phaseFor(dates.harvestStart, dates.harvestEnd, PHASE_COLORS.harvest)
            : [];
          const edges = isPerennial ? [] : edgeIndicators(dates);

          return (
            <div key={cropId} style={{
              display: "flex", alignItems: "center", gap: 8,
              minHeight: rowHeight,
            }}>
              <div style={{
                width: labelWidth, flexShrink: 0,
                fontSize: isMobile ? 12 : 13, fontWeight: 600, color: T.tx,
                paddingRight: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {crop.name}
              </div>
              <div style={{
                position: "relative", flex: 1, height: 28,
                background: isPerennial ? T.goldBg : T.card, borderRadius: T.radius,
                border: `1px solid ${isPerennial ? T.gold : T.border}`,
                overflow: "hidden",
                display: isPerennial ? "flex" : undefined,
                alignItems: isPerennial ? "center" : undefined,
                justifyContent: isPerennial ? "center" : undefined,
              }}>
                {isPerennial ? (
                  <span style={{
                    fontSize: isMobile ? 11 : 12, fontWeight: 600, color: T.gold,
                    letterSpacing: "0.02em", whiteSpace: "nowrap", padding: "0 8px",
                  }}>
                    {isMobile ? "Perennial — year 2+" : "Perennial — plant once, harvests year 2+"}
                  </span>
                ) : (
                  <>
                    {/* Month gridlines */}
                    {monthLabels.map((_, i) => i > 0 && (
                      <div key={i} style={{
                        position: "absolute", top: 0, bottom: 0,
                        left: `${(i / 12) * 100}%`, width: 1,
                        background: T.border, opacity: 0.5,
                      }} />
                    ))}
                    {/* Phase bars */}
                    {[...indoorsBars, ...growBars, ...harvestBars].map((b) => (
                      <div key={b.key} style={{
                        position: "absolute", top: 2, bottom: 2,
                        left: `${b.leftPct}%`, width: `${b.widthPct}%`,
                        background: b.color, borderRadius: 3,
                        opacity: 0.92,
                      }} />
                    ))}
                    {/* Edge indicators */}
                    {edges.map((e, i) => (
                      <div key={i} title={`${e.label}`} style={{
                        position: "absolute", top: 2, bottom: 2,
                        [e.side]: 0, width: 6,
                        background: e.side === "left" ? PHASE_COLORS.indoors : PHASE_COLORS.harvest,
                        borderRadius: 2, opacity: 0.7,
                      }} />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 14, display: "flex", flexWrap: "wrap", gap: "6px 18px",
        fontSize: 12, color: T.tx2,
      }}>
        {[
          { label: "Start indoors", color: PHASE_COLORS.indoors },
          { label: "Growing", color: PHASE_COLORS.grow },
          { label: "Harvest", color: PHASE_COLORS.harvest },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
        <span style={{ marginLeft: "auto", color: T.tx3, fontSize: 11 }}>
          Edge bars indicate dates outside {referenceYear}
        </span>
      </div>
    </div>
  );
}

function CropDatesCard({ cropId, crop, dates, sowMethodOverride, onSowMethodChange, referenceYear }) {
  // Resolve to an actual sow method for display — never leave the toggle
  // showing "direct" while the calculator quietly anchors on "transplant"
  // (which is what computePlantingDates does for "either" crops without an
  // override). Priority: user's explicit override > crop default > transplant
  // fallback matching the calc.
  const method = sowMethodOverride
    || (crop.sowMethod === "either" ? "transplant" : crop.sowMethod);
  const showMethodToggle = crop.sowMethod === "either";

  return (
    <div style={{
      padding: "14px 16px", borderRadius: T.radius,
      background: T.card, border: `1.5px solid ${T.border}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{crop.name}</div>
        {dates.frostRiskAtHarvest && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.error,
            padding: "2px 8px", borderRadius: T.radiusPill,
            background: T.errorBg,
          }} title="Harvest window extends past the first fall frost">
            Frost risk
          </span>
        )}
      </div>

      {showMethodToggle && (
        <div style={{ marginTop: 8 }}>
          <PillSelect
            size="sm"
            options={[
              { id: "transplant", label: "Transplant" },
              { id: "direct",     label: "Direct sow" },
            ]}
            value={method === "transplant" ? "transplant" : "direct"}
            onChange={onSowMethodChange}
            ariaLabel={`Sow method for ${crop.name}`} />
        </div>
      )}

      <div style={{
        marginTop: 10, display: "grid", gap: "4px 14px",
        gridTemplateColumns: "auto 1fr", fontSize: 13, color: T.tx2,
      }}>
        {dates.startIndoors && (
          <>
            <span style={{ color: T.tx3 }}>Start indoors</span>
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
              {formatDate(dates.startIndoors, referenceYear)}
            </span>
          </>
        )}
        {dates.transplant && method !== "direct" && (
          <>
            <span style={{ color: T.tx3 }}>Transplant out</span>
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
              {formatDate(dates.transplant, referenceYear)}
            </span>
          </>
        )}
        {dates.directSow && method !== "transplant" && (
          <>
            <span style={{ color: T.tx3 }}>Direct sow</span>
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
              {formatDate(dates.directSow, referenceYear)}
            </span>
          </>
        )}
        {dates.harvestStart && (
          <>
            <span style={{ color: T.tx3 }}>Harvest</span>
            <span style={{ fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
              {formatDate(dates.harvestStart, referenceYear)}
              {dates.harvestEnd && ` – ${formatDate(dates.harvestEnd, referenceYear)}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Landing hero wrapper + Home tab content ──
// ═══════════════════════════════════════════════════════════════════════════
// HomeView is now marketing-first. The calculator lives on its own tab
// (#self-sufficiency) so first-time visitors see the product pitch — stats
// cards, feature grid, pricing — above the fold instead of having to
// scroll past a 1400-px calculator to learn what the tool does.
function HomeView({ setTab }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const goToCalculator = (e) => {
    if (e) e.preventDefault();
    if (typeof setTab === "function") setTab("self-sufficiency");
    else window.location.hash = "self-sufficiency";
  };
  return (
    <>
      {/* Hero */}
      <section style={{
        background: `linear-gradient(180deg, ${T.bg} 0%, ${T.bg2} 100%)`,
        paddingTop: isMobile ? 40 : 72,
        paddingBottom: isMobile ? 40 : 64,
        paddingLeft: "clamp(16px, 4vw, 48px)",
        paddingRight: "clamp(16px, 4vw, 48px)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
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
            fontSize: "clamp(2.2rem, 5.5vw, 4rem)", lineHeight: 1.08,
            color: T.tx, fontWeight: 400, letterSpacing: "-0.01em",
          }}>
            Know exactly what to grow
          </h1>
          <p style={{
            margin: "20px auto 0", maxWidth: 620,
            fontSize: isMobile ? 16 : 19, lineHeight: 1.6, color: T.tx2,
          }}>
            Plan your homestead garden based on what your family actually eats.
            Four free calculators plus an AI-written year-long growing plan.
          </p>
          <div style={{
            marginTop: isMobile ? 28 : 36,
            display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
          }}>
            <a href="#self-sufficiency" onClick={goToCalculator}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 26px", minHeight: 52,
                background: T.accent, color: "#FEFCF8",
                borderRadius: T.radiusPill, textDecoration: "none",
                fontFamily: T.fontBody, fontSize: 16, fontWeight: 700,
                boxShadow: T.shadow.accent,
              }}>
              Start with the free calculator
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>→</span>
            </a>
            <a href="#pricing" onClick={(e) => {
                e.preventDefault();
                if (typeof setTab === "function") setTab("home");
                setTimeout(() => {
                  const el = document.getElementById("pricing");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }}
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "14px 22px", minHeight: 52,
                background: "transparent", color: T.tx,
                border: `1.5px solid ${T.border}`,
                borderRadius: T.radiusPill, textDecoration: "none",
                fontFamily: T.fontBody, fontSize: 15, fontWeight: 600,
              }}>
              See pricing
            </a>
          </div>
        </div>
      </section>

      <SocialProofSection />
      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection />
      <FAQSection />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Landing page sections ──
// ═══════════════════════════════════════════════════════════════════════════

function LandingSection({ id, bg, children, maxWidth = 1100 }) {
  return (
    <section id={id} style={{
      background: bg || T.bg,
      padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px)",
      scrollMarginTop: 80,
    }}>
      <div style={{ maxWidth, margin: "0 auto" }}>
        {children}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, subtitle, align = "center" }) {
  return (
    <div style={{
      textAlign: align, maxWidth: 720,
      margin: align === "center" ? "0 auto" : 0,
    }}>
      {eyebrow && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: T.accent,
          letterSpacing: "0.1em", textTransform: "uppercase",
          marginBottom: 12,
        }}>{eyebrow}</div>
      )}
      <h2 style={{
        margin: 0, fontFamily: T.fontDisplay,
        fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 400, color: T.tx,
        lineHeight: 1.15,
      }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{
          margin: "16px auto 0",
          fontSize: 17, color: T.tx2, lineHeight: 1.55, maxWidth: 620,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function SocialProofSection() {
  // Numbers pulled from the live data so they never drift from reality.
  const cropCount = Object.keys(CROPS).length;
  const pairCount = COMPANIONS.length;
  const stats = [
    { value: String(cropCount), label: "crops in the database",
      sub: "Tomatoes to parsnips. Regional additions for non-US gardens." },
    { value: String(pairCount), label: "companion pairings",
      sub: "Sourced from extension-service research, not Pinterest folklore." },
    { value: "$19.99", label: "one-time purchase",
      sub: "No subscription. No renewals. Your plan is yours." },
  ];
  return (
    <LandingSection>
      <div style={{
        display: "grid", gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            padding: "24px 20px", borderRadius: T.radiusLg,
            background: T.card, border: `1.5px solid ${T.border}`,
            textAlign: "center",
          }}>
            <div style={{
              fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
              fontSize: "clamp(2rem, 4vw, 2.75rem)", fontWeight: 700, color: T.primary,
              lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              marginTop: 8, fontSize: 14, fontWeight: 700, color: T.tx,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{s.label}</div>
            <div style={{
              marginTop: 8, fontSize: 13, color: T.tx2, lineHeight: 1.5,
            }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

const FEATURE_CARDS = [
  {
    id: "self-sufficiency",
    title: "Self-Sufficiency Calculator",
    desc: "Family size in, plant count and garden space out. Tells you what % of a year's produce you'd grow.",
    cta: "Try the calculator",
  },
  {
    id: "soil",
    title: "Raised Bed Soil Calculator",
    desc: "Rectangle, circle, or L-shape beds. Four mix recipes. Bag counts and cost estimate thread through your currency.",
    cta: "Plan your soil",
  },
  {
    id: "companion",
    title: "Companion Planting Checker",
    desc: "Which crops help each other. Which crops fight. Compatibility matrix with reasons, plus eight tested bed recipes.",
    cta: "Check compatibility",
  },
  {
    id: "planting-dates",
    title: "Planting Date Calculator",
    desc: "USDA zones 3-11 or manual frost entry. Hemisphere-aware. Per-crop indoor, transplant, sow, and harvest windows on a 12-month timeline.",
    cta: "Plan your calendar",
  },
];

function FeaturesSection() {
  return (
    <LandingSection id="features" bg={T.bg2}>
      <SectionHeading
        eyebrow="Four free calculators"
        title="Every part of a growing plan, worked out"
        subtitle="No account, no trial, no paywall on the essentials. Each calculator runs in your browser and saves to your device." />
      <div style={{
        marginTop: 40, display: "grid", gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}>
        {FEATURE_CARDS.map((f) => (
          <a key={f.id} href={`#${f.id}`}
            onClick={(e) => { e.preventDefault(); window.location.hash = f.id; }}
            style={{
              display: "flex", flexDirection: "column",
              padding: 22, borderRadius: T.radiusLg,
              background: T.card, border: `1.5px solid ${T.border}`,
              textDecoration: "none", cursor: "pointer",
              transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
              boxShadow: T.shadow.sm,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = T.primary;
              e.currentTarget.style.boxShadow = T.shadow.md;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.boxShadow = T.shadow.sm;
            }}>
            <h3 style={{
              margin: 0, fontFamily: T.fontDisplay,
              fontSize: 22, fontWeight: 400, color: T.tx,
            }}>{f.title}</h3>
            <p style={{
              margin: "10px 0 0", fontSize: 14, color: T.tx2, lineHeight: 1.55,
            }}>{f.desc}</p>
            <div style={{
              marginTop: "auto", paddingTop: 14,
              fontSize: 13, fontWeight: 700, color: T.primary,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>{f.cta} <span aria-hidden="true">→</span></div>
          </a>
        ))}
      </div>
    </LandingSection>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: "1", title: "Tell us about your family",
      body: "Family size, what you like to eat, the crops you're willing to grow. Set your hemisphere and zone or enter your own frost dates." },
    { n: "2", title: "See the math worked out",
      body: "Plant counts, bed space, soil volume, companion matrix, and a 12-month planting timeline. Everything updates live as you change inputs." },
    { n: "3", title: "(Later) Unlock the full growing plan",
      body: "Paid tier adds a personalised growing plan, a searchable crop database, cost savings tracking, and a preservation planner. Pay once, keep it." },
  ];
  return (
    <LandingSection id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="A plan, not a subscription" />
      <div style={{
        marginTop: 40, display: "grid", gap: 20,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}>
        {steps.map((s) => (
          <div key={s.n} style={{
            position: "relative",
            padding: "28px 24px 24px", borderRadius: T.radiusLg,
            background: T.card, border: `1.5px solid ${T.border}`,
          }}>
            <div style={{
              position: "absolute", top: -18, left: 22,
              width: 40, height: 40, borderRadius: 999,
              background: T.primary, color: "#FEFCF8",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.fontNum, fontSize: 20, fontWeight: 700,
              border: `3px solid ${T.bg}`,
            }}>{s.n}</div>
            <h3 style={{
              margin: "6px 0 0", fontFamily: T.fontBody,
              fontSize: 17, fontWeight: 700, color: T.tx,
            }}>{s.title}</h3>
            <p style={{
              margin: "10px 0 0", fontSize: 14, color: T.tx2, lineHeight: 1.55,
            }}>{s.body}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

function ComparisonSection() {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const rows = [
    { tool: "Homestead Harvest Planner", cost: "$19.99 once", fiveYears: "$19.99", afterStop: "Keep everything", ours: true },
    { tool: "GrowVeg", cost: "$29 / year", fiveYears: "$145", afterStop: "Plans locked" },
    { tool: "Old Farmer's Almanac Planner", cost: "$29 / year", fiveYears: "$145", afterStop: "Plans locked" },
    { tool: "Seedtime (paid tier)", cost: "from ~$10 / month", fiveYears: "~$420+", afterStop: "Plans locked" },
  ];
  const cell = (r, text, isFirst) => ({
    padding: isMobile ? "12px 10px" : "14px 16px",
    fontSize: isMobile ? 13 : 14,
    color: r.ours ? T.tx : T.tx2,
    fontWeight: r.ours ? 700 : 500,
    background: r.ours ? T.primaryBg : "transparent",
    borderTop: isFirst ? "none" : `1px solid ${T.border}`,
    textAlign: "left",
    whiteSpace: isMobile ? "normal" : "nowrap",
    verticalAlign: "top",
  });
  return (
    <LandingSection id="comparison" bg={T.bg2}>
      <SectionHeading
        eyebrow="Why not a subscription?"
        title="Five years of garden plans for less than one year of the others"
        subtitle="The other tools lock your plans when you stop paying. We don't. The product is yours once you buy it." />
      <div style={{
        marginTop: 36, overflowX: "auto",
        borderRadius: T.radiusLg, border: `1.5px solid ${T.border}`,
        background: T.card,
      }}>
        <table style={{ width: "100%", minWidth: isMobile ? 480 : "auto", borderCollapse: "collapse", fontFamily: T.fontBody }}>
          <thead>
            <tr>
              {["Tool", "Cost", "5-year total", "If you stop paying"].map((h, i) => (
                <th key={h} style={{
                  padding: isMobile ? "12px 10px" : "14px 16px",
                  fontSize: 12, fontWeight: 700, color: T.tx2,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  textAlign: "left", background: T.bg2,
                  borderBottom: `1.5px solid ${T.border}`,
                  whiteSpace: isMobile && i === 3 ? "normal" : "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.tool}>
                <td style={cell(r, r.tool, i === 0)}>
                  {r.ours && (
                    <div style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999,
                      background: T.primary, color: "#FEFCF8",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                      textTransform: "uppercase", marginRight: 8,
                    }}>Us</div>
                  )}
                  {r.tool}
                </td>
                <td style={{ ...cell(r, r.cost, i === 0), fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
                  {r.cost}
                </td>
                <td style={{ ...cell(r, r.fiveYears, i === 0), fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
                  {r.fiveYears}
                </td>
                <td style={cell(r, r.afterStop, i === 0)}>{r.afterStop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{
        marginTop: 16, fontSize: 12, color: T.tx3, lineHeight: 1.55, textAlign: "center",
      }}>
        Prices verified on vendor pages early 2026. Seedtime's paid tier varies by feature level.
        GrowVeg and Old Farmer's Almanac use the same underlying planner (Growing Interactive).
      </p>
    </LandingSection>
  );
}

function PricingSection() {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const features = [
    "Personalised month-by-month growing plan tuned to your family and zone",
    "Complete crop database with 60+ vegetables and varieties",
    "Cost savings calculator with ROI and break-even timeline",
    "Preservation planner (can, freeze, dehydrate, root cellar)",
    "Self-contained HTML report you can save, print, or email",
    "Works on your phone in the garden, mobile-first",
    "3-device license, never expires",
  ];
  return (
    <LandingSection id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Pay once. Use forever."
        subtitle="The four free calculators above stay free. The paid tier unlocks the full growing plan plus the rest." />
      <div style={{
        marginTop: 36,
        maxWidth: 520, marginLeft: "auto", marginRight: "auto",
        padding: isMobile ? "28px 24px" : "40px 36px",
        borderRadius: T.radiusLg,
        background: T.card,
        border: `1.5px solid ${T.border}`,
        boxShadow: T.shadow.lg,
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block", padding: "6px 14px", borderRadius: T.radiusPill,
          background: T.accentBg, color: T.accent,
          fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Full Growing Plan
        </div>
        <div style={{
          fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          fontSize: "clamp(3rem, 7vw, 4.5rem)", fontWeight: 700, color: T.tx,
          lineHeight: 1,
        }}>
          $19.99
        </div>
        <div style={{
          marginTop: 8, fontSize: 14, color: T.tx2, fontWeight: 600,
        }}>One-time purchase. No renewal.</div>

        <ul style={{
          listStyle: "none", padding: 0, margin: "28px 0 0",
          textAlign: "left", display: "grid", gap: 10,
        }}>
          {features.map((f) => (
            <li key={f} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              fontSize: 15, color: T.tx, lineHeight: 1.5,
            }}>
              <span aria-hidden="true" style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: 999,
                background: T.primaryBg, color: T.primary,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 12, marginTop: 2,
              }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        <button type="button" disabled
          style={{
            marginTop: 28, width: "100%",
            padding: "16px 24px", minHeight: 56,
            background: T.tx3, color: "#FEFCF8",
            border: "none", borderRadius: T.radiusPill,
            fontFamily: T.fontBody, fontSize: 16, fontWeight: 700,
            cursor: "not-allowed", opacity: 0.65,
          }}>
          Coming soon
        </button>
        <p style={{
          margin: "14px 0 0", fontSize: 12, color: T.tx3, lineHeight: 1.5,
        }}>
          Paid tier launches with Session 4. All four calculators above stay free.
        </p>
      </div>
    </LandingSection>
  );
}

const FAQ_ITEMS = [
  {
    q: "Does this work for my zone? I'm in zone 4b, or UK, or Australia.",
    a: "The Planting Dates tab covers USDA zones 3 through 11 with frost dates pre-loaded. For the UK, EU, Australia, South Africa or anywhere else, you enter your own last-frost and first-frost dates and the calculator works the same way. No region lock. Hemisphere toggle flips all dates for southern-hemisphere users.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. You buy once, you get a license key, your data lives in your browser. No email verification loops, no password resets. If you want to back up your plan, use the export button and save the file somewhere you trust.",
  },
  {
    q: "What happens to my garden plan if I stop paying?",
    a: "Nothing. You don't keep paying. One payment, lifetime access. Your plan is yours. Contrast that with GrowVeg and the Almanac planner, where skipping a renewal locks your layouts.",
  },
  {
    q: "Does it work on my phone? I'm usually outside when I'm planning.",
    a: "Yes. The interface is mobile-first. 16 px inputs so iPhone doesn't auto-zoom. 44 px touch targets so you can tap with muddy fingers. No app store install, no 200 MB download. Open the link and bookmark it.",
  },
  {
    q: "Are the yield estimates accurate?",
    a: "They're estimates based on extension-service averages (Maryland, Cornell, Utah State, Texas A&M), not magic. Actual yield depends on your soil, water, weather, pests, and luck. The tool gives you a realistic planning number so you don't over-plant or under-plant. Track your real numbers each year and the plan gets more useful.",
  },
  {
    q: "Is companion planting in here? I've read some of it is folklore.",
    a: "Good instinct. Our 153 pairings are sourced from university extensions and peer-reviewed allelopathy studies, with a short mechanism note on every entry. We skip \"basil makes tomatoes taste better\" style claims that don't have evidence.",
  },
  {
    q: "How is the growing plan created?",
    a: "From your inputs: family size, hardiness zone, crops, garden space, sun exposure, soil, and experience. The plan returns a month-by-month schedule, bed layouts, succession timing, and yield estimates. Full technical detail (data handling, third parties, accuracy disclaimer) is in our Terms and Privacy Policy.",
  },
  {
    q: "What's the refund policy?",
    a: "48 hours after purchase, no questions asked, for technical failure or accidental duplicate purchases. The checkout runs through LemonSqueezy, who process the refund within a few business days.",
  },
];

function FAQSection() {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <LandingSection id="faq" bg={T.bg2} maxWidth={820}>
      <SectionHeading
        eyebrow="Questions"
        title="Everything a homesteader asks before buying a planning tool" />
      <div style={{
        marginTop: 32, display: "flex", flexDirection: "column", gap: 10,
      }}>
        {FAQ_ITEMS.map((item, i) => {
          const open = openIdx === i;
          return (
            <div key={item.q} style={{
              borderRadius: T.radius,
              background: T.card, border: `1.5px solid ${open ? T.primary : T.border}`,
              overflow: "hidden",
              transition: "border-color 0.18s ease",
            }}>
              <button type="button"
                onClick={() => setOpenIdx(open ? -1 : i)}
                aria-expanded={open}
                style={{
                  width: "100%", padding: "16px 20px", minHeight: 56,
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: T.fontBody, textAlign: "left",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, fontSize: 15, fontWeight: 700, color: T.tx,
                }}>
                <span>{item.q}</span>
                <span aria-hidden="true" style={{
                  flexShrink: 0, width: 24, height: 24,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: T.primary, fontWeight: 400,
                  transform: open ? "rotate(45deg)" : "none",
                  transition: "transform 0.2s ease",
                }}>+</span>
              </button>
              {open && (
                <div style={{
                  padding: "0 20px 18px", fontSize: 14,
                  color: T.tx2, lineHeight: 1.6,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </LandingSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Paywall overlay + supporting bits (Session 4) ──
// ═══════════════════════════════════════════════════════════════════════════
function LockIcon({ size = 48, color }) {
  const c = color || T.primary;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.1" fill={c} stroke="none" />
      <path d="M12 16.6v2" />
    </svg>
  );
}

function ValidatingOverlay() {
  return (
    <section aria-busy="true" aria-live="polite" style={{
      padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px)",
      background: T.bg,
    }}>
      <div style={{
        maxWidth: 420, margin: "0 auto", textAlign: "center",
        padding: 40, borderRadius: T.radiusLg,
        background: T.card, border: `1.5px solid ${T.border}`,
        boxShadow: T.shadow.md,
      }}>
        <div style={{
          width: 32, height: 32, margin: "0 auto 16px",
          border: `3px solid ${T.bg2}`, borderTopColor: T.primary,
          borderRadius: "50%", animation: "hhpSpin 0.9s linear infinite",
        }} />
        <div style={{
          fontFamily: T.fontBody, fontSize: 15, fontWeight: 600, color: T.tx,
        }}>
          Verifying your access…
        </div>
        <div style={{
          marginTop: 6, fontSize: 13, color: T.tx3,
        }}>
          One second.
        </div>
      </div>
    </section>
  );
}

function PaywallOverlay({ tab, keyError, prefillKey, activating, onActivate, onClearError }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [keyInputOpen, setKeyInputOpen] = useState(Boolean(prefillKey));
  const [key, setKey] = useState(prefillKey || "");

  // If the mount effect pre-fills a key (from ?key= that failed), surface the
  // input immediately so the user sees what was tried.
  useEffect(() => {
    if (prefillKey) {
      setKey(prefillKey);
      setKeyInputOpen(true);
    }
  }, [prefillKey]);

  const features = [
    "Personalised month-by-month growing plan tuned to your family and zone",
    "Complete crop database — 82 crops, searchable + sortable",
    "Cost savings calculator with grocery-vs-garden ROI",
    "Preservation planner for canning, freezing, dehydrating",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (activating) return;
    await onActivate(key);
  };

  return (
    <section style={{
      padding: "clamp(40px, 6vw, 72px) clamp(16px, 4vw, 48px)",
      background: T.bg,
    }}>
      <div style={{
        maxWidth: 560, margin: "0 auto", textAlign: "center",
        padding: isMobile ? 24 : 40,
        borderRadius: T.radiusLg,
        background: T.card, border: `1.5px solid ${T.border}`,
        boxShadow: T.shadow.lg,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 72, height: 72, borderRadius: "50%",
          background: T.primaryBg, marginBottom: 16,
        }}>
          <LockIcon size={36} />
        </div>
        <div style={{
          display: "inline-block",
          padding: "4px 12px", borderRadius: T.radiusPill,
          background: T.accentBg, color: T.accent,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 12,
        }}>
          {tab.label}
        </div>
        <h2 style={{
          margin: 0, fontFamily: T.fontDisplay,
          fontSize: "clamp(1.6rem, 3.2vw, 2.1rem)", fontWeight: 400, color: T.tx,
          lineHeight: 1.15,
        }}>
          Unlock your full growing plan
        </h2>
        <p style={{
          margin: "14px auto 0", maxWidth: 440,
          fontSize: 15, color: T.tx2, lineHeight: 1.55,
        }}>
          One payment. Yours forever. No subscription, no account, no renewals.
        </p>

        <ul style={{
          listStyle: "none", padding: 0, margin: "24px auto 0",
          maxWidth: 440, textAlign: "left",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {features.map((f) => (
            <li key={f} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              fontSize: 14, color: T.tx, lineHeight: 1.5,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={T.primary} strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true"
                style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div style={{
          margin: "28px 0 4px",
          fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          fontSize: 42, fontWeight: 700, color: T.tx, lineHeight: 1,
        }}>
          ${PRICE_USD}
        </div>
        <div style={{
          fontSize: 13, color: T.tx3, marginBottom: 22,
        }}>
          One-time. Forever yours. 48-hour refund window.
        </div>

        <a
          href={CHECKOUT_URL}
          className="lemonsqueezy-button"
          style={{
            display: "inline-block",
            padding: "14px 28px", borderRadius: T.radiusPill,
            background: T.accent, color: "#FEFCF8",
            fontFamily: T.fontBody, fontSize: 16, fontWeight: 700,
            textDecoration: "none", cursor: "pointer",
            boxShadow: T.shadow.accent,
            minHeight: 48, minWidth: 200,
          }}>
          Get full access
        </a>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
          {!keyInputOpen ? (
            <button type="button"
              onClick={() => setKeyInputOpen(true)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
                color: T.primary, textDecoration: "underline",
                textUnderlineOffset: 3, padding: "6px 10px",
                minHeight: 44,
              }}>
              Already purchased? Enter your licence key
            </button>
          ) : (
            <form onSubmit={handleSubmit} style={{
              display: "flex", flexDirection: "column", gap: 10,
              maxWidth: 420, margin: "0 auto", textAlign: "left",
            }}>
              <label style={{
                fontSize: 13, fontWeight: 600, color: T.tx2,
              }}>
                Licence key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => { setKey(e.target.value); if (keyError) onClearError(); }}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                disabled={activating}
                aria-invalid={Boolean(keyError)}
                aria-describedby={keyError ? "hhp-key-error" : undefined}
                style={{
                  fontSize: 16, fontFamily: T.fontNum,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.04em",
                  background: T.bg2, color: T.tx,
                  border: `1.5px solid ${keyError ? T.error : T.border}`,
                  borderRadius: T.radius,
                  padding: "12px 14px", minHeight: 48,
                  outline: "none",
                }}
              />
              {keyError && (
                <div id="hhp-key-error" role="alert" style={{
                  fontSize: 13, color: T.error, lineHeight: 1.45,
                }}>
                  {keyError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button"
                  onClick={() => { setKeyInputOpen(false); onClearError(); }}
                  disabled={activating}
                  style={{
                    background: "transparent", border: `1.5px solid ${T.border}`,
                    borderRadius: T.radiusPill, cursor: "pointer",
                    padding: "10px 18px", minHeight: 44,
                    fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
                    color: T.tx2,
                    opacity: activating ? 0.6 : 1,
                  }}>
                  Cancel
                </button>
                <button type="submit"
                  disabled={activating || key.trim().length < 8}
                  style={{
                    background: T.primary, color: "#FEFCF8", border: "none",
                    borderRadius: T.radiusPill, cursor: activating ? "wait" : "pointer",
                    padding: "10px 22px", minHeight: 44,
                    fontFamily: T.fontBody, fontSize: 14, fontWeight: 700,
                    opacity: (activating || key.trim().length < 8) ? 0.6 : 1,
                  }}>
                  {activating ? "Verifying…" : "Activate"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div style={{
          marginTop: 22, fontSize: 12, color: T.tx3, lineHeight: 1.5,
        }}>
          Secure checkout by LemonSqueezy. Your licence covers 3 devices and never expires.
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Growing Plan (Tab 5, paid) ──
// Personalised month-by-month plan generated server-side from the user's
// existing inputs (family, zone, frost dates, crops) plus a small handful
// of additional questions (sun, soil, water, experience, goals). Posts to
// /api/generate which proxies to Claude Sonnet with structured-output
// JSON-schema enforcement, then renders the parsed plan.
// ═══════════════════════════════════════════════════════════════════════════
const SUN_OPTIONS = [
  { id: "full_sun",     label: "Full sun",      sub: "6-8h direct" },
  { id: "partial_sun",  label: "Partial sun",   sub: "4-6h direct" },
  { id: "partial_shade", label: "Partial shade", sub: "2-4h direct" },
];
const SOIL_OPTIONS = [
  { id: "sandy",   label: "Sandy" },
  { id: "loamy",   label: "Loamy" },
  { id: "clay",    label: "Clay" },
  { id: "unknown", label: "Don't know" },
];
const WATER_OPTIONS = [
  { id: "drip",     label: "Drip" },
  { id: "hand",     label: "Hand watering" },
  { id: "sprinkler", label: "Sprinkler" },
  { id: "rain",     label: "Rain only" },
];
const EXPERIENCE_OPTIONS = [
  { id: "first_year", label: "First year" },
  { id: "1_to_3",     label: "1-3 years" },
  { id: "4_plus",     label: "4+ years" },
];
const GOAL_CHIPS = [
  { id: "fresh",      label: "Fresh eating" },
  { id: "preserving", label: "Preserving" },
  { id: "selling",    label: "Selling at market" },
  { id: "education",  label: "Teaching kids" },
];
const PLAN_INPUT_DEFAULTS = {
  sunExposure: "full_sun",
  soilType: "loamy",
  waterMethod: "drip",
  experience: "1_to_3",
  goals: ["fresh", "preserving"],
};
const LOADING_MESSAGES = [
  "Reading your inputs...",
  "Picking varieties for your zone...",
  "Mapping the planting calendar...",
  "Sketching bed layouts...",
  "Sizing yields and savings...",
  "Drafting your tips...",
];

// Mirrors api/generate.js sanitisePlan(). Used when re-hydrating a cached plan
// from localStorage so a tampered or migrated cache can't crash the renderer.
// Returns null if the plan is unsalvageable (no monthlySchedule).
const PLAN_STR_MAX = 800;
const PLAN_SHORT_MAX = 80;
const VALID_MONTHS = new Set(["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"]);
const CURRENCY_SYMBOLS = ["$", "€", "£", "R", "¥"];
function _str(v, max = PLAN_STR_MAX) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function _strArr(arr, max = 32, eachMax = PLAN_STR_MAX) {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => _str(v, eachMax)).filter(Boolean).slice(0, max);
}
function _num(v, min = 0, max = 1e9) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return Math.max(min, Math.min(max, x));
}
function sanitisePlanShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  const monthlySchedule = Array.isArray(raw.monthlySchedule)
    ? raw.monthlySchedule.slice(0, 12).map((m) => ({
        month: _str(m?.month, PLAN_SHORT_MAX),
        tasks: _strArr(m?.tasks, 12, 240),
      })).filter((m) => VALID_MONTHS.has(m.month) && m.tasks.length > 0)
    : [];
  if (monthlySchedule.length === 0) return null;
  const savings = raw.savingsEstimate && typeof raw.savingsEstimate === "object" ? {
    annualSavings: Math.round(_num(raw.savingsEstimate.annualSavings, 0, 1e7)),
    currency: CURRENCY_SYMBOLS.includes(raw.savingsEstimate.currency)
      ? raw.savingsEstimate.currency : "$",
    topSavers: _strArr(raw.savingsEstimate.topSavers, 10, PLAN_SHORT_MAX),
    note: _str(raw.savingsEstimate.note, 600),
  } : null;
  return {
    summary: _str(raw.summary, 1200),
    monthlySchedule,
    bedLayouts: Array.isArray(raw.bedLayouts)
      ? raw.bedLayouts.slice(0, 12).map((b) => ({
          bedName: _str(b?.bedName, 120),
          crops: _strArr(b?.crops, 24, PLAN_SHORT_MAX),
          notes: _str(b?.notes, 600),
        })).filter((b) => b.bedName && b.crops.length > 0)
      : [],
    successionPlanting: Array.isArray(raw.successionPlanting)
      ? raw.successionPlanting.slice(0, 24).map((sp) => ({
          crop: _str(sp?.crop, PLAN_SHORT_MAX),
          plantings: Math.round(_num(sp?.plantings, 1, 12)),
          intervalWeeks: Math.round(_num(sp?.intervalWeeks, 1, 52)),
          note: _str(sp?.note, 400),
        })).filter((sp) => sp.crop)
      : [],
    harvestTimeline: Array.isArray(raw.harvestTimeline)
      ? raw.harvestTimeline.slice(0, 32).map((h) => ({
          crop: _str(h?.crop, PLAN_SHORT_MAX),
          startMonth: _str(h?.startMonth, PLAN_SHORT_MAX),
          endMonth: _str(h?.endMonth, PLAN_SHORT_MAX),
          peakMonth: _str(h?.peakMonth, PLAN_SHORT_MAX),
        })).filter((h) => h.crop && h.startMonth)
      : [],
    yieldEstimates: Array.isArray(raw.yieldEstimates)
      ? raw.yieldEstimates.slice(0, 32).map((y) => ({
          crop: _str(y?.crop, PLAN_SHORT_MAX),
          plants: Math.round(_num(y?.plants, 0, 9999)),
          estimatedYield: Math.round(_num(y?.estimatedYield, 0, 100000) * 10) / 10,
          unit: y?.unit === "kg" ? "kg" : "lb",
          note: _str(y?.note, 400),
        })).filter((y) => y.crop)
      : [],
    preservationGuide: Array.isArray(raw.preservationGuide)
      ? raw.preservationGuide.slice(0, 32).map((p) => ({
          crop: _str(p?.crop, PLAN_SHORT_MAX),
          freshShare: _str(p?.freshShare, 32),
          preservationMethods: _strArr(p?.preservationMethods, 8, PLAN_SHORT_MAX),
          note: _str(p?.note, 400),
        })).filter((p) => p.crop)
      : [],
    savingsEstimate: savings,
    tips: _strArr(raw.tips, 12, 400),
  };
}

function GrowingPlanTab({
  baseResults, planState, setPlanState,
  familySize, hemisphere, plantingState,
  metric, currency, producePerPerson, setTab,
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [longRun, setLongRun] = useState(false); // swap copy after 30 s
  const downloadAnchorRef = useRef(null);
  // Track the current in-flight request so we can abort on unmount or on a
  // 90-second timeout. Also revoke any prior blob URL before we create a new
  // one — see #22, #23, #26.
  const abortControllerRef = useRef(null);
  const blobUrlRef = useRef(null);

  // Cycle the loading copy while we wait so the UI doesn't look frozen.
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setLoadingIdx((i) => (i + 1) % LOADING_MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, [generating]);

  // Unmount cleanup: abort any open fetch and revoke any outstanding blob URL.
  // We also revoke on beforeunload so refresh / tab-close doesn't leak the
  // last download URL forever (#26).
  useEffect(() => {
    const onBeforeUnload = () => {
      if (blobUrlRef.current) {
        try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* noop */ }
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* noop */ }
        abortControllerRef.current = null;
      }
      if (blobUrlRef.current) {
        try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* noop */ }
        blobUrlRef.current = null;
      }
    };
  }, []);

  const inputs = planState.inputs;
  const plan = planState.plan;
  const cropIds = baseResults.perCrop.map((r) => r.cropId);
  const cropNames = baseResults.perCrop.map((r) => r.crop.name);

  // Sorted-IDs fingerprint — used to detect when the user has changed crop
  // selection since the cached plan was generated (#15).
  const currentFingerprint = useMemo(
    () => cropIds.slice().sort().join(","),
    [cropIds]
  );
  const fingerprintStale = !!plan && !!planState.cropFingerprint
    && planState.cropFingerprint !== currentFingerprint;

  // Manual frost mode missing dates? Block generation (#5).
  const manualMissing = plantingState.mode === "manual"
    && (!plantingState.manualFrost?.lastSpring || !plantingState.manualFrost?.firstFall);

  const updateInput = (key, value) => {
    setPlanState((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [key]: value },
    }));
  };
  const toggleGoal = (id) => {
    setPlanState((prev) => {
      const next = prev.inputs.goals.includes(id)
        ? prev.inputs.goals.filter((g) => g !== id)
        : [...prev.inputs.goals, id];
      return { ...prev, inputs: { ...prev.inputs, goals: next } };
    });
  };
  const clearPlan = () => {
    if (window.confirm("Clear the current plan and start over?")) {
      setPlanState((prev) => ({ ...prev, plan: null, generatedAt: null, cropFingerprint: "" }));
    }
  };

  // ── Resolve frost dates from plantingState (zone or manual) ──
  const frostDates = useMemo(
    () => getFrostDates(plantingState.mode, plantingState.zone, hemisphere,
                       plantingState.manualFrost, plantingState.referenceYear),
    [plantingState, hemisphere]
  );
  const lastSpringFrostStr = frostDates.lastSpring
    ? formatDate(frostDates.lastSpring, plantingState.referenceYear)
    : "";
  const firstFallFrostStr = frostDates.firstFall
    ? formatDate(frostDates.firstFall, plantingState.referenceYear)
    : "";
  const zoneStr = plantingState.mode === "zone"
    ? `USDA zone ${plantingState.zone}`
    : "Manual frost entry";

  // ── Garden space estimate from selection ──
  // Use the RAW (un-buffered) area so the LLM sees actual growing area, not
  // path overhead. The buffered total is for layout/UX only (#10).
  const gardenSqFt = Math.max(50, Math.round(baseResults.totalSpaceRaw));

  const goalLabels = inputs.goals
    .map((id) => GOAL_CHIPS.find((g) => g.id === id)?.label)
    .filter(Boolean);

  const generate = async () => {
    if (cropIds.length === 0) {
      setError("Pick at least one crop on the Self-Sufficiency tab first.");
      return;
    }
    if (manualMissing) {
      setError("Manual frost mode is selected but the dates are blank. Open Planting Dates and set both.");
      return;
    }
    // Clear any prior server error BEFORE the confirm dialog — a user who
    // cancels should not stay staring at the last run's error message.
    setError("");
    // Confirm before regenerating when the current plan still matches the
    // selected crops. Each call consumes one of the user's 20/hr quota and
    // spends ~$0.06 on the Anthropic side. Stale-fingerprint case skips the
    // prompt because the user has visibly changed inputs and expects a fresh plan.
    if (plan && !fingerprintStale) {
      const ok = window.confirm(
        "You already have a fresh plan for this crop selection. Regenerate anyway? This will use one of your 20 hourly generations."
      );
      if (!ok) return;
    }
    setGenerating(true);
    setLoadingIdx(0);
    setLongRun(false);
    // 90-second hard timeout for the fetch. Show a reassurance line at 30 s
    // so the user knows we're still working (#22, #23).
    const ac = new AbortController();
    abortControllerRef.current = ac;
    const longRunTimer = setTimeout(() => setLongRun(true), 30000);
    const timeoutTimer = setTimeout(() => {
      try { ac.abort(); } catch { /* noop */ }
    }, 90000);
    try {
      // Read licence from LS at request time (not at mount) so a key entered
      // mid-session is picked up without a refresh.
      const licenseKey = loadState(LS_KEY, "");
      const instanceId = loadState(LS_INSTANCE, "");
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          licenseKey, instanceId,
          familySize,
          zone: zoneStr,
          lastSpringFrost: lastSpringFrostStr,
          firstFallFrost: firstFallFrostStr,
          hemisphere,
          // Always send sq ft; the server labels accordingly. The LLM is
          // told via displayUnits which units to use in OUTPUT (#11/#12).
          gardenSqFt,
          sunExposure: SUN_OPTIONS.find((o) => o.id === inputs.sunExposure)?.label || inputs.sunExposure,
          soilType: SOIL_OPTIONS.find((o) => o.id === inputs.soilType)?.label || inputs.soilType,
          waterMethod: WATER_OPTIONS.find((o) => o.id === inputs.waterMethod)?.label || inputs.waterMethod,
          experience: EXPERIENCE_OPTIONS.find((o) => o.id === inputs.experience)?.label || inputs.experience,
          goals: goalLabels,
          crops: cropNames,
          displayUnits: metric ? "metric" : "imperial",
          currency,
          // Always send lb; producePerPerson is stored in lb regardless of
          // metric toggle.
          producePerPersonLbs: producePerPerson,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        setError(data?.error || `The plan generator returned an error (${resp.status}). Please try again.`);
        setGenerating(false);
        return;
      }
      setPlanState((prev) => ({
        ...prev,
        plan: data.plan,
        generatedAt: Date.now(),
        cropFingerprint: currentFingerprint,
      }));
      setGenerating(false);
    } catch (e) {
      // AbortError means either we aborted on unmount (no UI needed) or the
      // 90 s timeout fired. Distinguish by checking the controller's signal.
      if (e?.name === "AbortError") {
        if (!ac.signal.aborted) return; // unmount, component is gone
        setError("The plan generator took too long to respond. Please try again.");
      } else {
        console.error("[GrowingPlan] fetch failed:", e?.message);
        setError("Couldn't reach the plan generator. Check your connection and try again.");
      }
      setGenerating(false);
    } finally {
      clearTimeout(longRunTimer);
      clearTimeout(timeoutTimer);
      abortControllerRef.current = null;
    }
  };

  const downloadHtml = () => {
    if (!plan) return;
    const html = buildPlanReportHtml({
      plan, inputs, familySize, zoneStr,
      lastSpringFrostStr, firstFallFrostStr, hemisphere,
      gardenSqFt, metric, currency, cropNames, generatedAt: planState.generatedAt,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    // Revoke the previous URL before creating a new one — every additional
    // download otherwise leaks an object URL until the page unloads (#26).
    if (blobUrlRef.current) {
      try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* noop */ }
    }
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    // The hidden anchor is rendered in JSX below; trust the ref instead of
    // creating a throwaway element (#9, #43).
    const a = downloadAnchorRef.current;
    if (!a) return;
    a.href = url;
    a.download = `Homestead-Harvest-Plan-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
  };

  return (
    <section aria-label="Growing Plan" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* ── Inputs from prior tabs (read-only summary) ── */}
      <div style={{
        padding: 16, borderRadius: T.radius,
        background: T.bg2, border: `1.5px solid ${T.border}`,
        marginBottom: 24,
      }}>
        <div style={{ ...eyebrowStyle, marginBottom: 8 }}>From your other tabs</div>
        <div style={{
          display: "grid", gap: "6px 24px",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          fontSize: 14, color: T.tx2,
        }}>
          <span><span style={{ color: T.tx3 }}>Family:</span> <strong style={{ color: T.tx }}>{familySize}</strong></span>
          <span><span style={{ color: T.tx3 }}>Hemisphere:</span> <strong style={{ color: T.tx }}>{hemisphere === "south" ? "Southern" : "Northern"}</strong></span>
          <span><span style={{ color: T.tx3 }}>Climate:</span> <strong style={{ color: T.tx }}>{zoneStr}</strong></span>
          <span><span style={{ color: T.tx3 }}>Garden space:</span> <strong style={{ color: T.tx }}>{metric ? `${(gardenSqFt * SQFT_TO_SQM).toFixed(1)} m²` : `${gardenSqFt} sq ft`}</strong></span>
          <span style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
            <span style={{ color: T.tx3 }}>Crops ({cropNames.length}):</span>{" "}
            <span style={{ color: T.tx }}>{cropNames.length > 0 ? cropNames.slice(0, 8).join(", ") + (cropNames.length > 8 ? `, +${cropNames.length - 8} more` : "") : "None selected yet"}</span>
          </span>
        </div>
      </div>

      {/* ── New inputs ── */}
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={labelStyle}>Sun exposure</label>
          <PillSelect options={SUN_OPTIONS} value={inputs.sunExposure}
            onChange={(v) => updateInput("sunExposure", v)} ariaLabel="Sun exposure" />
        </div>
        <div style={{
          display: "grid", gap: 20,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        }}>
          <div>
            <label style={labelStyle}>Soil type</label>
            <PillSelect options={SOIL_OPTIONS} value={inputs.soilType}
              onChange={(v) => updateInput("soilType", v)} size="sm" ariaLabel="Soil type" />
          </div>
          <div>
            <label style={labelStyle}>Watering</label>
            <PillSelect options={WATER_OPTIONS} value={inputs.waterMethod}
              onChange={(v) => updateInput("waterMethod", v)} size="sm" ariaLabel="Watering method" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Your experience</label>
          <PillSelect options={EXPERIENCE_OPTIONS} value={inputs.experience}
            onChange={(v) => updateInput("experience", v)} ariaLabel="Experience level" />
        </div>
        <div>
          <label style={labelStyle}>Goals (pick any that apply)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {GOAL_CHIPS.map((g) => {
              const active = inputs.goals.includes(g.id);
              return (
                <button key={g.id} type="button"
                  onClick={() => toggleGoal(g.id)}
                  aria-pressed={active}
                  style={{
                    padding: "10px 16px", minHeight: 44,
                    borderRadius: T.radiusPill,
                    background: active ? T.primary : T.bg2,
                    color: active ? "#FEFCF8" : T.tx2,
                    border: `1.5px solid ${active ? T.primary : T.border}`,
                    fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Generate / Regenerate button ── */}
      <div style={{ marginTop: 28 }}>
        {(() => {
          const disabled = generating || cropNames.length === 0 || manualMissing;
          // Disabled-state styling: drop opacity in addition to flipping the
          // background, so it reads as "not actionable" even when the colour
          // change alone is subtle (#14).
          const disabledLook = disabled || generating;
          return (
            <button type="button" onClick={generate} disabled={disabled}
              style={{
                width: "100%", padding: "16px 24px", minHeight: 56,
                borderRadius: T.radiusPill,
                background: generating ? T.tx3 : T.accent,
                color: "#FEFCF8", border: "none",
                fontFamily: T.fontBody, fontSize: 17, fontWeight: 700,
                cursor: disabled ? "default" : "pointer",
                opacity: disabledLook ? 0.7 : 1,
                boxShadow: generating ? "none" : T.shadow.accent,
                transition: "all 0.18s ease",
              }}>
              {generating
                ? LOADING_MESSAGES[loadingIdx]
                : plan ? "Regenerate plan" : "Generate my growing plan"}
            </button>
          );
        })()}
        {generating && (
          <p style={{
            marginTop: 10, fontSize: 13, color: T.tx2, textAlign: "center", lineHeight: 1.5,
          }}>
            {longRun
              ? "Still working — large plans take longer than usual. Please don't close the tab."
              : "This usually takes 20-40 seconds. Please don't close the tab."}
          </p>
        )}
        {cropNames.length === 0 && !generating && (
          <p style={{
            marginTop: 10, fontSize: 13, color: T.tx2, textAlign: "center",
          }}>
            Pick at least one crop on the{" "}
            <a href="#self-sufficiency"
              onClick={(e) => { if (typeof setTab === "function") { e.preventDefault(); setTab("self-sufficiency"); } }}
              style={{ color: T.primary, fontWeight: 700, textDecoration: "underline" }}>
              Self-Sufficiency tab
            </a>{" "}
            to enable plan generation.
          </p>
        )}
        {manualMissing && cropNames.length > 0 && !generating && (
          <p style={{
            marginTop: 10, fontSize: 13, color: T.tx2, textAlign: "center",
          }}>
            Manual frost mode is selected but the dates are blank. Open{" "}
            <a href="#planting-dates"
              onClick={(e) => { if (typeof setTab === "function") { e.preventDefault(); setTab("planting-dates"); } }}
              style={{ color: T.primary, fontWeight: 700, textDecoration: "underline" }}>
              Planting Dates
            </a>{" "}
            and set both.
          </p>
        )}
        {error && (
          <div role="alert" style={{
            marginTop: 12, padding: "10px 14px", borderRadius: T.radius,
            background: T.errorBg, color: T.error,
            border: `1px solid ${T.error}`, fontSize: 14,
          }}>{error}</div>
        )}
      </div>

      {/* ── Stale-plan banner: cropFingerprint changed since last generation (#15) ── */}
      {plan && !generating && fingerprintStale && (
        <div role="status" style={{
          marginTop: 20, padding: "12px 16px", borderRadius: T.radius,
          background: T.goldBg, color: T.gold,
          border: `1px solid ${T.gold}`, fontSize: 14, lineHeight: 1.5,
        }}>
          Your crop selection has changed since this plan was generated. Click <strong>Regenerate</strong> to update.
        </div>
      )}

      {/* ── Plan output ── */}
      {plan && !generating && (
        <PlanRenderer plan={plan} metric={metric} currency={currency}
          isMobile={isMobile}
          generatedAt={planState.generatedAt}
          onDownload={downloadHtml}
          onClear={clearPlan} />
      )}
      {/* hidden anchor for download */}
      <a ref={downloadAnchorRef} style={{ display: "none" }} aria-hidden="true" />
    </section>
  );
}

// ── PlanRenderer: renders the structured plan returned by the API ──────────
const MONTH_ORDER = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];
// Returns -1 for unknown month names. Callers that build timelines or sort
// rows MUST filter on `>= 0` rather than coerce silently — otherwise an
// unknown month sorts as January and renders a phantom bar.
function monthIndex(name) {
  return MONTH_ORDER.indexOf(name);
}

function PlanRenderer({ plan, metric, currency, isMobile, generatedAt, onDownload, onClear }) {
  return (
    <div style={{ marginTop: 32 }}>
      {/* ── Action bar ── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        justifyContent: "space-between", marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, color: T.tx3 }}>
          {generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onDownload}
            style={{
              padding: "10px 18px", minHeight: 44, borderRadius: T.radiusPill,
              background: T.primary, color: "#FEFCF8", border: "none",
              fontFamily: T.fontBody, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            Download as HTML
          </button>
          <button type="button" onClick={onClear}
            style={{
              padding: "10px 18px", minHeight: 44, borderRadius: T.radiusPill,
              background: "transparent", color: T.tx2,
              border: `1.5px solid ${T.border}`,
              fontFamily: T.fontBody, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            Clear plan
          </button>
        </div>
      </div>

      {/* ── Summary ── */}
      <PlanSection title="Summary">
        <p style={{ margin: 0, fontSize: 16, color: T.tx, lineHeight: 1.6 }}>{plan.summary}</p>
      </PlanSection>

      {/* ── Monthly schedule ── */}
      <PlanSection title="Month-by-month schedule">
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))",
        }}>
          {plan.monthlySchedule
            .slice()
            .sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
            .map((m) => (
              <div key={m.month} style={{
                padding: 14, borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
              }}>
                <div style={{
                  fontFamily: T.fontDisplay, fontSize: 18, color: T.tx, fontWeight: 400,
                  marginBottom: 8,
                }}>
                  {m.month}
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 18px", color: T.tx2, fontSize: 14, lineHeight: 1.55 }}>
                  {m.tasks.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
                </ul>
              </div>
            ))}
        </div>
      </PlanSection>

      {/* ── Bed layouts ── */}
      {plan.bedLayouts.length > 0 && (
        <PlanSection title="Bed layouts">
          <div style={{ display: "grid", gap: 12 }}>
            {plan.bedLayouts.map((b, i) => (
              <div key={i} style={{
                padding: 14, borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
              }}>
                <div style={{ fontWeight: 700, color: T.tx, fontSize: 15, marginBottom: 6 }}>
                  {b.bedName}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {b.crops.map((c, j) => (
                    <span key={j} style={{
                      padding: "4px 10px", borderRadius: T.radiusPill,
                      background: T.primaryBg, color: T.primary,
                      fontSize: 12, fontWeight: 600,
                    }}>{c}</span>
                  ))}
                </div>
                {b.notes && <p style={{ margin: 0, fontSize: 13, color: T.tx2, lineHeight: 1.55 }}>{b.notes}</p>}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* ── Succession planting ── */}
      {plan.successionPlanting.length > 0 && (
        <PlanSection title="Succession planting">
          <div style={{ display: "grid", gap: 8 }}>
            {plan.successionPlanting.map((s, i) => (
              <div key={i} style={{
                padding: "12px 14px", borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
                display: "grid", gap: 4,
                gridTemplateColumns: isMobile ? "1fr" : "minmax(140px, 200px) auto 1fr",
                alignItems: "baseline",
              }}>
                <div style={{ fontWeight: 700, color: T.tx, fontSize: 14 }}>{s.crop}</div>
                <div style={{
                  fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                  fontSize: 13, color: T.tx2,
                }}>
                  {s.plantings} plantings · every {s.intervalWeeks} {s.intervalWeeks === 1 ? "week" : "weeks"}
                </div>
                <div style={{ fontSize: 13, color: T.tx2, lineHeight: 1.5 }}>{s.note}</div>
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* ── Harvest timeline ── */}
      {plan.harvestTimeline.length > 0 && (
        <PlanSection title="Harvest timeline">
          <PlanHarvestChart rows={plan.harvestTimeline} />
        </PlanSection>
      )}

      {/* ── Yield estimates ── */}
      {plan.yieldEstimates.length > 0 && (
        <PlanSection title="Estimated yields">
          <div style={{ display: "grid", gap: 8 }}>
            {plan.yieldEstimates.map((y, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
                display: "grid", gap: 4,
                gridTemplateColumns: isMobile ? "1fr" : "minmax(140px, 200px) auto 1fr",
                alignItems: "baseline",
              }}>
                <div style={{ fontWeight: 700, color: T.tx, fontSize: 14 }}>{y.crop}</div>
                <div style={{
                  fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                  fontSize: 14, color: T.primary, fontWeight: 700,
                }}>
                  {y.plants} plants · ~{y.estimatedYield.toFixed(1)} {y.unit}
                </div>
                {y.note && <div style={{ fontSize: 12, color: T.tx3, lineHeight: 1.5 }}>{y.note}</div>}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* ── Preservation guide ── */}
      {plan.preservationGuide.length > 0 && (
        <PlanSection title="Preservation guide">
          <div style={{ display: "grid", gap: 8 }}>
            {plan.preservationGuide.map((p, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: T.radius,
                background: T.bg2, border: `1.5px solid ${T.border}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, color: T.tx, fontSize: 14 }}>{p.crop}</div>
                  <div style={{ fontSize: 12, color: T.tx3 }}>Fresh: <strong style={{ color: T.tx2 }}>{p.freshShare}</strong></div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {p.preservationMethods.map((m, j) => (
                    <span key={j} style={{
                      padding: "3px 9px", borderRadius: T.radiusPill,
                      background: T.goldBg, color: T.gold,
                      fontSize: 11, fontWeight: 600,
                    }}>{m}</span>
                  ))}
                </div>
                {p.note && <p style={{ margin: "6px 0 0", fontSize: 13, color: T.tx2, lineHeight: 1.5 }}>{p.note}</p>}
              </div>
            ))}
          </div>
        </PlanSection>
      )}

      {/* ── Savings estimate ── */}
      {plan.savingsEstimate && (
        <PlanSection title="Estimated annual savings">
          <div style={{
            padding: 18, borderRadius: T.radiusLg,
            background: `linear-gradient(180deg, ${T.primaryBg} 0%, ${T.bg2} 100%)`,
            border: `1.5px solid ${T.border}`, textAlign: "center",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
              <span style={{
                fontFamily: T.fontNum, fontWeight: 700,
                fontSize: isMobile ? 28 : 40, color: T.tx2,
              }}>{plan.savingsEstimate.currency || currency}</span>
              <span style={{
                fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                fontWeight: 700, fontSize: isMobile ? 36 : 56, color: T.primary, lineHeight: 1,
              }}>
                {plan.savingsEstimate.annualSavings.toLocaleString()}
              </span>
            </div>
            {plan.savingsEstimate.topSavers.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: T.tx2 }}>
                Top savers:{" "}
                {plan.savingsEstimate.topSavers.map((s, i) => (
                  <span key={i} style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: T.radiusPill,
                    background: T.card, border: `1px solid ${T.border}`,
                    fontWeight: 600, color: T.tx, marginLeft: 4,
                  }}>{s}</span>
                ))}
              </div>
            )}
            {plan.savingsEstimate.note && (
              <p style={{ margin: "10px auto 0", maxWidth: 460, fontSize: 13, color: T.tx2, lineHeight: 1.5 }}>
                {plan.savingsEstimate.note}
              </p>
            )}
          </div>
        </PlanSection>
      )}

      {/* ── Tips ── */}
      {plan.tips.length > 0 && (
        <PlanSection title="Tips for your first season">
          <ul style={{
            margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8,
          }}>
            {plan.tips.map((t, i) => (
              <li key={i} style={{
                padding: "10px 14px", borderRadius: T.radius,
                background: T.bg2, border: `1px solid ${T.border}`,
                fontSize: 14, color: T.tx, lineHeight: 1.55,
              }}>{t}</li>
            ))}
          </ul>
        </PlanSection>
      )}

      <p style={{ marginTop: 28, fontSize: 12, color: T.tx3, lineHeight: 1.55 }}>
        This plan was generated automatically from the inputs above. Generated plans are advisory,
        not authoritative; cross-check with local extension-service guidance before acting on
        anything irreversible. Full disclosure: see our <a href="/terms.html" style={{ color: T.tx2, textDecoration: "underline" }}>Terms</a>.
      </p>
    </div>
  );
}

function PlanSection({ title, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{
        margin: "0 0 12px", fontFamily: T.fontDisplay, fontWeight: 400,
        fontSize: 22, color: T.tx,
      }}>{title}</h3>
      {children}
    </div>
  );
}

// Compact bar-chart for the harvest timeline. Each row is a crop; the bar
// runs from startMonth to endMonth across a 12-column grid. Wraps year-end
// (e.g. tomatoes Sep–Mar) by drawing two segments.
function PlanHarvestChart({ rows }) {
  // Drop rows the LLM produced with non-canonical month names — the grid
  // requires a valid startIdx; without filtering, a bad row would render
  // a phantom January bar (#13).
  const filtered = rows
    .map((r) => {
      const startIdx = monthIndex(r.startMonth);
      let endIdx = monthIndex(r.endMonth);
      let peakIdx = monthIndex(r.peakMonth);
      // Soften end/peak: if the LLM only gave a startMonth, single-cell bar.
      if (endIdx === -1) endIdx = startIdx;
      if (peakIdx === -1) peakIdx = startIdx;
      return { ...r, startIdx, endIdx, peakIdx };
    })
    .filter((r) => r.startIdx >= 0);
  if (filtered.length === 0) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 560 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(120px, 160px) repeat(12, 1fr)",
          gap: 4, fontSize: 11, color: T.tx3, fontWeight: 600,
          paddingBottom: 6, borderBottom: `1px solid ${T.border}`, marginBottom: 8,
        }}>
          <div />
          {MONTH_ORDER.map((m) => (
            <div key={m} style={{ textAlign: "center", fontFamily: T.fontBody }}>{m.slice(0, 3)}</div>
          ))}
        </div>
        {filtered.map((r, i) => {
          const segments = [];
          if (r.endIdx >= r.startIdx) {
            segments.push([r.startIdx, r.endIdx]);
          } else {
            segments.push([r.startIdx, 11]);
            segments.push([0, r.endIdx]);
          }
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "minmax(120px, 160px) repeat(12, 1fr)",
              gap: 4, alignItems: "center", padding: "4px 0",
            }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: T.tx,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{r.crop}</div>
              {Array.from({ length: 12 }, (_, m) => {
                const inRange = segments.some(([a, b]) => m >= a && m <= b);
                const isPeak = m === r.peakIdx && inRange;
                return (
                  <div key={m} style={{
                    height: 18, borderRadius: 4,
                    background: inRange ? (isPeak ? T.accent : T.primary) : T.bg2,
                    opacity: inRange ? (isPeak ? 1 : 0.85) : 1,
                  }} title={inRange ? `${r.crop} - ${MONTH_ORDER[m]}${isPeak ? " (peak)" : ""}` : ""} />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Self-contained HTML report builder ─────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return "";
  // Defensive: numbers, booleans, etc. all coerce safely to a string. Returning
  // "" for non-strings used to swallow valid values like "0".
  const str = typeof s === "string" ? s : String(s);
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// Inline CSS hex values must match the T design tokens. Verified at audit
// 2026-04-17. If T changes, update here too:
//   bg=#FAF7F2, card=#FEFCF8, border=#DDD6C8, tx=#2C2418, tx2=#6B5D4F,
//   tx3=#7A6E5F, bg2=#F2EDE4, primary=#2D5A27, accent=#C45D3E,
//   primaryBg=#E6F0E5, goldBg=#FBF6E6, gold=#B8942C
function buildPlanReportHtml({ plan, inputs, familySize, zoneStr,
                              lastSpringFrostStr, firstFallFrostStr, hemisphere,
                              gardenSqFt, metric, currency, cropNames, generatedAt }) {
  const dateStr = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString();
  const sunLabel = SUN_OPTIONS.find((o) => o.id === inputs.sunExposure)?.label || inputs.sunExposure;
  const soilLabel = SOIL_OPTIONS.find((o) => o.id === inputs.soilType)?.label || inputs.soilType;
  const waterLabel = WATER_OPTIONS.find((o) => o.id === inputs.waterMethod)?.label || inputs.waterMethod;
  const expLabel = EXPERIENCE_OPTIONS.find((o) => o.id === inputs.experience)?.label || inputs.experience;
  const goalLabel = inputs.goals.map((id) => GOAL_CHIPS.find((g) => g.id === id)?.label || id).join(", ");
  const spaceStr = metric ? `${(gardenSqFt * SQFT_TO_SQM).toFixed(1)} m²` : `${gardenSqFt} sq ft`;

  const monthly = plan.monthlySchedule.slice().sort((a, b) => monthIndex(a.month) - monthIndex(b.month));

  const css = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #FAF7F2; color: #2C2418; margin: 0; padding: 24px 16px; line-height: 1.55; }
    .wrap { max-width: 880px; margin: 0 auto; background: #FEFCF8; border: 1px solid #DDD6C8; border-radius: 12px; padding: 32px 28px; }
    h1, h2, h3 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; color: #2C2418; line-height: 1.2; }
    h1 { font-size: clamp(24px, 4vw, 34px); margin: 0 0 6px; }
    h2 { font-size: clamp(20px, 3vw, 26px); margin: 32px 0 12px; }
    h3 { font-size: 18px; margin: 20px 0 8px; }
    .muted { color: #7A6E5F; font-size: 13px; }
    .num { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-weight: 700; }
    .meta { display: grid; gap: 6px 24px; grid-template-columns: 1fr 1fr; padding: 14px 16px; background: #F2EDE4; border-radius: 8px; margin: 16px 0 24px; font-size: 14px; }
    .card { padding: 14px 16px; border: 1px solid #DDD6C8; background: #F2EDE4; border-radius: 8px; margin-bottom: 10px; }
    .grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    ul.tasks { margin: 0; padding-left: 20px; color: #6B5D4F; font-size: 14px; }
    .chip { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #E6F0E5; color: #2D5A27; font-size: 12px; font-weight: 600; margin: 2px 4px 2px 0; }
    .chip-gold { background: #FBF6E6; color: #B8942C; }
    .savings { padding: 22px 18px; border-radius: 12px; background: linear-gradient(180deg, #E6F0E5 0%, #F2EDE4 100%); text-align: center; border: 1px solid #DDD6C8; }
    .savings .big { font-size: 48px; color: #2D5A27; }
    .savings .currency { font-size: 30px; color: #6B5D4F; vertical-align: top; }
    .timeline { display: grid; grid-template-columns: minmax(120px, 160px) repeat(12, 1fr); gap: 4px; align-items: center; padding: 4px 0; font-size: 12px; }
    .timeline .label { font-weight: 600; }
    .timeline .cell { height: 16px; border-radius: 4px; background: #F2EDE4; }
    .timeline .cell.on { background: #2D5A27; }
    .timeline .cell.peak { background: #C45D3E; }
    .header-row { display: grid; grid-template-columns: minmax(120px, 160px) repeat(12, 1fr); gap: 4px; padding-bottom: 6px; border-bottom: 1px solid #DDD6C8; margin-bottom: 8px; font-size: 11px; color: #7A6E5F; font-weight: 600; text-align: center; }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #DDD6C8; font-size: 12px; color: #7A6E5F; }
    a { color: #2D5A27; }
    .print-btn { display: inline-block; padding: 10px 18px; border-radius: 999px; background: #2D5A27; color: #FEFCF8; border: none; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; }
    @media print {
      body { background: #fff; padding: 0; }
      .wrap { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .print-btn { display: none; }
      .meta { background: #f7f4ee; }
      a { text-decoration: none; color: #2C2418; }
    }
    @media (max-width: 600px) {
      .meta { grid-template-columns: 1fr; }
      .timeline, .header-row { font-size: 10px; }
    }
  `;

  const monthlyHtml = monthly.map((m) => `
    <div class="card">
      <h3 style="margin-top:0;margin-bottom:6px;">${escapeHtml(m.month)}</h3>
      <ul class="tasks">${m.tasks.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>
  `).join("");

  const bedsHtml = plan.bedLayouts.length > 0 ? `
    <h2>Bed layouts</h2>
    ${plan.bedLayouts.map((b) => `
      <div class="card">
        <strong>${escapeHtml(b.bedName)}</strong>
        <div style="margin: 6px 0;">${b.crops.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>
        ${b.notes ? `<p style="margin:6px 0 0;font-size:13px;color:#6B5D4F;">${escapeHtml(b.notes)}</p>` : ""}
      </div>
    `).join("")}
  ` : "";

  const successionHtml = plan.successionPlanting.length > 0 ? `
    <h2>Succession planting</h2>
    ${plan.successionPlanting.map((s) => `
      <div class="card">
        <strong>${escapeHtml(s.crop)}</strong>
        <div class="num" style="font-size:13px;color:#6B5D4F;margin-top:4px;">
          ${s.plantings} plantings, every ${s.intervalWeeks} ${s.intervalWeeks === 1 ? "week" : "weeks"}
        </div>
        ${s.note ? `<p style="margin:6px 0 0;font-size:13px;color:#6B5D4F;">${escapeHtml(s.note)}</p>` : ""}
      </div>
    `).join("")}
  ` : "";

  const harvestHtml = plan.harvestTimeline.length > 0 ? `
    <h2>Harvest timeline</h2>
    <div style="overflow-x:auto;">
      <div style="min-width:560px;">
        <div class="header-row">
          <div></div>${MONTH_ORDER.map((m) => `<div>${m.slice(0, 3)}</div>`).join("")}
        </div>
        ${plan.harvestTimeline.map((r) => {
          const startIdx = monthIndex(r.startMonth);
          const endIdx = monthIndex(r.endMonth);
          const peakIdx = monthIndex(r.peakMonth);
          const segments = endIdx >= startIdx ? [[startIdx, endIdx]] : [[startIdx, 11], [0, endIdx]];
          const cells = Array.from({ length: 12 }, (_, m) => {
            const on = segments.some(([a, b]) => m >= a && m <= b);
            const peak = m === peakIdx && on;
            const cls = peak ? "cell on peak" : on ? "cell on" : "cell";
            return `<div class="${cls}"></div>`;
          }).join("");
          return `<div class="timeline"><div class="label">${escapeHtml(r.crop)}</div>${cells}</div>`;
        }).join("")}
      </div>
    </div>
  ` : "";

  const yieldHtml = plan.yieldEstimates.length > 0 ? `
    <h2>Estimated yields</h2>
    ${plan.yieldEstimates.map((y) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;">
          <strong>${escapeHtml(y.crop)}</strong>
          <span class="num" style="color:#2D5A27;">${y.plants} plants &middot; ~${y.estimatedYield.toFixed(1)} ${escapeHtml(y.unit)}</span>
        </div>
        ${y.note ? `<p style="margin:6px 0 0;font-size:13px;color:#6B5D4F;">${escapeHtml(y.note)}</p>` : ""}
      </div>
    `).join("")}
  ` : "";

  const presHtml = plan.preservationGuide.length > 0 ? `
    <h2>Preservation guide</h2>
    ${plan.preservationGuide.map((p) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <strong>${escapeHtml(p.crop)}</strong>
          <span class="muted">Fresh: <strong>${escapeHtml(p.freshShare)}</strong></span>
        </div>
        <div style="margin-top:6px;">${p.preservationMethods.map((m) => `<span class="chip chip-gold">${escapeHtml(m)}</span>`).join("")}</div>
        ${p.note ? `<p style="margin:6px 0 0;font-size:13px;color:#6B5D4F;">${escapeHtml(p.note)}</p>` : ""}
      </div>
    `).join("")}
  ` : "";

  const savingsHtml = plan.savingsEstimate ? `
    <h2>Estimated annual savings</h2>
    <div class="savings">
      <div><span class="num currency">${escapeHtml(plan.savingsEstimate.currency || currency)}</span><span class="num big">${plan.savingsEstimate.annualSavings.toLocaleString()}</span></div>
      ${plan.savingsEstimate.topSavers.length > 0 ? `<div style="margin-top:10px;font-size:13px;color:#6B5D4F;">Top savers: ${plan.savingsEstimate.topSavers.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      ${plan.savingsEstimate.note ? `<p style="margin:10px auto 0;max-width:460px;font-size:13px;color:#6B5D4F;">${escapeHtml(plan.savingsEstimate.note)}</p>` : ""}
    </div>
  ` : "";

  const tipsHtml = plan.tips.length > 0 ? `
    <h2>Tips for your first season</h2>
    ${plan.tips.map((t) => `<div class="card"><span style="font-size:14px;">${escapeHtml(t)}</span></div>`).join("")}
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Homestead Harvest Plan - ${escapeHtml(dateStr)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Plus+Jakarta+Sans:wght@400;600;700&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
  <div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Your Homestead Harvest Plan</h1>
        <div class="muted">by Urban Root &middot; generated ${escapeHtml(dateStr)}</div>
      </div>
      <button class="print-btn" type="button" onclick="window.print()">Save as PDF</button>
    </div>

    <div class="meta">
      <span><span class="muted">Family:</span> <strong>${familySize}</strong></span>
      <span><span class="muted">Hemisphere:</span> <strong>${hemisphere === "south" ? "Southern" : "Northern"}</strong></span>
      <span><span class="muted">Climate:</span> <strong>${escapeHtml(zoneStr)}</strong></span>
      <span><span class="muted">Garden space:</span> <strong>${escapeHtml(spaceStr)}</strong></span>
      <span><span class="muted">Last spring frost:</span> <strong>${escapeHtml(lastSpringFrostStr || "n/a")}</strong></span>
      <span><span class="muted">First fall frost:</span> <strong>${escapeHtml(firstFallFrostStr || "n/a")}</strong></span>
      <span><span class="muted">Sun:</span> <strong>${escapeHtml(sunLabel)}</strong></span>
      <span><span class="muted">Soil:</span> <strong>${escapeHtml(soilLabel)}</strong></span>
      <span><span class="muted">Watering:</span> <strong>${escapeHtml(waterLabel)}</strong></span>
      <span><span class="muted">Experience:</span> <strong>${escapeHtml(expLabel)}</strong></span>
      <span style="grid-column:1/-1;"><span class="muted">Goals:</span> <strong>${escapeHtml(goalLabel || "(none)")}</strong></span>
      <span style="grid-column:1/-1;"><span class="muted">Crops (${cropNames.length}):</span> <strong>${escapeHtml(cropNames.join(", "))}</strong></span>
    </div>

    <h2>Summary</h2>
    <p style="font-size:16px;line-height:1.6;">${escapeHtml(plan.summary)}</p>

    <h2>Month-by-month schedule</h2>
    <div class="grid-3">${monthlyHtml}</div>

    ${bedsHtml}
    ${successionHtml}
    ${harvestHtml}
    ${yieldHtml}
    ${presHtml}
    ${savingsHtml}
    ${tipsHtml}

    <footer>
      <p style="margin:0 0 6px;"><strong>Disclaimer.</strong> This plan was generated automatically from your inputs. Generated plans are advisory, not authoritative; cross-check with local extension-service guidance before acting on anything irreversible.</p>
      <p style="margin:0;">Homestead Harvest Planner by Urban Root &middot; thehomesteadplan.com</p>
    </footer>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Crop Database (Tab 6, paid) ──
// Searchable, sortable, filterable view of the full crop database. Desktop
// renders a table; mobile drops to cards. Row click expands a details drawer
// with companion + preservation context. Filter/sort state persists.
// ═══════════════════════════════════════════════════════════════════════════
const SOW_LABELS = { direct: "Direct sow", transplant: "Transplant", either: "Either" };
const SEASON_LABELS = { warm: "Warm", cool: "Cool", perennial: "Perennial" };
const WATER_LABELS = { low: "Low", moderate: "Moderate", high: "High" };
const PRESERVATION_LABELS = {
  can: "Canning", freeze: "Freezing", dehydrate: "Dehydrating",
  ferment: "Fermenting", root_cellar: "Root cellar", sauce: "Sauce", fresh: "Fresh only",
};
// Approximate average shelf-life in months by method (USDA, NCHFP, Ball Blue Book).
const PRESERVATION_SHELF_MONTHS = {
  can: 14, freeze: 10, dehydrate: 18, ferment: 9, root_cellar: 4, sauce: 14, fresh: 0.5,
};
// Truncate a comma-separated varieties string to the first 3 entries with
// an ellipsis when the list is longer. Single split() + consistent output.
// Audit #62.
const VARIETIES_PREVIEW_MAX = 3;
function summarizeVarieties(str) {
  if (!str) return "";
  const parts = str.split(",");
  if (parts.length <= VARIETIES_PREVIEW_MAX) return str;
  return `${parts.slice(0, VARIETIES_PREVIEW_MAX).join(",")}…`;
}

const CROP_DB_SORTS = [
  { id: "name_asc",       label: "Name A→Z" },
  { id: "name_desc",      label: "Name Z→A" },
  { id: "days_asc",       label: "Fastest to harvest" },
  { id: "yield_desc",     label: "Highest yield" },
  { id: "space_asc",      label: "Smallest footprint" },
  { id: "difficulty_asc", label: "Easiest first" },
];

function CropDatabaseTab({ metric, dbState, setDbState }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const { search, categoryFilter, sort, expandedId } = dbState;
  // Functional setters everywhere — see audit #82.
  const setSearch     = (v) => setDbState((p) => ({ ...p, search: v, expandedId: null }));
  const setSort       = (v) => setDbState((p) => ({ ...p, sort: v }));
  const setExpandedId = (v) => setDbState((p) => ({ ...p, expandedId: v }));
  const toggleCategory = (id) => {
    setDbState((p) => {
      const next = p.categoryFilter.includes(id)
        ? p.categoryFilter.filter((c) => c !== id)
        : [...p.categoryFilter, id];
      // Drop expandedId on filter change — otherwise a row that the user
      // closed by filtering it out will silently re-open if the filter is
      // widened again. Audit #13/#44.
      return { ...p, categoryFilter: next, expandedId: null };
    });
  };
  const clearFilters = () => setDbState((p) => ({ ...p, search: "", categoryFilter: [], expandedId: null }));

  const massConv = metric ? LB_TO_KG : 1;
  const areaConv = metric ? SQFT_TO_SQM : 1;
  const unitMass = metric ? "kg" : "lb";
  const unitArea = metric ? "m²" : "sq ft";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = Object.entries(CROPS)
      .filter(([id, c]) => {
        if (categoryFilter.length > 0 && !categoryFilter.includes(c.category)) return false;
        if (!q) return true;
        // Search common-name + cultivar names only. Raw crop ids are an
        // implementation detail; including them lets a user accidentally
        // match every underscored id by typing "_". Audit #37.
        const haystack = `${c.name} ${c.varieties || ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .map(([id, c]) => ({ id, ...c }));
    const dir = sort.endsWith("_desc") ? -1 : 1;
    // Defensive readers — a malformed range field on a future crop would
    // otherwise produce NaN comparators and a non-deterministic sort order.
    // Audit #38, #39.
    const lowOf  = (range, fb) => Array.isArray(range) && Number.isFinite(range[0]) ? range[0] : fb;
    const highOf = (range, fb) => Array.isArray(range) && Number.isFinite(range[1]) ? range[1] : fb;
    filtered.sort((a, b) => {
      switch (sort) {
        case "name_asc":
        case "name_desc":
          return a.name.localeCompare(b.name) * dir;
        case "days_asc":
          return (lowOf(a.daysToMaturity, 0) - lowOf(b.daysToMaturity, 0)) * dir;
        case "yield_desc": {
          const ya = (lowOf(a.yieldPerPlantLbs, 0) + highOf(a.yieldPerPlantLbs, 0)) / 2;
          const yb = (lowOf(b.yieldPerPlantLbs, 0) + highOf(b.yieldPerPlantLbs, 0)) / 2;
          return (ya - yb) * dir;
        }
        case "space_asc":
          return ((a.spacingSqFt || 0) - (b.spacingSqFt || 0)) * dir;
        case "difficulty_asc":
          return ((a.difficulty || 0) - (b.difficulty || 0)) * dir;
        default: return 0;
      }
    });
    return filtered;
  }, [search, categoryFilter, sort]);

  return (
    <section aria-label="Crop Database" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* ── Search + sort row ── */}
      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: isMobile ? "1fr" : "minmax(240px, 1fr) minmax(220px, 280px)",
      }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.tx2 }}>Search crops</span>
          <input type="search" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Try 'tomato' or 'San Marzano'"
            aria-label="Search crops"
            maxLength={64}
            style={{
              fontSize: 16, fontFamily: T.fontBody, color: T.tx,
              background: T.card, border: `1.5px solid ${T.border}`,
              borderRadius: T.radius, padding: "12px 14px", minHeight: 48,
            }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.tx2 }}>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            aria-label="Sort crops"
            style={{
              fontSize: 16, fontFamily: T.fontBody, color: T.tx,
              background: T.card, border: `1.5px solid ${T.border}`,
              borderRadius: T.radius, padding: "12px 14px", minHeight: 48,
            }}>
            {CROP_DB_SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Category filter chips ── */}
      <div style={{ marginTop: 18 }}>
        <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Filter by category</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map((cat) => {
            const active = categoryFilter.includes(cat.id);
            return (
              <button key={cat.id} type="button"
                onClick={() => toggleCategory(cat.id)}
                aria-pressed={active}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", minHeight: 44,
                  borderRadius: T.radiusPill,
                  background: active ? cat.color : T.bg2,
                  color: active ? "#FEFCF8" : T.tx2,
                  border: `1.5px solid ${active ? cat.color : T.border}`,
                  fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s ease",
                }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: active ? "rgba(254,252,248,0.85)" : cat.color,
                }} />
                {cat.label}
              </button>
            );
          })}
          {(categoryFilter.length > 0 || search) && (
            <button type="button" onClick={clearFilters}
              style={{
                padding: "10px 14px", minHeight: 44, borderRadius: T.radiusPill,
                background: "transparent", color: T.tx2,
                border: `1.5px dashed ${T.border}`,
                fontFamily: T.fontBody, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Result count ── */}
      <div style={{
        marginTop: 16, paddingBottom: 12,
        borderBottom: `1px solid ${T.border}`,
        fontSize: 13, color: T.tx3, fontWeight: 600,
      }}>
        Showing <span style={{ color: T.tx, fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>
          {rows.length}
        </span> of {Object.keys(CROPS).length} crops
      </div>

      {/* ── Results: mobile cards / desktop table ── */}
      {rows.length === 0 ? (
        <p style={{ marginTop: 24, color: T.tx3, fontSize: 14, textAlign: "center", padding: "32px 0" }}>
          No crops match those filters. Try clearing them or searching for a different term.
        </p>
      ) : isMobile ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <CropDbCard key={row.id} row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              massConv={massConv} areaConv={areaConv} unitMass={unitMass} unitArea={unitArea} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: T.fontBody, fontSize: 14, color: T.tx,
          }}>
            <thead>
              <tr style={{ textAlign: "left", color: T.tx3, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th scope="col" style={cropDbThStyle}>Crop</th>
                <th scope="col" style={cropDbThStyle}>Season</th>
                <th scope="col" style={cropDbThStyle}>Sow</th>
                <th scope="col" style={cropDbThStyle}>Maturity</th>
                <th scope="col" style={cropDbThStyle}>Space ({unitArea})</th>
                <th scope="col" style={cropDbThStyle}>Yield ({unitMass}/plant)</th>
                <th scope="col" style={cropDbThStyle}>Sun (h)</th>
                <th scope="col" style={cropDbThStyle}>Water</th>
                <th scope="col" style={cropDbThStyle}>Diff.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expandedId === row.id;
                const cat = CATEGORIES.find((c) => c.id === row.category);
                const toggleRow = () => setExpandedId(isOpen ? null : row.id);
                return (
                  <React.Fragment key={row.id}>
                    {/* Row is keyboard-focusable (tabIndex=0) and toggles on
                        Enter / Space so non-mouse users can open the detail
                        drawer. role="button" + aria-expanded surface the
                        interaction model to assistive tech. Audit #47. */}
                    <tr onClick={toggleRow}
                      role="button" tabIndex={0}
                      aria-expanded={isOpen}
                      aria-label={`${row.name} - ${isOpen ? "collapse" : "expand"} details`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRow();
                        }
                      }}
                      style={{
                        cursor: "pointer",
                        background: isOpen ? T.cardHover : "transparent",
                        borderTop: `1px solid ${T.border}`,
                      }}>
                      <td style={cropDbTdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: cat?.color || T.tx3, flexShrink: 0,
                          }} aria-label={cat?.label} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{row.name}</div>
                            {row.varieties && (
                              <div style={{ fontSize: 12, color: T.tx3, marginTop: 2, lineHeight: 1.3 }}>
                                {summarizeVarieties(row.varieties)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={cropDbTdStyle}>{SEASON_LABELS[row.season]}</td>
                      <td style={cropDbTdStyle}>{SOW_LABELS[row.sowMethod]}</td>
                      <td style={cropDbTdNumStyle}>{fmtMaturity(row.daysToMaturity, row.season)}</td>
                      <td style={cropDbTdNumStyle}>
                        {(row.spacingSqFt * areaConv).toFixed(metric ? 2 : 1)}
                      </td>
                      <td style={cropDbTdNumStyle}>
                        {(row.yieldPerPlantLbs[0] * massConv).toFixed(1)}–{(row.yieldPerPlantLbs[1] * massConv).toFixed(1)}
                      </td>
                      <td style={cropDbTdNumStyle}>{row.sunHours}</td>
                      <td style={cropDbTdStyle}>{WATER_LABELS[row.waterNeeds]}</td>
                      <td style={cropDbTdNumStyle}>
                        <DifficultyDots level={row.difficulty} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: T.bg2, borderTop: `1px solid ${T.border}`, padding: 0 }}>
                          <CropDbDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const cropDbThStyle = {
  padding: "10px 12px", fontWeight: 700, color: T.tx3,
  borderBottom: `1px solid ${T.border}`,
};
const cropDbTdStyle = {
  padding: "12px", verticalAlign: "top", color: T.tx,
};
const cropDbTdNumStyle = {
  padding: "12px", verticalAlign: "top", color: T.tx,
  fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
};

function DifficultyDots({ level }) {
  const dots = Math.max(1, Math.min(5, Math.round(level)));
  return (
    <span aria-label={`Difficulty ${dots} of 5`} style={{ display: "inline-flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: i <= dots ? T.gold : T.bg2,
          border: `1px solid ${i <= dots ? T.gold : T.border}`,
        }} />
      ))}
    </span>
  );
}

function CropDbCard({ row, expanded, onToggle, massConv, areaConv, unitMass, unitArea }) {
  const cat = CATEGORIES.find((c) => c.id === row.category);
  return (
    <div style={{
      background: expanded ? T.cardHover : T.card,
      border: `1.5px solid ${T.border}`,
      borderRadius: T.radius, overflow: "hidden",
    }}>
      <button type="button" onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%", padding: "14px 16px", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
          display: "grid", gap: 8,
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: cat?.color || T.tx3, flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: T.tx, fontSize: 16 }}>{row.name}</div>
            <div style={{ fontSize: 12, color: T.tx3, marginTop: 2 }}>
              {cat?.label} · {SEASON_LABELS[row.season]} · {SOW_LABELS[row.sowMethod]}
            </div>
          </div>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"
            style={{
              flexShrink: 0, color: T.tx2,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}>
            <path d="M3 5 L7 9 L11 5" stroke="currentColor" strokeWidth="2"
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 12px",
          fontSize: 13, color: T.tx2, fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
        }}>
          <span><span style={{ color: T.tx3 }}>Maturity:</span> {fmtMaturity(row.daysToMaturity, row.season)}</span>
          <span><span style={{ color: T.tx3 }}>Sun:</span> {row.sunHours}h</span>
          <span><span style={{ color: T.tx3 }}>Space:</span> {(row.spacingSqFt * areaConv).toFixed(1)} {unitArea}</span>
          <span><span style={{ color: T.tx3 }}>Yield:</span> {(row.yieldPerPlantLbs[0] * massConv).toFixed(1)}–{(row.yieldPerPlantLbs[1] * massConv).toFixed(1)} {unitMass}</span>
          <span><span style={{ color: T.tx3 }}>Water:</span> {WATER_LABELS[row.waterNeeds]}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: T.tx3 }}>Diff:</span> <DifficultyDots level={row.difficulty} />
          </span>
        </div>
      </button>
      {expanded && <CropDbDetail row={row} />}
    </div>
  );
}

function CropDbDetail({ row }) {
  // Companion lookup against the rest of the database. O(N) per open row;
  // database is ~63 entries so this is fine.
  const companions = useMemo(() => {
    const good = [];
    const bad = [];
    for (const otherId of Object.keys(CROPS)) {
      if (otherId === row.id) continue;
      const rel = getCompanion(row.id, otherId);
      if (!rel) continue;
      const entry = { id: otherId, name: CROPS[otherId].name, reason: rel.reason };
      if (rel.rel === "good") good.push(entry);
      else if (rel.rel === "bad") bad.push(entry);
    }
    good.sort((a, b) => a.name.localeCompare(b.name));
    bad.sort((a, b) => a.name.localeCompare(b.name));
    return { good, bad };
  }, [row.id]);

  return (
    <div style={{ padding: "16px 18px", display: "grid", gap: 16 }}>
      {row.varieties && (
        <div>
          <div style={eyebrowStyle}>Varieties</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: T.tx, lineHeight: 1.5 }}>
            {row.varieties}
          </p>
        </div>
      )}
      <div style={{
        display: "grid", gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}>
        <div>
          <div style={eyebrowStyle}>Preservation methods</div>
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {row.preservation.map((m) => (
              <li key={m} style={{ fontSize: 13, color: T.tx2, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: T.tx, fontWeight: 600 }}>{PRESERVATION_LABELS[m] || m}</span>
                <span style={{ fontFamily: T.fontNum, color: T.tx3 }}>
                  ~{PRESERVATION_SHELF_MONTHS[m] ?? "—"} mo
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={eyebrowStyle}>Plays well with</div>
          {companions.good.length === 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: T.tx3, fontStyle: "italic" }}>
              No specific companions logged.
            </p>
          ) : (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {companions.good.map((c) => (
                <span key={c.id} title={c.reason}
                  style={{
                    padding: "4px 10px", borderRadius: T.radiusPill,
                    background: T.primaryBg, color: T.primary,
                    fontSize: 12, fontWeight: 600,
                  }}>
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={eyebrowStyle}>Avoid planting with</div>
          {companions.bad.length === 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: T.tx3, fontStyle: "italic" }}>
              No conflicts logged.
            </p>
          ) : (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {companions.bad.map((c) => (
                <span key={c.id} title={c.reason}
                  style={{
                    padding: "4px 10px", borderRadius: T.radiusPill,
                    background: T.errorBg, color: T.error,
                    fontSize: 12, fontWeight: 600,
                  }}>
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Cost Savings Calculator (Tab 7, paid) ──
// Pulls plant counts and yields from the Self-Sufficiency selection so the
// user doesn't re-enter anything. Per-crop grocery prices are editable. Setup
// costs cover the typical first-year capital outlay. Currency symbol is
// passed-through display only — no FX conversion is performed (matches the
// rest of the app's currency model).
// ═══════════════════════════════════════════════════════════════════════════
const COST_SAVINGS_FIELDS = [
  { key: "beds",       label: "Raised beds / lumber" },
  { key: "soil",       label: "Soil + compost" },
  { key: "seeds",      label: "Seeds + seedlings" },
  { key: "tools",      label: "Tools" },
  { key: "irrigation", label: "Irrigation supplies" },
];
// Sensible US first-year defaults for a small-medium home garden (~$300 total).
const DEFAULT_SETUP_COSTS = {
  beds: 120, soil: 80, seeds: 35, tools: 40, irrigation: 25,
};

// Shared empty-state banner for paid tabs that depend on the
// Self-Sufficiency crop selection. Rendered when baseResults.perCrop is
// empty so the user gets a clear "do this first" instead of a page of
// zeros and em-dashes. Uses href="#self-sufficiency" so the existing
// hashchange listener does the routing — no setTab prop needed.
function NoCropsBanner({ cta = "Go to Self-Sufficiency" }) {
  return (
    <section aria-label="Pick crops first" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: "40px 28px", boxShadow: T.shadow.lg,
      textAlign: "center",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 60, height: 60, borderRadius: "50%",
        background: T.primaryBg, marginBottom: 16,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke={T.primary} strokeWidth="2.2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v9" /><path d="M8 6l4-4 4 4" />
          <path d="M4 13h16v8H4z" />
        </svg>
      </div>
      <h3 style={{
        margin: 0, fontFamily: T.fontDisplay,
        fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 400, color: T.tx, lineHeight: 1.2,
      }}>
        Pick your crops first
      </h3>
      <p style={{
        margin: "12px auto 20px", maxWidth: 440,
        fontSize: 15, color: T.tx2, lineHeight: 1.55,
      }}>
        This tab builds on your Self-Sufficiency selection. Head over there, pick the crops your family actually eats, and this calculator will fill with real numbers.
      </p>
      <a href="#self-sufficiency"
        onClick={() => {
          // The global hashchange listener switches the tab but doesn't
          // scroll to top when the click originates halfway down a long
          // paid tab. Force it here so the user lands on the Self-Suff
          // hero instead of in the middle of content.
          if (typeof window !== "undefined") {
            setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
          }
        }}
        style={{
          display: "inline-block", padding: "12px 24px", minHeight: 44,
          background: T.primary, color: "#FEFCF8",
          borderRadius: T.radiusPill, textDecoration: "none",
          fontFamily: T.fontBody, fontSize: 15, fontWeight: 700,
        }}>
        {cta}
      </a>
    </section>
  );
}

function CostSavingsCalculator({
  baseResults,
  beds, soilState, costSavings, setCostSavings,
  metric, currency,
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  // Empty-state guard: the whole tab is a Self-Sufficiency passthrough.
  // Without crops selected every number collapses to zero. Computed here
  // but applied AFTER all hooks run (below) to keep hook order stable
  // across renders — React's Rules of Hooks forbid an early return that
  // skips subsequent useMemo calls.
  const noCrops = !baseResults.perCrop.length;

  const massConv = metric ? LB_TO_KG : 1;
  const unitMass = metric ? "kg" : "lb";

  // ── Soil-cost prefill button: uses the current Soil Calculator state ──
  // Mirrors SoilCalculator's effectiveMix derivation so this number ALWAYS
  // matches what the user sees on the Soil tab. Reads BOTH price overrides
  // (every mix) and pct overrides (Custom mix only). Skipping pcts here was
  // the audit's HIGH finding — the button label promises "Soil Calculator
  // total" so it has to actually be that.
  const soilCostEstimate = useMemo(() => {
    const mix = SOIL_MIXES.find((m) => m.id === soilState.mixId) || SOIL_MIXES[0];
    const priceOverrides = soilState.mixOverrides?.prices?.[soilState.mixId] || {};
    const pctOverrides   = soilState.mixOverrides?.pcts?.[soilState.mixId]   || {};
    const effectiveMix = {
      ...mix,
      components: mix.components.map((c) => ({
        ...c,
        pct: mix.id === "custom" ? (pctOverrides[c.key] ?? c.pct) : c.pct,
        pricePerCuFt: priceOverrides[c.key] ?? c.pricePerCuFt,
      })),
    };
    return computeSoilResults(beds, effectiveMix).totalCost;
  }, [beds, soilState]);

  // Functional setters so back-to-back updates in the same React batch
  // (e.g. user blurs two Field components together) compose correctly
  // instead of the second overwriting the first's stale closure. Audit #82.
  const updatePrice = (cropId, value) => {
    setCostSavings((prev) => ({
      ...prev,
      priceOverrides: { ...prev.priceOverrides, [cropId]: value },
    }));
  };
  const updateSetup = (key, value) => {
    setCostSavings((prev) => ({
      ...prev,
      setupCosts: { ...prev.setupCosts, [key]: value },
    }));
  };
  const fillSoilCost = () => {
    if (soilCostEstimate > 0) {
      updateSetup("soil", Math.round(soilCostEstimate * 100) / 100);
    }
  };
  const resetPrices = () => {
    if (window.confirm("Reset every per-crop price back to the default? Your custom prices will be cleared.")) {
      setCostSavings((prev) => ({ ...prev, priceOverrides: {} }));
    }
  };
  const resetSetupCosts = () => {
    if (window.confirm("Reset all setup costs back to the defaults?")) {
      setCostSavings((prev) => ({ ...prev, setupCosts: { ...DEFAULT_SETUP_COSTS } }));
    }
  };

  // ── Per-crop savings table ──
  // Fallback chain: user override → crop-default → 0. The final 0 guard
  // covers a future crop shipped without `groceryPricePerLb` so a missing
  // field can't NaN-cascade through totals, hero, or bar widths. Audit #3.
  // Render in baseResults order (matches Self-Sufficiency tab) so editing
  // a price doesn't reorder the row mid-edit and yank the cursor with it.
  // The bar widths still convey ranking visually. Audit #49.
  const perCropSavings = useMemo(() => {
    return baseResults.perCrop.map((r) => {
      const stored = costSavings.priceOverrides[r.cropId];
      const cropDefault = r.crop.groceryPricePerLb;
      const pricePerLb = typeof stored === "number" && Number.isFinite(stored)
        ? stored
        : (typeof cropDefault === "number" && Number.isFinite(cropDefault) ? cropDefault : 0);
      const annualSavings = r.expectedYieldLbs * pricePerLb;
      return { ...r, pricePerLb, annualSavings };
    });
  }, [baseResults, costSavings.priceOverrides]);
  // Bar-chart denominator uses the max savings across all rows so per-row
  // widths still reflect ranking even though the row order itself is stable.
  const maxSavingsForBars = useMemo(
    () => perCropSavings.reduce((m, r) => Math.max(m, r.annualSavings), 0),
    [perCropSavings]
  );

  const totals = useMemo(() => {
    const totalSavings = perCropSavings.reduce((s, r) => s + r.annualSavings, 0);
    const totalSetup = COST_SAVINGS_FIELDS.reduce(
      (s, f) => s + (Number(costSavings.setupCosts[f.key]) || 0), 0
    );
    const monthlySavings = totalSavings / 12;
    const breakEvenMonths = monthlySavings > 0 ? totalSetup / monthlySavings : Infinity;
    const roiPct = totalSetup > 0 && totalSavings > 0
      ? ((totalSavings - totalSetup) / totalSetup) * 100
      : null;
    return { totalSavings, totalSetup, breakEvenMonths, roiPct, hasCrops: perCropSavings.length > 0 };
  }, [perCropSavings, costSavings.setupCosts]);

  const maxSavings = maxSavingsForBars;
  const heroBreakEven = Number.isFinite(totals.breakEvenMonths)
    ? Math.max(0.1, totals.breakEvenMonths)
    : null;

  // Perennial flag: blueberry, raspberry, rhubarb etc. take 1-3 years to
  // produce. The hero savings number assumes established plants, so
  // surface the caveat whenever the user's selection includes any.
  const hasPerennials = baseResults.perCrop.some((r) => r.crop.season === "perennial");

  // Apply the empty-state branch AFTER all hooks have run — see comment
  // at the top of this component for the Rules-of-Hooks rationale.
  if (noCrops) return <NoCropsBanner />;

  return (
    <section aria-label="Cost Savings Calculator" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* ── Hero stat ── */}
      {/* Visual block is aria-hidden so the count-up animation doesn't spam
          screen readers every interpolated frame. The polite live region
          below carries the settled value as a single announcement when the
          underlying number changes. Audit #56. */}
      <div style={{
        padding: isMobile ? 20 : 32, borderRadius: T.radiusLg,
        background: `linear-gradient(180deg, ${T.primaryBg} 0%, ${T.bg2} 100%)`,
        border: `1.5px solid ${T.border}`, textAlign: "center",
      }}>
        <div style={eyebrowStyle}>Estimated annual grocery savings</div>
        <div aria-hidden="true" style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
          <span style={{
            fontFamily: T.fontNum, fontWeight: 700,
            fontSize: isMobile ? 36 : 52, color: T.tx2,
          }}>{currency}</span>
          <CountUpNumber value={totals.totalSavings} decimals={0}
            size={isMobile ? 48 : 72} color={T.primary} />
        </div>
        <span aria-live="polite" style={srOnlyStyle}>
          Estimated annual grocery savings: {currency}{Math.round(totals.totalSavings).toLocaleString()}.
        </span>
        <p style={{ margin: "12px auto 0", fontSize: 15, color: T.tx2, maxWidth: 480, lineHeight: 1.5 }}>
          {heroBreakEven == null
            ? "Add at least one crop in the Self-Sufficiency tab to see your break-even timeline."
            : totals.totalSetup === 0
              ? "Add your setup costs below to see when your garden pays for itself."
              : <>Your garden pays for itself in <strong style={{ color: T.tx, fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums" }}>{heroBreakEven < 1 ? "under 1" : heroBreakEven.toFixed(1)}</strong> {heroBreakEven.toFixed(1) === "1.0" ? "month" : "months"}.{heroBreakEven > 36 ? " That's a long horizon. Consider trimming setup costs or adding higher-value crops." : ""}</>}
        </p>
      </div>

      {/* ── Perennial establishment caveat ── */}
      {/* Berries, rhubarb, asparagus, artichoke etc. produce little-to-zero
          yield in years 1-2. The savings number assumes established plants.
          Without this caveat a first-year homesteader expects same-season
          grocery savings from a blueberry bush that won't fruit for 2-3 yr. */}
      {hasPerennials && (
        <div role="note" style={{
          marginTop: 16, padding: "12px 16px", borderRadius: T.radius,
          background: T.goldBg, color: T.gold,
          border: `1px solid ${T.gold}`, fontSize: 13, lineHeight: 1.5,
        }}>
          <strong>Perennials take time to establish.</strong> Berries, rhubarb, asparagus, artichoke, sunchoke, horseradish, tarragon, and marjoram in your selection typically produce little or nothing in year 1. The savings number assumes established plants (year 2-3+).
        </div>
      )}

      {/* ── KPI row ── */}
      {/* Break-even and ROI are rendered as bare "—" via MiniStat's
          formatCountUp non-finite path when no crops are picked or there's
          nothing to amortize. Showing "0 mo" or "-100%" reads as broken.
          Audit #5, #6. */}
      <div style={{
        marginTop: 20, display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12,
      }}>
        <MiniStat label="Setup cost" value={totals.totalSetup} unit={currency} decimals={0} />
        <MiniStat label="Annual savings" value={totals.totalSavings} unit={currency} decimals={0} />
        <MiniStat label="Break-even"
          value={Number.isFinite(totals.breakEvenMonths) ? totals.breakEvenMonths : NaN}
          unit={Number.isFinite(totals.breakEvenMonths) ? "mo" : ""} decimals={1} />
        <MiniStat label="First-year ROI"
          value={totals.roiPct == null ? NaN : totals.roiPct}
          unit={totals.roiPct == null ? "" : "%"} decimals={0} />
      </div>

      {/* ── Setup cost inputs ── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <label style={labelStyle}>Garden setup costs ({currency})</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {soilCostEstimate > 0 && (
              <button type="button" onClick={fillSoilCost}
                title="Soil-mix prices are entered in the Soil Calculator and shown in your selected currency symbol. No FX conversion is applied."
                style={{
                  background: "transparent", border: `1.5px dashed ${T.primary}`,
                  color: T.primary, borderRadius: T.radiusPill,
                  padding: "10px 14px", minHeight: 44, cursor: "pointer",
                  fontFamily: T.fontBody, fontSize: 12, fontWeight: 600,
                }}>
                Use Soil Calculator total ({currency}{soilCostEstimate.toFixed(0)})
              </button>
            )}
            <button type="button" onClick={resetSetupCosts}
              style={{
                background: "transparent", border: "none", color: T.tx2,
                fontFamily: T.fontBody, fontSize: 12, fontWeight: 600,
                cursor: "pointer", textDecoration: "underline", padding: "6px 4px",
              }}>
              Reset to defaults
            </button>
          </div>
        </div>
        <p style={{
          margin: "0 0 10px", fontSize: 12, color: T.tx3, lineHeight: 1.5,
        }}>
          Defaults reflect 2026 US retail averages. Currency is a display symbol only; no FX conversion is applied.
        </p>
        <div style={{
          marginTop: 10, display: "grid", gap: 12,
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
        }}>
          {COST_SAVINGS_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} unit={currency}
              value={costSavings.setupCosts[f.key] ?? 0}
              onChange={(v) => updateSetup(f.key, v)}
              min={0} max={100000} step={5} />
          ))}
        </div>
      </div>

      {/* ── Per-crop savings ── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <label style={labelStyle}>Per-crop savings</label>
          {Object.keys(costSavings.priceOverrides).length > 0 && (
            <button type="button" onClick={resetPrices}
              style={{
                background: "transparent", border: "none", color: T.tx2,
                fontFamily: T.fontBody, fontSize: 12, fontWeight: 600,
                cursor: "pointer", textDecoration: "underline",
              }}>
              Reset prices to defaults
            </button>
          )}
        </div>
        {perCropSavings.length === 0 ? (
          <p style={{ marginTop: 12, color: T.tx3, fontSize: 14, fontStyle: "italic" }}>
            Pick crops on the Self-Sufficiency tab to see what each one saves you.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {perCropSavings.map((r) => {
              const widthPct = maxSavings > 0 ? (r.annualSavings / maxSavings) * 100 : 0;
              const cat = CATEGORIES.find((c) => c.id === r.crop.category);
              const pricePerKg = r.pricePerLb / LB_TO_KG;
              return (
                <div key={r.cropId} style={{
                  padding: 14, borderRadius: T.radius,
                  background: T.bg2, border: `1.5px solid ${T.border}`,
                }}>
                  <div style={{
                    display: "grid", gap: 12, alignItems: "center",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(160px, 200px) minmax(120px, 140px) 1fr auto",
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: cat?.color || T.tx3,
                        }} />
                        <span style={{ fontWeight: 700, color: T.tx, fontSize: 14 }}>{r.crop.name}</span>
                      </div>
                      <div style={{
                        fontSize: 12, color: T.tx3, marginTop: 4,
                        fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                      }}>
                        {fmtInt(r.plantsNeeded)} plants · ~{(r.expectedYieldLbs * massConv).toFixed(0)} {unitMass}/yr
                      </div>
                    </div>
                    <div>
                      {/* Storage in $/lb at 6 dp so the metric round-trip
                          (kg → lb → kg display) doesn't drift below the
                          displayed 2-dp precision on blur. Audit #25. */}
                      <Field label="Price" unit={`${currency}/${unitMass}`}
                        value={metric
                          ? Number(pricePerKg.toFixed(2))
                          : Number(r.pricePerLb.toFixed(2))}
                        onChange={(v) => {
                          const asLb = metric ? v * LB_TO_KG : v;
                          updatePrice(r.cropId, Math.max(0, Number(asLb.toFixed(6))));
                        }}
                        min={0} max={500} />
                    </div>
                    <div style={{
                      height: 12, borderRadius: 6, background: T.card,
                      border: `1px solid ${T.border}`, overflow: "hidden",
                      minWidth: isMobile ? "100%" : 80,
                    }} aria-hidden="true">
                      <div style={{
                        width: `${Math.min(100, widthPct)}%`, height: "100%",
                        background: cat?.color || T.primary,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <div style={{
                      fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                      fontSize: 18, fontWeight: 700, color: T.primary,
                      textAlign: isMobile ? "left" : "right", whiteSpace: "nowrap",
                    }}>
                      {currency}{r.annualSavings.toFixed(0)}
                      <span style={{ color: T.tx3, fontSize: 11, fontWeight: 500, marginLeft: 4 }}>/yr</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: T.tx3, lineHeight: 1.5 }}>
        Savings use midpoint yield estimates and your grocery prices. Defaults reflect 2026 US
        retail averages and are editable per crop. Setup costs are one-time; savings repeat every
        year, so the second year onward is closer to pure return.
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Preservation Planner (Tab 8, paid) ──
// Splits each crop's harvest between fresh eating and the user's chosen
// preservation method, then sizes containers (jars, freezer bags, dehydrator
// batches, root cellar shelf inches) using standard food-preservation rules
// of thumb (NCHFP, Ball Blue Book, USDA storage tables).
// ═══════════════════════════════════════════════════════════════════════════
// Conversion rates from prepared lbs to container counts. These are
// crop-agnostic averages anchored to the NCHFP "How Much" tables — high-
// density packs (corn, peas, sauce) actually need 1.5–2x more fresh weight
// per jar, low-density (snap beans) need ~1 lb/pint. The disclaimer below the
// planner says so. Whole-tomato (NCHFP-published) is the middle-of-the-road
// reference and the value used here.
//   can / sauce / ferment: 1 pint ≈ 1.5 lb fresh, 1 quart ≈ 3 lb fresh
//                          (NCHFP whole-tomato: ~1.4 lb/pt, ~3.0 lb/qt)
//   freeze: 1 gallon freezer bag ≈ 3 lb of typical produce; bag occupies
//           ≈ 0.1337 cu ft (1 US gal = 231 in³ = 0.1337 cu ft)
//   dehydrate: 8 trays × 1 lb fresh per home dehydrator batch
//   root_cellar: ~6 linear inches of shelf per 5 lb of bulky roots
const FREEZER_BAG_LBS = 3;
const FREEZER_BAG_CUFT = 0.1337;          // 1 US gal = 231 in³ = 0.1337 cu ft
const DEHYDRATOR_LBS_PER_BATCH = 8;
const ROOT_CELLAR_LBS_PER_INCH = 5 / 6;
const PINT_LBS = 1.5;                     // NCHFP whole-tomato baseline
const QUART_LBS = 3;                      // NCHFP whole-tomato baseline
const FRESH_PCT_MIN = 0;
const FRESH_PCT_MAX = 100;

function preservationOptionsFor(crop) {
  const arr = Array.isArray(crop.preservation) && crop.preservation.length > 0
    ? crop.preservation
    : ["fresh"];
  return arr.map((m) => ({ id: m, label: PRESERVATION_LABELS[m] || m }));
}

function computePreservationForCrop(yieldLbs, freshPct, method) {
  const fresh = yieldLbs * (freshPct / 100);
  const preserved = yieldLbs - fresh;
  // unstorablePreserved tracks the share the user asked to preserve but the
  // crop physically can't be (lettuce, etc. with preservation:["fresh"]).
  // Without this the calculator silently dropped the preserved share AND told
  // the user "no preservation needed" — see audit finding #40.
  const unstorablePreserved = method === "fresh" ? preserved : 0;
  const result = {
    method, fresh, preserved, unstorablePreserved,
    jarsPint: 0, jarsQuart: 0,
    freezerBags: 0, freezerCuFt: 0,
    dehydratorBatches: 0,
    shelfInches: 0,
    shelfMonths: PRESERVATION_SHELF_MONTHS[method] ?? 0,
  };
  if (preserved <= 0 || method === "fresh") return result;
  switch (method) {
    case "can":
    case "sauce":
    case "ferment":
      result.jarsPint = Math.ceil(preserved / PINT_LBS);
      result.jarsQuart = Math.ceil(preserved / QUART_LBS);
      break;
    case "freeze":
      result.freezerBags = Math.ceil(preserved / FREEZER_BAG_LBS);
      result.freezerCuFt = result.freezerBags * FREEZER_BAG_CUFT;
      break;
    case "dehydrate":
      result.dehydratorBatches = Math.ceil(preserved / DEHYDRATOR_LBS_PER_BATCH);
      break;
    case "root_cellar":
      result.shelfInches = Math.ceil(preserved / ROOT_CELLAR_LBS_PER_INCH);
      break;
    default: break;
  }
  return result;
}

function PreservationPlanner({
  baseResults,
  preservation, setPreservation,
  metric,
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  // Same empty-state pattern as Cost Savings — check now, branch AFTER
  // hooks to preserve order across renders (Rules of Hooks).
  const noCrops = !baseResults.perCrop.length;

  const massConv = metric ? LB_TO_KG : 1;
  const unitMass = metric ? "kg" : "lb";
  const freshPct = preservation.freshPct;

  // Functional setters per audit #82.
  const setFreshPct = (v) => {
    const clamped = Math.max(FRESH_PCT_MIN, Math.min(FRESH_PCT_MAX, v));
    setPreservation((prev) => ({ ...prev, freshPct: clamped }));
  };
  const setMethod = (cropId, method) => {
    setPreservation((prev) => ({
      ...prev,
      methodChoice: { ...prev.methodChoice, [cropId]: method },
    }));
  };
  const resetPreservation = () => {
    if (window.confirm("Reset every per-crop preservation method back to the default?")) {
      setPreservation((prev) => ({ ...prev, methodChoice: {} }));
    }
  };

  const perCrop = useMemo(() => {
    return baseResults.perCrop.map((r) => {
      const options = preservationOptionsFor(r.crop);
      const stored = preservation.methodChoice[r.cropId];
      const method = options.some((o) => o.id === stored) ? stored : (options[0]?.id ?? "fresh");
      const detail = computePreservationForCrop(r.expectedYieldLbs, freshPct, method);
      return { ...r, options, method, detail };
    });
  }, [baseResults, preservation.methodChoice, freshPct]);

  const totals = useMemo(() => {
    return perCrop.reduce((acc, r) => {
      acc.fresh += r.detail.fresh;
      acc.preserved += r.detail.preserved;
      acc.unstorablePreserved += r.detail.unstorablePreserved;
      acc.jarsPint += r.detail.jarsPint;
      acc.jarsQuart += r.detail.jarsQuart;
      acc.freezerBags += r.detail.freezerBags;
      acc.freezerCuFt += r.detail.freezerCuFt;
      acc.dehydratorBatches += r.detail.dehydratorBatches;
      acc.shelfInches += r.detail.shelfInches;
      return acc;
    }, {
      fresh: 0, preserved: 0, unstorablePreserved: 0,
      jarsPint: 0, jarsQuart: 0,
      freezerBags: 0, freezerCuFt: 0,
      dehydratorBatches: 0, shelfInches: 0,
    });
  }, [perCrop]);

  const shelfFeet = totals.shelfInches / 12;
  const shelfMeters = (totals.shelfInches * IN_TO_CM) / 100;
  const freezerCuM = totals.freezerCuFt * CUFT_TO_CUM;

  // Post-hook empty-state branch (see noCrops comment at top).
  if (noCrops) return <NoCropsBanner />;

  return (
    <section aria-label="Preservation Planner" style={{
      background: T.card, border: `1.5px solid ${T.border}`,
      borderRadius: T.radiusLg, padding: isMobile ? 20 : 32, boxShadow: T.shadow.lg,
    }}>
      {/* ── Fresh-vs-preserved split ── */}
      <div>
        <label style={labelStyle}>Fresh-eating share of the harvest</label>
        <div style={{
          display: "grid", gap: 12, alignItems: "center",
          gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
        }}>
          <div>
            <input type="range" min={0} max={100} step={5}
              value={freshPct}
              onChange={(e) => setFreshPct(Number(e.target.value))}
              aria-label="Fresh-eating percentage"
              className="hhp-range"
              style={{ width: "100%", accentColor: T.primary, minHeight: 44, touchAction: "manipulation" }} />
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 12, color: T.tx3, marginTop: 4,
            }}>
              <span>All preserved</span>
              <span>All fresh</span>
            </div>
          </div>
          <div style={{
            padding: "10px 16px", borderRadius: T.radiusPill,
            background: T.primaryBg, color: T.primary, fontWeight: 700,
            fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums", fontSize: 16,
            textAlign: "center", minWidth: 120,
          }}>
            {freshPct}% fresh · {100 - freshPct}% preserved
          </div>
        </div>
      </div>

      {/* ── Unstorable warning ── */}
      {/* When the user dials the slider toward "all preserved" but some crops
          (lettuce, arugula, etc.) only support fresh eating, surface the share
          that physically can't be put up. Without this, the math silently
          drops it from the totals. Audit finding #40. */}
      {totals.unstorablePreserved > 0.5 && (
        <div role="status" style={{
          marginTop: 20, padding: "12px 16px", borderRadius: T.radius,
          background: T.warningBg, color: T.warning,
          border: `1px solid ${T.warning}`,
          fontSize: 14, lineHeight: 1.5,
        }}>
          <strong>{(totals.unstorablePreserved * massConv).toFixed(0)} {unitMass}</strong> of your harvest comes from
          fresh-only crops (lettuce, spinach, etc.) that can't be canned, frozen, or stored long-term.
          Eat that share fresh in season — it's not counted in the preservation totals below.
        </div>
      )}

      {/* ── Totals row ── */}
      <div style={{
        marginTop: 20, display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12,
      }}>
        <MiniStat label={`Total fresh (${unitMass})`}
          value={totals.fresh * massConv} unit={unitMass} decimals={0} />
        <MiniStat label={`Total preserved (${unitMass})`}
          value={totals.preserved * massConv} unit={unitMass} decimals={0} />
        <MiniStat label="Pint jars"
          value={totals.jarsPint} unit="jars" decimals={0} />
        <MiniStat label={metric ? "Freezer space (m³)" : "Freezer space (cu ft)"}
          value={metric ? freezerCuM : totals.freezerCuFt}
          unit={metric ? "m³" : "cu ft"} decimals={2} />
      </div>

      {/* ── Secondary totals row ── */}
      <div style={{
        marginTop: 12, display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12,
      }}>
        <MiniStat label="Quart jars (alt.)"
          value={totals.jarsQuart} unit="jars" decimals={0} />
        <MiniStat label="Freezer bags"
          value={totals.freezerBags} unit="bags" decimals={0} />
        <MiniStat label="Dehydrator batches"
          value={totals.dehydratorBatches} unit="batches" decimals={0} />
        <MiniStat label={metric ? "Cellar shelf (m)" : "Cellar shelf (ft)"}
          value={metric ? shelfMeters : shelfFeet}
          unit={metric ? "m" : "ft"} decimals={1} />
      </div>

      {/* ── Per-crop breakdown ── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <label style={labelStyle}>Preservation method per crop</label>
          {Object.keys(preservation.methodChoice).length > 0 && (
            <button type="button" onClick={resetPreservation}
              style={{
                background: "transparent", border: "none", color: T.tx2,
                fontFamily: T.fontBody, fontSize: 12, fontWeight: 600,
                cursor: "pointer", textDecoration: "underline", padding: "6px 4px",
              }}>
              Reset to defaults
            </button>
          )}
        </div>
        {perCrop.length === 0 ? (
          <p style={{ marginTop: 12, color: T.tx3, fontSize: 14, fontStyle: "italic" }}>
            Pick crops on the Self-Sufficiency tab to plan how to put the harvest by.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {perCrop.map((r) => (
              <PreservationCropRow key={r.cropId} row={r}
                onMethodChange={(m) => setMethod(r.cropId, m)}
                massConv={massConv} unitMass={unitMass} metric={metric} />
            ))}
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: T.tx3, lineHeight: 1.5 }}>
        Container counts use NCHFP whole-tomato averages as a middle-of-the-road baseline:
        ~1.5 lb fresh per pint jar, ~3 lb per quart, ~3 lb per gallon freezer bag, 8 lb per
        dehydrator batch. Dense packs (sauce, corn, peas) need closer to 2 lb/pint and
        5 lb/quart; light packs (snap beans, leafy greens) need less. Shelf life is
        method-typical, not crop-specific.
      </p>
    </section>
  );
}

function PreservationCropRow({ row, onMethodChange, massConv, unitMass, metric }) {
  const cat = CATEGORIES.find((c) => c.id === row.crop.category);
  const isMobile = useMediaQuery("(max-width: 640px)");
  const d = row.detail;

  // Single source of truth for the row's container summary. Switch shape
  // mirrors computePreservationForCrop so the two stay in sync. The
  // fresh-only branch must distinguish "user asked for fresh" (correct, no
  // need for containers) from "this crop can ONLY be eaten fresh and the
  // user asked to preserve part of it" (audit finding #40).
  const summary = (() => {
    if (row.method === "fresh") {
      if (d.unstorablePreserved > 0.5) {
        return `Eat fresh in season — this crop can't be canned or stored.`;
      }
      return "Fresh eating only.";
    }
    if (d.preserved <= 0) return "All eaten fresh.";
    switch (row.method) {
      case "can":
      case "sauce":
      case "ferment":
        return `${d.jarsPint} pint jars (or ${d.jarsQuart} quarts)`;
      case "freeze": {
        const space = metric
          ? `${(d.freezerCuFt * CUFT_TO_CUM).toFixed(2)} m³`
          : `${d.freezerCuFt.toFixed(2)} cu ft`;
        return `${d.freezerBags} gallon freezer bags · ~${space}`;
      }
      case "dehydrate":
        return `${d.dehydratorBatches} dehydrator batches`;
      case "root_cellar": {
        const shelf = metric
          ? `${((d.shelfInches * IN_TO_CM) / 100).toFixed(1)} m`
          : `${(d.shelfInches / 12).toFixed(1)} ft`;
        return `~${shelf} of shelf space`;
      }
      default:
        return "";
    }
  })();
  const freshOnlyCrop = row.options.length === 1 && row.options[0]?.id === "fresh";

  return (
    <div style={{
      padding: 14, borderRadius: T.radius,
      background: T.bg2, border: `1.5px solid ${T.border}`,
    }}>
      <div style={{
        display: "grid", gap: 12, alignItems: "start",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(180px, 220px) 1fr",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: cat?.color || T.tx3,
            }} />
            <span style={{ fontWeight: 700, color: T.tx, fontSize: 15 }}>{row.crop.name}</span>
          </div>
          <div style={{
            marginTop: 6, fontSize: 12, color: T.tx3,
            fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          }}>
            ~{(row.expectedYieldLbs * massConv).toFixed(0)} {unitMass}/yr · fresh {(d.fresh * massConv).toFixed(0)} · preserved {(d.preserved * massConv).toFixed(0)}
          </div>
        </div>
        <div>
          {freshOnlyCrop ? (
            <div style={{
              padding: "8px 14px", borderRadius: T.radiusPill,
              background: T.bg, color: T.tx2, border: `1px solid ${T.border}`,
              fontSize: 13, fontWeight: 600, display: "inline-block",
            }}>
              Fresh only - no preservation methods available
            </div>
          ) : (
            <PillSelect
              options={row.options}
              value={row.method} onChange={onMethodChange}
              ariaLabel={`Preservation method for ${row.crop.name}`} size="sm" />
          )}
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: T.radius,
            background: T.card, border: `1px solid ${T.border}`,
            fontSize: 13, color: T.tx2,
          }}>
            <span style={{ color: T.tx, fontWeight: 600 }}>{summary}</span>
            {d.shelfMonths > 0 && !freshOnlyCrop && (
              <span style={{ color: T.tx3, marginLeft: 8 }}>
                · keeps ~{d.shelfMonths} mo
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
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
        {/* Logo / title — deliberately oversized so the masthead reads like
            a premium print journal instead of a calculator widget. */}
        <a href="#home"
          onClick={(e) => { e.preventDefault(); window.location.hash = "home"; }}
          style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, textDecoration: "none" }}>
          <BrandMark size={isMobile ? 36 : 48} />
          <span style={{
            fontFamily: T.fontDisplay, fontSize: isMobile ? 20 : 28,
            color: T.tx, fontWeight: 400, letterSpacing: "-0.01em",
            lineHeight: 1.05,
          }}>
            {isMobile ? "Homestead" : "Homestead Harvest Planner"}
          </span>
        </a>

        {/* Hemisphere + Metric toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div role="radiogroup" aria-label="Hemisphere"
            title="Hemisphere flips planting dates by 6 months — pick yours so spring/autumn line up with your calendar."
            style={{
              display: "flex", alignItems: "center",
              background: T.bg2, borderRadius: T.radiusPill,
              padding: 3, paddingLeft: isMobile ? 8 : 10,
            }}>
            <span aria-hidden="true" style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color: T.tx2, marginRight: 6,
              fontFamily: T.fontBody,
            }}>
              {isMobile ? "Hemi" : "Hemisphere"}
            </span>
            {[
              { id: "north", short: "N. Hem.", long: "Northern" },
              { id: "south", short: "S. Hem.", long: "Southern" },
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

          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
      </div>
    </header>
  );
}

// — CurrencySelect (native <select> styled to match the header pill toggles) —
// A 5-way choice is too many pills for the header; a styled native select is
// compact on mobile, accessible, and threads through every cost display in
// the Soil Calculator (and, later, the paid Cost Savings tab).
const CURRENCY_OPTIONS = [
  { symbol: "$", code: "USD", name: "US Dollar" },
  { symbol: "€", code: "EUR", name: "Euro" },
  { symbol: "£", code: "GBP", name: "British Pound" },
  { symbol: "R", code: "ZAR", name: "South African Rand" },
  { symbol: "¥", code: "JPY", name: "Japanese Yen" },
];
// Custom popover instead of <select> — the native dropdown renders in OS
// chrome (Windows ships a 1990s-era listbox), which clashed badly with the
// warm parchment design system. The popover is anchored to the trigger,
// closes on outside click + Escape, and uses arrow-key navigation.
function CurrencySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const active = CURRENCY_OPTIONS.find((c) => c.symbol === value) || CURRENCY_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Restore focus to the trigger so keyboard users don't land on <body>.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // Focus the active option once the popover paints.
    const idx = CURRENCY_OPTIONS.findIndex((c) => c.symbol === value);
    requestAnimationFrame(() => itemRefs.current[idx]?.focus());
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, value]);

  const onItemKeyDown = (e, idx) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      itemRefs.current[(idx + 1) % CURRENCY_OPTIONS.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemRefs.current[(idx - 1 + CURRENCY_OPTIONS.length) % CURRENCY_OPTIONS.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[CURRENCY_OPTIONS.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Focus is about to leave the popover — close it so the open state
      // tracks where the keyboard actually is. Don't preventDefault: the
      // browser still moves focus to the next tabbable element.
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button"
        ref={triggerRef}
        aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Currency: ${active.name}. Click to change.`}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: T.bg2, borderRadius: T.radiusPill,
          padding: "0 12px 0 14px", minHeight: 46, minWidth: 90,
          border: "none", cursor: "pointer",
          fontFamily: T.fontBody, fontSize: 13, fontWeight: 600, color: T.tx,
        }}>
        <span aria-hidden="true" style={{
          fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
          fontSize: 15, fontWeight: 700, color: T.tx,
        }}>{active.symbol}</span>
        <span style={{ color: T.tx2 }}>{active.code}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"
          style={{
            color: T.tx2, marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}>
          <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.6"
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" aria-label="Currency"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
            margin: 0, padding: 6, listStyle: "none",
            background: T.card, borderRadius: T.radius,
            border: `1.5px solid ${T.border}`, boxShadow: T.shadow.lg,
            minWidth: 200,
          }}>
          {CURRENCY_OPTIONS.map((c, i) => {
            const isActive = c.symbol === value;
            return (
              <li key={c.code}>
                <button type="button" role="option"
                  ref={(el) => (itemRefs.current[i] = el)}
                  aria-selected={isActive}
                  onClick={() => { onChange(c.symbol); setOpen(false); }}
                  onKeyDown={(e) => onItemKeyDown(e, i)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: T.radius,
                    background: isActive ? T.primaryBg : "transparent",
                    color: isActive ? T.primary : T.tx,
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: T.fontBody, fontSize: 14, fontWeight: isActive ? 700 : 500,
                    minHeight: 44,
                  }}>
                  <span aria-hidden="true" style={{
                    fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
                    fontSize: 16, fontWeight: 700, width: 16, textAlign: "center",
                    color: isActive ? T.primary : T.tx,
                  }}>{c.symbol}</span>
                  <span style={{ fontWeight: 700, minWidth: 36 }}>{c.code}</span>
                  <span style={{ color: isActive ? T.primary : T.tx3, fontSize: 13 }}>{c.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBar({ tab, setTab, paid, validating }) {
  const tabs = TABS; // show every tab, including Home, so there's always a visible selection
  const btnRefs = useRef([]);

  // Manual activation: arrow keys move FOCUS only, Space/Enter activates the
  // focused tab. This matches the ARIA-authoring-practices recommendation for
  // tablists whose panels swap substantial content (ours triggers scrollTo +
  // a content re-render, which would be jarring to fire on every arrow-key).
  const focusOnly = (idx) => {
    const clamped = (idx + tabs.length) % tabs.length;
    const el = btnRefs.current[clamped];
    if (el) el.focus();
  };

  const currentFocusIdx = () => {
    const i = btnRefs.current.findIndex((el) => el === document.activeElement);
    return i >= 0 ? i : Math.max(0, tabs.findIndex((t) => t.id === tab));
  };

  const onKeyDown = (e) => {
    const i = currentFocusIdx();
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); focusOnly(i + 1); break;
      case "ArrowLeft":  e.preventDefault(); focusOnly(i - 1); break;
      case "Home":       e.preventDefault(); focusOnly(0); break;
      case "End":        e.preventDefault(); focusOnly(tabs.length - 1); break;
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
          // Locked = paid tab + user has not unlocked. Dimmed until unlocked
          // so the nav visually signals which tabs require purchase. Once
          // unlocked (or during validation) we drop the dim so paid users
          // don't keep seeing "you don't have access" signalling.
          const locked = Boolean(t.paid) && !paid && !validating;
          return (
            <button key={t.id}
              id={`tab-${t.id}`}
              ref={(el) => (btnRefs.current[i] = el)}
              role="tab" aria-selected={active} aria-controls="main-panel"
              aria-label={locked ? `${t.label} — requires full access` : undefined}
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
                opacity: locked && !active ? 0.7 : 1,
                transition: "all 0.15s ease",
              }}>
              {t.label}
              {locked && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke={active ? "#FEFCF8" : T.gold} strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true" focusable="false"
                  style={{ flexShrink: 0 }}>
                  <rect x="4" y="10.5" width="16" height="10.5" rx="2.2" />
                  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                </svg>
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
  // Uses <h2> rather than <h1> so the only page-level <h1> is the hero on the
  // landing/home view. Keeps the document outline sensible for SEO crawlers
  // that render JS across tab routes.
  return (
    <section style={{
      padding: "clamp(32px, 5vw, 64px) clamp(16px, 4vw, 48px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{
          margin: 0, fontFamily: T.fontDisplay,
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, color: T.tx,
        }}>
          {title}
        </h2>
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
  const year = new Date().getFullYear();
  const linkStyle = {
    color: T.tx2, textDecoration: "none", fontSize: 13,
    fontWeight: 500, padding: "4px 0",
  };
  return (
    <footer style={{
      background: T.bg2, borderTop: `1px solid ${T.border}`,
      padding: "40px clamp(16px, 4vw, 48px) 28px",
      color: T.tx2, fontSize: 13,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          display: "grid", gap: 28,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          alignItems: "start",
        }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <BrandMark size={32} />
              <span style={{
                fontFamily: T.fontDisplay, fontSize: 17, color: T.tx, fontWeight: 400,
              }}>Homestead Harvest Planner</span>
            </div>
            <p style={{
              margin: "12px 0 0", fontSize: 13, color: T.tx3, lineHeight: 1.55,
            }}>
              A homesteading garden planner that you pay for once and keep forever.
            </p>
          </div>

          {/* Calculators */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.tx, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 10,
            }}>Calculators</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <a href="#self-sufficiency" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "self-sufficiency"; }}>Self-Sufficiency</a>
              <a href="#soil" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "soil"; }}>Soil</a>
              <a href="#companion" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "companion"; }}>Companion Planting</a>
              <a href="#planting-dates" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "planting-dates"; }}>Planting Dates</a>
            </div>
          </div>

          {/* Learn */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.tx, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 10,
            }}>Learn</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <a href="#features" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "features"; }}>Features</a>
              <a href="#how-it-works" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "how-it-works"; }}>How it works</a>
              <a href="#pricing" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "pricing"; }}>Pricing</a>
              <a href="#faq" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "faq"; }}>FAQ</a>
            </div>
          </div>

          {/* Legal + Contact */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.tx, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 10,
            }}>Support</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <a href="/contact.html" style={linkStyle}>Contact</a>
              <a href="/privacy.html" style={linkStyle}>Privacy</a>
              <a href="/terms.html" style={linkStyle}>Terms</a>
              <a href="/refund.html" style={linkStyle}>Refund policy</a>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}`,
          display: "flex", flexWrap: "wrap", gap: 12,
          alignItems: "center", justifyContent: "space-between",
          fontSize: 12, color: T.tx3,
        }}>
          <div>© {year} Urban Root. Pay once, use forever.</div>
          <div>Built for homesteaders who read extension-service PDFs for fun.</div>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Main App ──
// ═══════════════════════════════════════════════════════════════════════════
const VALID_TABS = TABS.map((t) => t.id);
// Hash aliases kept intentionally empty. Home and Self-Sufficiency are
// now separate tabs — a brief merge window (Apr 2026) routed
// #self-sufficiency → #home, but the split reinstated each as its own id.
// If old bookmarks surface, add them back here as { "old-id": "new-id" }.
const HASH_ALIASES = {};
const resolveHash = (h) => HASH_ALIASES[h] || h;

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
      // Drop entries with an invalid shape, then clamp every numeric field.
      // A single corrupt value (e.g. lengthFt: "banana") otherwise cascades
      // NaN through volumes, bag counts, and cost totals.
      const valid = saved
        .filter((b) => b && BED_SHAPES.some((s) => s.id === b.shape))
        .map((b) => {
          const def = DEFAULT_BED();
          return {
            ...def,
            ...b,
            lengthFt:       sanitizeNum(b.lengthFt,       def.lengthFt,       0.5, 100),
            widthFt:        sanitizeNum(b.widthFt,        def.widthFt,        0.5, 50),
            depthIn:        sanitizeNum(b.depthIn,        def.depthIn,        4,   48),
            diameterFt:     sanitizeNum(b.diameterFt,     def.diameterFt,     0.5, 50),
            outerLengthFt:  sanitizeNum(b.outerLengthFt,  def.outerLengthFt,  1,   100),
            outerWidthFt:   sanitizeNum(b.outerWidthFt,   def.outerWidthFt,   1,   50),
            cutoutLengthFt: sanitizeNum(b.cutoutLengthFt, def.cutoutLengthFt, 0,   99),
            cutoutWidthFt:  sanitizeNum(b.cutoutWidthFt,  def.cutoutWidthFt,  0,   49),
            qty:            clampInt   (b.qty,            def.qty,            1,   20),
          };
        });
      if (valid.length > 0) return valid;
    }
    return [DEFAULT_BED()];
  });
  const [soilState, setSoilState] = useState(() => {
    const saved = loadState(LS_SOIL, null);
    const validMixId = SOIL_MIXES.some((m) => m.id === saved?.mixId) ? saved.mixId : "classic_60_30_10";
    // Migration from the flat-map shape (Session 2) to the per-mix nested
    // shape (Fix Now + MEDIUM pass). Detect the old format by its lack of any
    // known mixId as a top-level key, then bucket the flat overrides under
    // whatever mix the user was last on.
    const isNestedShape = (obj) => {
      if (!obj || typeof obj !== "object") return true;
      const keys = Object.keys(obj);
      if (keys.length === 0) return true;
      return keys.every((k) => SOIL_MIXES.some((m) => m.id === k));
    };
    const migrateBucket = (obj) => {
      if (!obj || typeof obj !== "object") return {};
      if (isNestedShape(obj)) return obj;
      return { [validMixId]: obj };
    };
    const rawOverrides = (saved?.mixOverrides && typeof saved.mixOverrides === "object")
      ? saved.mixOverrides : null;
    const overrides = rawOverrides ? {
      prices: migrateBucket(rawOverrides.prices),
      pcts:   migrateBucket(rawOverrides.pcts),
    } : null;
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

  // Planting Date Calculator state
  const [plantingState, setPlantingState] = useState(() => {
    const saved = loadState(LS_PLANTING, null);
    const thisYear = new Date().getFullYear();
    const defaults = {
      mode: "zone",
      zone: 7,
      manualFrost: { lastSpring: "", firstFall: "" },
      selectedCrops: [...PLANTING_DATE_DEFAULT_CROPS],
      referenceYear: thisYear,
      sowMethodChoice: {},
    };
    if (!saved || typeof saved !== "object") return defaults;
    const valid = {
      mode: saved.mode === "manual" ? "manual" : "zone",
      zone: ZONE_FROST_DATES[saved.zone] ? saved.zone : 7,
      manualFrost: typeof saved.manualFrost === "object" && saved.manualFrost
        ? { lastSpring: saved.manualFrost.lastSpring || "", firstFall: saved.manualFrost.firstFall || "" }
        : defaults.manualFrost,
      selectedCrops: Array.isArray(saved.selectedCrops)
        ? saved.selectedCrops.filter((id) => CROPS[id])
        : defaults.selectedCrops,
      referenceYear: Number.isFinite(Number(saved.referenceYear))
        ? clampInt(Number(saved.referenceYear), thisYear - 1, thisYear + 2)
        : thisYear,
      sowMethodChoice: typeof saved.sowMethodChoice === "object" && saved.sowMethodChoice
        ? Object.fromEntries(Object.entries(saved.sowMethodChoice).filter(
            ([id, m]) => CROPS[id] && (m === "transplant" || m === "direct")
          ))
        : {},
    };
    if (valid.selectedCrops.length === 0) valid.selectedCrops = defaults.selectedCrops;
    return valid;
  });

  // Crop Database state (Tab 6 — paid)
  const [cropDbState, setCropDbState] = useState(() => {
    const saved = loadState(LS_CROP_DB, null);
    const defaults = { search: "", categoryFilter: [], sort: "name_asc", expandedId: null };
    if (!saved || typeof saved !== "object") return defaults;
    const validCats = saved.categoryFilter && Array.isArray(saved.categoryFilter)
      ? saved.categoryFilter.filter((id) => CATEGORIES.some((c) => c.id === id))
      : [];
    const validSort = CROP_DB_SORTS.some((s) => s.id === saved.sort) ? saved.sort : "name_asc";
    return {
      search: typeof saved.search === "string" ? saved.search.slice(0, 64) : "",
      categoryFilter: validCats,
      sort: validSort,
      // Don't restore an expanded row — it's an interaction-state, not a setting,
      // and a stale id from a removed crop would render an empty drawer.
      expandedId: null,
    };
  });

  // Cost Savings state (Tab 7 — paid)
  // Strict numeric coercion: Number(null) === 0, Number(false) === 0, "" → 0.
  // Without typeof===number guard a corrupt LS write of {tomato: null} silently
  // hydrates as {tomato: 0} and the user's tomato savings disappear. Audit #10.
  const isStoredNumber = (v) => typeof v === "number" && Number.isFinite(v);
  const [costSavings, setCostSavings] = useState(() => {
    const saved = loadState(LS_COST_SAVINGS, null);
    const defaults = {
      priceOverrides: {},
      setupCosts: { ...DEFAULT_SETUP_COSTS },
    };
    if (!saved || typeof saved !== "object") return defaults;
    const cleanPrices = {};
    if (saved.priceOverrides && typeof saved.priceOverrides === "object") {
      for (const [id, v] of Object.entries(saved.priceOverrides)) {
        if (CROPS[id] && isStoredNumber(v) && v >= 0 && v < 10000) cleanPrices[id] = v;
      }
    }
    const cleanSetup = { ...DEFAULT_SETUP_COSTS };
    if (saved.setupCosts && typeof saved.setupCosts === "object") {
      for (const f of COST_SAVINGS_FIELDS) {
        const v = saved.setupCosts[f.key];
        if (isStoredNumber(v) && v >= 0 && v < 1000000) cleanSetup[f.key] = v;
      }
    }
    return { priceOverrides: cleanPrices, setupCosts: cleanSetup };
  });

  // Growing Plan state (Tab 5 — paid)
  // Persists the user's input choices AND the last generated plan + timestamp
  // so reloads don't blow away an expensive call. Plan body is sanitised on
  // load so a corrupt cache can't crash the renderer.
  const [planState, setPlanState] = useState(() => {
    const saved = loadState(LS_PLAN, null);
    const validInputs = (raw) => {
      if (!raw || typeof raw !== "object") return { ...PLAN_INPUT_DEFAULTS };
      return {
        sunExposure: SUN_OPTIONS.some((o) => o.id === raw.sunExposure) ? raw.sunExposure : PLAN_INPUT_DEFAULTS.sunExposure,
        soilType:    SOIL_OPTIONS.some((o) => o.id === raw.soilType)   ? raw.soilType   : PLAN_INPUT_DEFAULTS.soilType,
        waterMethod: WATER_OPTIONS.some((o) => o.id === raw.waterMethod) ? raw.waterMethod : PLAN_INPUT_DEFAULTS.waterMethod,
        experience:  EXPERIENCE_OPTIONS.some((o) => o.id === raw.experience) ? raw.experience : PLAN_INPUT_DEFAULTS.experience,
        goals: Array.isArray(raw.goals)
          ? raw.goals.filter((g) => GOAL_CHIPS.some((c) => c.id === g)).slice(0, GOAL_CHIPS.length)
          : [...PLAN_INPUT_DEFAULTS.goals],
      };
    };
    if (!saved || typeof saved !== "object") {
      return { inputs: { ...PLAN_INPUT_DEFAULTS }, plan: null, generatedAt: null, cropFingerprint: "" };
    }
    // Run cached plan through the same sanitiser the server uses, so a corrupt
    // or tampered cache (or one written by an older code version) can't crash
    // the renderer. Drops the plan but keeps inputs if shape is unsalvageable.
    const cachedPlan = sanitisePlanShape(saved.plan);
    const generatedAt = typeof saved.generatedAt === "number" ? saved.generatedAt : null;
    const cropFingerprint = typeof saved.cropFingerprint === "string"
      ? saved.cropFingerprint.slice(0, 4096) : "";
    return {
      inputs: validInputs(saved.inputs),
      plan: cachedPlan,
      generatedAt: cachedPlan ? generatedAt : null,
      cropFingerprint: cachedPlan ? cropFingerprint : "",
    };
  });

  // Preservation Planner state (Tab 8 — paid)
  const [preservation, setPreservation] = useState(() => {
    const saved = loadState(LS_PRESERVATION, null);
    const defaults = { freshPct: 30, methodChoice: {} };
    if (!saved || typeof saved !== "object") return defaults;
    const cleanFresh = isStoredNumber(saved.freshPct)
      ? Math.max(FRESH_PCT_MIN, Math.min(FRESH_PCT_MAX, Math.round(saved.freshPct)))
      : 30;
    const cleanChoice = {};
    if (saved.methodChoice && typeof saved.methodChoice === "object") {
      for (const [id, m] of Object.entries(saved.methodChoice)) {
        if (!CROPS[id]) continue;
        const allowed = preservationOptionsFor(CROPS[id]).map((o) => o.id);
        if (allowed.includes(m)) cleanChoice[id] = m;
      }
    }
    return { freshPct: cleanFresh, methodChoice: cleanChoice };
  });

  // ── Paywall state ────────────────────────────────────────────────────────
  // paid starts false. validating starts true. Mount effect resolves both.
  // Paid tab UI MUST gate on !validating — rendering paid content while
  // validating === true is the race window that leaks free access.
  const [paid, setPaid] = useState(false);
  const [validating, setValidating] = useState(true);
  const [keyError, setKeyError] = useState("");   // surfaced in paywall overlay after a bad key
  const [prefillKey, setPrefillKey] = useState(""); // pre-fills the licence input from ?key= URLs
  const [activating, setActivating] = useState(false); // true while the Activate form is submitting

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
  useEffect(() => { persistState(LS_PLANTING, plantingState); }, [plantingState]);
  useEffect(() => { persistState(LS_CROP_DB, cropDbState); }, [cropDbState]);
  useEffect(() => { persistState(LS_COST_SAVINGS, costSavings); }, [costSavings]);
  useEffect(() => { persistState(LS_PRESERVATION, preservation); }, [preservation]);
  useEffect(() => { persistState(LS_PLAN, planState); }, [planState]);

  // If a long-lived browser session crosses Jan 1, bump the planting
  // referenceYear to the new calendar year so the timeline doesn't silently
  // keep rendering the prior season. Checks on every tab-visibility change.
  useEffect(() => {
    const bumpIfStale = () => {
      const now = new Date().getFullYear();
      setPlantingState((s) => (s.referenceYear < now ? { ...s, referenceYear: now } : s));
    };
    bumpIfStale();
    document.addEventListener("visibilitychange", bumpIfStale);
    return () => document.removeEventListener("visibilitychange", bumpIfStale);
  }, []);

  // ── Paywall mount effect ─────────────────────────────────────────────────
  // One sequential async flow: ?key= → stored key → grace window → deny.
  // A single useEffect prevents the race where multiple [] effects all call
  // setPaid/setValidating out of order. The `cancelled` guard prevents
  // setState on unmount (React StrictMode fires effects twice in dev).
  useEffect(() => {
    let cancelled = false;

    const attempt = async (key, existingInstance) => {
      const r1 = await validateKeyRemote(key, existingInstance || "");
      if (r1?.valid) return r1;
      // If LS no longer recognises our cached instance_id (deactivated remotely
      // from the LS dashboard, etc.), drop it and try a fresh activate.
      if (r1?.retry_activation) {
        clearLS(LS_INSTANCE);
        const r2 = await validateKeyRemote(key, "");
        if (r2?.valid) return r2;
        return r2;
      }
      return r1;
    };

    const commitPaid = (key, instanceId) => {
      if (key) persistState(LS_KEY, key);
      if (instanceId) persistState(LS_INSTANCE, instanceId);
      clearLS(LS_PENDING); // grace window no longer needed once we have a key
      setPaid(true);
      setValidating(false);
    };

    const stripKeyFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("key")) {
          url.searchParams.delete("key");
          window.history.replaceState(window.history.state, "", url.toString());
        }
      } catch { /* noop */ }
    };

    (async () => {
      try {
        // 1. URL ?key= takes precedence (email link, post-checkout redirect).
        const params = new URLSearchParams(window.location.search);
        const urlKey = params.get("key");
        if (urlKey) {
          const storedInstance = loadState(LS_INSTANCE, "");
          const r = await attempt(urlKey, storedInstance);
          if (cancelled) return;
          stripKeyFromUrl();
          if (r?.valid) {
            commitPaid(urlKey, r.instance_id);
            return;
          }
          // Surface the error so the user understands why they're not unlocked.
          setKeyError(r?.error || "We couldn't verify that licence key.");
          setPrefillKey(urlKey);
          setPaid(false);
          setValidating(false);
          // Send them to the paywall UI instead of silently dropping on Home.
          setTab("growing-plan");
          return;
        }

        // 2. Stored key from a previous session.
        const storedKey = loadState(LS_KEY, "");
        const storedInstance = loadState(LS_INSTANCE, "");
        if (storedKey) {
          const r = await attempt(storedKey, storedInstance);
          if (cancelled) return;
          if (r?.valid) {
            commitPaid(storedKey, r.instance_id);
            return;
          }
          // Stored key no longer valid — wipe silently. User sees paywall,
          // not an error — they didn't just try to enter it.
          clearLS(LS_KEY);
          clearLS(LS_INSTANCE);
        }

        // 3. Grace window: Checkout.Success timestamp within 48 h.
        // LS's Checkout.Success event fires BEFORE the email with the key
        // lands. Without this window the customer pays, reloads, and is
        // locked out until their inbox catches up.
        const pending = Number(loadState(LS_PENDING, 0));
        if (Number.isFinite(pending) && pending > 0) {
          const age = Date.now() - pending;
          if (age >= 0 && age < GRACE_WINDOW_MS) {
            setPaid(true);
            setValidating(false);
            return;
          }
          clearLS(LS_PENDING);
        }

        // 4. No entry path matched. Not paid.
        setPaid(false);
        setValidating(false);
      } catch (e) {
        console.error("[hhp] paywall mount failed:", e);
        if (!cancelled) {
          setPaid(false);
          setValidating(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── LemonSqueezy SDK + Checkout.Success hook ─────────────────────────────
  // lemon.js is loaded via a <defer> script tag in index.html. Defer scripts
  // run after DOMContentLoaded, which is before React's useEffect, so on the
  // fast path window.createLemonSqueezy exists by the time this runs. On slow
  // connections we poll for up to 8 s.
  useEffect(() => {
    let pollHandle = null;
    let cancelled = false;

    const setup = () => {
      if (typeof window.createLemonSqueezy !== "function") return false;
      try {
        window.createLemonSqueezy();
        window.LemonSqueezy?.Setup?.({
          eventHandler: (event) => {
            if (event?.event === "Checkout.Success") {
              // Open the 48-h grace window. The licence-key email hasn't
              // arrived yet — this is the bridge until the ?key= URL or
              // manual paste takes over.
              try { localStorage.setItem(LS_PENDING, String(Date.now())); } catch { /* noop */ }
              setPaid(true);
              setValidating(false);
              try { window.LemonSqueezy?.Url?.Close?.(); } catch { /* noop */ }
            }
          },
        });
      } catch (e) {
        console.warn("[hhp] LS Setup failed:", e?.message);
      }
      return true;
    };

    if (!setup()) {
      pollHandle = setInterval(() => {
        if (cancelled) return;
        if (setup()) { clearInterval(pollHandle); pollHandle = null; }
      }, 250);
      // Give up after 8 s — lemon.js isn't reachable, CSP is blocking, or
      // the user is offline. Paywall CTA still works as a plain link.
      setTimeout(() => { if (pollHandle) { clearInterval(pollHandle); pollHandle = null; } }, 8000);
    }

    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
    };
  }, []);

  // Activate a licence key from the paywall form. Wraps validateKeyRemote +
  // state updates so the overlay component can stay presentational.
  const activateKey = useCallback(async (rawKey) => {
    const key = String(rawKey || "").trim();
    if (key.length < 8) {
      setKeyError("Please paste the full licence key from your email.");
      return false;
    }
    setActivating(true);
    setKeyError("");
    try {
      const r = await validateKeyRemote(key, "");
      if (r?.valid) {
        persistState(LS_KEY, key);
        if (r.instance_id) persistState(LS_INSTANCE, r.instance_id);
        clearLS(LS_PENDING);
        setPaid(true);
        setKeyError("");
        setPrefillKey("");
        return true;
      }
      setKeyError(r?.error || "We couldn't verify that licence key.");
      return false;
    } finally {
      setActivating(false);
    }
  }, []);

  // Hash routing: mount-only init + back/forward + hashchange.
  // hashchange covers footer links like #features that are landing-section
  // anchors, not tab ids — we route those to Home and scroll to the anchor.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const resolvedInit = resolveHash(hash);
    if (resolvedInit && VALID_TABS.includes(resolvedInit)) setTab(resolvedInit);
    const onPop = (e) => {
      const stateTab = resolveHash(e.state?.tab);
      const hashTab = resolveHash(window.location.hash.slice(1) || "home");
      const next = VALID_TABS.includes(stateTab)
        ? stateTab
        : (VALID_TABS.includes(hashTab) ? hashTab : "home");
      setTab(next);
    };
    const onHashChange = () => {
      const h = window.location.hash.slice(1);
      if (!h) return;
      const resolved = resolveHash(h);
      if (VALID_TABS.includes(resolved)) {
        setTab(resolved);
      } else {
        // Landing-section anchor: ensure we're on Home, then scroll to it.
        setTab("home");
        setTimeout(() => {
          const el = document.getElementById(h);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  // Tab change: update hash + scroll to top
  const changeTab = useCallback((id) => {
    const resolved = resolveHash(id);
    if (!VALID_TABS.includes(resolved)) return;
    setTab(resolved);
    if (window.location.hash.slice(1) !== resolved) {
      window.history.pushState({ tab: resolved }, "", `#${resolved}`);
    }
    window.scrollTo(0, 0);
  }, []);

  // Resolve active tab data. If state ever desyncs (corrupt hash, schema change)
  // snap back to Home so `ComingSoon` never renders with a stale blurb.
  const activeTab = useMemo(() => {
    return TABS.find((x) => x.id === tab) || TABS[0];
  }, [tab]);
  useEffect(() => {
    if (!VALID_TABS.includes(tab)) {
      setTab("home");
      // Also normalise the URL so the hash matches the state we just snapped to.
      if (window.location.hash.slice(1) !== "home") {
        window.history.replaceState({ tab: "home" }, "", "#home");
      }
    }
  }, [tab]);

  const calcProps = {
    familySize, setFamilySize,
    goal, setGoal,
    selection, setSelection,
    metric,
    producePerPerson, setProducePerPerson,
  };

  // Single source of truth for crop-level results. Cost Savings, Preservation
  // (and a future AI Growing Plan tab) all branch off this — keeping one
  // memoized computation prevents the two paid tabs from drifting if the
  // formula in computeResults changes. Audit #61.
  const baseResults = useMemo(
    () => computeResults(selection, familySize, goal, producePerPerson),
    [selection, familySize, goal, producePerPerson]
  );

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.tx,
      fontFamily: T.fontBody, fontSize: 16,
    }}>
      <GlobalStyles />

      <AppHeader metric={metric} setMetric={setMetric}
        currency={currency} setCurrency={setCurrency}
        hemisphere={hemisphere} setHemisphere={setHemisphere} />

      <TabBar tab={tab} setTab={changeTab} paid={paid} validating={validating} />

      <main id="main-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "home" && <HomeView setTab={changeTab} />}
        {tab === "self-sufficiency" && (
          <TabPageShell
            title="Self-Sufficiency Calculator"
            blurb="Tell us your family size and what you actually eat. Get plant counts, garden space, and self-sufficiency % instantly.">
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
        {tab === "planting-dates" && (
          <TabPageShell
            title="Planting Date Calculator"
            blurb="Pick a hardiness zone or enter your own frost dates. Get per-crop indoor, transplant, direct-sow and harvest windows laid out on a 12-month timeline.">
            <PlantingDateCalculator
              plantingState={plantingState}
              setPlantingState={setPlantingState}
              hemisphere={hemisphere} />
          </TabPageShell>
        )}
        {activeTab.paid && validating && (
          <ValidatingOverlay />
        )}
        {activeTab.paid && !validating && !paid && (
          <PaywallOverlay
            tab={activeTab}
            keyError={keyError}
            prefillKey={prefillKey}
            activating={activating}
            onActivate={activateKey}
            onClearError={() => setKeyError("")} />
        )}
        {activeTab.paid && !validating && paid && tab === "crops" && (
          <TabPageShell
            title="Crop Database"
            blurb="Every crop in the planner, searchable, sortable, and filterable. Click a row for companion notes and preservation tips.">
            <CropDatabaseTab metric={metric}
              dbState={cropDbState} setDbState={setCropDbState} />
          </TabPageShell>
        )}
        {activeTab.paid && !validating && paid && tab === "cost-savings" && (
          <TabPageShell
            title="Cost Savings Calculator"
            blurb="Turn your Self-Sufficiency selection into hard numbers: annual grocery savings, setup costs, break-even, and ROI.">
            <CostSavingsCalculator
              baseResults={baseResults}
              beds={beds} soilState={soilState}
              costSavings={costSavings} setCostSavings={setCostSavings}
              metric={metric} currency={currency} />
          </TabPageShell>
        )}
        {activeTab.paid && !validating && paid && tab === "preservation" && (
          <TabPageShell
            title="Preservation Planner"
            blurb="Pick a preservation method per crop. We size the jars, freezer space, dehydrator batches, and shelf inches you'll need.">
            <PreservationPlanner
              baseResults={baseResults}
              preservation={preservation} setPreservation={setPreservation}
              metric={metric} />
          </TabPageShell>
        )}
        {activeTab.paid && !validating && paid && tab === "growing-plan" && (
          <TabPageShell
            title="Your Personalised Growing Plan"
            blurb="Pull in your family, climate, garden space, and crop selection. Add a few details about your sun, soil, and experience. Generate a month-by-month plan you can save or print.">
            <GrowingPlanTab
              baseResults={baseResults}
              planState={planState} setPlanState={setPlanState}
              familySize={familySize} hemisphere={hemisphere}
              plantingState={plantingState}
              metric={metric} currency={currency}
              producePerPerson={producePerPerson}
              setTab={setTab} />
          </TabPageShell>
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

      /* Bigger range thumb so the touch target meets 44x44 (Apple HIG).
         Native default is ~16px on most browsers — too small for fingers
         on the preservation slider. Audit #45. */
      .hhp-range { -webkit-appearance: none; appearance: none; height: 6px; background: ${T.bg2}; border-radius: 999px; padding: 0; }
      .hhp-range::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 28px; height: 28px; border-radius: 50%;
        background: ${T.primary}; border: 3px solid #FEFCF8;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
      }
      .hhp-range::-moz-range-thumb {
        width: 28px; height: 28px; border-radius: 50%;
        background: ${T.primary}; border: 3px solid #FEFCF8;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
      }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes hhpSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
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
