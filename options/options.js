import {
  createConfiguration,
  derivedActiveTabColor,
  editableHexColor,
  hasSuitableInstallIcon,
  permissionOrigins,
  resolvedActiveTabColor,
  validateConfiguration,
  withDisplayPreferences,
  withThemeColor,
} from "../lib/config.js";
import {
  createGeneratedIcon,
  inferManifest,
  normalizeSiteUrl,
  originMatchPattern,
  resolveImportedManifest,
} from "../lib/site-discovery.js";

const elements = {
  configurationList: document.querySelector("#configuration-list"),
  templateList: document.querySelector("#template-list"),
  search: document.querySelector("#template-search"),
  dialog: document.querySelector("#editor"),
  form: document.querySelector("#editor-form"),
  error: document.querySelector("#form-error"),
  status: document.querySelector("#status"),
};

let templates = [];
let configurations = [];
let toastTimer;

document.querySelector("#new-configuration").addEventListener("click", () => openEditor());
document.querySelector("#close-editor").addEventListener("click", closeEditor);
document.querySelector("#cancel-editor").addEventListener("click", closeEditor);
document.querySelector("#export").addEventListener("click", exportConfigurations);
document.querySelector("#import").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", importConfigurations);
elements.search.addEventListener("input", renderTemplates);
elements.form.addEventListener("submit", saveEditor);
elements.configurationList.addEventListener("click", handleConfigurationClick);
elements.configurationList.addEventListener("change", handleConfigurationToggle);
elements.templateList.addEventListener("click", handleTemplateClick);
document.querySelector("#active-tab-color-enabled").addEventListener("change", updateColorControl);
document.querySelector("#active-tab-color-auto").addEventListener("change", updateColorControl);
document.querySelector("#active-tab-color").addEventListener("input", updateColorValue);
document.querySelector("#active-tab-color-value").addEventListener("input", updateColorFromText);
document.querySelector("#discover-site").addEventListener("click", discoverSite);
document.querySelector("#manifest-display").addEventListener("change", () => updateManifestDisplay("display"));
document
  .querySelector("#manifest-display-override")
  .addEventListener("change", () => updateManifestDisplay("override"));
document.querySelector("#manifest-json").addEventListener("input", syncManifestControlsFromJson);
document.querySelector("#theme-color-enabled").addEventListener("change", updateManifestThemeColor);
document.querySelector("#manifest-theme-color").addEventListener("input", updateThemeColorValue);
document.querySelector("#manifest-theme-color-value").addEventListener("input", updateThemeColorFromText);

await loadState();

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  if (!response?.ok) return showToast(response?.error || "Could not load settings.");
  templates = response.templates;
  configurations = response.configurations;
  renderConfigurations();
  renderTemplates();
}

function renderConfigurations() {
  elements.configurationList.replaceChildren();
  if (!configurations.length) {
    elements.configurationList.append(
      emptyState("No configurations yet", "Start with a template or create one from scratch."),
    );
    return;
  }

  configurations.forEach((configuration) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = configuration.id;
    const top = div("card-top");
    const title = document.createElement("div");
    title.append(heading(configuration.name), paragraph(configuration.matchPatterns.join(" · ")));
    const toggle = document.createElement("label");
    toggle.className = "switch";
    toggle.title = configuration.enabled ? "Disable" : "Enable";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = configuration.enabled;
    checkbox.dataset.action = "toggle";
    checkbox.setAttribute("aria-label", `${configuration.enabled ? "Disable" : "Enable"} ${configuration.name}`);
    toggle.append(checkbox, document.createElement("span"));
    top.append(title, toggle);

    const meta = div("card-meta");
    const enabledRuleCount = configuration.rules.filter((rule) => rule.enabled !== false).length;
    meta.append(
      pill(configuration.enabled ? "Active" : "Inactive", configuration.enabled),
      pill(
        configuration.rules.length
          ? `${enabledRuleCount}/${configuration.rules.length} network rules enabled`
          : "No network rules",
      ),
      pill(configuration.replaceExistingManifest ? "Replaces manifest" : "Adds manifest"),
    );
    const tabColor = resolvedActiveTabColor(configuration);
    if (tabColor) {
      const label = configuration.pageOverrides?.activeTabColorMode === "theme" ? "Tab auto" : "Tab";
      meta.append(pill(`${label} ${tabColor.toUpperCase()}`));
    }
    const actions = div("card-actions");
    const source = document.createElement("span");
    source.className = "source";
    source.textContent = configuration.templateId ? "Created from template" : "Custom";
    actions.append(source, actionButtons());
    card.append(top, meta, actions);
    elements.configurationList.append(card);
  });
}

