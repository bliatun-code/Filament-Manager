import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./spool_qr_artifacts.ts", import.meta.url), "utf8");

test("spool QR artifacts keep QR encoding behind the print action", () => {
  assert.match(source, /import\("\.\/filament_label_print"\)/);
  assert.doesNotMatch(source, /from "\.\/filament_label_print"/);
});
