import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_LOCALE,
  CATALOG_LOCALES,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  flattenDictionary,
  localeDictionaryExportName,
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateLocaleOverlay,
} from "./check-i18n-locales.mjs";
import { readCompanionLocaleCatalog } from "./generate-companion-locales.mjs";

const repoRoot = resolve(".");
const statusFile = resolve(repoRoot, "localization", "locale-status.json");
const contextFile = resolve(repoRoot, "localization", "message-context.json");
const desktopLocaleRoot = resolve(
  repoRoot,
  "ui",
  "src",
  "lib",
  "i18n_locales",
  "locales",
);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function catalogFingerprint(desktopDictionary, companionDictionary) {
  const rows = [
    ...flattenDictionary(desktopDictionary).map(([key, value]) => [
      "desktop",
      key,
      value,
    ]),
    ...flattenDictionary(companionDictionary).map(([key, value]) => [
      "companion",
      key,
      value,
    ]),
  ].sort(([surfaceA, keyA], [surfaceB, keyB]) =>
    `${surfaceA}:${keyA}`.localeCompare(`${surfaceB}:${keyB}`, "en"),
  );
  return `sha256:${createHash("sha256").update(JSON.stringify(rows)).digest("hex")}`;
}

function dictionaryMap(dictionary) {
  return new Map(flattenDictionary(dictionary));
}

function translationStats(baseDictionary, targetDictionary) {
  const base = dictionaryMap(baseDictionary);
  const target = dictionaryMap(targetDictionary);
  const translated = [...base].filter(
    ([key, value]) =>
      typeof target.get(key) === "string" && target.get(key) !== value,
  ).length;
  const present = [...base.keys()].filter(
    (key) => typeof target.get(key) === "string",
  ).length;
  return {
    total: base.size,
    present,
    translated,
    keyCoveragePercent: base.size === 0 ? 100 : (present / base.size) * 100,
    distinctTranslationPercent:
      base.size === 0 ? 100 : (translated / base.size) * 100,
  };
}

