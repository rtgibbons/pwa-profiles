import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// Deliberately enumerate files, not directories or globs. New runtime files require review.
const files = [
  "manifest.json", "background.js", "injectManifest.js",
  "lib/config.js", "lib/site-discovery.js", "lib/migrations.js",
  "options/options.html", "options/options.css", "options/options.js",
  "templates/catalog.json",
  "manifests/app.slack.com.json", "manifests/github.com.json",
  "manifests/www.canva.com.json", "manifests/www.smh.com.au.json",
  "manifests/app.notion.com.json", "manifests/claude.ai.json", "manifests/discord.com.json",
  "manifests/outlook.live.com.json", "manifests/outlook.office.com.json",
  "manifests/teams.microsoft.com.json", "manifests/x.com.json", "manifests/www.reddit.com.json",
  "images/icon48.png", "images/icon128.png", "images/icon512.png",
  "images/iconBlue48.png", "images/iconBlue512.png",
  "images/iconDisabled48.png", "images/iconDisabled512.png",
  "images/iconRed48.png", "images/iconRed512.png",
  "LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md",
].sort();
const run = (command, args) => execFileSync(command, args, { env: { ...process.env, TZ: "UTC" } });
const git = (...args) => run("git", args);
assert.equal(git("status", "--porcelain", "--untracked-files=no").toString().trim(), "",
  "Package only from clean tracked HEAD; commit or restore tracked changes first.");
const head = git("rev-parse", "HEAD").toString().trim();
for (const file of files) {
  assert.match(git("ls-tree", head, "--", file).toString(), /^100644 blob /,
    `${file} must be a tracked regular file`);
}

mkdirSync("dist", { recursive: true });
const archive = "dist/betterPWAs.zip";
// Git uses the commit timestamp and tracked blob bytes, never working-tree mtimes or content.
git("archive", "--format=zip", `--output=${archive}`, head, "--", ...files);
run("unzip", ["-t", archive]);
const entries = run("unzip", ["-Z1", archive]).toString().trim().split("\n");
assert.deepEqual(entries.filter((entry) => !entry.endsWith("/")).sort(), files);
for (const entry of entries.filter((entry) => entry.endsWith("/"))) {
  assert.ok(files.some((file) => file.startsWith(entry)), `Unexpected directory: ${entry}`);
}
for (const file of files) {
  assert.deepEqual(run("unzip", ["-p", archive, file]), git("show", `${head}:${file}`),
    `Archive bytes differ from HEAD: ${file}`);
}
console.log(`Verified ${archive}: ${files.length} files from ${head}; ZIP integrity, exact allowlist, and HEAD bytes match.`);
