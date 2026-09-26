import {
  CONFIGURATIONS_KEY,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  activeTabColorOverrideCss,
  configurationForUrl,
  grantIsNeeded,
  hasSiteAccess,
  permissionOrigins,
  validateConfiguration,
} from "./lib/config.js";
import { createGeneratedIcon } from "./lib/site-discovery.js";
import { migrateConfigurations, preserveLegacyRules } from "./lib/migrations.js";

const CONTENT_SCRIPT_ID = "better-pwas-managed";
const ENABLED_ICON = { 16: "images/icon16.png", 32: "images/icon32.png", 48: "images/icon48.png" };
const DISABLED_ICON = { 16: "images/iconDisabled16.png", 32: "images/iconDisabled32.png", 48: "images/iconDisabled48.png" };
const ENABLED_TEXT = "PWA Profiles: Replacement manifest active";
const DISABLED_TEXT = "PWA Profiles: No active profile";

let reconciliation = Promise.resolve();
let configurationOperations = Promise.resolve();
let actionUpdates = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => queueReconciliation());
chrome.runtime.onStartup.addListener(() => queueReconciliation());
chrome.permissions.onAdded.addListener(() => queueReconciliation());
chrome.permissions.onRemoved.addListener(() => queueReconciliation());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONFIGURATIONS_KEY]) queueReconciliation();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(({ tabId }) => queueActionUpdate(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const reset = Boolean(changeInfo.url || changeInfo.status === "loading");
  if (reset || changeInfo.status === "complete") return queueActionUpdate(tabId, reset ? "navigation" : "refresh");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

queueReconciliation();

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "getState":
      assertManagementSender(sender);
      return {
        ok: true,
        templates: await loadTemplates(),
        configurations: await getConfigurations(),
      };
    case "saveConfiguration":
      assertManagementSender(sender);
      return mutateConfigurations(() => saveConfiguration(message.configuration));
    case "deleteConfiguration":
      assertManagementSender(sender);
      return mutateConfigurations(() => deleteConfiguration(message.id));
    case "replaceConfigurations":
      assertManagementSender(sender);
      return mutateConfigurations(() => replaceConfigurations(message.configurations, message.schemaVersion));
    case "releaseDiscoveryAccess":
      assertManagementSender(sender);
      return mutateConfigurations(async () => {
        const [origin] = permissionOrigins([message.origin]);
        if (origin !== message.origin) throw new Error("Expected one concrete origin.");
        await removeUnusedAccess(await readConfigurations(), [origin]);
        return { ok: true };
      });
    case "reconcile":
      assertManagementSender(sender);
      await queueReconciliation();
      return { ok: true };
    case "getConfigurationForPage":
      if (!sender.tab?.url) return { ok: false, error: "Page URL is unavailable." };
      return getConfigurationForPage(sender.tab.url, sender.tab.id);
    case "manifestInjected":
      // Re-read the current document, not the notifying sender: a notification
      // from a replaced document must not mark the next navigation as injected.
      if (sender.tab?.id) await queueActionUpdate(sender.tab.id, "injected");
      return { ok: true };
    default:
      return { ok: false, error: "Unknown request." };
  }
}

function assertManagementSender(sender) {
  if (!sender.url?.startsWith(chrome.runtime.getURL(""))) {
    throw new Error("This request is only available from the settings page.");
  }
}

async function loadTemplates() {
  const catalog = await fetch(chrome.runtime.getURL("templates/catalog.json")).then((response) => {
    if (!response.ok) throw new Error("Could not load the template catalog.");
    return response.json();
  });

  return Promise.all(
    catalog.templates.map(async (template) => ({
      ...template,
      replaceExistingManifest: template.replaceExistingManifest !== false,
      manifest: await fetch(chrome.runtime.getURL(template.manifestPath)).then((response) => {
        if (!response.ok) throw new Error(`Could not load ${template.manifestPath}.`);
        return response.json();
      }).then((manifest) => {
        const siteUrl = new URL(template.matchPatterns[0].replace(/\*$/, ""));
        manifest.icons = [createGeneratedIcon(siteUrl)];
        return manifest;
      }),
    })),
  );
}