export function validateTranslatorContext(
  contextDocument,
  baseDictionaries,
  fileExists = existsSync,
) {
  const errors = [];
  const seen = new Set();
  if (contextDocument?.schemaVersion !== 1 || !Array.isArray(contextDocument.messages)) {
    return [
      "Translator context must use schemaVersion 1 and a messages array.",
    ];
  }

  if (
    contextDocument.groups !== undefined &&
    !Array.isArray(contextDocument.groups)
  ) {
    errors.push("Translator context groups must be an array when provided.");
    return errors;
  }
  if (
    contextDocument.trivialGroups !== undefined &&
    !Array.isArray(contextDocument.trivialGroups)
  ) {
    errors.push(
      "Translator context trivialGroups must be an array when provided.",
    );
    return errors;
  }

  function validateSharedFields(entry, label) {
    if (
      typeof entry.meaning !== "string" ||
      entry.meaning.trim().length < 12
    ) {
      errors.push(`${label} needs a useful meaning.`);
    }
    if (
      typeof entry.screenshot !== "string" ||
      !fileExists(resolve(repoRoot, entry.screenshot))
    ) {
      errors.push(`${label} references a missing screenshot.`);
    }
    if (
      entry.maxCharacters !== undefined &&
      (!Number.isInteger(entry.maxCharacters) || entry.maxCharacters < 1)
    ) {
      errors.push(`${label} has an invalid maxCharacters value.`);
    }
  }

  for (const [index, message] of contextDocument.messages.entries()) {
    const label = `message-context.json messages[${index}]`;
    if (!Object.hasOwn(baseDictionaries, message.surface)) {
      errors.push(`${label} has unknown surface ${message.surface}.`);
      continue;
    }
    const identity = `${message.surface}:${message.key}`;
    if (seen.has(identity)) {
      errors.push(`${label} duplicates ${identity}.`);
    }
    seen.add(identity);
    if (!dictionaryMap(baseDictionaries[message.surface]).has(message.key)) {
      errors.push(`${label} references unknown key ${identity}.`);
    }
    validateSharedFields(message, label);
  }

  for (const [index, group] of (contextDocument.groups ?? []).entries()) {
    const label = `message-context.json groups[${index}]`;
    if (!Object.hasOwn(baseDictionaries, group.surface)) {
      errors.push(`${label} has unknown surface ${group.surface}.`);
      continue;
    }
    if (typeof group.keyPrefix !== "string" || !group.keyPrefix.trim()) {
      errors.push(`${label} needs a non-empty keyPrefix.`);
      continue;
    }
    const identity = `${group.surface}:${group.keyPrefix}`;
    if (seen.has(identity)) {
      errors.push(`${label} duplicates ${identity}.`);
    }
    seen.add(identity);
    const matches = flattenDictionary(baseDictionaries[group.surface]).some(
      ([key]) => key.startsWith(group.keyPrefix),
    );
    if (!matches) {
      errors.push(`${label} matches no keys for ${identity}.`);
    }
    validateSharedFields(group, label);
  }

  for (const [index, group] of (
    contextDocument.trivialGroups ?? []
  ).entries()) {
    const label = `message-context.json trivialGroups[${index}]`;
    if (!Object.hasOwn(baseDictionaries, group.surface)) {
      errors.push(`${label} has unknown surface ${group.surface}.`);
      continue;
    }
    if (typeof group.keyPrefix !== "string" || !group.keyPrefix.trim()) {
      errors.push(`${label} needs a non-empty keyPrefix.`);
      continue;
    }
    const identity = `${group.surface}:${group.keyPrefix}`;
    if (seen.has(identity)) {
      errors.push(`${label} duplicates ${identity}.`);
    }
    seen.add(identity);
    if (
      typeof group.reason !== "string" ||
      group.reason.trim().length < 12
    ) {
      errors.push(`${label} needs a useful reason.`);
    }
    const matches = flattenDictionary(baseDictionaries[group.surface]).some(
      ([key]) => key.startsWith(group.keyPrefix),
    );
    if (!matches) {
      errors.push(`${label} matches no keys for ${identity}.`);
    }
  }
  return errors;
}

export function translatorContextCoverageSnapshot(
  contextDocument,
  baseDictionaries,
) {
  const exact = new Set(
    (contextDocument.messages ?? []).map(
      ({ surface, key }) => `${surface}:${key}`,
    ),
  );
  const prefixes = (contextDocument.groups ?? []).filter(
    ({ surface, keyPrefix }) =>
      Object.hasOwn(baseDictionaries, surface) &&
      typeof keyPrefix === "string" &&
      keyPrefix.length > 0,
  );
  const trivialPrefixes = (contextDocument.trivialGroups ?? []).filter(
    ({ surface, keyPrefix }) =>
      Object.hasOwn(baseDictionaries, surface) &&
      typeof keyPrefix === "string" &&
      keyPrefix.length > 0,
  );
  const uncoveredKeys = Object.entries(baseDictionaries)
    .flatMap(([surface, dictionary]) =>
      flattenDictionary(dictionary)
        .map(([key]) => ({ surface, key }))
        .filter(({ key }) => {
          if (exact.has(`${surface}:${key}`)) {
            return false;
          }
          return !prefixes.some(
            (group) =>
              group.surface === surface && key.startsWith(group.keyPrefix),
          ) && !trivialPrefixes.some(
            (group) =>
              group.surface === surface && key.startsWith(group.keyPrefix),
          );
        })
        .map(({ key }) => `${surface}:${key}`),
    )
    .sort((left, right) => left.localeCompare(right, "en"));

  return {
    uncoveredKeyCount: uncoveredKeys.length,
    uncoveredKeyFingerprint: `sha256:${createHash("sha256")
      .update(JSON.stringify(uncoveredKeys))
      .digest("hex")}`,
  };
}

