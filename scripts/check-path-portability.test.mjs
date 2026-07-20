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
const macosLibrarySegment = ["Lib", "rary"].join("");
const macosApplicationSupportSegment = ["Application", " Support"].join("");
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
  "path portability source collection covers manifests, scripts, UI config, HTML, and plist",
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
      "scripts/verify.ps1",
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

test("path portability rejects manual separators split across lines", () => {
  const source = [
    "const first = outputDirectory",
    '  + "/artifact.png";',
    "const second = `${repoRoot}",
    "/report.json`;",
    "const fixture = targetDir",
    '  + "/fixture.json"; // path-portability-allow: intentional external fixture path',
  ].join("\r\n");

  assert.deepEqual(
    findHostSpecificPaths(source, "scripts/fixture.mjs").map(({ label, line }) => ({
      label,
      line,
    })),
    [
      {
        label: "manual POSIX separator appended to a filesystem path",
        line: 2,
      },
      {
        label: "manual POSIX separator appended to a filesystem path",
        line: 4,
      },
    ],
  );
});

test("path portability rejects manual separators on qualified path identifiers", () => {
  const source = [
    `const p01 = ${interpolatedManualPath("filePath", "child.json")};`,
    `const p02 = ${concatenatedManualPath("visualQaDatabasePath", "database.sqlite")};`,
    `const p03 = ${interpolatedManualPath("options.outputPath", "wide.png")};`,
    `const p04 = ${concatenatedManualPath("state.buildArtifactPath", "manifest.json")};`,
    `const p05 = ${interpolatedManualPath("repoPath", "package.json")};`,
    `const p06 = ${concatenatedManualPath("projectPath", "src")};`,
    `const p07 = ${interpolatedManualPath("configPath", "defaults.json")};`,
    `const p08 = ${concatenatedManualPath("manifestPath", "fragment.json")};`,
    `const p09 = ${interpolatedManualPath("resourcePath", "theme.css")};`,
    `const p10 = ${concatenatedManualPath("sourcePath", "assets")};`,
    `const p11 = ${interpolatedManualPath("target_path", "result")};`,
    `const p12 = ${concatenatedManualPath("FILAMENT_MANAGER_DB_PATH", "wal")};`,
    `const p13 = ${interpolatedManualPath("options?.temporaryPath", "snapshot.db")};`,
    "const p14 = targetPath",
    '  + "/logs/app.log";',
  ].join("\n");

  assert.deepEqual(
    findHostSpecificPaths(source, "scripts/fixture.mjs").map(({ label, line }) => ({
      label,
      line,
    })),
    [...Array.from({ length: 13 }, (_, index) => index + 1), 15].map((line) => ({
      label: "manual POSIX separator appended to a filesystem path",
      line,
    })),
  );
});

test("path portability accepts URL and display separators", () => {
  const source = [
    `url.pathname = ${interpolatedManualPath("trimmedPath", "companion")};`,
    `const endpoint = ${interpolatedManualPath("baseUrl", "api/v1/health")};`,
    `const request = ${interpolatedManualPath("requestPath", "health")};`,
    `const route = ${concatenatedManualPath("routePath", "settings")};`,
    `const display = ${interpolatedManualPath("displayPath", "…")};`,
    `const field = ${concatenatedManualPath("selectedFieldPath", "label")};`,
    `const sort = ${concatenatedManualPath("bambuLiveSortPath", "ascending")};`,
    `const browser = ${interpolatedManualPath("browserPath", "settings")};`,
    `const template = ${concatenatedManualPath("templatePath", "partial")};`,
    `const resourceUrl = ${interpolatedManualPath("resourceUrlPath", "api")};`,
    `const projector = ${concatenatedManualPath("projectorPath", "image")};`,
    `const attempt = ${interpolatedManualPath("attemptPath", "next")};`,
    `const profile = ${concatenatedManualPath("profilePath", "avatar")};`,
    ["const ratio = `", "${", "success", "}/", "${", "total", "}`;"].join(""),
  ].join("\n");

  assert.deepEqual(findHostSpecificPaths(source, "scripts/fixture.mjs"), []);
});

test("path portability permits a documented manual separator", () => {
  const source = [
    `const artifact = ${interpolatedManualPath("repoRoot", "artifact.png")}; // path-portability-allow: external format requires POSIX separators`,
    `const output = ${interpolatedManualPath("outputPath", "external-id")}; // path-portability-allow: external format requires POSIX separators`,
  ].join("\n");

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

test("path portability rejects segmented macOS Application Support paths", () => {
  const source = [
    'import path from "node:path";',
    "const databasePath = path.join(",
    '  process.env.HOME ?? "",',
    `  ${JSON.stringify(macosLibrarySegment)},`,
    `  ${JSON.stringify(macosApplicationSupportSegment)},`,
    '  "app",',
    '  "database.sqlite",',
    ");",
  ].join("\n");

  assert.deepEqual(
    findHostSpecificPaths(source, "scripts/fixture.mjs").map(({ label, line }) => ({
      label,
      line,
    })),
    [
      {
        label: "hardcoded macOS Application Support path construction",
        line: 5,
      },
    ],
  );
});

test("path portability permits a documented macOS Application Support branch", () => {
  const source =
    `const databasePath = path.join(homeDirectory, ${JSON.stringify(macosLibrarySegment)}, ` +
    `${JSON.stringify(macosApplicationSupportSegment)}); ` +
    "// path-portability-allow: guarded by platform === darwin";

  assert.deepEqual(findHostSpecificPaths(source, "scripts/fixture.mjs"), []);
});

test("path portability permits explicitly documented fixtures", () => {
  const errors = findHostSpecificPaths(
    `const fixture = "${macosUserPath}"; // path-portability-allow: intentional display fixture`,
  );

  assert.deepEqual(errors, []);
});
