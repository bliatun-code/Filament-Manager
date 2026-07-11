import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalizationReviewRows,
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
