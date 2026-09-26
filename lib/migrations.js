import { hasSuitableInstallIcon } from "./config.js";
import { createGeneratedIcon } from "./site-discovery.js";

// Exact vendor URLs from the schema-1 bundled manifests, not arbitrary images on these hosts.
const VENDOR_ICONS = {
  github: [
    "apple-touch-icon-114x114-09ce42d3ca4b.png", "apple-touch-icon-120x120-92bd46d04241.png",
    "apple-touch-icon-144x144-b882e354c005.png", "apple-touch-icon-152x152-5f777cdc30ae.png",
    "apple-touch-icon-180x180-a80b8e11abe2.png", "apple-touch-icon-57x57-22f09f5b3a64.png",
    "apple-touch-icon-60x60-19037ac897bf.png", "apple-touch-icon-72x72-e090c8a282d0.png",
    "apple-touch-icon-76x76-a4523d80afb4.png", "app-icon-192-bcc967ab9829.png",
    "app-icon-512-7f9c4ff2e960.png",
  ].map((file) => `https://github.githubassets.com/assets/${file}`),
  canva: ["android-192x192-2.png", "apple-touch-180x180-1.png"]
    .map((file) => `https://static.canva.com/domain-assets/canva/static/images/${file}`),
  smh: ["https://www.smh.com.au/apple-touch-icons/smh.png"],
  teams: [
    ...[16, 32, 48, 64, 128, 144, 150, 192, 256, 512]
      .map((size) => `windows/teams-icon-pwa-v2025-${size}.png`),
    "microsoft_teams_logo_refresh_v2025.ico",
  ].map((file) => `https://teams.public.onecdn.static.microsoft/evergreen-assets/icons/${file}`),
  reddit: [
    ...[36, 48, 72, 96, 144, 192, 512].map((size) => `android-icon-${size}x${size}.png`),
    ...["home", "popular", "all", "search", "chat", "notifications"]
      .map((name) => `shortcuts/icon_${name}_fill.png`),
  ].map((file) => `https://www.redditstatic.com/desktop2x/img/favicon/${file}`),
};

function isLegacyIcon(icon, templateId) {
  const src = icon?.src;
  return typeof src === "string" && (
    /^(?:icons\/|chrome-extension:\/\/[^/]+\/manifests\/icons\/)/.test(src) ||
    (VENDOR_ICONS[templateId] ?? []).includes(src)
  );
}

function isObsoleteNotificationRule(rule) {
  const condition = rule?.condition;
  return rule?.priority === 1 && rule.action?.type === "block" &&
    Object.keys(rule.action).length === 1 &&
    Object.keys(rule).every((key) => ["id", "name", "enabled", "priority", "action", "condition"].includes(key)) &&
    condition?.regexFilter === "^https://abs\\.twimg\\.com/responsive-web/client-serviceworker/logo\\..*\\.png$" &&
    Object.keys(condition).length === 2 && Array.isArray(condition.resourceTypes) &&
    JSON.stringify([...condition.resourceTypes].sort()) === '["image","other","xmlhttprequest"]';
}

// Schema 1 -> 2. Identity, not hostname or profile name, establishes template provenance.
export function migrateTemplateConfigurations(configurations, templates) {
  return configurations.map((configuration) => {
    const template = templates.find((item) => item.id === configuration.templateId);
    if (!template || !configuration.manifest) return configuration;
    const migrated = structuredClone(configuration);
    const manifest = migrated.manifest;
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const retained = icons.filter((icon) => !isLegacyIcon(icon, template.id));
    const removed = retained.length !== icons.length;
    if (removed || !hasSuitableInstallIcon(retained)) {
      const generated = createGeneratedIcon(template.matchPatterns[0].replace(/\*$/, ""));
      manifest.icons = retained.some((icon) => icon.src === generated.src) ? retained : [...retained, generated];
    }
    for (const shortcut of manifest.shortcuts ?? []) {
      if (!Array.isArray(shortcut.icons)) continue;
      shortcut.icons = shortcut.icons.filter((icon) => !isLegacyIcon(icon, template.id));
      if (!shortcut.icons.length) delete shortcut.icons;
    }
    if (template.id === "x") {
      if (["Twitter", "X / Twitter"].includes(migrated.name)) migrated.name = "X";
      for (const key of ["name", "short_name"]) {
        if (manifest[key] === "Twitter") manifest[key] = "X";
      }
      for (const shortcut of manifest.shortcuts ?? []) {
        if (shortcut.name === "Tweet") shortcut.name = "Post";
        if (shortcut.short_name === "Tweet") shortcut.short_name = "Post";
      }
      if (manifest.share_target?.action === "https://x.com/compose/tweet") {
        manifest.share_target.action = "https://x.com/compose/post";
      }
      if (manifest.android_package_name === "com.twitter.android") delete manifest.android_package_name;
      if (Array.isArray(manifest.related_applications)) {
        const previousCount = manifest.related_applications.length;
        manifest.related_applications = manifest.related_applications.filter((app) => !(
          app.id === "com.twitter.android" && app.platform === "play" &&
          app.url === "https://play.google.com/store/apps/details?id=com.twitter.android" &&
          Object.keys(app).length === 3
        ));
        if (previousCount && !manifest.related_applications.length) {
          delete manifest.related_applications;
          if (manifest.prefer_related_applications === true) delete manifest.prefer_related_applications;
        }
      }
      if (Array.isArray(migrated.rules)) {
        migrated.rules = migrated.rules.filter((rule) => !isObsoleteNotificationRule(rule));
      }
    }
    return migrated;
  });
}

// Schema 2 -> 3: opaque archival data, never validated as executable instructions.
export function preserveLegacyRules(configurations) {
  return configurations.map((configuration) => {
    const migrated = structuredClone(configuration);
    const legacyRules = [...(migrated.legacyRules ?? []), ...(migrated.rules ?? [])];
    delete migrated.rules;
    delete migrated.legacyRules;
    if (legacyRules.length) migrated.legacyRules = legacyRules;
    return migrated;
  });
}

export function migrateConfigurations(configurations, version, templates) {
  const normalized = version < 2 ? migrateTemplateConfigurations(configurations, templates) : configurations;
  return preserveLegacyRules(normalized);
}
