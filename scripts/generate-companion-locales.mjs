import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CATALOG_LOCALES,
  DEFAULT_LOCALE,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  validateDictionaryMessageFormats,
  validateLocaleDictionaries,
  validateLocaleOverlay,
} from "./check-i18n-locales.mjs";

const repoRoot = resolve(".");

export const companionLocaleCatalogFile = resolve(
  repoRoot,
  "localization",
  "companion-dictionaries.json",
);

export const companionLocaleOutputRoot = resolve(
  repoRoot,
  "src-tauri",
  "companion_browser",
);

export const companionLocaleRustRegistryFile = resolve(
  repoRoot,
  "src-tauri",
  "src",
  "companion_locale_assets.generated.rs",
);

function isPlainDictionaryObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function companionDictionaryValueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  let constructorName = null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "constructor")?.value
      : null;
    constructorName = typeof constructor === "function" ? constructor.name : null;
  } catch {
    return "uninspectable object";
  }
  return constructorName && constructorName !== "Object"
    ? `object (${constructorName})`
    : "object";
}

function validateCompanionDictionaryNode(value, path, ancestors) {
  if (typeof value === "string") {
    return [];
  }
  if (!isPlainDictionaryObject(value)) {
    return [
      `${path} must be a string leaf or nested object; received ${companionDictionaryValueType(value)}.`,
    ];
  }
  if (ancestors.has(value)) {
    return [`${path} contains a cyclic object.`];
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length === 0) {
    return [`${path} must not be an empty object.`];
  }

  const errors = [];
  const nestedAncestors = new Set(ancestors).add(value);
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      errors.push(`${path} contains a non-string translation key.`);
      continue;
    }
    const keyPath = key ? `${path}.${key}` : `${path}.<empty>`;
    if (!key || key.includes(".")) {
      errors.push(
        `${keyPath} has an invalid translation key segment; segments must be non-empty and cannot contain dots.`,
      );
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      errors.push(
        `${keyPath} must be an enumerable data property in the catalog.`,
      );
      continue;
    }
    errors.push(
      ...validateCompanionDictionaryNode(
        descriptor.value,
        keyPath,
        nestedAncestors,
      ),
    );
  }
  return errors;
}

export function validateCompanionDictionaryShape(dictionary, locale) {
  if (!isPlainDictionaryObject(dictionary)) {
    return [
      `${locale} must contain an object dictionary; received ${companionDictionaryValueType(dictionary)}.`,
    ];
  }
  return validateCompanionDictionaryNode(dictionary, locale, new Set());
}

export function validateCompanionDictionariesShape(dictionaries) {
  if (!isPlainDictionaryObject(dictionaries)) {
    return [
      `Companion dictionaries must be an object keyed by locale; received ${companionDictionaryValueType(dictionaries)}.`,
    ];
  }
  const localeKeys = Reflect.ownKeys(dictionaries);
  if (localeKeys.length === 0) {
    return ["Companion dictionaries must contain at least one locale."];
  }

  const errors = [];
  for (const locale of localeKeys) {
    if (typeof locale !== "string") {
      errors.push("Companion dictionary map contains a non-string locale key.");
      continue;
    }
    const localeLabel = locale || "<empty locale>";
    if (!locale) {
      errors.push("Companion dictionary map contains an empty locale key.");
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(dictionaries, locale);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      errors.push(
        `${localeLabel} must be an enumerable data property in Companion dictionaries.`,
      );
      continue;
    }
    errors.push(
      ...validateCompanionDictionaryShape(descriptor.value, localeLabel),
    );
  }
  return errors;
}

export function companionLocaleAssetName(locale) {
  return `companion_locale_${locale}.js`;
}

