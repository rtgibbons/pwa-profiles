import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { createConfiguration, validateConfiguration } from "../lib/config.js";
import { createGeneratedIcon } from "../lib/site-discovery.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog = read("templates/catalog.json");

test("catalog identities and exact first match patterns are unambiguous", () => {
  assert.equal(catalog.templates.length, 12);
  for (const field of ["id", "manifestPath"]) {
    assert.equal(new Set(catalog.templates.map((item) => item[field])).size, 12);
  }
  for (const template of catalog.templates) {
    assert.match(template.matchPatterns[0], /^https:\/\/[^/*]+\/\*$/);
    assert.match(template.manifestPath, /^manifests\/[^/]+\.json$/);
    const { source } = template;
    assert.deepEqual(Object.keys(source).sort(), ["label", "path", "repository", "revision"]);
    assert.ok(typeof source.label === "string" && source.label.trim());
    assert.match(source.repository, /^https:\/\/github\.com\/[\w-]+\/[\w-]+$/);
    assert.match(source.revision, /^[a-f0-9]{40}$/);
    const original = ["slack", "github", "canva", "smh"].includes(template.id);
    assert.equal(source.repository, `https://github.com/${original ? "benfredwells" : "bmndc"}/betterPWAs`);
    assert.equal(source.revision, original ? "40ee31ad6cf6acc66189b482dab25df094b5abc2" : "d10a17ca4dc928be96f4acc4367a9202133b11d4");
    assert.equal(source.path, original ? template.manifestPath.replace(/\.json$/, ".js") : template.manifestPath);
  }
});

test("raw manifests and repository contain no bundled vendor artwork", () => {
  assert.equal(existsSync(new URL("manifests/icons", root)), false);
  for (const file of readdirSync(new URL("manifests/", root))) {
    const raw = JSON.stringify(read(`manifests/${file}`));
    assert.doesNotMatch(raw, /"icons"\s*:|icons\/|https?:[^"\s]+\.(png|svg|jpe?g|webp|gif|ico)(?:[?"#])/i);
    assert.doesNotMatch(raw, /"src"\s*:\s*"https?:/i);
  }
  const x = catalog.templates.find((item) => item.id === "x");
  assert.equal(x.name, "X");
  assert.deepEqual(x.rules ?? [], []);
  const manifest = read(x.manifestPath);
  assert.equal(manifest.name, "X");
  assert.equal(manifest.shortcuts[0].name, "Post");
  assert.equal(manifest.theme_color, undefined);
  assert.equal(manifest.background_color, undefined);
  assert.doesNotMatch(JSON.stringify([x, manifest]), /twitter|tweet|twimg/i);
});

test("background assembles all twelve templates offline with valid neutral icons", async (t) => {
  let messageHandler;
  const event = { addListener() {} };
  const stored = {};
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(url.startsWith("chrome-extension://test/"), "only bundled files may be fetched");
    return { ok: true, json: async () => read(url.slice("chrome-extension://test/".length)) };
  });
  globalThis.chrome = {
    runtime: {
      onInstalled: event, onStartup: event,
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener(handler) { messageHandler = handler; } },
    },
    storage: { onChanged: event, local: {
      get: async () => stored,
      set: async (value) => Object.assign(stored, value),
    } },
    action: { onClicked: event },
    tabs: { onActivated: event, onUpdated: event, query: async () => [] },
    permissions: { contains: async () => false, onAdded: event, onRemoved: event },
    scripting: { getRegisteredContentScripts: async () => [] },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} },
  };
  t.after(() => { delete globalThis.chrome; });
  await import("../background.js");
  const state = await new Promise((resolve) => messageHandler(
    { type: "getState" }, { url: "chrome-extension://test/options/options.html" }, resolve,
  ));
  assert.equal(state.ok, true, state.error);
  assert.equal(state.templates.length, 12);
  assert.equal(state.configurations.length, 4);
  for (const template of state.templates) {
    assert.deepEqual(validateConfiguration(createConfiguration(template, `test-${template.id}`)), [], template.id);
    assert.deepEqual(template.manifest.icons, [createGeneratedIcon(template.matchPatterns[0].slice(0, -1))]);
  }
  for (const configuration of state.configurations) assert.deepEqual(validateConfiguration(configuration), []);
});
