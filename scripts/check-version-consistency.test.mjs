import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("scripts", "check-version-consistency.mjs");
const version = "0.23.0";
const tag = `v${version}`;

function writeFixture(root, overrides = {}) {
  const files = {
    "package.json": `${JSON.stringify({ version }, null, 2)}\n`,
    "package-lock.json": `${JSON.stringify({ version, packages: { "": { version } } }, null, 2)}\n`,
    "Cargo.toml": `[package]\nname = "filament-manager-core"\nversion = "${version}"\n`,
    "src-tauri/Cargo.toml": `[package]\nversion = "${version}"\n`,
    "Cargo.lock": `[[package]]\nname = "bambu-filament-manager"\nversion = "${version}"\n\n[[package]]\nname = "filament-manager-core"\nversion = "${version}"\n`,
    "src-tauri/tauri.conf.json": `${JSON.stringify({ version }, null, 2)}\n`,
    "README.md": `Release notes:\n\n- [${tag}](RELEASE_NOTES_${tag}.md)\n\n- Current version: \`${version}\`\n`,
    [`RELEASE_NOTES_${tag}.md`]: `# Filament Manager ${tag}\n\nRelease date: 2026-08-10\n`,
    ...overrides,
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    if (contents === null) {
      continue;
    }
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function runFixture(t, overrides = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "filament-version-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFixture(root, overrides);
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
}

test("accepts matching version metadata and release notes", (t) => {
  const result = runFixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Version consistency ok \(v0\.23\.0\)\./);
});

test("rejects a core crate version that would leak into backups and catalog requests", (t) => {
  const result = runFixture(t, {
    "Cargo.toml": `[package]\nname = "filament-manager-core"\nversion = "0.1.0"\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /core Cargo\.toml package version is 0\.1\.0, expected 0\.23\.0/);
});

test("rejects a stale locked core crate version", (t) => {
  const result = runFixture(t, {
    "Cargo.lock": `[[package]]\nname = "bambu-filament-manager"\nversion = "${version}"\n\n[[package]]\nname = "filament-manager-core"\nversion = "0.1.0"\n`,
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Cargo\.lock filament-manager-core package version is 0\.1\.0, expected 0\.23\.0/,
  );
});

test("rejects a missing versioned release notes file", (t) => {
  const result = runFixture(t, { [`RELEASE_NOTES_${tag}.md`]: null });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release notes file RELEASE_NOTES_v0\.23\.0\.md is missing/);
});

test("rejects a missing README release notes link", (t) => {
  const result = runFixture(t, { "README.md": `- Current version: \`${version}\`\n` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README release notes link is missing/);
});

test("rejects a mismatched release notes heading", (t) => {
  const result = runFixture(t, {
    [`RELEASE_NOTES_${tag}.md`]: "# Filament Manager v0.22.1\n",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release notes heading is # Filament Manager v0\.22\.1/);
});
