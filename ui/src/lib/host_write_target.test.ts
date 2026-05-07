import assert from "node:assert/strict";
import test from "node:test";

import {
  requireClientHostBaseTarget,
  requireClientHostWriteTarget,
} from "./host_write_target";

test("requireClientHostWriteTarget trims and returns complete host details", () => {
  assert.deepEqual(
    requireClientHostWriteTarget(
      {
        clientHostBaseUrl: "  http://host.local  ",
        clientLibraryId: " library-1 ",
      },
      "missing host",
    ),
    { baseUrl: "http://host.local", libraryId: "library-1" },
  );
});

test("requireClientHostWriteTarget rejects missing library details", () => {
  assert.throws(
    () =>
      requireClientHostWriteTarget(
        { clientHostBaseUrl: "http://host.local", clientLibraryId: " " },
        "missing host",
      ),
    /missing host/,
  );
});

test("requireClientHostBaseTarget allows optional library id for base-only writes", () => {
  assert.deepEqual(
    requireClientHostBaseTarget(
      { clientHostBaseUrl: " http://host.local ", clientLibraryId: " " },
      "missing host base",
    ),
    { baseUrl: "http://host.local", libraryId: null },
  );
});
