import {
  CONFIGURATIONS_KEY,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  activeTabColorOverrideCss,
  configurationForUrl,
  createConfiguration,
  permissionOrigins,
  validateConfiguration,
} from "./lib/config.js";
import { createGeneratedIcon } from "./lib/site-discovery.js";

const CONTENT_SCRIPT_ID = "better-pwas-managed";
const ENABLED_ICON = "images/icon48.png";
const DISABLED_ICON = "images/iconDisabled48.png";
const ENABLED_TEXT = "Better PWAs: replacement manifest active";
const DISABLED_TEXT = "Better PWAs: no active configuration";

let reconciliation = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => queueReconciliation());
chrome.runtime.onStartup.addListener(() => queueReconciliation());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONFIGURATIONS_KEY]) queueReconciliation();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(updateActionForTab).catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateActionForTab(tab);
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
      return saveConfiguration(message.configuration);
    case "deleteConfiguration":
      assertManagementSender(sender);
      return deleteConfiguration(message.id);
    case "replaceConfigurations":
      assertManagementSender(sender);
      return replaceConfigurations(message.configurations);
    case "getConfigurationForPage":
      if (!sender.tab?.url) return { ok: false, error: "Page URL is unavailable." };
      return getConfigurationForPage(sender.tab.url, sender.tab.id);
    case "manifestInjected":
      if (sender.tab?.id && sender.tab.url) {
        const configuration = configurationForUrl(await getConfigurations(), sender.tab.url);
        if (configuration?.id === message.configurationId) {
          await setAction(ENABLED_ICON, ENABLED_TEXT, sender.tab.id);
        }
      }
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
      rules: template.rules ?? [],
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

async function getConfigurations() {
  const stored = await chrome.storage.local.get([CONFIGURATIONS_KEY, SCHEMA_VERSION_KEY]);
  if (Array.isArray(stored[CONFIGURATIONS_KEY])) {
    if (stored[SCHEMA_VERSION_KEY] !== SCHEMA_VERSION) {
      await chrome.storage.local.set({ [SCHEMA_VERSION_KEY]: SCHEMA_VERSION });
    }
    return stored[CONFIGURATIONS_KEY];
  }

  const templates = await loadTemplates();
  const configurations = templates
    .filter((template) => template.enabledByDefault)
    .map((template) => createConfiguration(template, `default-${template.id}`));
  await chrome.storage.local.set({
    [CONFIGURATIONS_KEY]: configurations,
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
  });
  return configurations;
}

async function saveConfiguration(configuration) {
  const errors = validateConfiguration(configuration);
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const configurations = await getConfigurations();
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
  return { ok: true, configuration: value };
}

async function deleteConfiguration(id) {
  const configurations = (await getConfigurations()).filter((item) => item.id !== id);
  await chrome.storage.local.set({ [CONFIGURATIONS_KEY]: configurations });
  return { ok: true };
}

async function replaceConfigurations(configurations) {
  if (!Array.isArray(configurations)) return { ok: false, error: "Import must contain an array." };
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
  await chrome.storage.local.set({ [CONFIGURATIONS_KEY]: imported });
  return { ok: true };
}

async function getConfigurationForPage(url, tabId) {
  const configuration = configurationForUrl(await getConfigurations(), url);
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
    if (await chrome.permissions.contains({ origins: permissionOrigins(configuration.matchPatterns) })) {
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

  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const rules = enabled.flatMap((configuration) =>
    configuration.rules
      .filter((rule) => rule.enabled !== false)
      .map((rule) => {
        const { name: _name, enabled: _enabled, id: _id, ...declarativeRule } = rule;
        return declarativeRule;
      }),
  );
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: rules.map((rule, index) => ({ ...rule, id: index + 1 })),
  });
}

async function updateActionForTab(tab) {
  if (!tab?.id || !tab.url) return;
  const configuration = configurationForUrl(await getConfigurations(), tab.url);
  const hasAccess =
    configuration &&
    (await chrome.permissions.contains({ origins: permissionOrigins(configuration.matchPatterns) }));
  await setAction(
    hasAccess ? ENABLED_ICON : DISABLED_ICON,
    hasAccess ? `Better PWAs: ${configuration.name} configured` : DISABLED_TEXT,
    tab.id,
  );
}

function setAction(icon, title, tabId) {
  return Promise.all([
    chrome.action.setIcon({ path: { 48: icon }, tabId }),
    chrome.action.setTitle({ title, tabId }),
  ]);
}
