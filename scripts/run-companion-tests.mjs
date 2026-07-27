import { resolve } from "node:path";
import {
  collectTestFiles,
  normalizeNodeTestArgs,
  runNodeTestCommand,
  toNodeImportSpecifier,
} from "./test-runner-utils.mjs";

const testsDir = resolve("src-tauri", "companion_browser");
const testFiles = collectTestFiles(testsDir, /\.test\.mjs$/).sort();

if (testFiles.length === 0) {
  console.error(`No companion tests found in ${testsDir}`);
  process.exit(1);
}

runNodeTestCommand([
  "--import",
  toNodeImportSpecifier(resolve("scripts", "preload-companion-locales.mjs")),
  "--test",
  ...normalizeNodeTestArgs(process.argv.slice(2)),
  ...testFiles,
]);
