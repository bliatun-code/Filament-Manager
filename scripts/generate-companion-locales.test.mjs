import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  checkGeneratedCompanionLocales,
  companionLocaleAssetName,
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
