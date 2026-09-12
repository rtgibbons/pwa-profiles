import assert from "node:assert/strict";
import test from "node:test";

import {
  generatedIconDesign,
  generatedIconSvg,
  inferManifest,
  normalizeSiteUrl,
  originMatchPattern,
  resolveImportedManifest,
} from "../lib/site-discovery.js";

test("site URLs default to HTTPS and reject non-web protocols", () => {
  assert.equal(normalizeSiteUrl("example.com/app#section").href, "https://example.com/app");
  assert.throws(() => normalizeSiteUrl("file:///tmp/app"), /HTTP or HTTPS/);
  assert.throws(() => normalizeSiteUrl("https://user:secret@example.com"), /credentials/);
  assert.throws(() => normalizeSiteUrl("  "), /Enter a site URL/);
  assert.equal(originMatchPattern("https://example.com/app"), "https://example.com/*");
  assert.equal(originMatchPattern("http://localhost:4173/app"), "http://localhost/*");
});

test("generated icon designs are deterministic per hostname", () => {
  const first = generatedIconDesign("https://mail.example.com/inbox");
  assert.deepEqual(first, generatedIconDesign("https://mail.example.com/settings"));
  assert.notDeepEqual(first, generatedIconDesign("https://chat.example.com/"));
  assert.match(first.startColor, /^#[\da-f]{6}$/);
  assert.match(first.endColor, /^#[\da-f]{6}$/);
  assert.ok(first.stripeOffset >= 0 && first.stripeOffset < 64);
  const svg = generatedIconSvg("https://mail.example.com/inbox");
  assert.equal(svg, generatedIconSvg("https://mail.example.com/settings"));
  assert.match(svg, /^<svg .+<linearGradient .+<pattern .+<\/svg>$/);
  assert.ok(svg.length < 700);
});

test("imported manifest URLs resolve against the manifest location", () => {
  const manifest = resolveImportedManifest(
    {
      id: "./identity",
      start_url: "../launch",
      scope: "../",
      icons: [{ src: "icons/app.png" }],
      shortcuts: [{ url: "../inbox" }],
    },
    "https://example.com/assets/manifest.json",
  );
  assert.deepEqual(manifest, {
    id: "https://example.com/assets/identity",
    start_url: "https://example.com/launch",
    scope: "https://example.com/",
    icons: [{ src: "https://example.com/assets/icons/app.png" }],
    shortcuts: [{ url: "https://example.com/inbox" }],
  });
});

test("page metadata creates a disabled-review-ready manifest draft", () => {
  assert.deepEqual(
    inferManifest("https://mail.example.com/inbox?view=all", {
      name: "Example Mail",
      shortName: "Mail",
      description: "Read your mail",
      themeColor: "#123456",
      icons: [{ src: "https://mail.example.com/icon.png", sizes: "192x192", type: "image/png" }],
    }),
    {
      id: "https://mail.example.com/better-pwa/mail.example.com",
      name: "Example Mail",
      short_name: "Mail",
      start_url: "https://mail.example.com/inbox?view=all",
      scope: "https://mail.example.com/",
      display: "standalone",
      description: "Read your mail",
      theme_color: "#123456",
      background_color: "#123456",
      icons: [{ src: "https://mail.example.com/icon.png", sizes: "192x192", type: "image/png" }],
    },
  );
});
