import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(
  new URL("./printer_overview_card_header.tsx", import.meta.url),
  "utf8",
);

test("printer overview header lets long names and metadata wrap inside compact cards", () => {
  assert.match(headerSource, /className="printer-balanced-identity"/);
  assert.match(headerSource, /className="shrink-0"/);
  assert.match(headerSource, /className="min-w-0 space-y-0\.5"/);
  assert.equal(headerSource.match(/\[overflow-wrap:anywhere\]/g)?.length, 2);
  assert.match(headerSource, /className="printer-balanced-metrics"/);
  assert.match(headerSource, /className="printer-balanced-telemetry"/);
  assert.doesNotMatch(headerSource, /printerBrandSurfaceStyle/);
});
