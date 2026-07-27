import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function collectTestFiles(directory, pattern) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(entryPath, pattern);
    }
    return entry.isFile() && pattern.test(entry.name) ? [entryPath] : [];
  });
}

export function normalizeNodeTestArgs(argv) {
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--grep" || arg === "-g") {
      const pattern = argv[index + 1];
      if (!pattern) {
        throw new Error(`${arg} requires a test name pattern`);
      }
      normalized.push("--test-name-pattern", pattern);
      index += 1;
      continue;
    }
    if (arg.startsWith("--grep=")) {
      normalized.push(`--test-name-pattern=${arg.slice("--grep=".length)}`);
      continue;
    }
    normalized.push(arg);
  }
  return normalized;
}

export function toNodeImportSpecifier(filePath) {
  return pathToFileURL(filePath).href;
}

export function runNodeTestCommand(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    ...options,
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
