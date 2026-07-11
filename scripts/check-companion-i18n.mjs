import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateLocaleOverlay,
  validateRuntimeTranslationKeys,
} from "./check-i18n-locales.mjs";
import {
  DEFAULT_LOCALE,
  CATALOG_LOCALES,
  SOURCE_LOCALES,
} from "../src-tauri/companion_browser/supported_locales.js";

const repoRoot = resolve(".");
const companionRoot = resolve(repoRoot, "src-tauri", "companion_browser");
const dictionaryFile = resolve(companionRoot, "companion_i18n.js");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));

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

function runCompanionI18nCheck() {
  const dictionaries = readLocaleDictionaryFromSource(
    readFileSync(dictionaryFile, "utf8"),
    "dictionaries",
  );
  const dictionaryLocales = Object.keys(dictionaries).sort();
  const manifestLocales = CATALOG_LOCALES.map(({ id }) => id).sort();
  const errors = [];
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
  errors.push(...validateRuntimeTranslationKeys(baseDictionary, runtimeKeys));

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
