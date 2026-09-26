import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as config from "../lib/config.js";
import * as migrations from "../lib/migrations.js";
import * as discovery from "../lib/site-discovery.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const profile = (id, patterns = ["https://example.com/app/*"]) => ({
  id, name: id, enabled: true, matchPatterns: patterns,
  manifest: { name: id, start_url: "/", icons: [discovery.createGeneratedIcon("https://example.com")] },
});

function worker(initial, origins = []) {
  const event = () => ({ addListener(handler) { this.handler = handler; } });
  const stored = structuredClone(initial);
  const calls = [];
  let scripts = [];
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event(), getURL: (path) => `chrome-extension://test/${path}` },
    storage: { onChanged: event(), local: {
      get: async () => structuredClone(stored),
      set: async (value) => { calls.push(["persist", plain(value)]); Object.assign(stored, structuredClone(value)); },
    } },
    permissions: {
      onAdded: event(), onRemoved: event(),
      contains: async ({ origins: requested }) => requested.every((origin) => origins.some((grant) =>
        config.grantIsNeeded(grant, [{ enabled: true, matchPatterns: [origin] }]))),
      getAll: async () => ({ origins: [...origins] }),
      remove: async ({ origins: removed }) => {
        calls.push(["remove", [...removed]]);
        origins = origins.filter((origin) => !removed.includes(origin));
        return true;
      },
    },
    action: { onClicked: event() },
    tabs: { onActivated: event(), onUpdated: event(), query: async () => [] },
    scripting: {
      getRegisteredContentScripts: async () => scripts,
      unregisterContentScripts: async () => { scripts = []; },
      registerContentScripts: async (value) => { scripts = plain(value); },
      insertCSS: async () => calls.push(["css"]),
    },
  };
  runInNewContext(read("background.js").split("const CONTENT_SCRIPT_ID")[1].replace(/^/, "const CONTENT_SCRIPT_ID"), {
    ...config, ...migrations, ...discovery, chrome, structuredClone, crypto, URL, console,
    hasSiteAccess: (value) => config.hasSiteAccess(value, chrome.permissions),
    fetch: async (url) => ({ ok: true, json: async () => JSON.parse(read(url.replace("chrome-extension://test/", ""))) }),
  });
  const send = (message) => new Promise((resolve) => chrome.runtime.onMessage.handler(message,
    { url: "chrome-extension://test/options/options.html" }, resolve));
  return { chrome, stored, calls, send, scripts: () => scripts, grant: (value) => { origins = value; } };
}

