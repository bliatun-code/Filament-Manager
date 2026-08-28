import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_QA_CONTRACT_FILES,
  buildLocalizationReport,
  catalogFingerprint,
  catalogSetFingerprint,
  currentRuntimeQaContractFingerprint,
  runtimeQaContractFingerprint,
  translatorContextCoverageSnapshot,
  validateTranslatorContext,
  validateTranslatorContextCoverage,
} from "./check-i18n-readiness.mjs";

const desktop = { common: { active: "Active", save: "Save" } };
const companion = { shell: { close: "Close" } };
const nbDesktop = { common: { active: "Aktiv", save: "Lagre" } };
const nbCompanion = { shell: { close: "Lukk" } };
const esDesktop = { common: { active: "Activo", save: "Guardar" } };
const esCompanion = { shell: { close: "Cerrar" } };

function releaseQaAudit(sourceFingerprint, catalogSetFingerprintValue, locales) {
  return {
    sourceFingerprint,
    catalogSetFingerprint: catalogSetFingerprintValue,
    runtimeContractFingerprint: currentRuntimeQaContractFingerprint(),
    verifiedAt: "2026-08-28",
    artifactQa: "passed",
    runtimeQa: "passed",
    locales,
  };
}

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

test("catalog-set fingerprint is stable and changes with a target translation", () => {
  const first = catalogSetFingerprint(
    {
      en: desktop,
      es: { common: { active: "Activo", save: "Guardar" } },
    },
    { en: companion, es: { shell: { close: "Cerrar" } } },
  );
  assert.equal(
    first,
    catalogSetFingerprint(
      {
        es: { common: { save: "Guardar", active: "Activo" } },
        en: desktop,
      },
      { es: { shell: { close: "Cerrar" } }, en: companion },
    ),
  );
  assert.notEqual(
    first,
    catalogSetFingerprint(
      {
        en: desktop,
        es: { common: { active: "Activo", save: "Guardar cambios" } },
      },
      { en: companion, es: { shell: { close: "Cerrar" } } },
    ),
  );
});

test("runtime QA fingerprint is stable and changes with its contract sources", () => {
  const first = runtimeQaContractFingerprint({
    "runtime.js": "one",
    "contract.test.mjs": "two",
  });
  assert.equal(
    first,
    runtimeQaContractFingerprint({
      "contract.test.mjs": "two",
      "runtime.js": "one",
    }),
  );
  assert.notEqual(
    first,
    runtimeQaContractFingerprint({
      "runtime.js": "changed",
      "contract.test.mjs": "two",
    }),
  );
});

