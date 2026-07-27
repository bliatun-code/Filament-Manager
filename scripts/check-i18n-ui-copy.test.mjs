import assert from "node:assert/strict";
import test from "node:test";

import {
  collectStaticUiCopyFromSource,
  shouldCheckStaticUiCopyFile,
  validateStaticUiCopy,
} from "./check-i18n-ui-copy.mjs";

test("static UI copy collector finds JSX text and accessibility attributes", () => {
  const findings = collectStaticUiCopyFromSource(
    `<section aria-label="Settings">Hardcoded copy<span>{translated}</span></section>`,
  );

  assert.deepEqual(
    findings.map(({ kind, value }) => ({ kind, value })),
    [
      { kind: "aria-label", value: "Settings" },
      { kind: "text", value: "Hardcoded copy" },
    ],
  );
});

test("static UI copy contract allows technical units and rejects user copy", () => {
  const errors = validateStaticUiCopy([
    { file: "example.tsx", line: 1, column: 1, kind: "text", value: "g" },
    { file: "example.tsx", line: 2, column: 1, kind: "text", value: "Save" },
  ]);

  assert.deepEqual(errors, [
    `example.tsx:2:1: untranslated text copy "Save".`,
  ]);
});

test("static UI copy contract excludes only the isolated accessibility harness", () => {
  assert.equal(
    shouldCheckStaticUiCopyFile(
      "ui/src/accessibility/app_modal_accessibility_harness.tsx",
    ),
    false,
  );
  assert.equal(
    shouldCheckStaticUiCopyFile("ui/src/accessibility/future_product_surface.tsx"),
    true,
  );
  assert.equal(shouldCheckStaticUiCopyFile("ui/src/pages/dashboard.tsx"), true);
});
