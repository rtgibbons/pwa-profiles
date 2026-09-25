import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { CONFIGURATIONS_KEY, SCHEMA_VERSION_KEY, SCHEMA_VERSION } from "../lib/config.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const iconMap = (disabled, sizes) => Object.fromEntries(sizes.map((size) =>
  [size, `images/icon${disabled ? "Disabled" : ""}${size}.png`]));

test("exports use the new filename while old filenames remain content-importable", async () => {
  const source = read("options/options.js");
  const configurations = [{ id: "preserved-id", name: "Custom backup", enabled: true }];
  const anchor = { click() {} };
  let blob;
  let imported;
  const context = {
    configurations, Blob,
    Date: class extends Date { constructor() { super("2026-09-25T23:59:00Z"); } },
    URL: { createObjectURL(value) { blob = value; return "blob:test"; }, revokeObjectURL() {} },
    document: { createElement: () => anchor }, setTimeout: (fn) => fn(),
    showToast() {}, confirm: () => true, loadState: async () => {},
    chrome: { runtime: { sendMessage: async (message) => { imported = message; return { ok: true }; } } },
  };
  runInNewContext(source.slice(source.indexOf("function exportConfigurations()"), source.indexOf("function actionButtons()")), context);
  context.exportConfigurations();
  assert.equal(anchor.download, "pwa-profiles-settings-2026-09-25.json");
  assert.deepEqual(JSON.parse(await blob.text()), { version: 1, configurations });
  const event = { target: { files: [{ name: "better-pwas-settings-2024-04-03.json", text: () => blob.text() }], value: "legacy-file" } };
  await context.importConfigurations(event);
  assert.deepEqual(JSON.parse(JSON.stringify(imported)), { type: "replaceConfigurations", configurations });
  assert.equal(event.target.value, "");
});

test("public metadata and display copy use the exact PWA Profiles identity", () => {
  assert.equal(manifest.name, "PWA Profiles \u2013 Custom Web Apps");
  assert.equal(manifest.short_name, "PWA Profiles");
  assert.equal(manifest.version, "3.0.0");
  assert.equal(manifest.description, "Create custom installable web apps with editable manifests, display modes, colors, icons, and per-site settings.");
  assert.equal(manifest.homepage_url, "https://github.com/rtgibbons/pwa-profiles");
  assert.ok(manifest.name.length <= 75);
  assert.ok(manifest.short_name.length <= 12);
  assert.ok(manifest.description.length <= 132);
  assert.ok(!("key" in manifest));
  assert.equal(manifest.action.default_title, "PWA Profiles: No active profile");
  assert.deepEqual(manifest.icons, iconMap(false, [16, 32, 48, 128, 512]));
  assert.deepEqual(manifest.action.default_icon, iconMap(true, [16, 32, 48]));
  const html = read("options/options.html");
  assert.match(html, /<title>PWA Profiles settings<\/title>/);
  assert.match(html, /aria-label="PWA Profiles settings"/);
  assert.match(html, /<span>PWA Profiles<\/span>/);
  assert.match(html.replace(/\s+/g, " "), /Choose where PWA Profiles runs, customize each web app manifest, and manage its network rules—all stored locally in your browser\./);
  assert.match(html, /src="\.\.\/images\/icon128.png"/);
  assert.match(read("injectManifest.js"), /console.error\("PWA Profiles could not inject the manifest:"/);
  // Deliberately scoped: attribution, legacy fixtures, and internal identifiers are not public copy.
  for (const file of ["manifest.json", "background.js", "injectManifest.js", "options/options.html", "options/options.js"]) {
    assert.doesNotMatch(read(file), /Better PWAs?/, file);
  }
});

test("toolbar transitions send complete state-specific icon maps and exact titles", async () => {
  const source = read("background.js");
  const calls = [];
  const configuration = { id: "asymmetric", name: "Asymmetric test" };
  let enabled = false;
  const context = {
    chrome: { permissions: { contains: async () => enabled }, action: {
      setIcon: async (value) => calls.push(value), setTitle: async (value) => calls.push(value),
    }, tabs: { sendMessage: async () => null } },
    getConfigurations: async () => [configuration],
    configurationForUrl: () => configuration,
    permissionOrigins: () => [],
  };
  runInNewContext(source.slice(source.indexOf("const ENABLED_ICON"), source.indexOf("let reconciliation")) +
    source.slice(source.indexOf("async function updateActionForTab")), context);
  for (const [active, title] of [[false, "PWA Profiles: No active profile"], [true, "PWA Profiles: Asymmetric test profile enabled"]]) {
    enabled = active;
    calls.length = 0;
    await context.updateActionForTab({ id: 37, url: "https://example.org/" });
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
      { path: iconMap(!active, [16, 32, 48]), tabId: 37 }, { title, tabId: 37 },
    ]);
  }
  calls.length = 0;
  await runInNewContext("setAction(ENABLED_ICON, ENABLED_TEXT, 37)", context);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { path: iconMap(false, [16, 32, 48]), tabId: 37 },
    { title: "PWA Profiles: Replacement manifest active", tabId: 37 },
  ]);
  assert.match(source, /await queueActionUpdate\(sender.tab.id, "injected"\)/);
});