test("runtime QA fingerprint covers Companion locale formatting", () => {
  assert.ok(
    RUNTIME_QA_CONTRACT_FILES.includes(
      "src-tauri/companion_browser/locale_format.js",
    ),
  );
  assert.ok(
    RUNTIME_QA_CONTRACT_FILES.includes(
      "src-tauri/companion_browser/locale_format.test.mjs",
    ),
  );
  assert.ok(RUNTIME_QA_CONTRACT_FILES.includes("scripts/check-i18n-fallbacks.mjs"));
  assert.ok(RUNTIME_QA_CONTRACT_FILES.includes("scripts/check-i18n-ui-copy.mjs"));
  assert.ok(
    RUNTIME_QA_CONTRACT_FILES.includes("scripts/check-i18n-ui-copy.test.mjs"),
  );
  assert.ok(RUNTIME_QA_CONTRACT_FILES.includes("scripts/ui-source-utils.mjs"));
  assert.ok(
    RUNTIME_QA_CONTRACT_FILES.includes(
      "scripts/quality-gates-contract.test.mjs",
    ),
  );
  assert.ok(!RUNTIME_QA_CONTRACT_FILES.includes("package.json"));
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
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
      { id: "nb", catalogKind: "source", fallbackLocale: null, selectable: true },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      releaseQaAudits: [
        releaseQaAudit(
          sourceFingerprint,
          catalogSetFingerprint(
            { en: desktop, nb: nbDesktop },
            { en: companion, nb: nbCompanion },
          ),
          ["en", "nb"],
        ),
      ],
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

test("a complete selectable community locale does not claim native review", () => {
  const report = buildLocalizationReport({
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
      { id: "es", catalogKind: "source", fallbackLocale: null, selectable: true },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      releaseQaAudits: [
        releaseQaAudit(
          catalogFingerprint(desktop, companion),
          catalogSetFingerprint(
            { en: desktop, es: esDesktop },
            { en: companion, es: esCompanion },
          ),
          ["en", "es"],
        ),
      ],
      locales: {
        en: {
          releaseStatus: "canonical",
          nativeReviewer: "owner",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: "canonical",
        },
        es: {
          releaseStatus: "community",
          nativeReviewer: null,
          reviewedAt: null,
          reviewedSourceFingerprint: null,
        },
      },
    },
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
    desktopDictionaries: {
      en: desktop,
      es: { common: { active: "Activo", save: "Guardar" } },
    },
    companionDictionaries: {
      en: companion,
      es: { shell: { close: "Cerrar" } },
    },
    fileExists: () => true,
  });

  assert.deepEqual(report.errors, []);
});

test("published locales require current artifact and runtime QA evidence", () => {
  const sourceFingerprint = catalogFingerprint(desktop, companion);
  const input = {
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
      { id: "es", catalogKind: "source", fallbackLocale: null, selectable: true },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      releaseQaAudits: [
        releaseQaAudit(
          `sha256:${"0".repeat(64)}`,
          catalogSetFingerprint(
            { en: desktop, es: esDesktop },
            { en: companion, es: esCompanion },
          ),
          ["en", "es"],
        ),
      ],
      locales: {
        en: {
          releaseStatus: "canonical",
          nativeReviewer: "owner",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: "canonical",
        },
        es: {
          releaseStatus: "community",
          nativeReviewer: null,
          reviewedAt: null,
          reviewedSourceFingerprint: null,
        },
      },
    },
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
    desktopDictionaries: {
      en: desktop,
      es: { common: { active: "Activo", save: "Guardar" } },
    },
    companionDictionaries: {
      en: companion,
      es: { shell: { close: "Cerrar" } },
    },
    fileExists: () => true,
  };

  const stale = buildLocalizationReport(input);
  assert.ok(
    stale.errors.some((error) =>
      error.includes(
        `es is published without artifact and runtime QA evidence for source ${sourceFingerprint}`,
      ),
    ),
  );

  input.statusDocument.releaseQaAudits = [
    releaseQaAudit(
      sourceFingerprint,
      catalogSetFingerprint(input.desktopDictionaries, input.companionDictionaries),
      ["en", "es"],
    ),
  ];
  assert.deepEqual(buildLocalizationReport(input).errors, []);

  input.desktopDictionaries.es.common.save = "Guardar cambios";
  assert.ok(
    buildLocalizationReport(input).errors.some((error) =>
      error.includes("catalog set"),
    ),
  );
  input.desktopDictionaries.es.common.save = "Guardar";

  input.statusDocument.releaseQaAudits[0].runtimeContractFingerprint =
    `sha256:${"0".repeat(64)}`;
  assert.ok(
    buildLocalizationReport(input).errors.some((error) =>
      error.includes("runtime contract"),
    ),
  );
});

test("release QA audit records reject incomplete or ambiguous evidence", () => {
  const sourceFingerprint = catalogFingerprint(desktop, companion);
  const report = buildLocalizationReport({
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      releaseQaAudits: [
        {
          sourceFingerprint: "invalid",
          catalogSetFingerprint: "invalid",
          runtimeContractFingerprint: "invalid",
          verifiedAt: "today",
          artifactQa: "pending",
          runtimeQa: "failed",
          locales: ["en", "en", "missing"],
        },
      ],
      locales: {
        en: {
          releaseStatus: "canonical",
          nativeReviewer: "owner",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: "canonical",
        },
      },
    },
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
    desktopDictionaries: { en: desktop },
    companionDictionaries: { en: companion },
    fileExists: () => true,
  });

  assert.ok(report.errors.some((error) => error.includes("valid sourceFingerprint")));
  assert.ok(report.errors.some((error) => error.includes("valid catalogSetFingerprint")));
  assert.ok(
    report.errors.some((error) =>
      error.includes("valid runtimeContractFingerprint"),
    ),
  );
  assert.ok(report.errors.some((error) => error.includes("verifiedAt")));
  assert.ok(report.errors.some((error) => error.includes("artifactQa must be passed")));
  assert.ok(report.errors.some((error) => error.includes("runtimeQa must be passed")));
  assert.ok(report.errors.some((error) => error.includes("duplicate locale en")));
  assert.ok(report.errors.some((error) => error.includes("unknown locale missing")));
});

