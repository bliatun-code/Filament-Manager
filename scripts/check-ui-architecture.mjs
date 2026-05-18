import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  buildRelativeImportResolver,
  collectImportSpecifiers,
  collectUiSourceFiles,
} from "./ui-source-utils.mjs";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const appPath = resolve(sourceRoot, "App.tsx");
const mainPath = resolve(sourceRoot, "main.tsx");

const files = collectUiSourceFiles(sourceRoot);
const resolveImport = buildRelativeImportResolver(files);
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
