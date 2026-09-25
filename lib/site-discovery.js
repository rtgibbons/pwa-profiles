export function normalizeSiteUrl(value) {
  const input = value.trim();
  if (!input) throw new Error("Enter a site URL.");

  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Site URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) throw new Error("Site URL cannot contain credentials.");
  url.hash = "";
  return url;
}

export function originMatchPattern(url) {
  const value = new URL(url);
  return `${value.protocol}//${value.hostname}/*`;
}

export function generatedIconDesign(url) {
  const palettes = [
    ["#2563eb", "#7c3aed"],
    ["#0f766e", "#0891b2"],
    ["#c2410c", "#eab308"],
    ["#be123c", "#7e22ce"],
    ["#166534", "#65a30d"],
    ["#1d4ed8", "#0e7490"],
  ];
  const hostname = new URL(url).hostname.toLowerCase();
  let hash = 2166136261;
  for (const character of hostname) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const [startColor, endColor] = palettes[hash % palettes.length];
  return {
    startColor,
    endColor,
    stripeOffset: (hash >>> 16) % 64,
  };
}

export function createGeneratedIcon(url) {
  return {
    src: `data:image/svg+xml;base64,${btoa(generatedIconSvg(url))}`,
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any maskable",
  };
}

export function generatedIconSvg(url) {
  const design = generatedIconDesign(url);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x2="100%" y2="100%"><stop stop-color="${design.startColor}"/><stop offset="1" stop-color="${design.endColor}"/></linearGradient><pattern id="s" width="112" height="112" patternUnits="userSpaceOnUse" patternTransform="rotate(-35 ${design.stripeOffset} 0)"><rect width="30" height="112" fill="#fff" opacity=".18"/></pattern></defs><rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#s)"/></svg>`;
}

export function resolveImportedManifest(manifest, manifestUrl) {
  const resolved = structuredClone(manifest);
  const resolve = (value) =>
    typeof value === "string" && !/^(data:|blob:)/.test(value)
      ? new URL(value, manifestUrl).href
      : value;
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
  if (resolved.id) resolved.id = resolve(resolved.id);
  visit(resolved);
  return resolved;
}

export function inferManifest(pageUrl, metadata) {
  const url = new URL(pageUrl);
  const name = metadata.name || url.hostname.replace(/^www\./, "");
  const manifest = {
    id: `${url.origin}/better-pwa/${url.hostname}`,
    name,
    short_name: metadata.shortName || name.slice(0, 30),
    start_url: url.href,
    scope: `${url.origin}/`,
    display: "standalone",
  };

  if (metadata.description) manifest.description = metadata.description;
  if (metadata.themeColor) {
    manifest.theme_color = metadata.themeColor;
    manifest.background_color = metadata.themeColor;
  }
  if (metadata.icons?.length) manifest.icons = metadata.icons;
  else manifest.icons = [];
  return manifest;
}
