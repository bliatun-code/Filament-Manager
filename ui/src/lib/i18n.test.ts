import assert from "node:assert/strict";
import test from "node:test";

import {
  getCachedLocaleDictionary,
  loadLocaleDictionary,
  lookup,
  persistLocale,
  resolveInitialLocale,
} from "./i18n";

function withGlobalValue<T>(
  key: "localStorage" | "navigator" | "window",
  value: unknown,
  run: () => T,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("resolveInitialLocale uses stored supported locale", () => {
  const storage = {
    getItem: () => "nb",
  };

  const locale = withGlobalValue("localStorage", storage, () => resolveInitialLocale());

  assert.equal(locale, "nb");
});

test("resolveInitialLocale lets screenshot URLs override stored locale", () => {
  const storage = {
    getItem: () => "nb",
  };
  const windowRef = {
    location: {
      search: "?bfm_locale=en",
    },
  };

  const locale = withGlobalValue("window", windowRef, () =>
    withGlobalValue("localStorage", storage, () => resolveInitialLocale()),
  );

  assert.equal(locale, "en");
});

test("locale dictionaries lazy-load and cache supported locales", async () => {
  const enDictionary = await loadLocaleDictionary("en");

  assert.equal(lookup(enDictionary, "app.title"), "Filament Manager");
  assert.equal(getCachedLocaleDictionary("en"), enDictionary);

  const nbDictionary = await loadLocaleDictionary("nb");

  assert.equal(lookup(nbDictionary, "nav.inventory"), "Lager");
  assert.equal(getCachedLocaleDictionary("nb"), nbDictionary);
});

test("resolveInitialLocale falls back when localStorage throws", () => {
  const storage = {
    getItem: () => {
      throw new Error("storage denied");
    },
  };
  const navigatorRef = {
    language: "no-NO",
  };

  const locale = withGlobalValue("localStorage", storage, () =>
    withGlobalValue("navigator", navigatorRef, () => resolveInitialLocale()),
  );

  assert.equal(locale, "nb");
});

test("persistLocale ignores localStorage write failures", () => {
  const storage = {
    setItem: () => {
      throw new Error("storage denied");
    },
  };

  assert.doesNotThrow(() => {
    withGlobalValue("localStorage", storage, () => persistLocale("en"));
  });
});
