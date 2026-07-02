import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  analyzeCssVariables,
  analyzeCompanionCssVariables,
  analyzeCompanionThemeTokens,
  formatCssVariableReport,
  formatCompanionCssVariableReport,
  formatCompanionThemeTokenReport,
  normalizeCompanionCssSourcePath,
} from "./check-companion-css-vars.mjs";

function withCssFixture(files, callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "companion-css-vars-"));
  const cssDirectory = join(fixtureRoot, "src-tauri", "companion_browser");
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

test("companion css variable analyzer reports missing variables with source files", () => {
  withCssFixture(
    {
      "app.css": ":root { --defined: #fff; }\n.panel { color: var(--defined); border-color: var(--missing); }",
      "nested/theme.css": ".chip { background: var(--nested-missing); }",
    },
    ({ cssDirectory, fixtureRoot }) => {
      const result = analyzeCompanionCssVariables({
        cssDirectory,
        repoRoot: fixtureRoot,
      });

      assert.deepEqual(
        result.missing.map((entry) => entry.name),
        ["--missing", "--nested-missing"],
      );
      assert.deepEqual(result.missing[0].files, ["src-tauri/companion_browser/app.css"]);
      assert.match(formatCssVariableReport(result, "Fixture CSS"), /--nested-missing/);
      assert.match(formatCompanionCssVariableReport(result), /--nested-missing/);
    },
  );
});

test("companion css variable analyzer reports success counts", () => {
  withCssFixture(
    {
      "app.css": ":root { --defined: #fff; --also-defined: #000; }\n.panel { color: var(--defined); border-color: var(--also-defined); }",
    },
    ({ cssDirectory, fixtureRoot }) => {
      const result = analyzeCompanionCssVariables({
        cssDirectory,
        repoRoot: fixtureRoot,
      });

      assert.equal(result.missing.length, 0);
      assert.equal(
        formatCompanionCssVariableReport(result),
        "Companion CSS variables ok (2 used, 2 defined).",
      );
    },
  );
});

test("css variable analyzer can ignore generated variable prefixes", () => {
  withCssFixture(
    {
      "app.css":
        ".gradient { --defined: #fff; color: var(--defined); background: var(--tw-gradient-to); border-color: var(--missing); }",
    },
    ({ cssDirectory, fixtureRoot }) => {
      const result = analyzeCssVariables({
        cssDirectory,
        ignoredPrefixes: ["--tw-"],
        repoRoot: fixtureRoot,
      });

      assert.deepEqual(
        result.missing.map((entry) => entry.name),
        ["--missing"],
      );
      assert.equal(result.usages.has("--tw-gradient-to"), false);
    },
  );
});

test("companion css variable analyzer normalizes Windows source paths", () => {
  assert.equal(
    normalizeCompanionCssSourcePath("src-tauri\\companion_browser\\app.css"),
    "src-tauri/companion_browser/app.css",
  );
});

test("companion theme token analyzer keeps explicit and auto dark tokens in sync", () => {
  withCssFixture(
    {
      "theme.css": `
        :root[data-theme-mode="dark"] {
          --surface: rgb(10, 17, 31);
          --text: #fff;
        }

        @media (prefers-color-scheme: dark) {
          :root:not([data-theme-mode]),
          :root[data-theme-mode="auto"] {
            --text: #fff;
            --surface: rgb(10, 17, 31);
          }
        }
      `,
    },
    ({ cssDirectory }) => {
      const result = analyzeCompanionThemeTokens({
        themePath: join(cssDirectory, "theme.css"),
      });

      assert.equal(result.missingBlocks.length, 0);
      assert.equal(result.mismatches.length, 0);
      assert.equal(
        formatCompanionThemeTokenReport(result),
        "Companion theme dark tokens ok (2 matched).",
      );
    },
  );
});

test("companion theme token analyzer reports dark token drift", () => {
  withCssFixture(
    {
      "theme.css": `
        :root[data-theme-mode="dark"] {
          --surface: rgb(10, 17, 31);
          --text: #fff;
        }

        @media (prefers-color-scheme: dark) {
          :root:not([data-theme-mode]),
          :root[data-theme-mode="auto"] {
            --surface: rgb(17, 28, 45);
            --text: #fff;
            --accent: #eee;
          }
        }
      `,
    },
    ({ cssDirectory }) => {
      const result = analyzeCompanionThemeTokens({
        themePath: join(cssDirectory, "theme.css"),
      });

      assert.deepEqual(
        result.mismatches.map((entry) => entry.name),
        ["--accent", "--surface"],
      );
      assert.match(formatCompanionThemeTokenReport(result), /--surface/);
      assert.match(
        formatCompanionThemeTokenReport(result),
        /explicit dark: rgb\(10, 17, 31\)/,
      );
      assert.match(
        formatCompanionThemeTokenReport(result),
        /auto dark: rgb\(17, 28, 45\)/,
      );
    },
  );
});