function renderTemplates() {
  const query = elements.search.value.trim().toLowerCase();
  const visible = templates.filter((template) =>
    [template.name, template.summary, template.source.label].some((value) => value.toLowerCase().includes(query)),
  );
  elements.templateList.replaceChildren();
  visible.forEach((template) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = template.id;
    card.append(heading(template.name), paragraph(template.summary));
    const meta = div("card-meta");
    meta.append(pill(template.matchPatterns[0].replace(/^https?:\/\//, "").replace(/\/\*$/, "")));
    if (template.rules.length) meta.append(pill(`${template.rules.length} network rule`));
    const actions = div("card-actions");
    const source = document.createElement("span");
    source.className = "source";
    source.textContent = template.source.label;
    source.title = `${template.source.repository}/blob/${template.source.revision}/${template.source.path}`;
    const button = document.createElement("button");
    button.className = "button quiet";
    button.type = "button";
    button.dataset.action = "use-template";
    button.textContent = "Use template";
    actions.append(source, button);
    card.append(meta, actions);
    elements.templateList.append(card);
  });
  if (!visible.length) elements.templateList.append(emptyState("No templates found", "Try another search."));
}

function openEditor(configuration) {
  const value = configuration || {
    id: "",
    templateId: null,
    name: "",
    enabled: false,
    matchPatterns: ["https://example.com/*"],
    replaceExistingManifest: true,
    pageOverrides: {},
    manifest: {
      name: "Example",
      short_name: "Example",
      start_url: "/",
      scope: "/",
      display: "standalone",
      icons: [],
    },
    rules: [],
  };
  document.querySelector("#editor-title").textContent = value.id ? `Edit ${value.name}` : "New configuration";
  document.querySelector("#configuration-id").value = value.id;
  document.querySelector("#template-id").value = value.templateId || "";
  document.querySelector("#configuration-name").value = value.name;
  document.querySelector("#match-patterns").value = value.matchPatterns.join("\n");
  document.querySelector("#configuration-enabled").checked = value.enabled;
  document.querySelector("#replace-manifest").checked = value.replaceExistingManifest;
  document.querySelector("#manifest-json").value = JSON.stringify(value.manifest, null, 2);
  const activeTabColor = value.pageOverrides?.activeTabColor;
  const autoActiveTabColor = value.pageOverrides?.activeTabColorMode === "theme";
  const colorInput = document.querySelector("#active-tab-color");
  document.querySelector("#active-tab-color-enabled").checked = Boolean(activeTabColor || autoActiveTabColor);
  document.querySelector("#active-tab-color-auto").checked = autoActiveTabColor;
  colorInput.value = resolvedActiveTabColor(value) || preferredDefaultColor(value.manifest);
  updateColorControl();
  updateColorValue();
  syncDisplayControls(value.manifest);
  syncThemeColorControls(value.manifest);
  document.querySelector("#rules-json").value = JSON.stringify(value.rules, null, 2);
  document.querySelector("#site-url").value = "";
  setDiscoveryStatus("");
  elements.error.textContent = "";
  elements.dialog.showModal();
  document.querySelector("#configuration-name").focus();
}

function closeEditor() {
  elements.dialog.close();
}

async function saveEditor(event) {
  event.preventDefault();
  elements.error.textContent = "";
  let configuration;
  try {
    const existing = configurations.find((item) => item.id === document.querySelector("#configuration-id").value);
    configuration = {
      ...existing,
      id: document.querySelector("#configuration-id").value,
      templateId: document.querySelector("#template-id").value || null,
      name: document.querySelector("#configuration-name").value.trim(),
      enabled: document.querySelector("#configuration-enabled").checked,
      matchPatterns: document
        .querySelector("#match-patterns")
        .value.split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      replaceExistingManifest: document.querySelector("#replace-manifest").checked,
      pageOverrides: {
        ...(existing?.pageOverrides ?? {}),
        activeTabColor:
          document.querySelector("#active-tab-color-enabled").checked &&
          !document.querySelector("#active-tab-color-auto").checked
          ? document.querySelector("#active-tab-color").value
          : null,
        activeTabColorMode:
          document.querySelector("#active-tab-color-enabled").checked &&
          document.querySelector("#active-tab-color-auto").checked
            ? "theme"
            : null,
      },
      manifest: JSON.parse(document.querySelector("#manifest-json").value),
      rules: JSON.parse(document.querySelector("#rules-json").value),
    };
  } catch (error) {
    elements.error.textContent = `Invalid JSON: ${error.message}`;
    return;
  }

  const errors = validateConfiguration(configuration);
  if (errors.length) {
    elements.error.textContent = errors.join(" ");
    return;
  }
  if (configuration.enabled && !(await requestSiteAccess(configuration))) return;

  const response = await chrome.runtime.sendMessage({ type: "saveConfiguration", configuration });
  if (!response.ok) {
    elements.error.textContent = response.error;
    return;
  }
  closeEditor();
  await loadState();
  showToast(`${configuration.name} saved. Reload matching pages to apply.`);
}

function updateColorControl() {
  const enabled = document.querySelector("#active-tab-color-enabled").checked;
  const auto = document.querySelector("#active-tab-color-auto");
  if (!enabled) auto.checked = false;
  auto.disabled = !enabled;
  const manualDisabled = !enabled || auto.checked;
  document.querySelector("#active-tab-color").disabled = manualDisabled;
  document.querySelector("#active-tab-color-value").disabled = manualDisabled;
  updateActiveTabColorPreview();
}

function updateColorValue() {
  const valueInput = document.querySelector("#active-tab-color-value");
  valueInput.value = document.querySelector("#active-tab-color").value;
  valueInput.setCustomValidity("");
}

function updateColorFromText() {
  const valueInput = document.querySelector("#active-tab-color-value");
  if (/^#[\da-f]{6}$/i.test(valueInput.value)) {
    document.querySelector("#active-tab-color").value = valueInput.value;
    valueInput.setCustomValidity("");
  } else {
    valueInput.setCustomValidity("Enter a six-digit hexadecimal color such as #232F3E.");
  }
}

function updateActiveTabColorPreview() {
  const note = document.querySelector("#active-tab-color-note");
  if (!document.querySelector("#active-tab-color-auto").checked) {
    note.textContent =
      "Applied to the root HTML element as a user-origin style. The color may appear in overscroll or gaps on pages that do not cover the full viewport.";
    return;
  }
  try {
    const manifest = JSON.parse(document.querySelector("#manifest-json").value);
    const color = derivedActiveTabColor(manifest.theme_color);
    if (!color) {
      note.textContent = "Automatic color requires a hexadecimal manifest theme color.";
      return;
    }
    document.querySelector("#active-tab-color").value = color;
    const value = document.querySelector("#active-tab-color-value");
    value.value = color;
    value.setCustomValidity("");
    note.textContent = `Derived ${color.toUpperCase()} from ${editableHexColor(manifest.theme_color).toUpperCase()} using Chromium's 1.3 contrast target.`;
  } catch {
    note.textContent = "Fix the manifest JSON to calculate an automatic active tab color.";
  }
}

function preferredDefaultColor(manifest) {
  return [manifest.background_color, manifest.theme_color].find((color) => /^#[\da-f]{6}$/i.test(color)) || "#ffffff";
}

function updateManifestDisplay(field) {
  try {
    const manifest = JSON.parse(document.querySelector("#manifest-json").value);
    const updated =
      field === "display"
        ? { ...manifest, display: document.querySelector("#manifest-display").value }
        : withDisplayPreferences(
            manifest,
            manifest.display || "browser",
            document.querySelector("#manifest-display-override").value,
          );
    document.querySelector("#manifest-json").value = JSON.stringify(updated, null, 2);
    syncDisplayControls(updated);
    elements.error.textContent = "";
  } catch (error) {
    elements.error.textContent = `Fix the manifest JSON before changing window behavior: ${error.message}`;
  }
}

function syncManifestControlsFromJson() {
  try {
    const manifest = JSON.parse(document.querySelector("#manifest-json").value);
    syncDisplayControls(manifest);
    syncThemeColorControls(manifest);
  } catch {}
}

function syncDisplayControls(manifest) {
  setDisplaySelect(document.querySelector("#manifest-display"), manifest.display || "browser");
  const overrides = Array.isArray(manifest.display_override) ? manifest.display_override : [];
  setDisplaySelect(document.querySelector("#manifest-display-override"), overrides[0] || "");
  document.querySelector("#display-override-note").textContent =
    overrides.length > 1
      ? `This manifest has ${overrides.length} ordered overrides. Changing this selection replaces the list.`
      : "Tried before the fallback display mode.";
}

function setDisplaySelect(select, value) {
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
    return;
  }
  const custom = select.querySelector(".custom-option");
  custom.textContent = `Custom: ${value}`;
  select.value = custom.value;
}

function updateManifestThemeColor() {
  try {
    const manifest = JSON.parse(document.querySelector("#manifest-json").value);
    const themeColor = document.querySelector("#theme-color-enabled").checked
      ? document.querySelector("#manifest-theme-color").value
      : null;
    const updated = withThemeColor(manifest, themeColor);
    document.querySelector("#manifest-json").value = JSON.stringify(updated, null, 2);
    syncThemeColorControls(updated);
    elements.error.textContent = "";
  } catch (error) {
    elements.error.textContent = `Fix the manifest JSON before changing its theme color: ${error.message}`;
  }
}

function updateThemeColorValue() {
  const picker = document.querySelector("#manifest-theme-color");
  const value = document.querySelector("#manifest-theme-color-value");
  value.value = picker.value;
  value.setCustomValidity("");
  updateManifestThemeColor();
}

function updateThemeColorFromText() {
  const value = document.querySelector("#manifest-theme-color-value");
  const color = editableHexColor(value.value);
  if (!color) {
    value.setCustomValidity("Enter a hexadecimal color such as #232F3E.");
    return;
  }
  value.value = color;
  value.setCustomValidity("");
  document.querySelector("#manifest-theme-color").value = color;
  updateManifestThemeColor();
}

function syncThemeColorControls(manifest) {
  const enabled = typeof manifest.theme_color === "string" && manifest.theme_color.length > 0;
  const color = editableHexColor(manifest.theme_color);
  const picker = document.querySelector("#manifest-theme-color");
  const value = document.querySelector("#manifest-theme-color-value");
  document.querySelector("#theme-color-enabled").checked = enabled;
  picker.disabled = !enabled;
  value.disabled = !enabled;
  if (color) {
    picker.value = color;
    value.value = color;
  } else {
    picker.value = "#ffffff";
    value.value = "#ffffff";
  }
  value.setCustomValidity("");
  document.querySelector("#theme-color-note").textContent =
    enabled && !color
      ? `The custom value “${manifest.theme_color}” is preserved in JSON. Choose a color to replace it.`
      : "Updates the manifest's theme_color value.";
  updateActiveTabColorPreview();
}

async function discoverSite() {
  const button = document.querySelector("#discover-site");
  let url;
  try {
    url = normalizeSiteUrl(document.querySelector("#site-url").value);
    document.querySelector("#site-url").value = url.href;
  } catch (error) {
    setDiscoveryStatus(error.message, true);
    return;
  }

  const origin = originMatchPattern(url);
  try {
    if (!(await chrome.permissions.request({ origins: [origin] }))) {
      setDiscoveryStatus("Site access is required to inspect this website.", true);
      return;
    }
  } catch (error) {
    setDiscoveryStatus(`Could not request site access: ${error.message}`, true);
    return;
  }

  button.disabled = true;
  button.textContent = "Importing…";
  showDiscoveredIcon([]);
  setDiscoveryStatus("Reading website metadata…");
  try {
    const pageResponse = await fetch(url.href);
    if (!pageResponse.ok) throw new Error(`Website returned HTTP ${pageResponse.status}.`);
    const pageUrl = pageResponse.url;
    const pageDocument = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
    const baseHref = pageDocument.querySelector("base[href]")?.getAttribute("href");
    const pageBaseUrl = baseHref ? new URL(baseHref, pageUrl).href : pageUrl;
    const manifestLink = pageDocument.querySelector('link[rel~="manifest"][href]');
    let manifest;
    let importedExistingManifest = false;

    if (manifestLink) {
      const manifestUrl = new URL(manifestLink.getAttribute("href"), pageBaseUrl);
      if (manifestUrl.origin !== new URL(pageUrl).origin) {
        throw new Error("The manifest is hosted on another domain and needs separate site access.");
      }
      const manifestResponse = await fetch(manifestUrl.href);
      if (!manifestResponse.ok) throw new Error(`Manifest returned HTTP ${manifestResponse.status}.`);
      manifest = resolveImportedManifest(await manifestResponse.json(), manifestResponse.url);
      importedExistingManifest = true;
    } else {
      manifest = inferManifest(pageUrl, extractMetadata(pageDocument, pageBaseUrl));
    }

    let generatedFallback = false;
    if (!hasSuitableInstallIcon(manifest.icons)) {
      manifest.icons = [...(Array.isArray(manifest.icons) ? manifest.icons : []), createGeneratedIcon(pageUrl)];
      generatedFallback = true;
    }

    document.querySelector("#configuration-name").value =
      manifest.name || manifest.short_name || new URL(pageUrl).hostname;
    document.querySelector("#template-id").value = "";
    document.querySelector("#match-patterns").value = originMatchPattern(pageUrl);
    document.querySelector("#configuration-enabled").checked = false;
    document.querySelector("#manifest-json").value = JSON.stringify(manifest, null, 2);
    syncDisplayControls(manifest);
    syncThemeColorControls(manifest);
    const defaultColor = preferredDefaultColor(manifest);
    document.querySelector("#active-tab-color").value = defaultColor;
    updateColorControl();
    if (!document.querySelector("#active-tab-color-auto").checked) updateColorValue();

    const iconMessage = generatedFallback
      ? " Generated a fallback icon because the site did not provide an installable icon."
      : "";
    showDiscoveredIcon(manifest.icons, generatedFallback);
    setDiscoveryStatus(
      `${importedExistingManifest ? "Existing manifest imported." : "Draft built from page metadata."}${iconMessage} Review the values before saving.`,
    );
  } catch (error) {
    setDiscoveryStatus(`Could not import website: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "Import website";
  }
}

function extractMetadata(document, pageUrl) {
  const content = (selector) => document.querySelector(selector)?.content?.trim() || "";
  const name =
    content('meta[name="application-name"]') ||
    content('meta[name="apple-mobile-web-app-title"]') ||
    content('meta[property="og:site_name"]') ||
    document.title.trim();
  const icons = [...document.querySelectorAll('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]')]
    .map((link) => ({
      src: new URL(link.getAttribute("href"), pageUrl).href,
      sizes: link.getAttribute("sizes") || "",
      type: link.type || imageTypeFromUrl(link.getAttribute("href")),
      purpose: "any",
    }))
    .filter((icon) => icon.sizes && icon.type);
  return {
    name,
    shortName: content('meta[name="apple-mobile-web-app-title"]'),
    description: content('meta[name="description"]') || content('meta[property="og:description"]'),
    themeColor: content('meta[name="theme-color"]'),
    icons,
  };
}

function imageTypeFromUrl(url) {
  const extension = new URL(url, "https://example.invalid").pathname.split(".").pop().toLowerCase();
  return { png: "image/png", svg: "image/svg+xml", webp: "image/webp" }[extension] || "";
}

function showDiscoveredIcon(icons, generated = false) {
  const preview = document.querySelector("#discovered-icon");
  const icon = generated
    ? icons.at(-1)
    : icons.find((value) => value.sizes?.split(/\s+/).includes("192x192")) || icons[0];
  preview.src = icon?.src || "";
  preview.hidden = !icon;
  preview.alt = generated ? "Generated fallback icon" : "Discovered website icon";
}

function setDiscoveryStatus(message, error = false) {
  const status = document.querySelector("#discovery-status");
  status.textContent = message;
  status.classList.toggle("error", error);
  if (!message || error) showDiscoveredIcon([]);
}

async function handleConfigurationClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const configuration = configurations.find((item) => item.id === button.closest(".card").dataset.id);
  if (button.dataset.action === "edit") openEditor(configuration);
  if (button.dataset.action === "delete") {
    if (!confirm(`Delete “${configuration.name}”? The bundled template will remain available.`)) return;
    const response = await chrome.runtime.sendMessage({ type: "deleteConfiguration", id: configuration.id });
    if (!response.ok) return showToast(response.error);
    await loadState();
    showToast(`${configuration.name} deleted.`);
  }
}

async function handleConfigurationToggle(event) {
  if (event.target.dataset.action !== "toggle") return;
  const configuration = configurations.find((item) => item.id === event.target.closest(".card").dataset.id);
  const updated = { ...configuration, enabled: event.target.checked };
  if (updated.enabled && !(await requestSiteAccess(updated))) {
    event.target.checked = false;
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "saveConfiguration", configuration: updated });
  if (!response.ok) return showToast(response.error);
  await loadState();
  showToast(`${configuration.name} ${updated.enabled ? "enabled" : "disabled"}. Reload matching pages to apply.`);
}

function handleTemplateClick(event) {
  const button = event.target.closest('button[data-action="use-template"]');
  if (!button) return;
  const template = templates.find((item) => item.id === button.closest(".card").dataset.id);
  const configuration = createConfiguration({ ...template, enabledByDefault: false });
  configuration.id = "";
  openEditor(configuration);
}

async function requestSiteAccess(configuration) {
  const origins = permissionOrigins(configuration.matchPatterns);
  const hasAccess = await chrome.permissions.contains({ origins });
  if (hasAccess) return true;
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    elements.error.textContent = "Site access is required before this configuration can be enabled.";
    showToast("Site access was not granted.");
  }
  return granted;
}

function exportConfigurations() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 1, configurations }, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pwa-profiles-settings-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Settings exported.");
}

async function importConfigurations(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  if (!confirm("Importing replaces all current configurations. Imported configurations start disabled.")) return;
  try {
    const data = JSON.parse(await file.text());
    const response = await chrome.runtime.sendMessage({
      type: "replaceConfigurations",
      configurations: data.configurations,
    });
    if (!response.ok) throw new Error(response.error);
    await loadState();
    showToast("Settings imported. Review and enable the configurations you trust.");
  } catch (error) {
    showToast(`Import failed: ${error.message}`);
  }
}

function actionButtons() {
  const wrapper = document.createElement("div");
  const edit = document.createElement("button");
  edit.className = "button quiet";
  edit.type = "button";
  edit.dataset.action = "edit";
  edit.textContent = "Edit";
  const remove = document.createElement("button");
  remove.className = "button quiet danger";
  remove.type = "button";
  remove.dataset.action = "delete";
  remove.textContent = "Delete";
  wrapper.append(edit, remove);
  return wrapper;
}

function heading(text) {
  const value = document.createElement("h3");
  value.textContent = text;
  return value;
}

function paragraph(text) {
  const value = document.createElement("p");
  value.textContent = text;
  return value;
}

function pill(text, active = false) {
  const value = document.createElement("span");
  value.className = `pill${active ? " active" : ""}`;
  value.textContent = text;
  return value;
}

function div(className) {
  const value = document.createElement("div");
  value.className = className;
  return value;
}

function emptyState(title, description) {
  const value = div("empty");
  const strong = document.createElement("strong");
  strong.textContent = title;
  value.append(strong, document.createTextNode(description));
  return value;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.status.textContent = message;
  elements.status.classList.add("visible");
  toastTimer = setTimeout(() => elements.status.classList.remove("visible"), 3600);
}
