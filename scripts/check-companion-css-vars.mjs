import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function collectCssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectCssFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : [];
  });
}

export function normalizeCompanionCssSourcePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

export function normalizeCssSourcePath(filePath) {
  return normalizeCompanionCssSourcePath(filePath);
}

export function analyzeCssVariables(options = {}) {
  const repoRoot = options.repoRoot ?? resolve(".");
  const cssDirectory =
    options.cssDirectory ?? resolve(repoRoot, "src-tauri", "companion_browser");
  const ignoredPrefixes = options.ignoredPrefixes ?? [];
  const definitions = new Set();
  const usages = new Map();

  for (const file of collectCssFiles(cssDirectory)) {
    const source = readFileSync(file, "utf8");
    const relativePath = normalizeCssSourcePath(relative(repoRoot, file));

    for (const match of source.matchAll(/(^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/g)) {
      const name = match[2];
      if (!ignoredPrefixes.some((prefix) => name.startsWith(prefix))) {
        definitions.add(name);
      }
    }

    for (const match of source.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const name = match[1];
      if (ignoredPrefixes.some((prefix) => name.startsWith(prefix))) {
        continue;
      }
      if (!usages.has(name)) {
        usages.set(name, new Set());
      }
      usages.get(name).add(relativePath);
    }
  }

  const missing = [...usages.keys()]
    .filter((name) => !definitions.has(name))
    .sort()
    .map((name) => ({
      files: [...usages.get(name)].sort(),
      name,
    }));

  return { definitions, missing, usages };
}

export function analyzeCompanionCssVariables(options = {}) {
  return analyzeCssVariables(options);
}

export function formatCssVariableReport(result, label = "CSS") {
  if (result.missing.length > 0) {
    const lines = [`${label} variables used without definitions:`];
    for (const missingVariable of result.missing) {
      lines.push(`  - ${missingVariable.name}`);
      for (const file of missingVariable.files) {
        lines.push(`    ${file}`);
      }
    }
    return lines.join("\n");
  }

  return `${label} variables ok (${result.usages.size} used, ${result.definitions.size} defined).`;
}

export function formatCompanionCssVariableReport(result) {
  return formatCssVariableReport(result, "Companion CSS");
}

function runCli() {
  const result = analyzeCompanionCssVariables();
  const report = formatCompanionCssVariableReport(result);

  if (result.missing.length > 0) {
    console.error(report);
    process.exit(1);
  }

  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
