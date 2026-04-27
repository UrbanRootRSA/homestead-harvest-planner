// One-off: rasterise public/favicon.svg → public/store-avatar.png at 512x512
// for the LemonSqueezy store avatar upload. Not wired into npm scripts.
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "public/favicon.svg"));

const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } })
  .render()
  .asPng();

const out = path.join(root, "public/store-avatar.png");
fs.writeFileSync(out, png);
console.log(`[avatar] ${png.length} bytes → ${out}`);
