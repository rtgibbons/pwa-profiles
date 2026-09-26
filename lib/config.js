export const CONFIGURATIONS_KEY = "configurations";
export const SCHEMA_VERSION_KEY = "configurationSchemaVersion";
export const SCHEMA_VERSION = 3;

const MATCH_PATTERN = /^(\*|https?):\/\/([^/]+)(\/[^\s#\\]*)$/;
const HEX_COLOR = /^#[\da-f]{6}$/i;

// One contract for stored patterns, runtime matches and Chrome registration/grants.
// Never normalize away a port: that would silently broaden a saved profile.
export function parseMatchPattern(pattern) {
  const match = typeof pattern === "string" && pattern.match(MATCH_PATTERN);
  if (!match) throw new Error("Every match pattern must use Chrome match-pattern syntax.");
  const [, scheme, authority, path] = match;
  const invalidHost = () => { throw new Error("Invalid hostname. Use a DNS name, localhost, IPv4, or bracketed IPv6 without credentials."); };
  if (/[\s@%?#\\]/.test(authority)) invalidHost();
  const bracketed = authority.startsWith("[");
  if (bracketed ? /^\[[^\]]+\]:/.test(authority) : authority.includes(":")) {
    throw new Error("Explicit ports are not supported. Chrome site access applies to all ports; remove the port from the match pattern.");
  }
  const wildcard = authority === "*" || authority.startsWith("*.");
  const rawHost = authority.startsWith("*.") ? authority.slice(2) : authority;
  if (authority !== "*" && rawHost === "*") invalidHost();
  let host = rawHost.toLowerCase();
  if (rawHost !== "*") {
    if (bracketed) {
      if (!/^\[[0-9a-f:.]+\]$/i.test(rawHost)) invalidHost();
    } else if (!/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?)(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*\.?$/i.test(rawHost)) invalidHost();
    try {
      const parsed = new URL(`https://${rawHost}/`);
      if (!bracketed && parsed.hostname !== host) invalidHost();
      host = parsed.hostname;
    } catch { invalidHost(); }
  }
  if (authority.startsWith("*.")) host = `*.${host}`;
  return { scheme, host, path, wildcard, canonical: `${scheme}://${host}${path}` };
}

export function validateMatchPattern(pattern) {
  try { parseMatchPattern(pattern); return true; } catch { return false; }
}

export function permissionOrigins(matchPatterns) {
  return [...new Set(matchPatterns.flatMap((pattern) => {
    const { scheme, host, wildcard } = parseMatchPattern(pattern);
    if (wildcard) {
      throw new Error("Use concrete host patterns, such as https://example.com/app/*. Wildcard hosts and all-host patterns cannot receive site access.");
    }
    return (scheme === "*" ? ["http", "https"] : [scheme]).map((value) => `${value}://${host}/*`);
  }))];
}

export function grantIsNeeded(grant, configurations) {
  return configurations.some((configuration) => {
    if (!configuration.enabled) return false;
    // Retain access for concrete parts even if another pattern still needs editing.
    return configuration.matchPatterns.some((pattern) => {
      try {
        return permissionOrigins([pattern]).some((origin) =>
          grant === "<all_urls>" || patternMatchesUrl(grant.replace(/(\:\/\/[^/]+)\/.*$/, "$1/*"), origin.slice(0, -1)));
      } catch { return false; }
    });
  });
}

export async function hasSiteAccess(configuration, permissions = chrome.permissions) {
  try {
    return await permissions.contains({ origins: permissionOrigins(configuration.matchPatterns) });
  } catch { return false; }
}

export function patternMatchesUrl(pattern, url) {
  let parsed, candidate;
  try {
    parsed = parseMatchPattern(pattern);
    candidate = new URL(url);
  } catch { return false; }
  const { scheme, host, path } = parsed;
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

export function validateConfiguration(configuration, { allowInvalidPatterns = false } = {}) {
  const errors = [];
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    return ["Configuration must be an object."];
  }

  if (!configuration.name?.trim()) errors.push("Name is required.");
  if (!Array.isArray(configuration.matchPatterns) || configuration.matchPatterns.length === 0) {
    errors.push("At least one match pattern is required.");
  } else if (!allowInvalidPatterns) {
    for (const pattern of configuration.matchPatterns) {
      try { parseMatchPattern(pattern); } catch (error) {
        if (!errors.includes(error.message)) errors.push(error.message);
      }
    }
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

  if (configuration.legacyRules !== undefined && !Array.isArray(configuration.legacyRules)) {
    errors.push("Legacy rule data must be a JSON array.");
  }

  const activeTabColor = configuration.pageOverrides?.activeTabColor;
  if (activeTabColor != null && !HEX_COLOR.test(activeTabColor)) {
    errors.push("Active tab color must be a six-digit hexadecimal color.");
  }
  const activeTabColorMode = configuration.pageOverrides?.activeTabColorMode;
  if (activeTabColorMode != null && activeTabColorMode !== "theme") {
    errors.push("Active tab color mode is invalid.");
  } else if (activeTabColorMode === "theme" && !derivedActiveTabColor(manifest?.theme_color)) {
    errors.push("Automatic active tab color requires a hexadecimal manifest theme color.");
  }

  return errors;
}

export function activeTabColorOverrideCss(configuration) {
  const color = resolvedActiveTabColor(configuration);
  return HEX_COLOR.test(color ?? "")
    ? `html { background-color: ${color} !important; }`
    : null;
}

export function resolvedActiveTabColor(configuration) {
  if (configuration.pageOverrides?.activeTabColorMode === "theme") {
    return derivedActiveTabColor(configuration.manifest?.theme_color);
  }
  return configuration.pageOverrides?.activeTabColor ?? null;
}

export function derivedActiveTabColor(themeColor) {
  const color = editableHexColor(themeColor);
  if (!color) return null;
  const source = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  const target = contrastRatio(source, white) > contrastRatio(source, black) ? white : black;
  for (let alpha = 1; alpha <= 255; alpha += 1) {
    const candidate = source.map((channel, index) =>
      Math.round((channel * (255 - alpha) + target[index] * alpha) / 255),
    );
    if (contrastRatio(source, candidate) >= 1.3) return rgbToHex(candidate);
  }
  return rgbToHex(target);
}

export function withDisplayPreferences(manifest, display, displayOverride) {
  const updated = structuredClone(manifest);
  updated.display = display;
  if (displayOverride) updated.display_override = [displayOverride];
  else delete updated.display_override;
  return updated;
}

export function editableHexColor(value) {
  if (/^#[\da-f]{6}$/i.test(value ?? "")) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value ?? "")) {
    return `#${[...value.slice(1)].map((character) => character.repeat(2)).join("")}`.toLowerCase();
  }
  return null;
}

export function withThemeColor(manifest, themeColor) {
  const updated = structuredClone(manifest);
  if (themeColor) updated.theme_color = themeColor;
  else delete updated.theme_color;
  return updated;
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
    enabled: false,
    matchPatterns: structuredClone(template.matchPatterns),
    replaceExistingManifest: template.replaceExistingManifest !== false,
    pageOverrides: structuredClone(template.pageOverrides ?? {}),
    manifest: structuredClone(template.manifest),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contrastRatio(first, second) {
  const [brightest, darkest] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (brightest + 0.05) / (darkest + 0.05);
}

function relativeLuminance(color) {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rgbToHex(color) {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
