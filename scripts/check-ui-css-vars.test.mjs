import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  analyzeUiCssVariables,
  formatUiCssVariableReport,
} from "./check-ui-css-vars.mjs";

function withUiCssFixture(files, callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ui-css-vars-"));
  const cssDirectory = join(fixtureRoot, "ui", "src");
  mkdirSync(cssDirectory, { recursive: true });

  try {
    for (const [fileName, source] of Object.entries(files)) {
      const filePath = join(cssDirectory, fileName);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, source);
    }

    return callback({ cssDirectory, fixtureRoot });
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

test("desktop css variable analyzer reports missing variables with desktop label", () => {
  withUiCssFixture(
    {
      "index.css": ":root { --defined: #fff; }\n.card { color: var(--defined); border-color: var(--missing); }",
    },
    ({ cssDirectory, fixtureRoot }) => {
      const result = analyzeUiCssVariables({
        cssDirectory,
        repoRoot: fixtureRoot,
      });

      assert.deepEqual(
        result.missing.map((entry) => entry.name),
        ["--missing"],
      );
      assert.deepEqual(result.missing[0].files, ["ui/src/index.css"]);
      assert.match(
        formatUiCssVariableReport(result),
        /Desktop UI CSS variables used without definitions/,
      );
    },
  );
});

test("desktop css variable analyzer ignores Tailwind-generated variables", () => {
  withUiCssFixture(
    {
      "index.css":
        ".gradient { --defined: #fff; color: var(--defined); background: var(--tw-gradient-to); }",
    },
    ({ cssDirectory, fixtureRoot }) => {
      const result = analyzeUiCssVariables({
        cssDirectory,
        repoRoot: fixtureRoot,
      });

      assert.equal(result.missing.length, 0);
      assert.equal(result.usages.has("--tw-gradient-to"), false);
      assert.equal(
        formatUiCssVariableReport(result),
        "Desktop UI CSS variables ok (1 used, 1 defined).",
      );
    },
  );
});
