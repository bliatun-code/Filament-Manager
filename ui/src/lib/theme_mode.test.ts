import assert from "node:assert/strict";
import test from "node:test";

import { getThemeMode, setThemeMode } from "./theme_mode";

function withLocalStorage<T>(storage: unknown, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
}

function withWindowSearch<T>(search: string, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search },
    },
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test("getThemeMode returns stored supported mode", () => {
  const mode = withLocalStorage({ getItem: () => "dark" }, () => getThemeMode());

  assert.equal(mode, "dark");
});

test("getThemeMode forces dark mode for desktop visual QA routes", () => {
  const mode = withWindowSearch("?bfm_visual_qa=add-filament", () =>
    withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
  );

  assert.equal(mode, "dark");
});

test("getThemeMode falls back to auto when localStorage throws", () => {
  const storage = {
    getItem: () => {
      throw new Error("storage denied");
    },
  };

  const mode = withLocalStorage(storage, () => getThemeMode());

  assert.equal(mode, "auto");
});

test("setThemeMode ignores localStorage write failures", () => {
  const storage = {
    setItem: () => {
      throw new Error("storage denied");
    },
  };

  assert.doesNotThrow(() => {
    withLocalStorage(storage, () => setThemeMode("light"));
  });
});
