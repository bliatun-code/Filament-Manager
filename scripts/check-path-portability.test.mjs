import assert from "node:assert/strict";
import test from "node:test";

import { findHostSpecificPaths } from "./check-path-portability.mjs";

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
