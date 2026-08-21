import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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

test("maintained catalog locales contain no English fallback rows", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "filament-manager-i18n-review-"),
  );
  const localeStatus = JSON.parse(
    readFileSync(
      new URL("../localization/locale-status.json", import.meta.url),
      "utf8",
    ),
  );
  try {
    for (const locale of ["de", "fr", "es", "pt-BR", "it-IT", "pl-PL", "nl-NL", "cs-CZ", "zh-CN", "ja-JP", "ko-KR", "zh-TW", "tr-TR", "uk-UA", "ru-RU", "hu-HU", "sv-SE", "da-DK", "fi-FI"]) {
      const outputPath = join(directory, `${locale}.tsv`);
      const result = exportLocalizationReview({ locale, outputPath });
      const releaseStatus = localeStatus.locales?.[locale]?.releaseStatus;
      assert.ok(
        releaseStatus === "draft" || releaseStatus === "maintained",
        `${locale} has an unsupported release status`,
      );
      if (releaseStatus === "maintained") {
        assert.equal(
          result.states.fallback,
          0,
          `${locale} contains fallback rows`,
        );
      }
      assert.equal(
        readFileSync(outputPath, "utf8").split("\n")[0],
        "surface\tkey\tstate\tsource_en\ttarget\tmeaning\tmax_characters\tscreenshot",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
