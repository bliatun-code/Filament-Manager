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

test("getThemeMode keeps dark as the desktop visual QA default", () => {
  const mode = withWindowSearch("?bfm_visual_qa=add-filament", () =>
    withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
  );

  assert.equal(mode, "dark");
});

test("getThemeMode honors supported desktop visual QA theme overrides", () => {
  for (const theme of ["light", "dark", "auto"] as const) {
    const mode = withWindowSearch(
      `?bfm_visual_qa=add-filament&bfm_visual_qa_theme=${theme}`,
      () => withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
    );

    assert.equal(mode, theme);
  }
});

test("getThemeMode rejects invalid desktop visual QA theme overrides", () => {
  const mode = withWindowSearch(
    "?bfm_visual_qa=add-filament&bfm_visual_qa_theme=sepia",
    () => withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
  );

  assert.equal(mode, "dark");
});

test("getThemeMode ignores visual QA theme overrides outside a visual QA route", () => {
  const mode = withWindowSearch("?bfm_visual_qa_theme=dark", () =>
    withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
  );

  assert.equal(mode, "light");
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