test("manifest grants only storage/scripting and optional HTTP(S); runtime has no rule execution or remote code", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.permissions, ["storage", "scripting"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  for (const file of ["background.js", "injectManifest.js", "options/options.js", "options/options.html", "lib/config.js", "lib/site-discovery.js"]) {
    assert.doesNotMatch(read(file), /declarativeNetRequest|rules-json|network rules|\beval\s*\(|new\s+Function\s*\(|import\s*\(\s*["']https?:/i, file);
  }
});

test("concrete origin extraction rejects broad hosts and ignores paths; broad existing grants cover overlap", () => {
  assert.deepEqual(config.permissionOrigins(["*://example.com/private/*", "https://example.com/public/*"]),
    ["http://example.com/*", "https://example.com/*"]);
  for (const pattern of ["https://*/*", "*://*.example.com/*", "<all_urls>", "https://user@host/*"]) {
    assert.throws(() => config.permissionOrigins([pattern]));
  }
  const profiles = [profile("a", ["https://sub.example.com/a/*"]), { ...profile("disabled"), enabled: false }];
  assert.equal(config.grantIsNeeded("*://*.example.com/*", profiles), true);
  assert.equal(config.grantIsNeeded("https://sub.example.com/ignored/*", profiles), true);
  assert.equal(config.grantIsNeeded("http://*.example.com/*", profiles), false);
  assert.equal(config.grantIsNeeded("https://example.com/*", profiles), false);
  assert.equal(config.grantIsNeeded("<all_urls>", profiles), true);
});

test("enabled without access is inert, permission events register narrowed paths and revocation preserves enabled", async () => {
  const w = worker({ configurations: [profile("a")], configurationSchemaVersion: 3 });
  await w.send({ type: "reconcile" });
  assert.deepEqual(w.scripts(), []);
  w.grant(["https://example.com/*"]);
  await w.chrome.permissions.onAdded.handler();
  assert.deepEqual(w.scripts()[0].matches, ["https://example.com/app/*"]);
  w.grant([]);
  await w.chrome.permissions.onRemoved.handler();
  assert.deepEqual(w.scripts(), []);
  assert.equal(w.stored.configurations[0].enabled, true);
});

test("disable, edit, delete and replace persist before removing only unused actual grants", async () => {
  const w = worker({ configurations: [profile("a"), profile("b", ["https://other.example.com/*"])], configurationSchemaVersion: 3 },
    ["https://*.example.com/*", "http://unused.test/*"]);
  await w.send({ type: "saveConfiguration", configuration: { ...profile("a"), enabled: false } });
  assert.deepEqual(w.calls.filter(([type]) => type === "remove"), [["remove", ["http://unused.test/*"]]]);
  assert.equal(w.calls[0][0], "persist");
  await w.send({ type: "saveConfiguration", configuration: profile("b", ["https://elsewhere.test/private/*"]) });
  assert.deepEqual(w.calls.at(-1), ["remove", ["https://*.example.com/*"]]);
  w.grant(["https://elsewhere.test/*"]);
  await w.send({ type: "deleteConfiguration", id: "b" });
  assert.deepEqual(w.calls.at(-1), ["remove", ["https://elsewhere.test/*"]]);
  w.grant(["https://example.com/*"]);
  const imported = { ...profile("import"), rules: ["opaque"], legacyRules: [123] };
  const result = await w.send({ type: "replaceConfigurations", configurations: [imported], schemaVersion: 2 });
  assert.equal(result.ok, true, result.error);
  assert.equal(w.stored.configurations[0].enabled, false);
  assert.deepEqual(plain(w.stored.configurations[0].legacyRules), [123, "opaque"]);
  assert.equal("rules" in w.stored.configurations[0], false);
  assert.deepEqual(w.calls.at(-1), ["remove", ["https://example.com/*"]]);
});

test("shared concrete grant survives first disable; discovery release observes newly enabled profile", async () => {
  const w = worker({ configurations: [profile("a"), profile("b")], configurationSchemaVersion: 3 }, ["https://example.com/*"]);
  await w.send({ type: "deleteConfiguration", id: "a" });
  assert.equal(w.calls.some(([type]) => type === "remove"), false);
  await w.send({ type: "releaseDiscoveryAccess", origin: "https://example.com/*" });
  assert.equal(w.calls.some(([type]) => type === "remove"), false);
  await w.send({ type: "saveConfiguration", configuration: { ...profile("b"), enabled: false } });
  assert.deepEqual(w.calls.at(-1), ["remove", ["https://example.com/*"]]);
});

test("concurrent migration, reads and saves cannot overwrite new state", async () => {
  const w = worker({ configurations: [{ ...profile("old"), rules: [9] }], configurationSchemaVersion: 1 });
  const results = await Promise.all([
    w.send({ type: "getState" }),
    w.send({ type: "saveConfiguration", configuration: profile("new") }),
    w.send({ type: "saveConfiguration", configuration: { ...profile("old"), name: "edited" } }),
  ]);
  assert.ok(results.every((result) => result.ok));
  assert.equal(w.stored.configurationSchemaVersion, 3);
  assert.deepEqual(w.stored.configurations.map(({ name }) => name), ["edited", "new"]);
  assert.equal(w.calls.filter(([type, value]) => type === "persist" && value.configurationSchemaVersion === 3).length, 1);
});

test("discovery rejects cross-origin before a second request and bounds readable same-origin redirects", async () => {
  const calls = [];
  const redirect = (location) => ({ status: 302, headers: new Headers({ location }) });
  await assert.rejects(discovery.fetchSameOrigin("https://example.com/", undefined, async (url, options) => {
    calls.push(url); assert.equal(options.redirect, "manual"); return redirect("https://other.test/");
  }), /Cross-origin/);
  assert.deepEqual(calls, ["https://example.com/"]);
  calls.length = 0;
  const result = await discovery.fetchSameOrigin("https://example.com/", undefined, async (url) => {
    calls.push(url); return calls.length === 1 ? redirect("/final") : { ok: true, url };
  });
  assert.equal(result.url, "https://example.com/final");
  assert.equal(calls.length, 2);
  calls.length = 0;
  await assert.rejects(discovery.fetchSameOrigin("https://example.com/", undefined, async (url) => {
    calls.push(url); return redirect("/again");
  }), /maximum five/);
  assert.equal(calls.length, 6);
  calls.length = 0;
  await assert.rejects(discovery.fetchSameOrigin("https://example.com/", undefined, async (url) => {
    calls.push(url); return { type: "opaqueredirect" };
  }), /final site URL/);
  assert.equal(calls.length, 1);
});

test("discovery click requests one origin; releases new grants on success/failure, never preexisting ones", async () => {
  for (const preexisting of [false, true]) for (const failure of [false, true]) for (const denied of [false, true]) {
    const requests = [], releases = [];
    const nodes = new Map();
    const node = (id) => {
      if (!nodes.has(id)) nodes.set(id, { value: "", checked: true });
      return nodes.get(id);
    };
    node("#site-url").value = "https://example.com/private";
    const context = {
      ...discovery, URL, document: { querySelector: node },
      chrome: { permissions: {
        contains: async () => preexisting,
        request: async (request) => { requests.push(plain(request)); return !denied; },
      }, runtime: { sendMessage: async (message) => { releases.push(plain(message)); return { ok: true }; } } },
      DOMParser: class { parseFromString() { return { querySelector: () => null }; } },
      fetchSameOrigin: async () => { if (failure) throw new Error("failed fetch"); return { response: { text: async () => "" }, url: "https://example.com/private" }; },
      extractMetadata: () => ({ name: "Imported" }), hasSuitableInstallIcon: () => false,
      setDiscoveryStatus() {}, showDiscoveredIcon() {}, syncDisplayControls() {}, syncThemeColorControls() {},
      preferredDefaultColor: () => "#ffffff", updateColorControl() {}, updateColorValue() {}, showToast() {},
    };
    const source = read("options/options.js");
    runInNewContext(source.slice(source.indexOf("async function discoverSite()"), source.indexOf("function extractMetadata")), context);
    await context.discoverSite();
    assert.deepEqual(requests, [{ origins: ["https://example.com/*"] }]);
    assert.equal(releases.length, !preexisting && !denied ? 1 : 0);
    if (!failure && !denied) assert.equal(node("#configuration-enabled").checked, false);
    assert.equal(node("#discover-site").disabled, false);
  }
});
