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

test("path portability accepts paths built from platform APIs", () => {
  const errors = findHostSpecificPaths(`
import { tmpdir } from "node:os";
import path from "node:path";
const artifact = path.join(tmpdir(), "artifact.png");
`);

  assert.deepEqual(errors, []);
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
