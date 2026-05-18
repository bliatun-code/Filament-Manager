import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const appPath = resolve(sourceRoot, "App.tsx");
const mainPath = resolve(sourceRoot, "main.tsx");
const sourceExtensions = [".ts", ".tsx"];

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    if (!entry.isFile()) {
      return [];
    }
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      return [];
    }
    if (entry.name.endsWith(".d.ts")) {
      return [];
    }
    return sourceExtensions.some((extension) => entry.name.endsWith(extension)) ? [entryPath] : [];
  });
}

function sourceFileKey(filePath) {
  return filePath.replace(/\.(tsx|ts)$/, "");
}

function buildResolver(files) {
  const byKey = new Map();
  for (const file of files) {
    const key = sourceFileKey(file);
    byKey.set(key, file);
    byKey.set(`${key}.tsx`, file);
    byKey.set(`${key}.ts`, file);
    byKey.set(join(key, "index"), file);
  }
  return (fromFile, specifier) => {
    if (!specifier.startsWith(".")) {
      return null;
    }
    return byKey.get(resolve(join(fromFile, ".."), specifier)) ?? null;
  };
}

function collectImportSpecifiers(source) {
  const specifiers = new Set();
  const importPattern =
    /(?:import|export)\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gms;
  for (const match of source.matchAll(importPattern)) {
    specifiers.add(match[1] ?? match[2]);
  }
  return specifiers;
}

const files = collectSourceFiles(sourceRoot);
const resolveImport = buildResolver(files);
const appImporters = [];

for (const file of files) {
  if (file === mainPath) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const specifier of collectImportSpecifiers(source)) {
    if (resolveImport(file, specifier) === appPath) {
      appImporters.push(relative(repoRoot, file));
      break;
    }
  }
}

if (appImporters.length > 0) {
  console.error("UI source files must not import App.tsx; move shared types/models to ui/src/lib or page models:");
  for (const file of appImporters.sort()) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log(`UI architecture check ok (${files.length} source files scanned).`);
