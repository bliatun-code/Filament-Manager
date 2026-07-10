import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(
  new URL("./printer_overview_card_header.tsx", import.meta.url),
  "utf8",
);

test("printer overview header lets long names and metadata wrap inside compact cards", () => {
  assert.match(headerSource, /order-1 flex min-w-0 flex-1 items-start gap-3/);
  assert.match(headerSource, /className="shrink-0"/);
  assert.match(headerSource, /className="min-w-0 space-y-0\.5"/);
  assert.equal(headerSource.match(/\[overflow-wrap:anywhere\]/g)?.length, 2);
  assert.match(headerSource, /min-\[900px\]:w-auto/);
  assert.match(
    headerSource,
    /order-2 w-full min-\[640px\]:-mt-8 min-\[640px\]:pl-\[10\.25rem\] min-\[900px\]:order-3/,
  );
  assert.doesNotMatch(headerSource, /min-\[1200px\]:w-auto/);
  assert.doesNotMatch(headerSource, /min-\[1080px\]:w-auto/);
});
