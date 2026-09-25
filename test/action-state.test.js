import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as config from "../lib/config.js";

const source = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const configured = "PWA Profiles: Example profile enabled";
const active = "PWA Profiles: Replacement manifest active";
const disabled = "PWA Profiles: No active profile";

test("document-owned injection state survives completion, activation and worker restart, not navigation", async () => {
  const event = () => ({ addListener(handler) { this.handler = handler; } });
  let tab = { id: 41, url: "https://example.org/first" };
  let documentState = null;
  let holdReply;
  let title;
  let icon;
  const profile = { id: "test-profile", name: "Example", enabled: true, matchPatterns: ["https://example.org/*"], rules: [] };
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { onChanged: event(), local: { get: async () => ({ configurations: [profile], configurationSchemaVersion: 2 }) } },
    action: { onClicked: event(), getTitle: async () => title,
      setTitle: async (value) => { title = value.title; }, setIcon: async (value) => { icon = value.path; } },
    tabs: { onActivated: event(), onUpdated: event(),
      get: async () => { if (!tab) throw new Error("Tab closed"); return { ...tab }; },
      sendMessage: async (id, message, options) => {
        assert.equal(id, 41);
        assert.equal(message.type, "getManifestState");
        assert.equal(options.frameId, 0);
        if (holdReply) return new Promise((resolve) => { holdReply = resolve; });
        if (!documentState) throw new Error("No receiver in this document");
        return documentState;
      },
    },
    permissions: { contains: async () => true },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} },
  };
  const startWorker = () => runInNewContext(source.slice(source.indexOf("const CONTENT_SCRIPT_ID")), { ...config, chrome });
  const updated = async (change) => {
    if (change.status && tab) tab.status = change.status;
    await chrome.tabs.onUpdated.handler(41, change, tab);
    await new Promise(setImmediate);
  };
  const activated = async () => { await chrome.tabs.onActivated.handler({ tabId: 41 }); await new Promise(setImmediate); };
  const notify = () => new Promise((resolve) => chrome.runtime.onMessage.handler(
    { type: "manifestInjected", configurationId: profile.id }, { tab: { id: 41, url: "https://example.org/first" } }, resolve,
  ));
  startWorker();
  await updated({ status: "loading" });
  assert.equal(title, configured);
  documentState = { configurationId: profile.id, pageUrl: tab.url };
  await notify();
  assert.equal(title, active);
  await activated();
  assert.equal(title, active, "activation during the injected document's loading preserves success");
  await updated({ status: "complete" });
  assert.equal(title, active, "completion must not downgrade successful injection");
  await activated();
  assert.equal(title, active);
  startWorker(); // Same browser/content document, all worker-local variables recreated.
  await activated();
  assert.equal(title, active, "worker restart retains document success");

  await updated({ status: "loading" }); // Same-URL reload resets even while old document remains.
  assert.equal(title, configured);
  await activated();
  assert.equal(title, configured, "activation must not revive the outgoing document during reload");
  documentState = null; // New document fails to inject.
  await updated({ status: "complete" });
  await activated();
  assert.equal(title, configured, "failed injection must never become active");
  await notify(); // Delayed notification from the previous document.
  assert.equal(title, configured, "stale sender must not upgrade the current document");

  documentState = { configurationId: "other-profile", pageUrl: tab.url };
  await activated();
  assert.equal(title, configured, "a different configuration is not this profile's success");
  documentState = { configurationId: profile.id, pageUrl: tab.url };
  await notify();
  assert.equal(title, active);
  tab.url = "https://example.org/next";
  await updated({ url: tab.url });
  assert.equal(title, configured, "URL changes reset immediately");
  await activated();
  assert.equal(title, configured, "same-document URL change cannot revive an old URL's success");
  documentState = null;
  await updated({ status: "complete" });
  assert.equal(title, configured);

  // An older, slow response must settle before the later navigation reset.
  holdReply = true;
  const pending = activated();
  await new Promise(setImmediate);
  tab.url = "https://unconfigured.example/";
  const navigation = updated({ status: "loading", url: tab.url });
  holdReply({ configurationId: profile.id });
  holdReply = null;
  await Promise.all([pending, navigation]);
  assert.equal(title, disabled);
  await notify();
  await updated({ status: "complete" });
  assert.equal(title, disabled);
  assert.deepEqual(JSON.parse(JSON.stringify(icon)), { 16: "images/iconDisabled16.png", 32: "images/iconDisabled32.png", 48: "images/iconDisabled48.png" });

  tab = null;
  await activated(); // Closing a queued tab must not poison subsequent updates.
  tab = { id: 41, url: "https://example.org/reopened" };
  await updated({ status: "loading" });
  assert.equal(title, configured);
});
