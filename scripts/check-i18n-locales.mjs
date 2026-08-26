import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectUiSourceFiles } from "./ui-source-utils.mjs";
import {
  CATALOG_LOCALES,
  DEFAULT_LOCALE,
  SOURCE_LOCALES,
} from "../src-tauri/companion_browser/supported_locales.js";

const repoRoot = resolve(".");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));

const localeFiles = Object.fromEntries(
  CATALOG_LOCALES.map(({ id }) => [
    id,
    resolve(
      repoRoot,
      "ui",
      "src",
      "lib",
      "i18n_locales",
      "locales",
      `${id}.ts`,
    ),
  ]),
);
const uiSourceRoot = resolve(repoRoot, "ui", "src");

export function localeDictionaryExportName(locale) {
  return `${String(locale).replace(/-([a-z])/gi, (_, letter) => letter.toUpperCase())}Dictionary`;
}

function propertyNameText(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function readDictionaryNode(node, path = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(
      `Unsupported dictionary value at ${path.join(".") || "<root>"}`,
    );
  }

  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(
        `Unsupported dictionary property at ${path.join(".") || "<root>"}`,
      );
    }
    const key = propertyNameText(property.name);
    if (!key) {
      throw new Error(
        `Unsupported dictionary key at ${path.join(".") || "<root>"}`,
      );
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
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== exportName
      ) {
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

export function flattenDictionary(dictionary, prefix = "") {
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
  return (
    ts.isPropertyAccessExpression(expression) && expression.name.text === "t"
  );
}

export function collectLiteralTranslationKeysFromSource(
  source,
  fileName = "source.tsx",
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const keys = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      isTranslationCallExpression(node.expression)
    ) {
      const keyArgument = node.arguments[0];
      if (
        ts.isStringLiteral(keyArgument) ||
        ts.isNoSubstitutionTemplateLiteral(keyArgument)
      ) {
        const paramsArgument = node.arguments[2];
        let staticParamKeys = null;
        if (paramsArgument && ts.isObjectLiteralExpression(paramsArgument)) {
          const names = [];
          let staticallyComplete = true;
          for (const property of paramsArgument.properties) {
            if (ts.isSpreadAssignment(property)) {
              staticallyComplete = false;
              break;
            }
            if (ts.isShorthandPropertyAssignment(property)) {
              names.push(property.name.text);
              continue;
            }
            if (ts.isPropertyAssignment(property)) {
              const name = propertyNameText(property.name);
              if (name) {
                names.push(name);
                continue;
              }
            }
            staticallyComplete = false;
            break;
          }
          if (staticallyComplete) {
            staticParamKeys = names.sort();
          }
        }
        const location = sourceFile.getLineAndCharacterOfPosition(
          keyArgument.getStart(sourceFile),
        );
        keys.push({
          key: keyArgument.text,
          line: location.line + 1,
          column: location.character + 1,
          paramsArgumentPresent:
            Boolean(paramsArgument) &&
            !(ts.isIdentifier(paramsArgument) && paramsArgument.text === "undefined"),
          staticParamKeys,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return keys;
}

export function validateRuntimeTranslationKeys(dictionary, runtimeKeys) {
  const dictionaryKeys = new Set(
    flattenDictionary(dictionary).map(([key]) => key),
  );
  return runtimeKeys
    .filter(({ key }) => !dictionaryKeys.has(key))
    .map(({ key, location }) => `${location}: unknown translation key ${key}.`);
}

export function validateRuntimeTranslationParams(dictionary, runtimeKeys) {
  const dictionaryEntries = new Map(flattenDictionary(dictionary));
  const errors = [];

  for (const entry of runtimeKeys) {
    const template = dictionaryEntries.get(entry.key);
    if (typeof template !== "string") {
      continue;
    }
    const requiredParams = [...new Set(placeholderTokens(template))];
    if (requiredParams.length === 0) {
      continue;
    }
    if (!entry.paramsArgumentPresent) {
      errors.push(
        `${entry.location}: translation key ${entry.key} requires ${requiredParams
          .map((name) => `{${name}}`)
          .join(", ")} but the call provides no message parameters.`,
      );
      continue;
    }
    if (!Array.isArray(entry.staticParamKeys)) {
      continue;
    }
    const supplied = new Set(entry.staticParamKeys);
    const missing = requiredParams.filter((name) => !supplied.has(name));
    if (missing.length > 0) {
      errors.push(
        `${entry.location}: translation key ${entry.key} is missing message ${
          missing.length === 1 ? "parameter" : "parameters"
        } ${missing.map((name) => `{${name}}`).join(", ")}.`,
      );
    }
  }

  return errors;
}

function placeholderTokens(value) {
  return Array.from(
    value.matchAll(/\{([A-Za-z0-9_]+)\s*(?:[,}])/g),
    (match) => match[1],
  ).sort();
}

function compareSets(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  return {
    missingFromRight: [...left].filter((value) => !right.has(value)).sort(),
    extraInRight: [...right].filter((value) => !left.has(value)).sort(),
  };
}

export function validateLocaleDictionaries(
  baseDictionary,
  targetDictionary,
  targetLocale = "nb",
) {
  const baseEntries = new Map(flattenDictionary(baseDictionary));
  const targetEntries = new Map(flattenDictionary(targetDictionary));
  const { missingFromRight, extraInRight } = compareSets(
    baseEntries.keys(),
    targetEntries.keys(),
  );
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
      errors.push(
        `${targetLocale}.${key} is missing placeholder {${missing}}.`,
      );
    }
    for (const extra of placeholderDiff.extraInRight) {
      errors.push(`${targetLocale}.${key} has extra placeholder {${extra}}.`);
    }
  }

  return errors;
}

export function validateLocaleOverlay(
  baseDictionary,
  targetDictionary,
  targetLocale,
) {
  const baseEntries = new Map(flattenDictionary(baseDictionary));
  const targetEntries = new Map(flattenDictionary(targetDictionary));
  const errors = [];

  for (const [key, targetValue] of targetEntries) {
    const baseValue = baseEntries.get(key);
    if (typeof baseValue !== "string") {
      errors.push(`${targetLocale} has unknown translation key ${key}.`);
      continue;
    }
    const placeholderDiff = compareSets(
      placeholderTokens(baseValue),
      placeholderTokens(targetValue),
    );
    for (const missing of placeholderDiff.missingFromRight) {
      errors.push(
        `${targetLocale}.${key} is missing placeholder {${missing}}.`,
      );
    }
    for (const extra of placeholderDiff.extraInRight) {
      errors.push(`${targetLocale}.${key} has extra placeholder {${extra}}.`);
    }
  }

  return errors;
}

function runI18nLocaleCheck() {
  const dictionaries = Object.fromEntries(
    CATALOG_LOCALES.map(({ id }) => [
      id,
      readLocaleDictionaryFromSource(
        readFileSync(localeFiles[id], "utf8"),
        localeDictionaryExportName(id),
      ),
    ]),
  );
  const baseDictionary = dictionaries[DEFAULT_LOCALE];
  const errors = SOURCE_LOCALES.filter(
    ({ id }) => id !== DEFAULT_LOCALE,
  ).flatMap(({ id }) =>
    validateLocaleDictionaries(baseDictionary, dictionaries[id], id),
  );
  for (const { id } of CATALOG_LOCALES.filter(
    ({ catalogKind }) => catalogKind === "draft",
  )) {
    errors.push(...validateLocaleOverlay(baseDictionary, dictionaries[id], id));
  }
  const runtimeKeys = collectUiSourceFiles(uiSourceRoot).flatMap((file) =>
    collectLiteralTranslationKeysFromSource(
      readFileSync(file, "utf8"),
      file,
    ).map((entry) => ({
      ...entry,
      location: `${relative(repoRoot, file)}:${entry.line}:${entry.column}`,
    })),
  );
  errors.push(...validateRuntimeTranslationKeys(baseDictionary, runtimeKeys));
  errors.push(...validateRuntimeTranslationParams(baseDictionary, runtimeKeys));

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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runI18nLocaleCheck();
}
