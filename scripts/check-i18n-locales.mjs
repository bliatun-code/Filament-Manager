import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectUiSourceFiles } from "./ui-source-utils.mjs";

const repoRoot = resolve(".");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));

const localeFiles = {
  en: resolve(repoRoot, "ui", "src", "lib", "i18n_locales", "locales", "en.ts"),
  nb: resolve(repoRoot, "ui", "src", "lib", "i18n_locales", "locales", "nb.ts"),
};
const uiSourceRoot = resolve(repoRoot, "ui", "src");

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function readDictionaryNode(node, path = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(`Unsupported dictionary value at ${path.join(".") || "<root>"}`);
  }

  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`Unsupported dictionary property at ${path.join(".") || "<root>"}`);
    }
    const key = propertyNameText(property.name);
    if (!key) {
      throw new Error(`Unsupported dictionary key at ${path.join(".") || "<root>"}`);
    }
    result[key] = readDictionaryNode(property.initializer, [...path, key]);
  }
  return result;
}

export function readLocaleDictionaryFromSource(source, exportName) {
  const sourceFile = ts.createSourceFile(
    `${exportName}.ts`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) {
        continue;
      }
      if (!declaration.initializer) {
        throw new Error(`${exportName} is missing an initializer.`);
      }
      return readDictionaryNode(declaration.initializer);
    }
  }

  throw new Error(`Could not find ${exportName}.`);
}

function flattenDictionary(dictionary, prefix = "") {
  if (typeof dictionary === "string") {
    return [[prefix, dictionary]];
  }

  return Object.entries(dictionary).flatMap(([key, value]) =>
    flattenDictionary(value, prefix ? `${prefix}.${key}` : key),
  );
}

function isTranslationCallExpression(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text === "t";
  }
  return ts.isPropertyAccessExpression(expression) && expression.name.text === "t";
}

export function collectLiteralTranslationKeysFromSource(source, fileName = "source.tsx") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const keys = [];

  function visit(node) {
    if (ts.isCallExpression(node) && isTranslationCallExpression(node.expression)) {
      const keyArgument = node.arguments[0];
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

export function validateRuntimeTranslationKeys(dictionary, runtimeKeys) {
  const dictionaryKeys = new Set(flattenDictionary(dictionary).map(([key]) => key));
  return runtimeKeys
    .filter(({ key }) => !dictionaryKeys.has(key))
    .map(({ key, location }) => `${location}: unknown translation key ${key}.`);
}

function placeholderTokens(value) {
  return Array.from(value.matchAll(/\{([A-Za-z0-9_]+)\}/g), (match) => match[1]).sort();
}

function compareSets(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  return {
    missingFromRight: [...left].filter((value) => !right.has(value)).sort(),
    extraInRight: [...right].filter((value) => !left.has(value)).sort(),
  };
}

export function validateLocaleDictionaries(baseDictionary, targetDictionary, targetLocale = "nb") {
  const baseEntries = new Map(flattenDictionary(baseDictionary));
  const targetEntries = new Map(flattenDictionary(targetDictionary));
  const { missingFromRight, extraInRight } = compareSets(baseEntries.keys(), targetEntries.keys());
  const errors = [];

  for (const key of missingFromRight) {
    errors.push(`${targetLocale} is missing translation key ${key}.`);
  }
  for (const key of extraInRight) {
    errors.push(`${targetLocale} has extra translation key ${key}.`);
  }

  for (const [key, baseValue] of baseEntries) {
    const targetValue = targetEntries.get(key);
    if (typeof targetValue !== "string") {
      continue;
    }
    const basePlaceholders = placeholderTokens(baseValue);
    const targetPlaceholders = placeholderTokens(targetValue);
    const placeholderDiff = compareSets(basePlaceholders, targetPlaceholders);
    for (const missing of placeholderDiff.missingFromRight) {
      errors.push(`${targetLocale}.${key} is missing placeholder {${missing}}.`);
    }
    for (const extra of placeholderDiff.extraInRight) {
      errors.push(`${targetLocale}.${key} has extra placeholder {${extra}}.`);
    }
  }

  return errors;
}

function runI18nLocaleCheck() {
  const enDictionary = readLocaleDictionaryFromSource(
    readFileSync(localeFiles.en, "utf8"),
    "enDictionary",
  );
  const nbDictionary = readLocaleDictionaryFromSource(
    readFileSync(localeFiles.nb, "utf8"),
    "nbDictionary",
  );
  const errors = validateLocaleDictionaries(enDictionary, nbDictionary, "nb");
  const runtimeKeys = collectUiSourceFiles(uiSourceRoot).flatMap((file) =>
    collectLiteralTranslationKeysFromSource(readFileSync(file, "utf8"), file).map((entry) => ({
      key: entry.key,
      location: `${relative(repoRoot, file)}:${entry.line}:${entry.column}`,
    })),
  );
  errors.push(...validateRuntimeTranslationKeys(enDictionary, runtimeKeys));

  if (errors.length > 0) {
    console.error("UI locale dictionary contract failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI locale dictionary contract ok.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runI18nLocaleCheck();
}
