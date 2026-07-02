import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  analyzeCssVariables,
  formatCssVariableReport,
} from "./check-companion-css-vars.mjs";

export function analyzeUiCssVariables(options = {}) {
  const repoRoot = options.repoRoot ?? resolve(".");
  const cssDirectory = options.cssDirectory ?? resolve(repoRoot, "ui", "src");
  return analyzeCssVariables({
    cssDirectory,
    ignoredPrefixes: ["--tw-"],
    repoRoot,
  });
}

export function formatUiCssVariableReport(result) {
  return formatCssVariableReport(result, "Desktop UI CSS");
}

function runCli() {
  const result = analyzeUiCssVariables();
  const report = formatUiCssVariableReport(result);

  if (result.missing.length > 0) {
    console.error(report);
    process.exit(1);
  }

  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