test("compatibility identifiers remain independent of the public brand", () => {
  assert.equal(CONFIGURATIONS_KEY, "configurations");
  assert.equal(SCHEMA_VERSION_KEY, "configurationSchemaVersion");
  assert.equal(SCHEMA_VERSION, 2);
  assert.match(read("background.js"), /const CONTENT_SCRIPT_ID = "better-pwas-managed"/);
  assert.match(read("injectManifest.js"), /link.dataset.betterPwas = id/);
  assert.match(read("lib/site-discovery.js"), /id: `\$\{url.origin\}\/better-pwa\/\$\{url.hostname\}`/);
  for (const file of readdirSync(new URL("../manifests", import.meta.url))) {
    if (file.endsWith(".json")) assert.equal(JSON.parse(read(`manifests/${file}`)).id, `better-pwa/${file.slice(0, -5)}`);
  }
});

test("Profile Stack PNGs are RGBA with exact dimensions and a transparent safe border", () => {
  for (const [disabled, sizes] of [[false, [16, 32, 48, 128, 512]], [true, [16, 32, 48]]]) {
    for (const [sizeText, path] of Object.entries(iconMap(disabled, sizes))) {
      const size = Number(sizeText);
      const png = readFileSync(new URL(`../${path}`, import.meta.url));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), size, path);
      assert.equal(png.readUInt32BE(20), size, path);
      assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0], "8-bit RGBA, non-interlaced");
      const chunks = [];
      for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
      }
      const raw = inflateSync(Buffer.concat(chunks));
      const stride = size * 4;
      assert.equal(raw.length, (stride + 1) * size);
      const pixels = Buffer.alloc(stride * size);
      for (let y = 0; y < size; y++) {
        const filter = raw[y * (stride + 1)];
        assert.ok(filter <= 4);
        for (let x = 0; x < stride; x++) {
          const index = y * stride + x;
          const a = x >= 4 ? pixels[index - 4] : 0;
          const b = y ? pixels[index - stride] : 0;
          const c = y && x >= 4 ? pixels[index - stride - 4] : 0;
          const p = a + b - c;
          const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
          const paeth = [a, b, c][distances.indexOf(Math.min(...distances))];
          pixels[index] = raw[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth][filter];
        }
      }
      const alpha = [...pixels].filter((_, index) => index % 4 === 3);
      assert.ok(alpha.includes(255) && alpha.includes(0), path);
      const palette = disabled ? ["60656a", "aeb4b8", "c9cdd0", "f4f5f5"] : ["176b45", "67c994", "c8e8d5", "ffffff"];
      const colors = new Set();
      const occupiedX = [], occupiedY = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        if (pixels[offset + 3] === 255) colors.add(pixels.subarray(offset, offset + 3).toString("hex"));
        if (pixels[offset + 3]) { occupiedX.push(x); occupiedY.push(y); }
      }
      for (const color of palette) assert.ok(colors.has(color), `${path} missing canonical palette color ${color}`);
      // SVG's centered stroke extends from 32 to 480 on its 512-unit grid.
      for (const occupied of [occupiedX, occupiedY]) {
        assert.equal(Math.min(...new Set(occupied)), Math.floor(size / 16), `${path} lower visible bound`);
        assert.equal(Math.max(...new Set(occupied)), Math.ceil(size * 15 / 16) - 1, `${path} upper visible bound`);
      }
      // Interior sample locations selected independently from the canonical geometry:
      // top keyline, bottom base, exposed rear card, front card, profile aperture.
      for (const [x, y, color] of [[256, 48, 1], [256, 432, 0], [128, 192, 2], [224, 320, 3], [320, 224, 0]]) {
        const offset = (Math.floor(y * size / 512) * size + Math.floor(x * size / 512)) * 4;
        assert.equal(pixels.subarray(offset, offset + 4).toString("hex"), `${palette[color]}ff`, `${path} landmark ${x},${y}`);
      }
      // One fully clear outer pixel even at 16px; larger rasters retain proportional padding.
      const border = Math.max(1, Math.floor(size / 32));
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (x < border || y < border || x >= size - border || y >= size - border) {
          assert.equal(alpha[y * size + x], 0, `${path} safe border at ${x},${y}`);
        }
      }
    }
  }
  assert.deepEqual(readdirSync(new URL("../visd", import.meta.url)), ["pwa-profiles-profile-stack.svg"]);
  assert.doesNotMatch(read("visd/pwa-profiles-profile-stack.svg"), /<(?:image|filter|linearGradient|radialGradient)\b/);
});
