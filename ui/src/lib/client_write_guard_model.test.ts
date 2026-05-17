import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveClientHostWriteGuard,
  resolveLocalWriteGuard,
} from "./client_write_guard_model";

test("resolveLocalWriteGuard blocks local writes in client read-only mode", () => {
  assert.deepEqual(resolveLocalWriteGuard(false), { allowed: true, messageKey: null });
  assert.deepEqual(resolveLocalWriteGuard(true), {
    allowed: false,
    messageKey: "clientReadOnlyAction",
  });
});

test("resolveClientHostWriteGuard requires client mode, normalized host, library and pairing", () => {
  assert.deepEqual(
    resolveClientHostWriteGuard({
      clientReadOnly: false,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
      clientHostWritePaired: true,
    }),
    { allowed: false, messageKey: null },
  );

  assert.deepEqual(
    resolveClientHostWriteGuard({
      clientReadOnly: true,
      clientHostBaseUrl: " ",
      clientLibraryId: "library-1",
      clientHostWritePaired: true,
    }),
    { allowed: false, messageKey: "clientHostUnavailable" },
  );

  assert.deepEqual(
    resolveClientHostWriteGuard({
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      clientHostWritePaired: false,
    }),
    { allowed: false, messageKey: "clientWriteRequiresPairing" },
  );

  assert.deepEqual(
    resolveClientHostWriteGuard({
      clientReadOnly: true,
      clientHostBaseUrl: " http://host ",
      clientLibraryId: " library-1 ",
      clientHostWritePaired: true,
    }),
    { allowed: true, messageKey: null },
  );
});
