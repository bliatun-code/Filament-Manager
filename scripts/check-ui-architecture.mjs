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
const lazyOnlyModules = new Set(
  [
    "ui/src/lib/bambu_filament_code_camera_scan.ts",
    "ui/src/lib/bambu_filament_code_image_scan.ts",
    "ui/src/lib/filament_label_print.ts",
    "ui/src/lib/filament_qr_payload.ts",
    "ui/src/lib/inventory_overview_print.ts",
    "ui/src/lib/spool_qr_artifacts.ts",
  ].map((file) => resolve(repoRoot, file)),
);
const allowedLazyIslandStaticImports = new Set(
  [
    ["ui/src/lib/bambu_filament_code_camera_scan.ts", "ui/src/lib/bambu_filament_code_image_scan.ts"],
    ["ui/src/lib/spool_qr_artifacts.ts", "ui/src/lib/filament_qr_payload.ts"],
  ].map(([fromFile, toFile]) => `${resolve(repoRoot, fromFile)}=>${resolve(repoRoot, toFile)}`),
);

const files = collectUiSourceFiles(sourceRoot);
const resolveImport = buildRelativeImportResolver(files);
const appImporters = [];
const staticLazyOnlyImporters = [];

function collectStaticRuntimeImportSpecifiers(source) {
  const specifiers = new Set();
  const importPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']/gms;
  for (const match of source.matchAll(importPattern)) {
    specifiers.add(match[1]);
  }
  return specifiers;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (file !== mainPath) {
    for (const specifier of collectImportSpecifiers(source)) {
      if (resolveImport(file, specifier) === appPath) {
        appImporters.push(relative(repoRoot, file));
        break;
      }
    }
  }

  for (const specifier of collectStaticRuntimeImportSpecifiers(source)) {
    const importedFile = resolveImport(file, specifier);
    if (!importedFile || !lazyOnlyModules.has(importedFile)) {
      continue;
    }
    const importKey = `${file}=>${importedFile}`;
    if (allowedLazyIslandStaticImports.has(importKey)) {
      continue;
    }
    staticLazyOnlyImporters.push({
      from: relative(repoRoot, file),
      to: relative(repoRoot, importedFile),
    });
  }
}

if (appImporters.length > 0) {
  console.error("UI source files must not import App.tsx; move shared types/models to ui/src/lib or page models:");
  for (const file of appImporters.sort()) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

if (staticLazyOnlyImporters.length > 0) {
  console.error(
    "UI runtime code must lazy-load print, QR, and scanner helpers instead of statically importing them:",
  );
  for (const entry of staticLazyOnlyImporters.sort((left, right) =>
    `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
  )) {
    console.error(`  - ${entry.from} -> ${entry.to}`);
  }
  process.exit(1);
}

console.log(`UI architecture check ok (${files.length} source files scanned).`);
