import assert from "node:assert/strict";
import test from "node:test";

import {
  activeTabColorOverrideCss,
  configurationForUrl,
  createConfiguration,
  derivedActiveTabColor,
  editableHexColor,
  hasSuitableInstallIcon,
  patternMatchesUrl,
  permissionOrigins,
  resolvedActiveTabColor,
  validateConfiguration,
  validateMatchPattern,
  withDisplayPreferences,
  withThemeColor,
} from "../lib/config.js";

test("match patterns distinguish schemes, hosts, subdomains, paths, and queries", () => {
  assert.equal(patternMatchesUrl("https://example.com/app/*", "https://example.com/app/inbox?new=1"), true);
  assert.equal(patternMatchesUrl("https://example.com/app/*", "http://example.com/app/inbox"), false);
  assert.equal(patternMatchesUrl("https://example.com/app/*", "https://example.com/settings"), false);
  assert.equal(patternMatchesUrl("https://*.example.com/*", "https://example.com/home"), true);
  assert.equal(patternMatchesUrl("https://*.example.com/*", "https://team.example.com/home"), true);
  assert.equal(patternMatchesUrl("https://*.example.com/*", "https://notexample.com/home"), false);
  assert.equal(patternMatchesUrl("*://example.com/*", "http://example.com/"), true);
});

test("only requestable web match patterns are accepted", () => {
  assert.equal(validateMatchPattern("https://example.com/*"), true);
  assert.equal(validateMatchPattern("*://*.example.com/app/*"), true);
  assert.equal(validateMatchPattern("https://example.com"), false);
  assert.equal(validateMatchPattern("<all_urls>"), false);
  assert.equal(validateMatchPattern("file:///*"), false);
});

test("wildcard schemes expand into requestable optional origins", () => {
  assert.deepEqual(permissionOrigins(["*://example.com/*", "https://other.example/app/*"]), [
    "http://example.com/*",
    "https://example.com/*",
    "https://other.example/app/*",
  ]);
});

test("configuration lookup chooses the first enabled match", () => {
  const configurations = [
    { id: "disabled", enabled: false, matchPatterns: ["https://example.com/*"] },
    { id: "first", enabled: true, matchPatterns: ["https://example.com/*"] },
    { id: "second", enabled: true, matchPatterns: ["https://example.com/*"] },
  ];
  assert.equal(configurationForUrl(configurations, "https://example.com/inbox").id, "first");
  assert.equal(configurationForUrl(configurations, "https://other.example/inbox"), undefined);
});

test("configuration validation catches invalid manifests and non-array archival data", () => {
  const errors = validateConfiguration({
    name: "Test",
    matchPatterns: ["not a match pattern"],
    manifest: { name: "Test" },
    legacyRules: {},
  });
  assert.deepEqual(errors, [
    "Every match pattern must use Chrome match-pattern syntax.",
    "Manifest must contain start_url.",
    "Manifest must include a square PNG, SVG, or WebP icon of at least 144px with purpose 'any'.",
    "Legacy rule data must be a JSON array.",
  ]);
});

test("active tab color overrides accept only safe hex colors", () => {
  const configuration = {
    pageOverrides: { activeTabColor: "#232F3E" },
  };
  assert.equal(
    activeTabColorOverrideCss(configuration),
    "html { background-color: #232F3E !important; }",
  );
  assert.equal(
    activeTabColorOverrideCss({ pageOverrides: { activeTabColor: "red; body { display: none" } }),
    null,
  );
});

test("automatic active tab colors use Chromium's minimum contrast transformation", () => {
  assert.equal(derivedActiveTabColor("#FF9900"), "#de8500");
  assert.equal(derivedActiveTabColor("#523520"), "#624734");
  assert.equal(derivedActiveTabColor("#fff"), "#e1e1e1");
  assert.equal(derivedActiveTabColor("rgb(1, 2, 3)"), null);
  const configuration = {
    manifest: { theme_color: "#FF9900" },
    pageOverrides: { activeTabColorMode: "theme" },
  };
  assert.equal(resolvedActiveTabColor(configuration), "#de8500");
  assert.equal(
    activeTabColorOverrideCss(configuration),
    "html { background-color: #de8500 !important; }",
  );
  assert.deepEqual(
    validateConfiguration({
      name: "Example",
      matchPatterns: ["https://example.com/*"],
      manifest: {
        name: "Example",
        start_url: "/",
        theme_color: "red",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      rules: [],
      pageOverrides: { activeTabColorMode: "theme" },
    }),
    ["Automatic active tab color requires a hexadecimal manifest theme color."],
  );
});

test("display preferences preserve the manifest and replace or remove overrides", () => {
  const manifest = { name: "Example", display: "standalone", display_override: ["tabbed", "minimal-ui"] };
  assert.deepEqual(withDisplayPreferences(manifest, "minimal-ui", "window-controls-overlay"), {
    name: "Example",
    display: "minimal-ui",
    display_override: ["window-controls-overlay"],
  });
  assert.deepEqual(withDisplayPreferences(manifest, "browser", ""), {
    name: "Example",
    display: "browser",
  });
  assert.deepEqual(manifest.display_override, ["tabbed", "minimal-ui"]);
});

test("theme color controls normalize hex colors and preserve other manifest fields", () => {
  assert.equal(editableHexColor("#AbC"), "#aabbcc");
  assert.equal(editableHexColor("#12abEF"), "#12abef");
  assert.equal(editableHexColor("rgb(1, 2, 3)"), null);
  const manifest = { name: "Example", theme_color: "red", display: "standalone" };
  assert.deepEqual(withThemeColor(manifest, "#123456"), {
    name: "Example",
    theme_color: "#123456",
    display: "standalone",
  });
  assert.deepEqual(withThemeColor(manifest, null), { name: "Example", display: "standalone" });
  assert.equal(manifest.theme_color, "red");
});

test("install icons must be large, square, supported, and usable for any purpose", () => {
  assert.equal(
    hasSuitableInstallIcon([
      { src: "data:image/svg+xml;base64,PHN2Zy8+", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ]),
    true,
  );
  assert.equal(
    hasSuitableInstallIcon([
      { src: "icon.png", sizes: "128x128 192x192", type: "image/png", purpose: "any maskable" },
    ]),
    true,
  );
  assert.equal(
    hasSuitableInstallIcon([
      { src: "icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]),
    false,
  );
  assert.equal(
    hasSuitableInstallIcon([{ src: "favicon.ico", sizes: "256x256", type: "image/x-icon" }]),
    false,
  );
  assert.equal(
    hasSuitableInstallIcon([{ src: "icon.png", sizes: "192x180", type: "image/png" }]),
    false,
  );
});

test("creating from a template produces an independent editable copy", () => {
  const template = {
    id: "example",
    name: "Example",
    enabledByDefault: true,
    matchPatterns: ["https://example.com/*"],
    manifest: {
      name: "Example",
      start_url: "/",
      icons: [{ src: "icon.png", sizes: "192x192", type: "image/png" }],
    },
    rules: [],
  };
  const configuration = createConfiguration(template, "configuration-id");
  configuration.manifest.name = "Changed";
  configuration.matchPatterns.push("https://other.example/*");
  assert.equal(template.manifest.name, "Example");
  assert.deepEqual(template.matchPatterns, ["https://example.com/*"]);
  assert.equal(configuration.id, "configuration-id");
  assert.equal(configuration.templateId, "example");
});
