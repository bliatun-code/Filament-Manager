import assert from "node:assert/strict";
import test from "node:test";

import {
  getNativeWindowTheme,
  getThemeMode,
  isThemeMode,
  resolveThemeMode,
  setThemeMode,
  THEME_MODES,
} from "./theme_mode";

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

function withDocument<T>(documentValue: unknown, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentValue,
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "document", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "document");
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
  for (const theme of THEME_MODES) {
    const mode = withWindowSearch(
      `?bfm_visual_qa=add-filament&bfm_visual_qa_theme=${theme}`,
      () => withLocalStorage({ getItem: () => "light" }, () => getThemeMode()),
    );

    assert.equal(mode, theme);
  }
});

test("theme registry distinguishes selected modes from resolved color schemes", () => {
  assert.deepEqual(THEME_MODES, ["auto", "dark", "dark-deep", "blue", "light"]);
  assert.equal(resolveThemeMode("auto", false), "light");
  assert.equal(resolveThemeMode("auto", true), "dark");
  assert.equal(resolveThemeMode("light", true), "light");
  assert.equal(resolveThemeMode("dark", false), "dark");
  assert.equal(resolveThemeMode("dark-deep", false), "dark");
  assert.equal(resolveThemeMode("blue", false), "dark");
  assert.equal(isThemeMode("dark-deep"), true);
  assert.equal(isThemeMode("sepia"), false);
});

test("native window theme keeps system modes native and gives brand themes opaque titlebars", () => {
  assert.deepEqual(getNativeWindowTheme("auto"), {
    appearance: null,
    backgroundColor: null,
  });
  assert.deepEqual(getNativeWindowTheme("light"), {
    appearance: "light",
    backgroundColor: [245, 247, 249, 255],
  });
  assert.deepEqual(getNativeWindowTheme("dark"), {
    appearance: "dark",
    backgroundColor: [34, 45, 53, 255],
  });
  assert.deepEqual(getNativeWindowTheme("dark-deep"), {
    appearance: "dark",
    backgroundColor: [18, 25, 30, 255],
  });
  assert.deepEqual(getNativeWindowTheme("blue"), {
    appearance: "dark",
    backgroundColor: [14, 23, 40, 255],
  });
});

test("getThemeMode restores stored branded themes", () => {
  for (const theme of ["dark-deep", "blue"] as const) {
    const mode = withLocalStorage({ getItem: () => theme }, () => getThemeMode());
    assert.equal(mode, theme);
  }
});

test("setThemeMode exposes selected and resolved themes without dropping dark compatibility", () => {
  const classNames = new Set<string>();
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  const documentValue = {
    documentElement: {
      classList: {
        toggle: (name: string, enabled: boolean) => {
          if (enabled) {
            classNames.add(name);
          } else {
            classNames.delete(name);
          }
        },
      },
      dataset,
      style,
    },
  };

  withDocument(documentValue, () => {
    withLocalStorage({ setItem: () => {} }, () => setThemeMode("dark-deep"));
  });

  assert.equal(classNames.has("dark"), true);
  assert.equal(dataset.theme, "dark-deep");
  assert.equal(dataset.themeMode, "dark-deep");
  assert.equal(dataset.resolvedTheme, "dark");
  assert.equal(style.colorScheme, "dark");

  withDocument(documentValue, () => {
    withLocalStorage({ setItem: () => {} }, () => setThemeMode("light"));
  });

  assert.equal(classNames.has("dark"), false);
  assert.equal(dataset.theme, "light");
  assert.equal(dataset.themeMode, "light");
  assert.equal(dataset.resolvedTheme, "light");
  assert.equal(style.colorScheme, "light");
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

test("retired brand preferences migrate to gray soft", () => {
  for (const stored of ["bambu", "prusa"]) {
    assert.equal(withLocalStorage({ getItem: () => stored }, () => getThemeMode()), "dark");
    assert.equal(isThemeMode(stored), false);
  }
});
