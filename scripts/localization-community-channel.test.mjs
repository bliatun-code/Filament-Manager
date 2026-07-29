import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SELECTABLE_LOCALES } from "../src-tauri/companion_browser/supported_locales.js";

const issueTemplate = readFileSync(
  new URL("../.github/ISSUE_TEMPLATE/translation.yml", import.meta.url),
  "utf8",
);
const issueConfig = readFileSync(
  new URL("../.github/ISSUE_TEMPLATE/config.yml", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const localizationGuide = readFileSync(
  new URL("../docs/LOCALIZATION.md", import.meta.url),
  "utf8",
);

const TRANSLATION_FORM_URL =
  "https://github.com/bliatun-code/Filament-Manager/issues/new?template=translation.yml";

test("translation issue form accepts corrections only for the 20 published non-English catalogs", () => {
  assert.match(issueTemplate, /name: Translation correction/);
  assert.match(issueTemplate, /21-language set stable/);
  assert.match(issueTemplate, /id: current/);
  assert.match(issueTemplate, /id: suggested/);
  assert.match(issueTemplate, /id: surface/);
  const languageBlock = issueTemplate.match(
    /id: language[\s\S]*?options:\n(?<options>[\s\S]*?)    validations:/,
  );
  assert.ok(languageBlock?.groups?.options);
  const languageOptions = [
    ...languageBlock.groups.options.matchAll(/^        - (.+)$/gm),
  ].map((match) => match[1]);
  assert.deepEqual(
    languageOptions,
    SELECTABLE_LOCALES.filter(({ id }) => id !== "en").map(
      ({ nativeLabel }) => nativeLabel,
    ),
  );
  assert.doesNotMatch(issueTemplate, /request a new language/i);
});

test("repository entry points link directly to the translation correction form", () => {
  for (const source of [issueConfig, readme, localizationGuide]) {
    assert.ok(source.includes(TRANSLATION_FORM_URL));
  }
  assert.match(
    localizationGuide,
    /selectable set is frozen at the current 21 languages/i,
  );
});
