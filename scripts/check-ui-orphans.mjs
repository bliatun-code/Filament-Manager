import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const sourceExtensions = [".ts", ".tsx"];
const entryFiles = [
  resolve(sourceRoot, "main.tsx"),
  resolve(sourceRoot, "App.tsx"),
];

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
    byKey.set(join(key, "index"), file);
  }
  return (fromFile, specifier) => {
    if (!specifier.startsWith(".")) {
      return null;
    }
    const base = resolve(join(fromFile, ".."), specifier);
    return byKey.get(base) ?? null;
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
const reachable = new Set();
const pending = entryFiles.filter((file) => files.includes(file));

while (pending.length > 0) {
  const file = pending.pop();
  if (!file || reachable.has(file)) {
    continue;
  }
  reachable.add(file);
  const source = readFileSync(file, "utf8");
  for (const specifier of collectImportSpecifiers(source)) {
    const dependency = resolveImport(file, specifier);
    if (dependency && !reachable.has(dependency)) {
      pending.push(dependency);
    }
  }
}

const orphanFiles = files
  .filter((file) => !reachable.has(file))
  .map((file) => relative(repoRoot, file))
  .sort();

if (orphanFiles.length > 0) {
  console.error("UI source files not reachable from the app entry points:");
  for (const file of orphanFiles) {
    console.error(`  - ${file}`);
  }
  console.error("Import the file from the app graph or remove it if it is dead code.");
  process.exit(1);
}

console.log(`UI orphan check ok (${reachable.size} reachable source files).`);