function serializeConfigurations(operation) {
  const result = configurationOperations.then(operation);
  configurationOperations = result.catch(() => {});
  return result;
}

function getConfigurations() {
  return serializeConfigurations(readConfigurations);
}

async function mutateConfigurations(operation) {
  const result = await serializeConfigurations(operation);
  await queueReconciliation();
  return result;
}

async function removeUnusedAccess(configurations, candidates) {
  const { origins = [] } = await chrome.permissions.getAll();
  const unused = origins.filter((origin) => (!candidates || candidates.includes(origin)) &&
    !grantIsNeeded(origin, configurations));
  if (unused.length) await chrome.permissions.remove({ origins: unused });
}

async function readConfigurations() {
  const stored = await chrome.storage.local.get([CONFIGURATIONS_KEY, SCHEMA_VERSION_KEY]);
  if (Array.isArray(stored[CONFIGURATIONS_KEY])) {
    if ((stored[SCHEMA_VERSION_KEY] ?? 1) < SCHEMA_VERSION) {
      const configurations = migrateConfigurations(stored[CONFIGURATIONS_KEY], stored[SCHEMA_VERSION_KEY] ?? 1, await loadTemplates());
      await chrome.storage.local.set({
        [CONFIGURATIONS_KEY]: configurations,
        [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
      });
      return configurations;
    }
    return stored[CONFIGURATIONS_KEY];
  }

  const configurations = [];
  await chrome.storage.local.set({
    [CONFIGURATIONS_KEY]: configurations,
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
  });
  return configurations;
}

async function saveConfiguration(configuration) {
  [configuration] = preserveLegacyRules([configuration]);
  const errors = validateConfiguration(configuration);
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const configurations = await readConfigurations();
  const index = configurations.findIndex((item) => item.id === configuration.id);
  const value = {
    ...structuredClone(configuration),
    id: configuration.id || crypto.randomUUID(),
    templateId: configuration.templateId ?? null,
    createdAt: configuration.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (index === -1) configurations.push(value);
  else configurations[index] = value;
  await chrome.storage.local.set({ [CONFIGURATIONS_KEY]: configurations });
  await removeUnusedAccess(configurations);
  return { ok: true, configuration: value };
}

async function deleteConfiguration(id) {
  const configurations = (await readConfigurations()).filter((item) => item.id !== id);
  await chrome.storage.local.set({ [CONFIGURATIONS_KEY]: configurations });
  await removeUnusedAccess(configurations);
  return { ok: true };
}

async function replaceConfigurations(configurations, schemaVersion = 1) {
  if (!Array.isArray(configurations)) return { ok: false, error: "Import must contain an array." };
  configurations = migrateConfigurations(configurations, schemaVersion, await loadTemplates());
  const errors = configurations.flatMap((configuration, index) =>
    validateConfiguration(configuration).map((error) => `Configuration ${index + 1}: ${error}`),
  );
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const imported = configurations.map((configuration) => ({
    ...structuredClone(configuration),
    id: configuration.id || crypto.randomUUID(),
    enabled: false,
    createdAt: configuration.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  await chrome.storage.local.set({ [CONFIGURATIONS_KEY]: imported, [SCHEMA_VERSION_KEY]: SCHEMA_VERSION });
  await removeUnusedAccess(imported);
  return { ok: true };
}

async function activeConfigurationForUrl(url) {
  for (const configuration of await getConfigurations()) {
    if (configurationForUrl([configuration], url) && await hasSiteAccess(configuration)) return configuration;
  }
  return null;
}

async function getConfigurationForPage(url, tabId) {
  const configuration = await activeConfigurationForUrl(url);
  if (!configuration) return { ok: true, configuration: null };
  const overrideCss = activeTabColorOverrideCss(configuration);
  if (overrideCss) {
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: overrideCss,
      origin: "USER",
    });
  }
  const manifest = resolveManifestUrls(configuration.manifest, url);
  await inlineExtensionImages(manifest);
  return {
    ok: true,
    configuration: {
      id: configuration.id,
      replaceExistingManifest: configuration.replaceExistingManifest,
      manifest,
    },
  };
}

function resolveManifestUrls(manifest, pageUrl) {
  const resolved = structuredClone(manifest);
  const pageOrigin = new URL("/", pageUrl);
  const resolve = (value) => {
    if (typeof value !== "string" || /^(data:|blob:|https?:|chrome-extension:)/.test(value)) {
      return value;
    }
    if (value.startsWith("icons/")) return chrome.runtime.getURL(`manifests/${value}`);
    return new URL(value, pageOrigin).href;
  };
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["src", "url", "action"].includes(key)) value[key] = resolve(child);
      else visit(child);
    }
  };
  if (resolved.start_url) resolved.start_url = resolve(resolved.start_url);
  if (resolved.scope) resolved.scope = resolve(resolved.scope);
  if (resolved.id && !/^[a-z][a-z\d+.-]*:/i.test(resolved.id)) resolved.id = resolve(resolved.id);
  visit(resolved);
  return resolved;
}

