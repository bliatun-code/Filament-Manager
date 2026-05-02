import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function collectTestFiles(directory, pattern) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(entryPath, pattern);
    }
    return entry.isFile() && pattern.test(entry.name) ? [entryPath] : [];
  });
}

export function runNodeTestCommand(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
