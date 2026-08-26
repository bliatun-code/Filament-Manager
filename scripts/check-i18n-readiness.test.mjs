import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalizationReport,
  catalogFingerprint,
  translatorContextCoverageSnapshot,
  validateTranslatorContext,
  validateTranslatorContextCoverage,
} from "./check-i18n-readiness.mjs";

const desktop = { common: { active: "Active", save: "Save" } };
const companion = { shell: { close: "Close" } };

function withCoverage(
  contextDocument,
  baseDictionaries = { desktop, companion },
) {
  const snapshot = translatorContextCoverageSnapshot(
    contextDocument,
    baseDictionaries,
  );
  return {
    ...contextDocument,
    coverage: {
      strategy: "uncovered-key-delta",
      reviewedUncoveredKeyCount: snapshot.uncoveredKeyCount,
      reviewedUncoveredKeyFingerprint: snapshot.uncoveredKeyFingerprint,
    },
  };
}

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

test("translator context accepts maintained prefix groups and rejects empty groups", () => {
  const errors = validateTranslatorContext(
    {
      schemaVersion: 1,
      messages: [],
      groups: [
        {
          surface: "desktop",
          keyPrefix: "common.",
          meaning: "Shared desktop interface language.",
          screenshot: "exists.jpg",
        },
        {
          surface: "companion",
          keyPrefix: "missing.",
          meaning: "A prefix that should not pass validation.",
          screenshot: "exists.jpg",
        },
      ],
      trivialGroups: [
        {
          surface: "companion",
          keyPrefix: "shell.",
          reason: "Conventional single-word shell commands need no feature-specific context.",
        },
      ],
    },
    { desktop, companion },
    () => true,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /matches no keys/);
});

test("translator context coverage catches new uncovered keys but accepts explicit context", () => {
  const contextDocument = withCoverage({
    schemaVersion: 1,
    messages: [
      {
        surface: "desktop",
        key: "common.active",
        meaning: "Current enabled state.",
        screenshot: "exists.jpg",
      },
    ],
    groups: [],
  });

  assert.deepEqual(
    validateTranslatorContextCoverage(
      contextDocument,
      { desktop, companion },
    ),
    [],
  );

  const expandedDictionaries = {
    desktop: {
      common: { active: "Active", save: "Save", warning: "Warning" },
    },
    companion,
  };
  assert.ok(
    validateTranslatorContextCoverage(
      contextDocument,
      expandedDictionaries,
    ).some((error) => error.includes("coverage changed")),
  );

  const contextualized = {
    ...contextDocument,
    messages: [
      ...contextDocument.messages,
      {
        surface: "desktop",
        key: "common.warning",
        meaning: "Warning shown before a consequential action.",
        screenshot: "exists.jpg",
      },
    ],
  };
  assert.deepEqual(
    validateTranslatorContextCoverage(
      contextualized,
      expandedDictionaries,
    ),
    [],
  );
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
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
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

test("an English fallback overlay cannot be marked maintained", () => {
  const report = buildLocalizationReport({
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null },
      { id: "es", catalogKind: "draft", fallbackLocale: "en" },
    ],
    statusDocument: {
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 0,
      locales: {
        en: {
          releaseStatus: "canonical",
          nativeReviewer: "owner",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: "canonical",
        },
        es: {
          releaseStatus: "maintained",
          nativeReviewer: "reviewer",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: catalogFingerprint(desktop, companion),
        },
      },
    },
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
    desktopDictionaries: { en: desktop, es: desktop },
    companionDictionaries: { en: companion, es: companion },
    fileExists: () => true,
  });

  assert.ok(
    report.errors.some((error) =>
      error.includes("uses an English fallback overlay and must remain draft"),
    ),
  );
});
