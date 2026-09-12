import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const jsonFiles = globSync("**/*.json", {
  exclude: ["node_modules/**", ".git/**"],
});
for (const file of jsonFiles) JSON.parse(readFileSync(file, "utf8"));

const javascriptFiles = globSync("**/*.js", {
  exclude: ["node_modules/**", ".git/**"],
});
for (const file of javascriptFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const extensionManifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const catalog = JSON.parse(readFileSync("templates/catalog.json", "utf8"));
for (const template of catalog.templates) {
  const manifest = JSON.parse(readFileSync(template.manifestPath, "utf8"));
  if (!manifest.name && !manifest.short_name) throw new Error(`${template.id} has no name.`);
  if (!manifest.start_url) throw new Error(`${template.id} has no start_url.`);
}

if (extensionManifest.options_ui?.page !== "options/options.html") {
  throw new Error("Extension settings page is not registered.");
}

console.log(`Validated ${jsonFiles.length} JSON files, ${javascriptFiles.length} JavaScript files, and ${catalog.templates.length} templates.`);
