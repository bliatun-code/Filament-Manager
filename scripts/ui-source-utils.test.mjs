import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import {
  collectDynamicImportTemplateSpecifiers,
  resolveRelativeImportGlob,
} from "./ui-source-utils.mjs";

test("UI source utilities discover locale modules loaded through dynamic imports", () => {
  const fromFile = resolve("ui/src/lib/i18n_locales/load_dictionary.ts");
  const files = [
    resolve("ui/src/lib/i18n_locales/locales/en.ts"),
    resolve("ui/src/lib/i18n_locales/locales/nb.ts"),
    resolve("ui/src/lib/i18n_locales/locales/readme.md"),
  ];
  const [specifier] = collectDynamicImportTemplateSpecifiers(
    "const module = import(`./locales/${locale}.ts`);",
  );

  assert.equal(specifier, "./locales/*.ts");
  assert.deepEqual(resolveRelativeImportGlob(files, fromFile, specifier), files.slice(0, 2));
});