export function validateTranslatorContextCoverage(
  contextDocument,
  baseDictionaries,
) {
  const coverage = contextDocument?.coverage;
  if (
    coverage?.strategy !== "uncovered-key-delta" ||
    !Number.isInteger(coverage.reviewedUncoveredKeyCount) ||
    !/^sha256:[a-f0-9]{64}$/.test(
      coverage.reviewedUncoveredKeyFingerprint ?? "",
    )
  ) {
    return [
      "Translator context needs a valid uncovered-key-delta coverage baseline.",
    ];
  }

  const snapshot = translatorContextCoverageSnapshot(
    contextDocument,
    baseDictionaries,
  );
  if (
    coverage.reviewedUncoveredKeyCount === snapshot.uncoveredKeyCount &&
    coverage.reviewedUncoveredKeyFingerprint ===
      snapshot.uncoveredKeyFingerprint
  ) {
    return [];
  }

  return [
    "Translator context coverage changed: " +
      `reviewed ${coverage.reviewedUncoveredKeyCount} uncovered keys ` +
      `(${coverage.reviewedUncoveredKeyFingerprint}), now ` +
      `${snapshot.uncoveredKeyCount} (${snapshot.uncoveredKeyFingerprint}). ` +
      "Add exact or prefix context for contextual copy; only refresh the baseline after explicitly reviewing trivial uncovered keys.",
  ];
}

