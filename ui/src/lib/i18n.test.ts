import assert from "node:assert/strict";
import test from "node:test";

import { persistLocale, resolveInitialLocale } from "./i18n";

function withGlobalValue<T>(key: "localStorage" | "navigator", value: unknown, run: () => T): T {
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
