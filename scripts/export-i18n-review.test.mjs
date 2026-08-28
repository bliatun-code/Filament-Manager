import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CATALOG_LOCALES,
  DEFAULT_LOCALE,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  buildLocalizationReviewRows,
  exportLocalizationReview,
  formatLocalizationReviewTsv,
} from "./export-i18n-review.mjs";

test("review rows combine desktop and Companion copy with translator context", () => {
  const rows = buildLocalizationReviewRows({
    sourceDictionaries: {
      desktop: { common: { save: "Save", unchanged: "AMS" } },
      companion: { shell: { close: "Close" } },
    },
    targetDictionaries: {
      desktop: { common: { save: "Enregistrer", unchanged: "AMS" } },
      companion: {},
    },
    contextDocument: {
      messages: [
        {
          surface: "desktop",
          key: "common.save",
          meaning: "Persist the current edit.",
          maxCharacters: 12,
          screenshot: "docs/screenshots/example.jpg",
        },
      ],
      groups: [
        {
          surface: "companion",
          keyPrefix: "shell.",
          meaning: "Browser Companion shell action.",
          screenshot: "docs/screenshots/companion-phone-settings.jpg",
        },
      ],
    },
  });

  assert.deepEqual(
    rows.map(({ surface, key, state }) => ({ surface, key, state })),
    [
      { surface: "companion", key: "shell.close", state: "fallback" },
      { surface: "desktop", key: "common.save", state: "translated" },
      { surface: "desktop", key: "common.unchanged", state: "unchanged" },
    ],
  );
  assert.equal(rows[1].meaning, "Persist the current edit.");
  assert.equal(rows[1].maxCharacters, 12);
  assert.equal(rows[0].meaning, "Browser Companion shell action.");
});

test("review TSV keeps one physical row per message", () => {
  const tsv = formatLocalizationReviewTsv([
    {
      surface: "desktop",
      key: "common.warning",
      state: "translated",
      sourceText: "First line\nSecond line",
      targetText: "Première ligne\nDeuxième ligne",
      meaning: "",
      maxCharacters: "",
      screenshot: "",
    },
  ]);

  assert.equal(tsv.trimEnd().split("\n").length, 2);
  assert.match(tsv, /First line\\nSecond line/);
  assert.match(tsv, /Première ligne\\nDeuxième ligne/);
});

test("every published catalog locale contains no English fallback rows", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "filament-manager-i18n-review-"),
  );
  const localeStatus = JSON.parse(
    readFileSync(
      new URL("../localization/locale-status.json", import.meta.url),
      "utf8",
    ),
  );
  const selectableLocales = CATALOG_LOCALES.filter(
    ({ id, selectable }) => id !== DEFAULT_LOCALE && selectable,
  )
    .map(({ id }) => id)
    .sort((left, right) => left.localeCompare(right, "en"));
  const publishedStatusLocales = Object.entries(localeStatus.locales ?? {})
    .filter(
      ([id, status]) =>
        id !== DEFAULT_LOCALE &&
        ["community", "maintained"].includes(status?.releaseStatus),
    )
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, "en"));

  assert.deepEqual(
    publishedStatusLocales,
    selectableLocales,
    "community and maintained statuses must match the selectable locale registry",
  );

  try {
    for (const locale of selectableLocales) {
      const outputPath = join(directory, `${locale}.tsv`);
      const result = exportLocalizationReview({ locale, outputPath });
      const releaseStatus = localeStatus.locales?.[locale]?.releaseStatus;
      assert.ok(
        releaseStatus === "community" || releaseStatus === "maintained",
        `${locale} has an unsupported release status`,
      );
      assert.equal(
        result.states.fallback,
        0,
        `${locale} contains fallback rows`,
      );
      assert.equal(
        readFileSync(outputPath, "utf8").split("\n")[0],
        "surface\tkey\tstate\tsource_en\ttarget\tmeaning\tmax_characters\tscreenshot",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
