import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  checkGeneratedCompanionLocales,
  companionLocaleAssetName,
  companionLocaleModuleSource,
  validateCompanionLocaleCatalog,
  writeGeneratedCompanionLocales,
} from "./generate-companion-locales.mjs";

test("Companion locale generator writes deterministic modules from one catalog", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "filament-manager-locales-"));
  const catalogFile = resolve(root, "catalog.json");
  const outputRoot = resolve(root, "output");
  const registryFile = resolve(root, "registry.rs");
  const localeDefinitions = [{ id: "en" }, { id: "nb" }];
  writeFileSync(
    catalogFile,
    JSON.stringify({
      schemaVersion: 1,
      dictionaries: {
        en: { nav: { storage: "Inventory", "aria-label": "Inventory" } },
        nb: { nav: { storage: "Lager", "aria-label": "Lagerbeholdning" } },
      },
    }),
  );

  writeGeneratedCompanionLocales({
    catalogFile,
    outputRoot,
    registryFile,
    localeDefinitions,
  });

  const norwegian = readFileSync(
    resolve(outputRoot, companionLocaleAssetName("nb")),
    "utf8",
  );
  assert.match(norwegian, /export const locale = "nb";/);
  assert.match(norwegian, /nav:\{storage:"Lager"/);
  assert.match(norwegian, /"aria-label":"Lagerbeholdning"/);
  const generatedModule = await import(
    `data:text/javascript;base64,${Buffer.from(norwegian).toString("base64")}`,
  );
  assert.equal(generatedModule.locale, "nb");
  assert.deepEqual(generatedModule.default, {
    nav: { storage: "Lager", "aria-label": "Lagerbeholdning" },
  });
  assert.deepEqual(
    checkGeneratedCompanionLocales({
      catalogFile,
      outputRoot,
      registryFile,
      localeDefinitions,
    }).errors,
    [],
  );
});

test("Companion locale catalog requires complete keys and matching placeholders", () => {
  const errors = validateCompanionLocaleCatalog(
    {
      en: {
        nav: { visibleCount: "{count} visible" },
        shell: { done: "Done" },
      },
      nb: {
        nav: { visibleCount: "Synlige" },
      },
    },
    [{ id: "en" }, { id: "nb" }],
  );

  assert.match(errors.join("\n"), /nb is missing translation key shell\.done/);
  assert.match(
    errors.join("\n"),
    /nb\.nav\.visibleCount is missing placeholder \{count\}/,
  );
});

test("Companion locale catalog rejects every non-string leaf with its path", () => {
  const invalidLeaves = [
    ["numberValue", 42, "number"],
    ["booleanValue", false, "boolean"],
    ["nullValue", null, "null"],
    ["arrayValue", ["Save"], "array"],
  ];

  for (const [key, value, type] of invalidLeaves) {
    const errors = validateCompanionLocaleCatalog(
      { en: { common: { [key]: value } } },
      [{ id: "en", catalogKind: "source" }],
    );
    assert.deepEqual(errors, [
      `en.common.${key} must be a string leaf or nested object; received ${type}.`,
    ]);
  }
});

test("Companion locale catalog rejects invalid nested object forms", () => {
  const accessorGroup = {};
  Object.defineProperty(accessorGroup, "save", {
    enumerable: true,
    get() {
      throw new Error("the validator must not evaluate catalog accessors");
    },
  });

  assert.deepEqual(
    validateCompanionLocaleCatalog(
      {
        en: {
          empty: {},
          dotted: { "bad.key": "Bad" },
          exotic: new Date(0),
          accessor: accessorGroup,
        },
      },
      [{ id: "en", catalogKind: "source" }],
    ),
    [
      "en.empty must not be an empty object.",
      "en.dotted.bad.key has an invalid translation key segment; segments must be non-empty and cannot contain dots.",
      "en.exotic must be a string leaf or nested object; received object (Date).",
      "en.accessor.save must be an enumerable data property in the catalog.",
    ],
  );
});

