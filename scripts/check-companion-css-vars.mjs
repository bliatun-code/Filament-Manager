import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  analyzeCssVariables,
  collectCssFiles,
  formatCssVariableReport,
  normalizeCssSourcePath,
  parseCssVariableDeclarations,
} from "./css-variable-contract.mjs";

export {
  analyzeCssVariables,
  collectCssFiles,
  formatCssVariableReport,
  normalizeCssSourcePath,
};

export const normalizeCompanionCssSourcePath = normalizeCssSourcePath;

function extractCssBlockAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const openingBraceIndex = source.indexOf("{", markerIndex);
  if (openingBraceIndex < 0) {
    return null;
  }

  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBraceIndex + 1, index);
      }
    }
  }

  return null;
}

export function analyzeCompanionThemeTokens(options = {}) {
  const repoRoot = options.repoRoot ?? resolve(".");
  const themePath =
    options.themePath ??
    resolve(repoRoot, "src-tauri", "companion_browser", "theme.css");
  const source = readFileSync(themePath, "utf8");
  const explicitDarkBlock = extractCssBlockAfter(source, ':root[data-theme-mode="dark"]');
  const autoDarkBlock = extractCssBlockAfter(source, ":root:not([data-theme-mode])");
  const missingBlocks = [];

  if (explicitDarkBlock === null) {
    missingBlocks.push(':root[data-theme-mode="dark"]');
  }
  if (autoDarkBlock === null) {
    missingBlocks.push(":root:not([data-theme-mode]) / :root[data-theme-mode=\"auto\"]");
  }

  const explicitDark = parseCssVariableDeclarations(explicitDarkBlock ?? "");
  const autoDark = parseCssVariableDeclarations(autoDarkBlock ?? "");
  const names = [...new Set([...explicitDark.keys(), ...autoDark.keys()])].sort();
  const mismatches = [];

  for (const name of names) {
    const explicitDarkValue = explicitDark.get(name) ?? null;
    const autoDarkValue = autoDark.get(name) ?? null;
    if (explicitDarkValue !== autoDarkValue) {
      mismatches.push({
        autoDark: autoDarkValue,
        explicitDark: explicitDarkValue,
        name,
      });
    }
  }

  return { autoDark, explicitDark, mismatches, missingBlocks };
}

export function analyzeCompanionCssVariables(options = {}) {
  return analyzeCssVariables(options);
}

export function formatCompanionThemeTokenReport(result) {
  if (result.missingBlocks.length > 0) {
    return [
      "Companion theme dark token blocks missing:",
      ...result.missingBlocks.map((selector) => `  - ${selector}`),
    ].join("\n");
  }

  if (result.mismatches.length > 0) {
    const lines = ["Companion theme dark token mismatch:"];
    for (const mismatch of result.mismatches) {
      lines.push(`  - ${mismatch.name}`);
      lines.push(`    explicit dark: ${mismatch.explicitDark ?? "(missing)"}`);
      lines.push(`    auto dark: ${mismatch.autoDark ?? "(missing)"}`);
    }
    return lines.join("\n");
  }

  return `Companion theme dark tokens ok (${result.explicitDark.size} matched).`;
}

export function formatCompanionCssVariableReport(result) {
  return formatCssVariableReport(result, "Companion CSS");
}

function runCli() {
  const cssResult = analyzeCompanionCssVariables();
  const themeResult = analyzeCompanionThemeTokens();
  const report = [
    formatCompanionCssVariableReport(cssResult),
    formatCompanionThemeTokenReport(themeResult),
  ].join("\n");

  if (
    cssResult.missing.length > 0 ||
    themeResult.missingBlocks.length > 0 ||
    themeResult.mismatches.length > 0
  ) {
    console.error(report);
    process.exit(1);
  }

  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
