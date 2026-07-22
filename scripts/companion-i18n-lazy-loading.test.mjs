import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { CATALOG_LOCALES } from "../src-tauri/companion_browser/supported_locales.js";
import {
  loadCompanionLocale,
  loadedCompanionDictionaryLocales,
  requiredCompanionDictionaryLocales,
  t,
} from "../src-tauri/companion_browser/companion_i18n.js";
import { companionLocaleAssetName } from "./generate-companion-locales.mjs";

const MAX_INITIAL_TRANSLATION_BYTES = 64 * 1024;

test("Companion locale loading fetches only the selected source dictionary", async () => {
  const requested = [];
  const loadModule = async (locale) => {
    requested.push(locale);
    return {
      locale,
      default: { nav: { storage: `${locale} inventory` } },
    };
  };

  assert.deepEqual(requiredCompanionDictionaryLocales("nb"), ["nb"]);
  await loadCompanionLocale("nb", { loadModule });
  assert.deepEqual(requested, ["nb"]);
  assert.equal(t("nb", "nav.storage"), "nb inventory");

  assert.deepEqual(requiredCompanionDictionaryLocales("es"), ["es"]);
  await loadCompanionLocale("es", { loadModule });
  assert.deepEqual(requested, ["nb", "es"]);
  assert.equal(t("es", "nav.storage"), "es inventory");
  assert.equal(t("es", "missing.key", "Safe fallback"), "Safe fallback");

  assert.deepEqual(requiredCompanionDictionaryLocales("en-XA"), ["en"]);
  await loadCompanionLocale("en-XA", { loadModule });
  assert.deepEqual(requested, ["nb", "es", "en"]);
  assert.deepEqual(loadedCompanionDictionaryLocales(), ["en", "es", "nb"]);
});

test("a malformed locale module can be retried after validation fails", async () => {
  let attempts = 0;
  const loadModule = async (locale) => {
    attempts += 1;
    return attempts === 1
      ? { locale, default: null }
      : { locale, default: { nav: { storage: "Bestand" } } };
  };

  await assert.rejects(
    loadCompanionLocale("de", { loadModule }),
    /did not provide a dictionary/,
  );
  await loadCompanionLocale("de", { loadModule });
  assert.equal(attempts, 2);
  assert.equal(t("de", "nav.storage"), "Bestand");
});

test("Companion runtime has no eager imports of generated locale modules", () => {
  const source = readFileSync(
    resolve("src-tauri", "companion_browser", "companion_i18n.js"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:from|import\s+)\s*[('"`]\.\/companion_locale_/,
  );
  assert.match(source, /import\(`\.\/\$\{companionLocaleAssetName\(locale\)\}`\)/);
});

test("every selected Companion locale stays within the initial translation budget", () => {
  const browserRoot = resolve("src-tauri", "companion_browser");
  const runtimeBytes = readFileSync(
    resolve(browserRoot, "companion_i18n.js"),
  ).byteLength;

  for (const { id } of CATALOG_LOCALES) {
    const localeBytes = readFileSync(
      resolve(browserRoot, companionLocaleAssetName(id)),
    ).byteLength;
    assert.ok(
      runtimeBytes + localeBytes <= MAX_INITIAL_TRANSLATION_BYTES,
      `${id} initial translation payload is ${runtimeBytes + localeBytes} bytes`,
    );
  }
});
