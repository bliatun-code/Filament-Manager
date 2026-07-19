import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootSourceFiles = ["Cargo.toml", "package.json"];
const sourceRoots = [
  "scripts",
  "src",
  "src-tauri",
  "ui",
  ".github/workflows",
];
const sourceExtensions = new Set([
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".plist",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([
  ".git",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const ignoredFiles = new Set(["package-lock.json"]);
const allowMarker = "path-portability-allow";
const slash = String.raw`\/`;
const hostSpecificPathPatterns = [
  {
    label: "hardcoded Unix temporary directory",
    pattern: new RegExp(`${slash}(?:private${slash})?tmp${slash}`),
  },
  {
    label: "hardcoded macOS user directory",
    pattern: new RegExp(`${slash}Users${slash}`),
  },
  {
    label: "hardcoded macOS per-user temporary directory",
    pattern: new RegExp(`${slash}var${slash}folders${slash}`),
  },
];
const filesystemPathIdentifier =
  String.raw`(?:[A-Za-z_$][A-Za-z0-9_$]*\.)*(?:[A-Za-z_$][A-Za-z0-9_$]*(?:Root|Dir|Directory|Folder|Cwd|_?(?:root|dir|directory|folder))|root|dir|directory|folder|cwd)`;
const filesystemPathExpression = String.raw`(?:${filesystemPathIdentifier}|process\.cwd\(\)|tmpdir\(\)|__dirname|__filename|(?:resolve|dirname|join)\([^)]*\))`;
const manualFilesystemSeparatorPatterns = [
  new RegExp(String.raw`\$\{\s*${filesystemPathExpression}\s*\}\s*\/`, "g"),
  new RegExp(
    String.raw`${filesystemPathExpression}\s*\+\s*["'\x60]\/`,
    "g",
  ),
];
const macosApplicationSupportPathPattern =
  /["'`]Library["'`]\s*,\s*["'`]Application Support["'`]/g;

function lineNumberAtOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function collectFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectFiles(entryPath, files);
      }
      continue;
    }
    if (
      entry.isFile() &&
      !ignoredFiles.has(entry.name) &&
      sourceExtensions.has(extname(entry.name))
    ) {
      files.push(entryPath);
    }
  }
}

export function collectPathPortabilitySourceFiles(repoRoot = resolve(".")) {
  const files = [];
  for (const rootSourceFile of rootSourceFiles) {
    const sourceFile = resolve(repoRoot, rootSourceFile);
    if (existsSync(sourceFile) && statSync(sourceFile).isFile()) {
      files.push(sourceFile);
    }
  }
  for (const sourceRoot of sourceRoots) {
    const directory = resolve(repoRoot, sourceRoot);
    if (existsSync(directory)) {
      collectFiles(directory, files);
    }
  }
  return Array.from(new Set(files)).sort();
}

export function findHostSpecificPaths(source, file = "<source>") {
  const errors = [];
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (line.includes(allowMarker)) {
      continue;
    }
    for (const { label, pattern } of hostSpecificPathPatterns) {
      if (pattern.test(line)) {
        errors.push({ file, label, line: index + 1 });
      }
    }
  }

  for (const match of source.matchAll(macosApplicationSupportPathPattern)) {
    const segmentOffset = match[0].lastIndexOf("Application Support");
    const line = lineNumberAtOffset(
      source,
      (match.index ?? 0) + Math.max(segmentOffset, 0),
    );
    if (lines[line - 1]?.includes(allowMarker)) {
      continue;
    }
    errors.push({
      file,
      label: "hardcoded macOS Application Support path construction",
      line,
    });
  }

  for (const pattern of manualFilesystemSeparatorPatterns) {
    for (const match of source.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const separatorOffset = match[0].lastIndexOf("/");
      const line = lineNumberAtOffset(
        source,
        (match.index ?? 0) + Math.max(separatorOffset, 0),
      );
      if (lines[line - 1]?.includes(allowMarker)) {
        continue;
      }
      errors.push({
        file,
        label: "manual POSIX separator appended to a filesystem path",
        line,
      });
    }
  }

  return errors.sort(
    (left, right) =>
      left.line - right.line || left.label.localeCompare(right.label),
  );
}

export function analyzePathPortability(options = {}) {
  const sourceFiles =
    options.sourceFiles ?? collectPathPortabilitySourceFiles(options.repoRoot);
  const errors = sourceFiles.flatMap((sourceFile) =>
    findHostSpecificPaths(readFileSync(sourceFile, "utf8"), sourceFile),
  );

  return { errors, sourceFiles };
}

function runCli() {
  const { errors, sourceFiles } = analyzePathPortability();
  if (errors.length > 0) {
    console.error("Path portability contract failed:");
    for (const error of errors) {
      console.error(`  - ${error.file}:${error.line}: ${error.label}`);
    }
    console.error(
      "Build paths from node:os and node:path, or add a documented path-portability-allow marker for an intentional fixture.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Path portability contract ok (${sourceFiles.length} source files checked).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
