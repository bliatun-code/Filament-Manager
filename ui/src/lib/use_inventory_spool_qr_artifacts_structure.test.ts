import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_inventory_spool_qr_artifacts.ts", import.meta.url),
  "utf8",
);

test("selected spool QR hook lazy-loads QR artifact generation", () => {
  assert.match(source, /import\("\.\/spool_qr_artifacts"\)/);
  assert.match(source, /import type \{ SpoolQrArtifacts \} from "\.\/spool_qr_artifacts"/);
  assert.doesNotMatch(source, /import \{ buildSpoolQrArtifacts \} from "\.\/spool_qr_artifacts"/);
});
