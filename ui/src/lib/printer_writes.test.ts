import assert from "node:assert/strict";
import test from "node:test";

import { createManagedPrinter, deleteManagedPrinter } from "./printer_writes";
import type { CreatePrinterInput } from "./tauri_client";

function printerInput(overrides: Partial<CreatePrinterInput> = {}): CreatePrinterInput {
  return {
    id: "printer-1",
    model: "bambu_x1c",
    name: "X1 Carbon",
    ams_units: 1,
    slots_per_ams: 4,
    ...overrides,
  };
}

test("createManagedPrinter routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string; input: CreatePrinterInput }> = [];

  await createManagedPrinter(
    printerInput(),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      createHostPrinter: async (baseUrl, libraryId, input) => {
        calls.push({ baseUrl, libraryId, input });
      },
    },
  );

  assert.equal(calls[0]?.baseUrl, "http://host");
  assert.equal(calls[0]?.libraryId, "library-1");
  assert.equal(calls[0]?.input.id, "printer-1");
});

test("createManagedPrinter writes locally outside client mode", async () => {
  const calls: CreatePrinterInput[] = [];
  const input = printerInput({ id: "local-printer" });

  await createManagedPrinter(input, { clientReadOnly: false }, {
    createLocalPrinter: async (localInput) => {
      calls.push(localInput);
    },
  });

  assert.deepEqual(calls, [input]);
});

test("deleteManagedPrinter routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string; printerId: string }> = [];

  await deleteManagedPrinter(
    "printer-1",
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      deleteHostPrinter: async (baseUrl, libraryId, printerId) => {
        calls.push({ baseUrl, libraryId, printerId });
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1", printerId: "printer-1" },
  ]);
});

test("deleteManagedPrinter writes locally outside client mode", async () => {
  const calls: string[] = [];

  await deleteManagedPrinter("printer-1", { clientReadOnly: false }, {
    deleteLocalPrinter: async (printerId) => {
      calls.push(printerId);
    },
  });

  assert.deepEqual(calls, ["printer-1"]);
});

test("printer host writes reject missing host details", async () => {
  await assert.rejects(
    () => createManagedPrinter(printerInput(), { clientReadOnly: true }),
    /Host connection details/,
  );
});