async function inlineExtensionImages(value) {
  if (Array.isArray(value)) {
    await Promise.all(value.map(inlineExtensionImages));
    return;
  }
  if (!value || typeof value !== "object") return;

  if (typeof value.src === "string" && value.src.startsWith(chrome.runtime.getURL(""))) {
    const response = await fetch(value.src);
    if (!response.ok) throw new Error(`Could not load bundled image: ${value.src}`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    value.src = `data:${blob.type};base64,${btoa(binary)}`;
  }
  await Promise.all(Object.values(value).map(inlineExtensionImages));
}

function queueReconciliation() {
  reconciliation = reconciliation.then(reconcile).catch((error) => console.error(error));
  return reconciliation;
}

async function reconcile() {
  const configurations = await getConfigurations();
  const enabled = [];
  for (const configuration of configurations.filter((item) => item.enabled)) {
    if (await hasSiteAccess(configuration)) {
      enabled.push(configuration);
    }
  }

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  const matches = [...new Set(enabled.flatMap((configuration) => configuration.matchPatterns))];
  if (matches.length) {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        js: ["injectManifest.js"],
        matches,
        persistAcrossSessions: true,
        runAt: "document_start",
      },
    ]);
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => queueActionUpdate(tab.id)));
}

function queueActionUpdate(tabId, reason = "refresh") {
  // Serialize writes so a slow pre-injection read cannot overwrite a later
  // success or navigation reset. No per-tab state survives tab closure.
  actionUpdates = actionUpdates.then(async () => {
    const tab = await chrome.tabs.get(tabId);
    await updateActionForTab(tab, reason);
  }).catch(() => {}); // Tabs may close while an update is queued.
  return actionUpdates;
}

async function updateActionForTab(tab, reason = "refresh") {
  if (!tab?.id) return;
  if (!tab.url || !/^https?:\/\//.test(tab.url)) return setAction(DISABLED_ICON, DISABLED_TEXT, tab.id);
  const configuration = await activeConfigurationForUrl(tab.url);
  const hasAccess = Boolean(configuration);
  // The successful content script owns this document-scoped state. It outlives
  // service-worker suspension, disappears with the document, and needs no DOM
  // probing or persistent storage. Missing/failed injection has no responder.
  // During loading the outgoing document may still answer. Activation must not
  // undo a navigation reset; only a success notification or completion upgrades it.
  const canReadState = hasAccess && reason !== "navigation" && (
    tab.status !== "loading" || reason === "injected" ||
    await chrome.action.getTitle({ tabId: tab.id }) === ENABLED_TEXT
  );
  const injected = canReadState && await chrome.tabs.sendMessage(
    tab.id, { type: "getManifestState" }, { frameId: 0 },
  ).catch(() => null);
  await setAction(
    hasAccess ? ENABLED_ICON : DISABLED_ICON,
    hasAccess
      ? injected?.configurationId === configuration.id && injected.pageUrl === tab.url
        ? ENABLED_TEXT : `PWA Profiles: ${configuration.name} profile enabled`
      : DISABLED_TEXT,
    tab.id,
  );
}

function setAction(icon, title, tabId) {
  return Promise.all([
    chrome.action.setIcon({ path: icon, tabId }),
    chrome.action.setTitle({ title, tabId }),
  ]);
}