export function buildLocalizationReport({
  localeDefinitions,
  statusDocument,
  contextDocument,
  desktopDictionaries,
  companionDictionaries,
  fileExists = existsSync,
}) {
  const errors = [];
  const sourceLocale = statusDocument.sourceLocale;
  if (sourceLocale !== DEFAULT_LOCALE) {
    errors.push(`locale-status.json sourceLocale must be ${DEFAULT_LOCALE}.`);
  }
  const sourceDesktop = desktopDictionaries[sourceLocale];
  const sourceCompanion = companionDictionaries[sourceLocale];
  if (!sourceDesktop || !sourceCompanion) {
    errors.push(`Missing source dictionaries for ${sourceLocale}.`);
    return { sourceFingerprint: null, locales: [], errors };
  }

  const sourceFingerprint = catalogFingerprint(sourceDesktop, sourceCompanion);
  errors.push(
    ...validateTranslatorContext(
      contextDocument,
      { desktop: sourceDesktop, companion: sourceCompanion },
      fileExists,
    ),
  );
  errors.push(
    ...validateTranslatorContextCoverage(
      contextDocument,
      { desktop: sourceDesktop, companion: sourceCompanion },
    ),
  );

  const localeIds = localeDefinitions.map(({ id }) => id);
  for (const localeId of Object.keys(statusDocument.locales ?? {})) {
    if (!localeIds.includes(localeId)) {
      errors.push(
        `locale-status.json contains unknown source locale ${localeId}.`,
      );
    }
  }

  const localeReports = [];
  for (const { id, catalogKind, fallbackLocale } of localeDefinitions) {
    const status = statusDocument.locales?.[id];
    if (!status) {
      errors.push(`locale-status.json is missing source locale ${id}.`);
      continue;
    }
    const desktop = desktopDictionaries[id];
    const companion = companionDictionaries[id];
    if (!desktop || !companion) {
      errors.push(`Missing desktop or Companion dictionary for ${id}.`);
      continue;
    }
    if (id !== sourceLocale && catalogKind === "draft") {
      errors.push(
        ...validateLocaleOverlay(sourceDesktop, desktop, `${id} desktop`),
      );
      errors.push(
        ...validateLocaleOverlay(sourceCompanion, companion, `${id} companion`),
      );
    } else if (id !== sourceLocale) {
      errors.push(
        ...validateLocaleDictionaries(sourceDesktop, desktop, `${id} desktop`),
      );
      errors.push(
        ...validateLocaleDictionaries(
          sourceCompanion,
          companion,
          `${id} companion`,
        ),
      );
    }
    const desktopStats = translationStats(sourceDesktop, desktop);
    const companionStats = translationStats(sourceCompanion, companion);
    const total = desktopStats.total + companionStats.total;
    const translated = desktopStats.translated + companionStats.translated;
    const distinctTranslationPercent =
      id === sourceLocale ? 100 : (translated / total) * 100;
    const keyCoveragePercent =
      ((desktopStats.present + companionStats.present) / total) * 100;
    const maintained = status.releaseStatus === "maintained";

    if (catalogKind === "draft" && status.releaseStatus !== "draft") {
      errors.push(
        `${id} uses an English fallback overlay and must remain draft until it has a complete reviewed source catalog.`,
      );
    }
    if (catalogKind === "draft" && !fallbackLocale) {
      errors.push(`${id} is a draft overlay but has no fallback locale.`);
    }
    if (id === sourceLocale && status.releaseStatus !== "canonical") {
      errors.push(`${id} is the source locale and must be canonical.`);
    }
    if (id !== sourceLocale && status.releaseStatus === "canonical") {
      errors.push(`${id} is not the source locale and cannot be canonical.`);
    }

    if (
      maintained &&
      (!status.nativeReviewer || !String(status.nativeReviewer).trim())
    ) {
      errors.push(`${id} needs a named nativeReviewer.`);
    }
    if (maintained && !/^\d{4}-\d{2}-\d{2}$/.test(status.reviewedAt ?? "")) {
      errors.push(`${id} needs reviewedAt in YYYY-MM-DD format.`);
    }
    if (maintained && status.reviewedSourceFingerprint !== sourceFingerprint) {
      errors.push(
        `${id} is stale: reviewed ${status.reviewedSourceFingerprint}, source is ${sourceFingerprint}.`,
      );
    }
    if (maintained && keyCoveragePercent < 100) {
      errors.push(
        `${id} key coverage is ${keyCoveragePercent.toFixed(2)}%; maintained requires 100%.`,
      );
    }
    if (
      maintained &&
      distinctTranslationPercent <
        statusDocument.minimumDistinctTranslationPercent
    ) {
      errors.push(
        `${id} translation signal is ${distinctTranslationPercent.toFixed(2)}%; ` +
          `maintained requires ${statusDocument.minimumDistinctTranslationPercent}%.`,
      );
    }

    localeReports.push({
      id,
      releaseStatus: status.releaseStatus,
      nativeReviewer: status.nativeReviewer,
      keyCoveragePercent,
      distinctTranslationPercent,
      desktop: desktopStats,
      companion: companionStats,
      stale:
        maintained && status.reviewedSourceFingerprint !== sourceFingerprint,
    });
  }

  return { sourceFingerprint, locales: localeReports, errors };
}

function loadProjectReport() {
  const desktopDictionaries = Object.fromEntries(
    CATALOG_LOCALES.map(({ id }) => [
      id,
      readLocaleDictionaryFromSource(
        readFileSync(resolve(desktopLocaleRoot, `${id}.ts`), "utf8"),
        localeDictionaryExportName(id),
      ),
    ]),
  );
  const companionDictionaries = readCompanionLocaleCatalog();
  return buildLocalizationReport({
    localeDefinitions: CATALOG_LOCALES,
    statusDocument: readJson(statusFile),
    contextDocument: readJson(contextFile),
    desktopDictionaries,
    companionDictionaries,
  });
}

function run() {
  const report = loadProjectReport();
  console.log(`Localization source fingerprint: ${report.sourceFingerprint}`);
  for (const locale of report.locales) {
    console.log(
      `${locale.id}: ${locale.releaseStatus}, keys ${locale.keyCoveragePercent.toFixed(2)}%, ` +
        `translation signal ${locale.distinctTranslationPercent.toFixed(2)}%, ` +
        `reviewer ${locale.nativeReviewer}${locale.stale ? ", STALE" : ""}`,
    );
  }
  if (report.errors.length > 0) {
    console.error("Localization readiness failed:");
    for (const error of report.errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Localization readiness ok.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
