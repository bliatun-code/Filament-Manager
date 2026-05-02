import test from "node:test";
import assert from "node:assert/strict";

import {
  readStoredCompanionLocale,
  resolveInitialCompanionLocale,
} from "./companion_i18n.js";

test("readStoredCompanionLocale falls back when storage throws", () => {
  assert.equal(
    readStoredCompanionLocale("locale-key", {
      getItem() {
        throw new Error("storage denied");
      },
    }),
    "en",
  );
});

test("resolveInitialCompanionLocale falls back to navigator when storage throws", () => {
  const locale = resolveInitialCompanionLocale(
    {
      getItem() {
        throw new Error("storage denied");
      },
    },
    { language: "nb-NO" },
  );

  assert.equal(locale, "nb");
});

test("resolveInitialCompanionLocale falls back to English when storage and navigator throw", () => {
  const locale = resolveInitialCompanionLocale(
    {
      getItem() {
        throw new Error("storage denied");
      },
    },
    {
      get language() {
        throw new Error("navigator denied");
      },
    },
  );

  assert.equal(locale, "en");
});

test("resolveInitialCompanionLocale tolerates blocked browser globals", () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage denied");
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      get() {
        throw new Error("navigator denied");
      },
    });

    assert.equal(resolveInitialCompanionLocale(), "en");
  } finally {
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      delete globalThis.localStorage;
    }
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  }
});
