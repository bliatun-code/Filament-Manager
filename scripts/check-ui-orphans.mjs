import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  buildRelativeImportResolver,
  collectImportSpecifiers,
  collectUiSourceFiles,
} from "./ui-source-utils.mjs";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const entryFiles = [
  resolve(sourceRoot, "main.tsx"),
  resolve(sourceRoot, "App.tsx"),
];

const files = collectUiSourceFiles(sourceRoot);
const resolveImport = buildRelativeImportResolver(files);
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
