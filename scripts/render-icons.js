import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Requires librsvg's rsvg-convert (Debian: librsvg2-bin). Render at each target
// size, not by shrinking a PNG. Both palettes use the canonical SVG geometry.
const source = readFileSync(new URL("../visd/pwa-profiles-profile-stack.svg", import.meta.url), "utf8");
const disabledPalette = { "#176B45": "#60656A", "#67C994": "#AEB4B8", "#C8E8D5": "#C9CDD0", "#FFFFFF": "#F4F5F5" };
for (const disabled of [false, true]) {
  const svg = disabled ? source.replace(/#[A-F0-9]{6}/g, (color) => disabledPalette[color] ?? color) : source;
  for (const size of disabled ? [16, 32, 48] : [16, 32, 48, 128, 512]) {
    const png = execFileSync("rsvg-convert", ["--width", String(size), "--height", String(size)], { input: svg });
    writeFileSync(new URL(`../images/icon${disabled ? "Disabled" : ""}${size}.png`, import.meta.url), png);
  }
}
console.log("Rendered eight RGBA icons from the canonical Profile Stack SVG and explicit disabled palette.");