export function readCompanionLocaleCatalog(
  catalogFile = companionLocaleCatalogFile,
) {
  let document;
  try {
    document = JSON.parse(readFileSync(catalogFile, "utf8"));
  } catch (error) {
    throw new Error(
      `${catalogFile} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isPlainDictionaryObject(document)) {
    throw new Error(`${catalogFile} must contain a JSON object.`);
  }
  if (document.schemaVersion !== 1 || !("dictionaries" in document)) {
    throw new Error(
      `${catalogFile} must use schemaVersion 1 and contain dictionaries.`,
    );
  }
  const shapeErrors = validateCompanionDictionariesShape(document.dictionaries);
  if (shapeErrors.length > 0) {
    throw new Error(
      `${catalogFile} has an invalid Companion dictionary structure:\n${shapeErrors.join("\n")}`,
    );
  }
  return document.dictionaries;
}

export function validateCompanionLocaleCatalog(
  dictionaries,
  localeDefinitions = CATALOG_LOCALES,
) {
  const expected = localeDefinitions.map(({ id }) => id).sort();
  const shapeErrors = validateCompanionDictionariesShape(dictionaries);
  if (shapeErrors.length > 0) {
    return shapeErrors;
  }
  const actual = Object.keys(dictionaries).sort();
  const errors = [];
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    errors.push(
      `Catalog locales ${actual.join(", ")} do not match manifest locales ${expected.join(", ")}.`,
    );
  }
  if (errors.length > 0) {
    return errors;
  }

  const baseDictionary = dictionaries[DEFAULT_LOCALE];
  errors.push(
    ...validateDictionaryMessageFormats(baseDictionary, DEFAULT_LOCALE),
  );
  for (const locale of expected) {
    if (locale !== DEFAULT_LOCALE) {
      const definition = localeDefinitions.find(({ id }) => id === locale);
      errors.push(
        ...(definition?.catalogKind === "draft"
          ? validateLocaleOverlay(baseDictionary, dictionaries[locale], locale)
          : validateLocaleDictionaries(
              baseDictionary,
              dictionaries[locale],
              locale,
            )),
      );
    }
  }
  return errors;
}

const SAFE_JAVASCRIPT_PROPERTY_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// The generated files are JavaScript modules rather than JSON documents. Keep
// string values JSON-escaped, while omitting quotes from ordinary property
// names to reduce both the embedded app size and the locale payload served to
// the browser. __proto__ uses computed-property syntax so it can never acquire
// object-literal prototype semantics if a future catalog adds that key.
function companionDictionaryLiteral(value) {
  if (Array.isArray(value)) {
    return `[${value.map(companionDictionaryLiteral).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, nestedValue]) => {
        const property =
          key === "__proto__"
            ? `[${JSON.stringify(key)}]`
            : SAFE_JAVASCRIPT_PROPERTY_NAME.test(key)
              ? key
              : JSON.stringify(key);
        return `${property}:${companionDictionaryLiteral(nestedValue)}`;
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function companionLocaleModuleSource(locale, dictionary) {
  const shapeErrors = validateCompanionDictionaryShape(dictionary, locale);
  if (shapeErrors.length > 0) {
    throw new Error(shapeErrors.join("\n"));
  }
  return [
    "// Generated by scripts/generate-companion-locales.mjs.",
    "// Edit localization/companion-dictionaries.json, then regenerate.",
    `export const locale = ${JSON.stringify(locale)};`,
    `const dictionary = ${companionDictionaryLiteral(dictionary)};`,
    "export default dictionary;",
    "",
  ].join("\n");
}

export function generatedCompanionLocaleFiles(
  dictionaries,
  localeDefinitions = CATALOG_LOCALES,
) {
  return new Map(
    localeDefinitions.map(({ id }) => [
      companionLocaleAssetName(id),
      companionLocaleModuleSource(id, dictionaries[id]),
    ]),
  );
}

export function companionLocaleRustRegistrySource(
  localeDefinitions = CATALOG_LOCALES,
) {
  const entries = localeDefinitions
    .map(({ id }) => {
      const assetName = companionLocaleAssetName(id);
      return [
        "    (",
        `        ${JSON.stringify(assetName)},`,
        "        CompanionBrowserAsset {",
        '            content_type: "application/javascript; charset=utf-8",',
        `            content: include_str!("../companion_browser/${assetName}"),`,
        "        },",
        "    ),",
      ].join("\n");
    })
    .join("\n");
  return [
    "// Generated by scripts/generate-companion-locales.mjs.",
    "// Edit localization/companion-dictionaries.json, then regenerate.",
    "use super::CompanionBrowserAsset;",
    "",
    "pub(super) const COMPANION_BROWSER_LOCALE_ASSETS: &[(&str, CompanionBrowserAsset)] = &[",
    entries,
    "];",
    "",
  ].join("\n");
}

export function checkGeneratedCompanionLocales({
  catalogFile = companionLocaleCatalogFile,
  outputRoot = companionLocaleOutputRoot,
  registryFile = companionLocaleRustRegistryFile,
  localeDefinitions = CATALOG_LOCALES,
} = {}) {
  let dictionaries;
  try {
    dictionaries = readCompanionLocaleCatalog(catalogFile);
  } catch (error) {
    return {
      dictionaries: null,
      errors: [error instanceof Error ? error.message : String(error)],
      files: new Map(),
    };
  }
  const errors = validateCompanionLocaleCatalog(dictionaries, localeDefinitions);
  if (errors.length > 0) {
    return { dictionaries, errors, files: new Map() };
  }
  const expectedFiles = generatedCompanionLocaleFiles(
    dictionaries,
    localeDefinitions,
  );
  for (const [name, expected] of expectedFiles) {
    const path = resolve(outputRoot, name);
    if (!existsSync(path)) {
      errors.push(`Missing generated Companion locale module ${name}.`);
      continue;
    }
    if (readFileSync(path, "utf8") !== expected) {
      errors.push(
        `${name} is stale; run npm run generate:companion-locales.`,
      );
    }
  }
  if (existsSync(outputRoot)) {
    for (const name of readdirSync(outputRoot)) {
      if (
        name.startsWith("companion_locale_") &&
        name.endsWith(".js") &&
        !expectedFiles.has(name)
      ) {
        errors.push(`Unexpected generated Companion locale module ${name}.`);
      }
    }
  }
  const expectedRegistry = companionLocaleRustRegistrySource(localeDefinitions);
  if (!existsSync(registryFile)) {
    errors.push(`Missing generated Companion Rust locale registry ${registryFile}.`);
  } else if (readFileSync(registryFile, "utf8") !== expectedRegistry) {
    errors.push(
      `${basename(registryFile)} is stale; run npm run generate:companion-locales.`,
    );
  }
  return { dictionaries, errors, files: expectedFiles };
}

export function writeGeneratedCompanionLocales({
  catalogFile = companionLocaleCatalogFile,
  outputRoot = companionLocaleOutputRoot,
  registryFile = companionLocaleRustRegistryFile,
  localeDefinitions = CATALOG_LOCALES,
} = {}) {
  const dictionaries = readCompanionLocaleCatalog(catalogFile);
  const errors = validateCompanionLocaleCatalog(dictionaries, localeDefinitions);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  const files = generatedCompanionLocaleFiles(dictionaries, localeDefinitions);
  mkdirSync(outputRoot, { recursive: true });
  for (const [name, source] of files) {
    writeFileSync(resolve(outputRoot, name), source);
  }
  mkdirSync(dirname(registryFile), { recursive: true });
  writeFileSync(
    registryFile,
    companionLocaleRustRegistrySource(localeDefinitions),
  );
  return files;
}

function run() {
  const checkOnly = process.argv.includes("--check");
  try {
    if (checkOnly) {
      const { errors, files } = checkGeneratedCompanionLocales();
      if (errors.length > 0) {
        console.error("Generated Companion locale contract failed:");
        for (const error of errors) {
          console.error(`  - ${error}`);
        }
        process.exitCode = 1;
        return;
      }
      console.log(
        `Generated Companion locale contract ok (${files.size} locale modules).`,
      );
      return;
    }

    const files = writeGeneratedCompanionLocales();
    console.log(
      `Generated ${files.size} Companion locale modules in ${basename(companionLocaleOutputRoot)}.`,
    );
  } catch (error) {
    console.error("Generated Companion locale contract failed:");
    console.error(`  - ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
