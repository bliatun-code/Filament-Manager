import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateLocaleDictionaries,
  validateLocaleOverlay,
  validateRuntimeTranslationKeys,
} from "./check-i18n-locales.mjs";
import {
  checkGeneratedCompanionLocales,
  readCompanionLocaleCatalog,
} from "./generate-companion-locales.mjs";
import {
  DEFAULT_LOCALE,
  CATALOG_LOCALES,
  SOURCE_LOCALES,
} from "../src-tauri/companion_browser/supported_locales.js";
import { ERROR_MESSAGE_DESCRIPTORS } from "../src-tauri/companion_browser/app_error.js";

const repoRoot = resolve(".");
const companionRoot = resolve(repoRoot, "src-tauri", "companion_browser");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));
const BACKEND_APP_ERROR_PREFIXES = Object.freeze([
  "bambu_live.",
  "export.",
  "filament_price_batch.",
  "filament_standards.",
  "inventory.bulk.",
  "inventory.location.",
  "inventory.spool.",
  "loans.",
  "purchase_metadata.",
  "purchase_price_protection.",
  "wishlist.",
]);

function rustSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return rustSourceFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".rs")
      ? [path]
      : [];
  });
}

export function collectLiteralCompanionTranslationKeys(source, fileName = "source.js") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const keys = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const keyArgument = node.arguments[1];
      if (ts.isStringLiteral(keyArgument) || ts.isNoSubstitutionTemplateLiteral(keyArgument)) {
        const location = sourceFile.getLineAndCharacterOfPosition(keyArgument.getStart(sourceFile));
        keys.push({
          key: keyArgument.text,
          line: location.line + 1,
          column: location.character + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return keys;
}

export function collectAppErrorTranslationKeys(
  descriptors = ERROR_MESSAGE_DESCRIPTORS,
) {
  return Object.entries(descriptors).map(([errorCode, [key]]) => ({
    key,
    location: `src-tauri/companion_browser/app_error.js descriptor ${errorCode}`,
  }));
}

export function collectBackendAppErrorCodes(
  source,
  fileName = "source.rs",
  prefixes = BACKEND_APP_ERROR_PREFIXES,
) {
  const codes = [];
  for (const match of source.matchAll(
    /"([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)"/g,
  )) {
    const code = match[1];
    if (
      !prefixes.some((prefix) => code.startsWith(prefix)) ||
      /\.(?:css|db|js|json|local|rs|tmp)$/.test(code)
    ) {
      continue;
    }
    const offset = match.index ?? 0;
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    codes.push({
      code,
      location: `${fileName}:${line}:${offset - lastNewline}`,
    });
  }
  return codes;
}

export function validateBackendAppErrorDescriptors(
  backendCodes,
  descriptors = ERROR_MESSAGE_DESCRIPTORS,
) {
  const errors = [];
  const seen = new Set();
  for (const { code, location } of backendCodes) {
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    if (!Object.hasOwn(descriptors, code)) {
      errors.push(
        `${location}: backend app-error code ${code} has no app_error.js descriptor.`,
      );
    }
  }
  return errors;
}

function runCompanionI18nCheck() {
  const dictionaries = readCompanionLocaleCatalog();
  const dictionaryLocales = Object.keys(dictionaries).sort();
  const manifestLocales = CATALOG_LOCALES.map(({ id }) => id).sort();
  const errors = [...checkGeneratedCompanionLocales().errors];
  if (JSON.stringify(dictionaryLocales) !== JSON.stringify(manifestLocales)) {
    errors.push(
      `Companion dictionary locales ${dictionaryLocales.join(", ")} do not match manifest locales ${manifestLocales.join(", ")}.`,
    );
  }
  const baseDictionary = dictionaries[DEFAULT_LOCALE];
  for (const { id } of SOURCE_LOCALES) {
    if (id !== DEFAULT_LOCALE && dictionaries[id]) {
      errors.push(...validateLocaleDictionaries(baseDictionary, dictionaries[id], id));
    }
  }
  for (const { id } of CATALOG_LOCALES.filter(({ catalogKind }) => catalogKind === "draft")) {
    errors.push(...validateLocaleOverlay(baseDictionary, dictionaries[id], id));
  }
  const runtimeKeys = readdirSync(companionRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .flatMap((entry) => {
      const file = resolve(companionRoot, entry.name);
      return collectLiteralCompanionTranslationKeys(readFileSync(file, "utf8"), file).map(
        ({ key, line, column }) => ({
          key,
          location: `${relative(repoRoot, file)}:${line}:${column}`,
        }),
      );
    });
  runtimeKeys.push(...collectAppErrorTranslationKeys());
  errors.push(...validateRuntimeTranslationKeys(baseDictionary, runtimeKeys));
  const backendCodes = [
    resolve(repoRoot, "src", "backend"),
    resolve(repoRoot, "src-tauri", "src"),
  ].flatMap((root) =>
    rustSourceFiles(root).flatMap((file) =>
      collectBackendAppErrorCodes(
        readFileSync(file, "utf8"),
        relative(repoRoot, file),
      ),
    ),
  );
  errors.push(
    ...validateBackendAppErrorDescriptors(
      backendCodes,
      ERROR_MESSAGE_DESCRIPTORS,
    ),
  );

  if (errors.length > 0) {
    console.error("Companion locale dictionary contract failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Companion locale dictionary contract ok.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCompanionI18nCheck();
}
