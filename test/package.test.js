import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("package is deterministic, excludes unsafe inputs, and rejects dirty tracked state", () => {
  const directory = mkdtempSync(join(tmpdir(), "pwa-package-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  const run = (command, args) => execFileSync(command, args, { cwd: directory, stdio: "pipe" });
  const build = () => run(process.execPath, [join(root, "scripts/package.js")]);
  try {
    for (const path of ["manifest.json", "background.js", "injectManifest.js", "lib", "options",
      "templates", "manifests", "images", "LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md"]) {
      cpSync(join(root, path), join(directory, path), { recursive: true });
    }
    for (const path of ["visd", "manifests/icons", "scripts", "test", ".agents"]) {
      mkdirSync(join(directory, path), { recursive: true });
      writeFileSync(join(directory, path, "forbidden.xcf"), "must not ship");
    }
    for (const path of ["betterPWAs.zip", "images/vendor.png", "README.md"]) {
      writeFileSync(join(directory, path), "must not ship");
    }
    run("git", ["init", "-q"]);
    run("git", ["add", "."]);
    run("git", ["config", "user.name", "Ryan Gibbons"]);
    run("git", ["config", "user.email", "rtgibbons23@gmail.com"]);
    for (const role of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
      assert.match(run("git", ["var", role]).toString(), /^Ryan Gibbons <rtgibbons23@gmail\.com> /);
    }
    run("git", ["commit", "-qm", "Disposable package fixture"]);
    build();
    const archive = join(directory, "dist/betterPWAs.zip");
    const first = readFileSync(archive);
    build();
    assert.deepEqual(readFileSync(archive), first);
    const entries = run("unzip", ["-Z1", archive]).toString().trim().split("\n");
    assert.deepEqual(entries.filter((entry) => entry.endsWith(".png")).sort(), [
      "icon128.png", "icon48.png", "icon512.png", "iconBlue48.png", "iconBlue512.png",
      "iconDisabled48.png", "iconDisabled512.png", "iconRed48.png", "iconRed512.png",
    ].map((name) => `images/${name}`));
    for (const required of ["LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md", "manifest.json"]) {
      assert.ok(entries.includes(required));
    }
    assert.doesNotMatch(entries.join("\n"), /visd|\.xcf|\.zip|README|scripts\/|test\/|\.agents|manifests\/icons/);
    for (const entry of entries.filter((name) => /^manifests\/.*\.json$/.test(name))) {
      assert.doesNotMatch(run("unzip", ["-p", archive, entry]).toString(), /"icons"\s*:|"src"\s*:\s*"https?:/);
    }
    writeFileSync(join(directory, "manifest.json"), "dirty");
    assert.throws(build, /clean tracked HEAD/);
    run("git", ["add", "manifest.json"]);
    assert.throws(build, /clean tracked HEAD/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
