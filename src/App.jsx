import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CROPS, CATEGORIES } from "./data/crops.js";
import { COMPANIONS, COMPANION_GROUPINGS, getCompanion } from "./data/companions.js";

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
const LS_PLANTING = "hhp_planting";

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
  { id: "home",             label: "Self-Sufficiency",paid: false, live: true,  blurb: "" },
  { id: "soil",             label: "Soil",            paid: false, live: true,  blurb: "Raised-bed volume, soil mix breakdown, and bag estimates." },
  { id: "companion",        label: "Companion",       paid: false, live: true,  blurb: "Which crops grow well together, which ones fight." },
  { id: "planting-dates",   label: "Planting Dates",  paid: false, live: true,  blurb: "Start indoors, transplant, direct sow, and harvest windows for your zone." },
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
  return new Date(y, mo - 1, d);
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
    segments.push({ start: yearStart instanceof Date ? new Date(refYear + 1, 0, 1) : null, end, offYear: +1 });
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
            {formatDate(frostDates.lastSpring, referenceYear)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx2 }}>
            First fall frost:
          </span>
          <span style={{
            fontFamily: T.fontNum, fontVariantNumeric: "tabular-nums",
            fontSize: 15, fontWeight: 700, color: T.tx,
          }}>
            {formatDate(frostDates.firstFall, referenceYear)}
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

      {/* Results */}
      {frostDates && perCropDates.length > 0 && (
        <div style={{ marginTop: 40 }} aria-live="polite">
          <div style={eyebrowStyle}>Your planting calendar</div>
          <div style={{ marginTop: 14 }}>
            <PlantingTimelineChart
              rows={perCropDates} referenceYear={referenceYear} />
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
                referenceYear={referenceYear} />
            ))}
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: T.tx3, lineHeight: 1.55 }}>
            Dates are planning estimates from extension-service averages. Soil temperature,
            microclimate, and variety all shift the actual windows. Watch your local weather
            and harden off transplants for 5-7 days before they go in the ground.
          </p>
        </div>
      )}

      {!frostDates && (
        <p role="alert" style={{
          marginTop: 24, padding: 16, borderRadius: T.radius,
          background: T.warningBg, color: T.tx,
          fontSize: 14, lineHeight: 1.5,
        }}>
          Enter both frost dates (or pick a zone) to see your planting calendar.
        </p>
      )}
    </section>
  );
}

function ZonePicker({ value, onChange, hemisphere }) {
  // Build label text for each zone showing its frost dates in the user's hemisphere.
  const refYear = new Date().getFullYear();
  const opts = Object.keys(ZONE_FROST_DATES).map((k) => Number(k));
  return (
    <div>
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
              Zone {z} — last frost {formatDate(f.lastSpring)}, first frost {formatDate(f.firstFall)}
            </option>
          );
        })}
      </select>
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
          const indoorsBars = dates.startIndoors && dates.transplant
            ? phaseFor(dates.startIndoors, dates.transplant, PHASE_COLORS.indoors)
            : [];
          const sowBase = dates.anchorMethod === "transplant" ? dates.transplant : dates.directSow;
          const growBars = sowBase && dates.harvestStart
            ? phaseFor(sowBase, dates.harvestStart, PHASE_COLORS.grow)
            : [];
          const harvestBars = dates.harvestStart && dates.harvestEnd
            ? phaseFor(dates.harvestStart, dates.harvestEnd, PHASE_COLORS.harvest)
            : [];
          const edges = edgeIndicators(dates);

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
                background: T.card, borderRadius: T.radius,
                border: `1px solid ${T.border}`,
                overflow: "hidden",
              }}>
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
  const method = sowMethodOverride || crop.sowMethod;
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

      <SocialProofSection />
      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection />
      <FAQSection />
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
  const stats = [
    { value: "63", label: "crops in the database", sub: "Tomatoes to parsnips. Six regional additions for non-US gardens." },
    { value: "153", label: "companion pairings", sub: "Sourced from extension-service research, not Pinterest folklore." },
    { value: "$19.99", label: "one-time purchase", sub: "No subscription. No renewals. Your plan is yours." },
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
    id: "home",
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
      body: "Paid tier adds an AI-generated personalised plan, a searchable crop database, cost savings tracking, and a preservation planner. Pay once, keep it." },
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
    "AI-generated personalised growing plan",
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
    q: "Does it use AI?",
    a: "The four free calculators are plain math. The paid growing-plan tab uses Claude (by Anthropic) to generate a personalised monthly schedule from your inputs. Everything is clearly labelled so you know where the math ends and the AI begins.",
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
        <a href="#home"
          onClick={(e) => { e.preventDefault(); window.location.hash = "home"; }}
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
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: T.primary, color: T.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 400,
              }}>H</span>
              <span style={{
                fontFamily: T.fontDisplay, fontSize: 17, color: T.tx, fontWeight: 400,
              }}>Homestead Harvest Planner</span>
            </div>
            <p style={{
              margin: "12px 0 0", fontSize: 13, color: T.tx3, lineHeight: 1.55, maxWidth: 280,
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
              <a href="#home" style={linkStyle}
                onClick={(e) => { e.preventDefault(); window.location.hash = "home"; }}>Self-Sufficiency</a>
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
              <a href="#features" style={linkStyle}>Features</a>
              <a href="#how-it-works" style={linkStyle}>How it works</a>
              <a href="#pricing" style={linkStyle}>Pricing</a>
              <a href="#faq" style={linkStyle}>FAQ</a>
            </div>
          </div>

          {/* Legal + Contact */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.tx, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 10,
            }}>Support</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <a href="mailto:urbanroot.contact@gmail.com" style={linkStyle}>Contact</a>
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
// Hash aliases for backwards compat with pre-merge URLs. #self-sufficiency
// used to be its own route; it now resolves to #home (the same calculator).
const HASH_ALIASES = { "self-sufficiency": "home" };
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
        {tab !== "home" && tab !== "soil" && tab !== "companion" && tab !== "planting-dates" && (
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
