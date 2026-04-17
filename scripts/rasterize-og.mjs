// One-off SVG → PNG rasteriser for SEO assets.
// Run with `node scripts/rasterize-og.mjs`.
//
// Why it exists: Facebook, Twitter/X, and LinkedIn refuse SVG for og:image.
// The source SVGs live in /public and stay human-editable; this script
// generates the PNG counterparts that crawlers actually consume.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "..", "public");

function rasterise({ inputSvg, outputPng, width, height, label }) {
  const svg = readFileSync(resolve(pub, inputSvg), "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(255, 255, 255, 0)",
    // resvg-js ships without system fonts by default. We pass a font
    // fallback chain so "DM Serif Display" / "Plus Jakarta Sans" degrade
    // gracefully to whatever the host has rather than rendering as blank
    // rectangles. For production-grade social previews you'd embed the
    // font files explicitly — the current fallback is good enough for a
    // legible OG card.
    font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
  });
  const buf = resvg.render().asPng();
  writeFileSync(resolve(pub, outputPng), buf);
  console.log(`[rasterise-og] ${label}: ${buf.length.toLocaleString()} bytes → public/${outputPng}`);
}

rasterise({
  inputSvg: "og-image.svg",
  outputPng: "og-image.png",
  width: 1200,
  height: 630,
  label: "OG card",
});

rasterise({
  inputSvg: "favicon.svg",
  outputPng: "apple-touch-icon.png",
  width: 180,
  height: 180,
  label: "Apple touch icon",
});
