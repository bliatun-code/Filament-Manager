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
  readLocaleDictionaryFromSource,
  validateLocaleDictionaries,
  validateLocaleOverlay,
} from "./check-i18n-locales.mjs";

const repoRoot = resolve(".");
const statusFile = resolve(repoRoot, "localization", "locale-status.json");
const contextFile = resolve(repoRoot, "localization", "message-context.json");
const desktopLocaleRoot = resolve(repoRoot, "ui", "src", "lib", "i18n_locales", "locales");
const companionDictionaryFile = resolve(
  repoRoot,
  "src-tauri",
  "companion_browser",
  "companion_i18n.js",
);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function catalogFingerprint(desktopDictionary, companionDictionary) {
  const rows = [
    ...flattenDictionary(desktopDictionary).map(([key, value]) => ["desktop", key, value]),
    ...flattenDictionary(companionDictionary).map(([key, value]) => ["companion", key, value]),
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
    ([key, value]) => typeof target.get(key) === "string" && target.get(key) !== value,
  ).length;
  const present = [...base.keys()].filter((key) => typeof target.get(key) === "string").length;
  return {
    total: base.size,
    present,
    translated,
    keyCoveragePercent: base.size === 0 ? 100 : (present / base.size) * 100,
    distinctTranslationPercent: base.size === 0 ? 100 : (translated / base.size) * 100,
  };
}

export function validateTranslatorContext(contextDocument, baseDictionaries, fileExists = existsSync) {
  const errors = [];
  const seen = new Set();
  if (contextDocument?.schemaVersion !== 1 || !Array.isArray(contextDocument.messages)) {
    return ["Translator context must use schemaVersion 1 and a messages array."];
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
    if (typeof message.meaning !== "string" || message.meaning.trim().length < 12) {
      errors.push(`${label} needs a useful meaning.`);
    }
    if (typeof message.screenshot !== "string" || !fileExists(resolve(repoRoot, message.screenshot))) {
      errors.push(`${label} references a missing screenshot.`);
    }
    if (
      message.maxCharacters !== undefined &&
      (!Number.isInteger(message.maxCharacters) || message.maxCharacters < 1)
    ) {
      errors.push(`${label} has an invalid maxCharacters value.`);
    }
  }
  return errors;
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

  const localeIds = localeDefinitions.map(({ id }) => id);
  for (const localeId of Object.keys(statusDocument.locales ?? {})) {
    if (!localeIds.includes(localeId)) {
      errors.push(`locale-status.json contains unknown source locale ${localeId}.`);
    }
  }

  const localeReports = [];
  for (const { id, catalogKind } of localeDefinitions) {
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
      errors.push(...validateLocaleOverlay(sourceDesktop, desktop, `${id} desktop`));
      errors.push(...validateLocaleOverlay(sourceCompanion, companion, `${id} companion`));
    } else if (id !== sourceLocale) {
      errors.push(...validateLocaleDictionaries(sourceDesktop, desktop, `${id} desktop`));
      errors.push(...validateLocaleDictionaries(sourceCompanion, companion, `${id} companion`));
    }
    const desktopStats = translationStats(sourceDesktop, desktop);
    const companionStats = translationStats(sourceCompanion, companion);
    const total = desktopStats.total + companionStats.total;
    const translated = desktopStats.translated + companionStats.translated;
    const distinctTranslationPercent = id === sourceLocale ? 100 : (translated / total) * 100;
    const keyCoveragePercent =
      ((desktopStats.present + companionStats.present) / total) * 100;
    const maintained = status.releaseStatus === "maintained";

    if (maintained && (!status.nativeReviewer || !String(status.nativeReviewer).trim())) {
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
      errors.push(`${id} key coverage is ${keyCoveragePercent.toFixed(2)}%; maintained requires 100%.`);
    }
    if (
      maintained &&
      distinctTranslationPercent < statusDocument.minimumDistinctTranslationPercent
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
      stale: maintained && status.reviewedSourceFingerprint !== sourceFingerprint,
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
        `${id}Dictionary`,
      ),
    ]),
  );
  const companionDictionaries = readLocaleDictionaryFromSource(
    readFileSync(companionDictionaryFile, "utf8"),
    "dictionaries",
  );
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
