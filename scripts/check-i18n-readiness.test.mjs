import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalizationReport,
  catalogFingerprint,
  validateTranslatorContext,
} from "./check-i18n-readiness.mjs";

const desktop = { common: { active: "Active", save: "Save" } };
const companion = { shell: { close: "Close" } };

test("source catalog fingerprint is stable across object insertion order", () => {
  assert.equal(
    catalogFingerprint({ z: "last", a: "first" }, companion),
    catalogFingerprint({ a: "first", z: "last" }, companion),
  );
});

test("translator context rejects unknown keys, duplicates, and missing screenshots", () => {
  const errors = validateTranslatorContext(
    {
      schemaVersion: 1,
      messages: [
        { surface: "desktop", key: "common.missing", meaning: "A useful explanation.", screenshot: "missing.jpg" },
        { surface: "desktop", key: "common.missing", meaning: "short", screenshot: "missing.jpg" },
      ],
    },
    { desktop, companion },
    () => false,
  );
  assert.ok(errors.some((error) => error.includes("unknown key desktop:common.missing")));
  assert.ok(errors.some((error) => error.includes("duplicates desktop:common.missing")));
  assert.ok(errors.some((error) => error.includes("needs a useful meaning")));
  assert.ok(errors.some((error) => error.includes("missing screenshot")));
});

test("maintained locale must match the reviewed source fingerprint", () => {
  const sourceFingerprint = catalogFingerprint(desktop, companion);
  const base = {
    localeDefinitions: [{ id: "en" }, { id: "nb" }],
    statusDocument: {
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      locales: {
        en: { releaseStatus: "canonical", nativeReviewer: "owner", reviewedAt: "2026-07-11", reviewedSourceFingerprint: "canonical" },
        nb: { releaseStatus: "maintained", nativeReviewer: "reviewer", reviewedAt: "2026-07-11", reviewedSourceFingerprint: sourceFingerprint },
      },
    },
    contextDocument: { schemaVersion: 1, messages: [] },
    desktopDictionaries: { en: desktop, nb: { common: { active: "Aktiv", save: "Lagre" } } },
    companionDictionaries: { en: companion, nb: { shell: { close: "Lukk" } } },
    fileExists: () => true,
  };
  assert.deepEqual(buildLocalizationReport(base).errors, []);

  const stale = {
    ...base,
    statusDocument: structuredClone(base.statusDocument),
  };
  stale.statusDocument.locales.nb.reviewedSourceFingerprint = "sha256:old";
  assert.ok(buildLocalizationReport(stale).errors.some((error) => error.includes("nb is stale")));
});
