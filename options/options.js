import { createConfiguration, permissionOrigins, validateConfiguration } from "../lib/config.js";

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
document.querySelector("#active-tab-color").addEventListener("input", updateColorValue);
document.querySelector("#active-tab-color-value").addEventListener("input", updateColorFromText);

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
    if (configuration.pageOverrides?.activeTabColor) {
      meta.append(pill(`Tab ${configuration.pageOverrides.activeTabColor.toUpperCase()}`));
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
    [template.name, template.summary, template.source].some((value) => value.toLowerCase().includes(query)),
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
    source.textContent = template.source;
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
  const activeTabColor = value.pageOverrides?.activeTabColor;
  const colorInput = document.querySelector("#active-tab-color");
  document.querySelector("#active-tab-color-enabled").checked = Boolean(activeTabColor);
  colorInput.value = activeTabColor || preferredDefaultColor(value.manifest);
  updateColorControl();
  updateColorValue();
  document.querySelector("#manifest-json").value = JSON.stringify(value.manifest, null, 2);
  document.querySelector("#rules-json").value = JSON.stringify(value.rules, null, 2);
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
        activeTabColor: document.querySelector("#active-tab-color-enabled").checked
          ? document.querySelector("#active-tab-color").value
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
  const disabled = !document.querySelector("#active-tab-color-enabled").checked;
  document.querySelector("#active-tab-color").disabled = disabled;
  document.querySelector("#active-tab-color-value").disabled = disabled;
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

function preferredDefaultColor(manifest) {
  return [manifest.background_color, manifest.theme_color].find((color) => /^#[\da-f]{6}$/i.test(color)) || "#ffffff";
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
  anchor.download = `better-pwas-settings-${new Date().toISOString().slice(0, 10)}.json`;
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
