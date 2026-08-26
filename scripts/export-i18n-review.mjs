import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CATALOG_LOCALES,
  DEFAULT_LOCALE,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  flattenDictionary,
  localeDictionaryExportName,
  readLocaleDictionaryFromSource,
} from "./check-i18n-locales.mjs";
import { catalogFingerprint } from "./check-i18n-readiness.mjs";
import { readCompanionLocaleCatalog } from "./generate-companion-locales.mjs";

const repoRoot = resolve(".");
const desktopLocaleRoot = resolve(
  repoRoot,
  "ui",
  "src",
  "lib",
  "i18n_locales",
  "locales",
);

function dictionaryMap(dictionary) {
  return new Map(flattenDictionary(dictionary));
}

function contextIndex(contextDocument) {
  const exact = new Map(
    (contextDocument.messages ?? []).map((entry) => [
      `${entry.surface}:${entry.key}`,
      entry,
    ]),
  );
  const groups = [...(contextDocument.groups ?? [])].sort(
    (left, right) => right.keyPrefix.length - left.keyPrefix.length,
  );
  return {
    forMessage(surface, key) {
      return (
        exact.get(`${surface}:${key}`) ??
        groups.find(
          (entry) =>
            entry.surface === surface && key.startsWith(entry.keyPrefix),
        ) ??
        {}
      );
    },
  };
}

export function buildLocalizationReviewRows({
  sourceDictionaries,
  targetDictionaries,
  contextDocument,
}) {
  const contexts = contextIndex(contextDocument);
  const rows = [];
  for (const surface of ["desktop", "companion"]) {
    const source = dictionaryMap(sourceDictionaries[surface]);
    const target = dictionaryMap(targetDictionaries[surface]);
    for (const [key, sourceText] of source) {
      const explicitTarget = target.get(key);
      const targetText =
        typeof explicitTarget === "string" ? explicitTarget : sourceText;
      const context = contexts.forMessage(surface, key);
      rows.push({
        surface,
        key,
        sourceText,
        targetText,
        state:
          typeof explicitTarget !== "string"
            ? "fallback"
            : explicitTarget === sourceText
              ? "unchanged"
              : "translated",
        meaning: context.meaning ?? "",
        maxCharacters: context.maxCharacters ?? "",
        screenshot: context.screenshot ?? "",
      });
    }
  }
  return rows.sort((left, right) =>
    `${left.surface}:${left.key}`.localeCompare(
      `${right.surface}:${right.key}`,
      "en",
    ),
  );
}

function tsvCell(value) {
  return String(value ?? "")
    .replaceAll("\t", " ")
    .replaceAll(/\r?\n/g, "\\n");
}

export function formatLocalizationReviewTsv(rows) {
  const columns = [
    "surface",
    "key",
    "state",
    "source_en",
    "target",
    "meaning",
    "max_characters",
    "screenshot",
  ];
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(
      [
        row.surface,
        row.key,
        row.state,
        row.sourceText,
        row.targetText,
        row.meaning,
        row.maxCharacters,
        row.screenshot,
      ]
        .map(tsvCell)
        .join("\t"),
    );
  }
  return `${lines.join("\n")}\n`;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function loadDesktopDictionary(locale) {
  return readLocaleDictionaryFromSource(
    readFileSync(resolve(desktopLocaleRoot, `${locale}.ts`), "utf8"),
    localeDictionaryExportName(locale),
  );
}

function loadCompanionDictionaries() {
  return readCompanionLocaleCatalog();
}

export function exportLocalizationReview({ locale, outputPath }) {
  const definition = CATALOG_LOCALES.find(({ id }) => id === locale);
  if (!definition || locale === DEFAULT_LOCALE) {
    throw new Error(
      `Choose a non-source catalog locale: ${CATALOG_LOCALES.map(({ id }) => id)
        .filter((id) => id !== DEFAULT_LOCALE)
        .join(", ")}.`,
    );
  }
  const companionDictionaries = loadCompanionDictionaries();
  const sourceDictionaries = {
    desktop: loadDesktopDictionary(DEFAULT_LOCALE),
    companion: companionDictionaries[DEFAULT_LOCALE],
  };
  const targetDictionaries = {
    desktop: loadDesktopDictionary(locale),
    companion: companionDictionaries[locale],
  };
  const contextDocument = JSON.parse(
    readFileSync(
      resolve(repoRoot, "localization", "message-context.json"),
      "utf8",
    ),
  );
  const rows = buildLocalizationReviewRows({
    sourceDictionaries,
    targetDictionaries,
    contextDocument,
  });
  const targetPath = resolve(
    outputPath ??
      resolve(
        repoRoot,
        "release-artifacts",
        "localization-review",
        `${locale}.tsv`,
      ),
  );
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, formatLocalizationReviewTsv(rows), "utf8");
  return {
    locale,
    outputPath: targetPath,
    rows: rows.length,
    sourceFingerprint: catalogFingerprint(
      sourceDictionaries.desktop,
      sourceDictionaries.companion,
    ),
    states: Object.fromEntries(
      ["translated", "unchanged", "fallback"].map((state) => [
        state,
        rows.filter((row) => row.state === state).length,
      ]),
    ),
  };
}

function run() {
  const argv = process.argv.slice(2);
  const result = exportLocalizationReview({
    locale: argValue(argv, "--locale"),
    outputPath: argValue(argv, "--output"),
  });
  console.log(`Localization review sheet: ${result.outputPath}`);
  console.log(`Locale: ${result.locale}`);
  console.log(`Source fingerprint: ${result.sourceFingerprint}`);
  console.log(
    `Rows: ${result.rows} (${result.states.translated} translated, ${result.states.unchanged} unchanged, ${result.states.fallback} fallback)`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
