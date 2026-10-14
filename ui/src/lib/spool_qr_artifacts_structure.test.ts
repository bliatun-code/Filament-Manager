import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./spool_qr_artifacts.ts", import.meta.url), "utf8");

test("spool QR artifacts lazy-load branded QR encoding", () => {
  assert.match(source, /import\("\.\/filament_qr_branding"\)/);
  assert.doesNotMatch(source, /from "\.\/filament_qr_branding"/);
});