test("Companion locale catalog inspects root descriptors without evaluating accessors", () => {
  const dictionaries = {
    en: { common: { save: "Save" } },
  };
  Object.defineProperty(dictionaries, "accessor-locale", {
    enumerable: true,
    get() {
      throw new Error("the validator must not evaluate catalog accessors");
    },
  });
  dictionaries[Symbol("symbol-locale")] = { common: { save: "Save" } };

  assert.deepEqual(
    validateCompanionLocaleCatalog(dictionaries, [
      { id: "en", catalogKind: "source" },
    ]),
    [
      "accessor-locale must be an enumerable data property in Companion dictionaries.",
      "Companion dictionary map contains a non-string locale key.",
    ],
  );
});

test("Companion locale module generation rejects malformed dictionaries directly", () => {
  assert.throws(
    () => companionLocaleModuleSource("en", { common: { save: null } }),
    /en\.common\.save must be a string leaf or nested object; received null/,
  );
});

test("Companion locale gate and writer fail closed without partial output", () => {
  const root = mkdtempSync(resolve(tmpdir(), "filament-manager-locales-"));
  const catalogFile = resolve(root, "catalog.json");
  const outputRoot = resolve(root, "output");
  const registryFile = resolve(root, "registry.rs");
  const localeDefinitions = [{ id: "en", catalogKind: "source" }];
  writeFileSync(
    catalogFile,
    JSON.stringify({
      schemaVersion: 1,
      dictionaries: { en: { common: { save: null } } },
    }),
  );

  const result = checkGeneratedCompanionLocales({
    catalogFile,
    outputRoot,
    registryFile,
    localeDefinitions,
  });
  assert.equal(result.files.size, 0);
  assert.match(
    result.errors.join("\n"),
    /en\.common\.save must be a string leaf or nested object; received null/,
  );
  assert.throws(
    () =>
      writeGeneratedCompanionLocales({
        catalogFile,
        outputRoot,
        registryFile,
        localeDefinitions,
      }),
    /invalid Companion dictionary structure.*en\.common\.save must be a string leaf or nested object; received null/s,
  );
  assert.equal(existsSync(outputRoot), false);
  assert.equal(existsSync(registryFile), false);
});

test("Companion locale generator rejects invalid English message syntax", () => {
  const root = mkdtempSync(resolve(tmpdir(), "filament-manager-locales-"));
  const catalogFile = resolve(root, "catalog.json");
  const outputRoot = resolve(root, "output");
  const registryFile = resolve(root, "registry.rs");
  const localeDefinitions = [{ id: "en", catalogKind: "source" }];
  writeFileSync(
    catalogFile,
    JSON.stringify({
      schemaVersion: 1,
      dictionaries: {
        en: { common: { count: "{count, plural, one {One item}}" } },
      },
    }),
  );

  assert.match(
    validateCompanionLocaleCatalog(
      {
        en: { common: { count: "{count, plural, one {One item}}" } },
      },
      localeDefinitions,
    ).join("\n"),
    /en\.common\.count has invalid message format.*missing the required "other" branch/,
  );
  assert.throws(
    () =>
      writeGeneratedCompanionLocales({
        catalogFile,
        outputRoot,
        registryFile,
        localeDefinitions,
      }),
    /invalid message format/,
  );
});

test("Companion locale generator reports stale and missing outputs", () => {
  const root = mkdtempSync(resolve(tmpdir(), "filament-manager-locales-"));
  const catalogFile = resolve(root, "catalog.json");
  const outputRoot = resolve(root, "output");
  const registryFile = resolve(root, "registry.rs");
  const localeDefinitions = [{ id: "en" }];
  writeFileSync(
    catalogFile,
    JSON.stringify({
      schemaVersion: 1,
      dictionaries: { en: { shell: { done: "Done" } } },
    }),
  );

  writeGeneratedCompanionLocales({
    catalogFile,
    outputRoot,
    registryFile,
    localeDefinitions,
  });
  writeFileSync(resolve(outputRoot, companionLocaleAssetName("en")), "stale\n");

  assert.match(
    checkGeneratedCompanionLocales({
      catalogFile,
      outputRoot,
      registryFile,
      localeDefinitions,
    }).errors.join("\n"),
    /is stale/,
  );
});