test("community and maintained statuses require a selectable published locale", () => {
  const sourceFingerprint = catalogFingerprint(desktop, companion);

  for (const releaseStatus of ["community", "maintained"]) {
    const report = buildLocalizationReport({
      localeDefinitions: [
        {
          id: "en",
          catalogKind: "source",
          fallbackLocale: null,
          selectable: true,
        },
        {
          id: "es",
          catalogKind: "source",
          fallbackLocale: null,
          selectable: false,
        },
      ],
      statusDocument: {
        schemaVersion: 4,
        sourceLocale: "en",
        minimumDistinctTranslationPercent: 50,
        releaseQaAudits: [
          releaseQaAudit(
            sourceFingerprint,
            catalogSetFingerprint(
              { en: desktop, es: esDesktop },
              { en: companion, es: esCompanion },
            ),
            ["en"],
          ),
        ],
        locales: {
          en: {
            releaseStatus: "canonical",
            nativeReviewer: "owner",
            reviewedAt: "2026-07-11",
            reviewedSourceFingerprint: "canonical",
          },
          es: {
            releaseStatus,
            nativeReviewer:
              releaseStatus === "maintained" ? "reviewer" : null,
            reviewedAt:
              releaseStatus === "maintained" ? "2026-07-11" : null,
            reviewedSourceFingerprint:
              releaseStatus === "maintained" ? sourceFingerprint : null,
          },
        },
      },
      contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
      desktopDictionaries: {
        en: desktop,
        es: { common: { active: "Activo", save: "Guardar" } },
      },
      companionDictionaries: {
        en: companion,
        es: { shell: { close: "Cerrar" } },
      },
      fileExists: () => true,
    });

    assert.ok(
      report.errors.some((error) =>
        error.includes(
          `es is marked ${releaseStatus} but is not selectable`,
        ),
      ),
    );
  }
});

test("an English fallback overlay cannot be marked maintained", () => {
  const report = buildLocalizationReport({
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
      { id: "es", catalogKind: "draft", fallbackLocale: "en", selectable: false },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 0,
      releaseQaAudits: [
        releaseQaAudit(
          catalogFingerprint(desktop, companion),
          catalogSetFingerprint(
            { en: desktop, es: desktop },
            { en: companion, es: companion },
          ),
          ["en"],
        ),
      ],
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

test("a selectable locale must have complete catalogs without English overlay fallback", () => {
  const report = buildLocalizationReport({
    localeDefinitions: [
      { id: "en", catalogKind: "source", fallbackLocale: null, selectable: true },
      { id: "es", catalogKind: "draft", fallbackLocale: "en", selectable: true },
    ],
    statusDocument: {
      schemaVersion: 4,
      sourceLocale: "en",
      minimumDistinctTranslationPercent: 50,
      releaseQaAudits: [
        releaseQaAudit(
          catalogFingerprint(desktop, companion),
          catalogSetFingerprint(
            { en: desktop, es: { common: { active: "Activo" } } },
            { en: companion, es: {} },
          ),
          ["en", "es"],
        ),
      ],
      locales: {
        en: {
          releaseStatus: "canonical",
          nativeReviewer: "owner",
          reviewedAt: "2026-07-11",
          reviewedSourceFingerprint: "canonical",
        },
        es: {
          releaseStatus: "draft",
          nativeReviewer: null,
          reviewedAt: null,
          reviewedSourceFingerprint: null,
        },
      },
    },
    contextDocument: withCoverage({ schemaVersion: 1, messages: [] }),
    desktopDictionaries: { en: desktop, es: { common: { active: "Activo" } } },
    companionDictionaries: { en: companion, es: {} },
    fileExists: () => true,
  });

  assert.ok(
    report.errors.some((error) =>
      error.includes("selectable but still uses a partial draft catalog"),
    ),
  );
  assert.ok(
    report.errors.some((error) => error.includes("published locales require 100%")),
  );
});
