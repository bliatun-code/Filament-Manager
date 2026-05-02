import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(entryPath);
    }
    return entry.isFile() && /\.test\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

const testsDir = resolve("ui", "src");
const testFiles = collectTestFiles(testsDir).sort();

if (testFiles.length === 0) {
  console.error(`No UI tests found in ${testsDir}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["./node_modules/tsx/dist/cli.mjs", "--test", ...testFiles],
  {
    cwd: resolve("."),
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
