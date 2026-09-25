import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateConfiguration } from "../lib/config.js";
import { migrateTemplateConfigurations } from "../lib/migrations.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const templates = read("../templates/catalog.json").templates;
// Unmodified catalog/manifests copied from 8ebb658d87831241816e48f53229c3edc6e32119.
const legacy = read("./fixtures/schema-1/catalog.json").templates.map((template) => ({
  id: `default-${template.id}`, templateId: template.id, name: template.name,
  enabled: true, matchPatterns: template.matchPatterns, replaceExistingManifest: true,
  createdAt: "2025-03-01T01:02:03Z", updatedAt: "2025-04-02T04:05:06Z",
  pageOverrides: {}, rules: template.rules ?? [],
  manifest: read(`./fixtures/schema-1/${template.manifestPath.split("/").at(-1)}`),
}));

test("all actual schema-1 templates migrate without vendor artwork and without mutation", () => {
  const before = structuredClone(legacy);
  const migrated = migrateTemplateConfigurations(legacy, templates);
  assert.deepEqual(legacy, before);
  for (const configuration of migrated) {
    assert.deepEqual(validateConfiguration(configuration), [], configuration.templateId);
    assert.equal(configuration.manifest.icons.length, 1);
    const icon = configuration.manifest.icons[0];
    assert.equal(icon.sizes, "any");
    assert.equal(icon.type, "image/svg+xml");
    assert.equal(icon.purpose, "any maskable");
    assert.match(icon.src, /^data:image\/svg\+xml;base64,/);
    assert.match(atob(icon.src.split(",")[1]), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.doesNotMatch(JSON.stringify(configuration), /icons\/|"src":"https?:|twimg|Twitter|Tweet/);
    assert.ok((configuration.manifest.shortcuts ?? []).every((shortcut) => !("icons" in shortcut)));
    const original = before.find((item) => item.id === configuration.id);
    for (const key of ["id", "enabled", "matchPatterns", "createdAt", "updatedAt", "pageOverrides"]) {
      assert.deepEqual(configuration[key], original[key]);
    }
  }
  // Distinct hosts must not accidentally receive the first/default template's icon.
  assert.notEqual(migrated[0].manifest.icons[0].src, migrated[1].manifest.icons[0].src);
  assert.deepEqual(migrateTemplateConfigurations(migrated, templates), migrated);
  assert.deepEqual(migrated.find((item) => item.templateId === "github").rules, legacy[1].rules);
  const x = migrated.find((item) => item.templateId === "x");
  assert.equal(x.name, "X");
  assert.equal(x.manifest.name, "X");
  assert.equal(x.manifest.shortcuts[0].name, "Post");
  assert.equal(x.manifest.share_target.action, "https://x.com/compose/post");
  assert.deepEqual(x.rules, []);
});

test("customizations, custom icons on vendor hosts, and non-template profiles survive", () => {
  const github = structuredClone(legacy[1]);
  github.name = "My review queue";
  github.enabled = false;
  github.matchPatterns = ["https://github.com/rtgibbons/*"];
  github.pageOverrides = { activeTabColor: "#123456" };
  github.manifest.display = "fullscreen";
  github.manifest.theme_color = "#abcdef";
  const customIcon = { src: "https://github.githubassets.com/assets/my-custom.png", sizes: "192x192" };
  const siteIcon = { src: "/icons/my-site-icon.png", sizes: "192x192" };
  github.manifest.icons.push(customIcon, siteIcon);
  github.manifest.shortcuts = [{ name: "Review", url: "/pulls", icons: [customIcon] }];
  const custom = { ...structuredClone(legacy[0]), id: "custom", templateId: null };
  const unknown = { ...structuredClone(legacy[0]), id: "unknown", templateId: "not-bundled" };
  const missing = structuredClone(legacy[0]);
  delete missing.templateId;
  const migrated = migrateTemplateConfigurations([github, custom, unknown, missing], templates);
  const expected = structuredClone(github);
  expected.manifest.icons = [customIcon, siteIcon, migrated[0].manifest.icons.at(-1)];
  assert.match(expected.manifest.icons.at(-1).src, /^data:image\/svg\+xml;base64,/);
  assert.deepEqual(migrated[0], expected);
  assert.deepEqual(migrated.slice(1), [custom, unknown, missing]);
  const fullyCustom = { ...github, manifest: { ...github.manifest, icons: [customIcon] } };
  assert.deepEqual(migrateTemplateConfigurations([fullyCustom], templates), [fullyCustom]);
});

test("X migration distinguishes stale defaults from edited text, routes, and similar rules", () => {
  const x = structuredClone(legacy.find((item) => item.templateId === "x"));
  x.name = "My Twitter research";
  x.manifest.name = "Twitter archive";
  x.manifest.short_name = "My tweets";
  x.manifest.theme_color = "#13579b";
  x.manifest.description = "Tweet research";
  x.manifest.shortcuts.push({ name: "Tweet archive", url: "/custom", icons: [{ src: "https://example.org/me.png" }] });
  x.manifest.share_target.action = "https://x.com/compose/tweet?custom=true";
  const scopedRule = structuredClone(x.rules[0]);
  scopedRule.condition.initiatorDomains = ["example.org"];
  const otherRule = { priority: 2, action: { type: "block" }, condition: { urlFilter: "||example.org/" } };
  x.rules.push(scopedRule, otherRule);
  const migrated = migrateTemplateConfigurations([x], templates)[0];
  assert.deepEqual(migrated.rules, [scopedRule, otherRule]);
  for (const key of ["name", "short_name", "description", "theme_color", "share_target"]) {
    assert.deepEqual(migrated.manifest[key], x.manifest[key]);
  }
  assert.equal(migrated.name, x.name);
  assert.deepEqual(migrated.manifest.shortcuts.at(-1), x.manifest.shortcuts.at(-1));
  assert.equal(migrated.manifest.shortcuts[0].name, "Post");
  assert.deepEqual(migrateTemplateConfigurations([migrated], templates), [migrated]);
});

test("startup persists schema 2, reconciles migrated rules, and injects without deleted-image fetches", async (t) => {
  let handler;
  let finishReconciliation;
  const reconciled = new Promise((resolve) => { finishReconciliation = resolve; });
  const stored = { configurations: structuredClone(legacy), configurationSchemaVersion: 1 };
  const writes = [];
  const requests = [];
  const event = { addListener() {} };
  t.mock.method(globalThis, "fetch", async (url) => {
    await new Promise((resolve) => setImmediate(resolve));
    requests.push(url);
    assert.ok(url.startsWith("chrome-extension://test/"));
    assert.doesNotMatch(url, /icons\//, "injection must never fetch removed artwork");
    return { ok: true, json: async () => read(`../${url.slice("chrome-extension://test/".length)}`) };
  });
  globalThis.chrome = {
    runtime: { onInstalled: event, onStartup: event, getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener(callback) { handler = callback; } } },
    storage: { onChanged: event, local: {
      get: async () => structuredClone(stored),
      set: async (value) => { writes.push(structuredClone(value)); Object.assign(stored, value); },
    } },
    action: { onClicked: event }, tabs: { onActivated: event, onUpdated: event },
    permissions: { contains: async () => true },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} },
    declarativeNetRequest: { getDynamicRules: async () => [{ id: 73 }],
      updateDynamicRules: async (value) => finishReconciliation(value) },
  };
  t.after(() => { delete globalThis.chrome; });
  await import("../background.js");
  const send = (message, sender) => new Promise((resolve) => handler(message, sender, resolve));
  const duringUpgrade = await Promise.all(["https://app.slack.com/client", "https://github.com/"].map((url) =>
    send({ type: "getConfigurationForPage" }, { tab: { id: 1, url } }),
  ));
  for (const response of duringUpgrade) {
    assert.equal(response.ok, true, response.error);
    assert.match(response.configuration.manifest.icons[0].src, /^data:image\/svg\+xml;base64,/);
  }
  assert.deepEqual(await reconciled, { removeRuleIds: [73], addRules: [] });
  assert.equal(stored.configurationSchemaVersion, 2);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].configurations);
  const fetchCount = requests.length;
  for (const template of templates) {
    const response = await send({ type: "getConfigurationForPage" },
      { tab: { id: 1, url: template.matchPatterns[0].slice(0, -1) } });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.configuration.id, `default-${template.id}`);
    assert.match(response.configuration.manifest.icons[0].src, /^data:image\/svg\+xml;base64,/);
    assert.doesNotMatch(JSON.stringify(response), /manifests\/icons\/|"src":"https?:/);
  }
  assert.equal(requests.length, fetchCount, "injection requires no asset fetch");
  const state = await send({ type: "getState" }, { url: "chrome-extension://test/options/options.html" });
  assert.deepEqual(state.configurations, stored.configurations);
  assert.equal(writes.length, 1, "reading schema 2 must not rewrite storage");
});
