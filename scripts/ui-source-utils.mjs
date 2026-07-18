import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sourceExtensions = [".ts", ".tsx"];

export function collectUiSourceFiles(sourceRoot) {
  return readdirSync(sourceRoot, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(sourceRoot, entry.name);
    if (entry.isDirectory()) {
      return collectUiSourceFiles(entryPath);
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

export function buildRelativeImportResolver(files) {
  const byKey = new Map();
  for (const file of files) {
    const key = sourceFileKey(file);
    byKey.set(key, file);
    byKey.set(`${key}.ts`, file);
    byKey.set(`${key}.tsx`, file);
    byKey.set(join(key, "index"), file);
  }
  return (fromFile, specifier) => {
    if (!specifier.startsWith(".")) {
      return null;
    }
    return byKey.get(resolve(join(fromFile, ".."), specifier)) ?? null;
  };
}

export function collectImportSpecifiers(source) {
  const specifiers = new Set();
  const importPattern =
    /(?:import|export)\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gms;
  for (const match of source.matchAll(importPattern)) {
    specifiers.add(match[1] ?? match[2]);
  }
  return specifiers;
}

export function collectDynamicImportTemplateSpecifiers(source) {
  return Array.from(
    source.matchAll(/import\(\s*`([^`]*\$\{[^}]+\}[^`]*)`\s*\)/g),
    (match) => match[1].replace(/\$\{[^}]+\}/g, "*"),
  );
}

export function pathGlobToRegExp(absolutePattern) {
  return new RegExp(
    `^${absolutePattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("**", "::DOUBLE_STAR::")
      .replaceAll("*", "[^/\\\\]*")
      .replaceAll("::DOUBLE_STAR::", ".*")}$`,
  );
}

export function resolveRelativeImportGlob(files, fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return [];
  }
  const absolutePattern = resolve(join(fromFile, ".."), specifier);
  const expression = pathGlobToRegExp(absolutePattern);
  return files.filter((file) => expression.test(file));
}
