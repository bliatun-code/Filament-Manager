import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

import {
  analyzePathPortability,
  collectPathPortabilitySourceFiles,
  findHostSpecificPaths,
} from "./check-path-portability.mjs";

const unixTemporaryPath = ["", "tmp", "artifact.png"].join("/");
const macosPrivateTemporaryPath = ["", "private", "tmp", "artifact.png"].join("/");
const macosUserPath = ["", "Users", "Alex", "Downloads", "artifact.png"].join("/");
const macosPerUserTemporaryPath = [
  "",
  "var",
  "folders",
  "ab",
  "temporary",
  "artifact.png",
].join("/");
const interpolatedManualPath = (expression, suffix) =>
  ["`", "${", expression, "}", "/", suffix, "`"].join("");
const concatenatedManualPath = (expression, suffix) =>
  [expression, " + ", `"/${suffix}"`].join("");

function writeFixtureFile(repoRoot, file, source = "") {
  const filePath = resolve(repoRoot, file);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
}

test(
  "path portability source collection covers manifests, UI config, HTML, and plist",
  (t) => {
    const repoRoot = mkdtempSync(
      join(tmpdir(), "filament-manager-path-portability-"),
    );
    t.after(() => rmSync(repoRoot, { recursive: true, force: true }));

    const expectedFiles = [
      ".github/workflows/ci.yml",
      "Cargo.toml",
      "package.json",
      "scripts/check.mjs",
      "src/index.ts",
      "src-tauri/Entitlements.plist",
      "src-tauri/Info.plist",
      "src-tauri/Cargo.toml",
      "src-tauri/companion_browser/index.html",
      "src-tauri/src/main.rs",
      "ui/eslint.config.js",
      "ui/index.html",
      "ui/package.json",
      "ui/src/app.tsx",
      "ui/tsconfig.json",
      "ui/vite.config.ts",
    ];
    const ignoredFiles = [
      "package-lock.json",
      "src-tauri/target/release/build.rs",
      "ui/.git/config.json",
      "ui/.vite/config.json",
      "ui/build/app.js",
      "ui/coverage/report.json",
      "ui/dist/assets/app.js",
      "ui/node_modules/example/index.js",
      "ui/package-lock.json",
      "ui/src/notes.md",
    ];

    for (const file of [...expectedFiles, ...ignoredFiles]) {
      writeFixtureFile(repoRoot, file);
    }

    const sourceFiles = collectPathPortabilitySourceFiles(repoRoot).map((file) =>
      relative(repoRoot, file).split(sep).join("/"),
    );

    assert.deepEqual(sourceFiles, [...expectedFiles].sort());
    assert.equal(new Set(sourceFiles).size, sourceFiles.length);

    const analyzedFiles = [
      "package.json",
      "src-tauri/Info.plist",
      "ui/index.html",
      "ui/vite.config.ts",
    ];
    for (const file of analyzedFiles) {
      writeFixtureFile(repoRoot, file, `fixture = "${macosUserPath}";`);
    }
    writeFixtureFile(
      repoRoot,
      "ui/package-lock.json",
      `fixture = "${macosUserPath}";`,
    );

    const { errors } = analyzePathPortability({ repoRoot });
    assert.deepEqual(
      errors.map(({ file, label, line }) => ({
        file: relative(repoRoot, file).split(sep).join("/"),
        label,
        line,
      })),
      analyzedFiles.map((file) => ({
        file,
        label: "hardcoded macOS user directory",
        line: 1,
      })),
    );
  },
);

test("path portability accepts paths built from platform APIs", () => {
  const errors = findHostSpecificPaths(`
import { tmpdir } from "node:os";
import path from "node:path";
const artifact = path.join(tmpdir(), "artifact.png");
`, "scripts/fixture.mjs");

  assert.deepEqual(errors, []);
});

test("path portability rejects manual separators appended to filesystem paths", () => {
  const errors = findHostSpecificPaths(
    [
      `const first = file.replace(${interpolatedManualPath("repoRoot", "")}, "");`,
      `const second = ${interpolatedManualPath("outputDirectory", "artifact.png")};`,
      `const third = ${concatenatedManualPath("targetDir", "logs/app.log")};`,
      `const fourth = ${interpolatedManualPath("options.outputDir", "report.json")};`,
      `const fifth = ${concatenatedManualPath("cwd", "artifacts")};`,
    ].join("\n"),
    "scripts/fixture.mjs",
  );

  assert.deepEqual(
    errors.map(({ label, line }) => ({ label, line })),
    Array.from({ length: 5 }, (_, index) => ({
      label: "manual POSIX separator appended to a filesystem path",
      line: index + 1,
    })),
  );
});

test("path portability accepts URL and display separators", () => {
  const source = [
    `url.pathname = ${interpolatedManualPath("trimmedPath", "companion")};`,
    `const endpoint = ${interpolatedManualPath("baseUrl", "api/v1/health")};`,
    ["const ratio = `", "${", "success", "}/", "${", "total", "}`;"].join(""),
  ].join("\n");

  assert.deepEqual(findHostSpecificPaths(source, "scripts/fixture.mjs"), []);
});

test("path portability permits a documented manual separator", () => {
  const source = `const artifact = ${interpolatedManualPath("repoRoot", "artifact.png")}; // path-portability-allow: external format requires POSIX separators`;

  assert.deepEqual(findHostSpecificPaths(source, "scripts/fixture.mjs"), []);
});

test("path portability rejects hardcoded host-specific paths", () => {
  const errors = findHostSpecificPaths(
    [
      `const first = "${unixTemporaryPath}";`,
      `const second = "${macosPrivateTemporaryPath}";`,
      `const third = "${macosUserPath}";`,
      `const fourth = "${macosPerUserTemporaryPath}";`,
    ].join("\n"),
    "fixture.mjs",
  );

  assert.deepEqual(
    errors.map(({ file, label, line }) => ({ file, label, line })),
    [
      {
        file: "fixture.mjs",
        label: "hardcoded Unix temporary directory",
        line: 1,
      },
      {
        file: "fixture.mjs",
        label: "hardcoded Unix temporary directory",
        line: 2,
      },
      {
        file: "fixture.mjs",
        label: "hardcoded macOS user directory",
        line: 3,
      },
      {
        file: "fixture.mjs",
        label: "hardcoded macOS per-user temporary directory",
        line: 4,
      },
    ],
  );
});

test("path portability permits explicitly documented fixtures", () => {
  const errors = findHostSpecificPaths(
    `const fixture = "${macosUserPath}"; // path-portability-allow: intentional display fixture`,
  );

  assert.deepEqual(errors, []);
});
