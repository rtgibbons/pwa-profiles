export const CONFIGURATIONS_KEY = "configurations";
export const SCHEMA_VERSION_KEY = "configurationSchemaVersion";
export const SCHEMA_VERSION = 1;

const MATCH_PATTERN = /^(\*|https?):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/;

export function validateMatchPattern(pattern) {
  return typeof pattern === "string" && MATCH_PATTERN.test(pattern);
}

export function permissionOrigins(matchPatterns) {
  return matchPatterns.flatMap((pattern) => {
    if (!pattern.startsWith("*://")) return pattern;
    const rest = pattern.slice(4);
    return [`http://${rest}`, `https://${rest}`];
  });
}

export function patternMatchesUrl(pattern, url) {
  if (!validateMatchPattern(pattern)) return false;

  const candidate = new URL(url);
  const [, scheme, host, path] = pattern.match(MATCH_PATTERN);
  const schemeMatches =
    scheme === "*"
      ? candidate.protocol === "http:" || candidate.protocol === "https:"
      : candidate.protocol === `${scheme}:`;
  const hostMatches =
    host === "*" ||
    candidate.hostname === host ||
    (host.startsWith("*.") &&
      (candidate.hostname === host.slice(2) ||
        candidate.hostname.endsWith(`.${host.slice(2)}`)));
  const pathExpression = `^${escapeRegExp(path).replaceAll("\\*", ".*")}$`;
  return schemeMatches && hostMatches && new RegExp(pathExpression).test(candidate.pathname + candidate.search);
}

export function validateConfiguration(configuration) {
  const errors = [];
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    return ["Configuration must be an object."];
  }

  if (!configuration.name?.trim()) errors.push("Name is required.");
  if (!Array.isArray(configuration.matchPatterns) || configuration.matchPatterns.length === 0) {
    errors.push("At least one match pattern is required.");
  } else if (configuration.matchPatterns.some((pattern) => !validateMatchPattern(pattern))) {
    errors.push("Every match pattern must use Chrome match-pattern syntax.");
  }

  const manifest = configuration.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("Manifest must be a JSON object.");
  } else {
    if (!manifest.name && !manifest.short_name) {
      errors.push("Manifest must contain name or short_name.");
    }
    if (!manifest.start_url) errors.push("Manifest must contain start_url.");
    if (!hasSuitableInstallIcon(manifest.icons)) {
      errors.push(
        "Manifest must include a square PNG, SVG, or WebP icon of at least 144px with purpose 'any'.",
      );
    }
  }

  if (!Array.isArray(configuration.rules)) {
    errors.push("Rules must be a JSON array.");
  } else {
    configuration.rules.forEach((rule, index) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        errors.push(`Rule ${index + 1} must be an object.`);
      } else if (!rule.action || !rule.condition) {
        errors.push(`Rule ${index + 1} must contain action and condition.`);
      }
    });
  }

  return errors;
}

export function hasSuitableInstallIcon(icons) {
  return Array.isArray(icons) && icons.some((icon) => {
    if (!icon?.src || !icon.sizes) return false;
    if (icon.purpose && !icon.purpose.split(/\s+/).includes("any")) return false;
    if (icon.type && !["image/png", "image/svg+xml", "image/webp"].includes(icon.type)) return false;
    return icon.sizes.split(/\s+/).some((size) => {
      if (size === "any") return true;
      const match = size.match(/^(\d+)x(\d+)$/);
      return match && Number(match[1]) >= 144 && match[1] === match[2];
    });
  });
}

export function configurationForUrl(configurations, url) {
  return configurations.find(
    (configuration) =>
      configuration.enabled &&
      configuration.matchPatterns.some((pattern) => patternMatchesUrl(pattern, url)),
  );
}

export function createConfiguration(template, id = crypto.randomUUID()) {
  return {
    id,
    templateId: template.id ?? null,
    name: template.name,
    enabled: Boolean(template.enabledByDefault),
    matchPatterns: structuredClone(template.matchPatterns),
    replaceExistingManifest: template.replaceExistingManifest !== false,
    manifest: structuredClone(template.manifest),
    rules: structuredClone(template.rules ?? []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
