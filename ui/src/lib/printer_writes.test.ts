import assert from "node:assert/strict";
import test from "node:test";

import {
  createManagedPrinter,
  createManagedPrinterWithBambuLive,
  deleteManagedBambuLiveIntegration,
  deleteManagedPrinter,
  saveManagedBambuLiveIntegration,
} from "./printer_writes";
import type { CreatePrinterInput, SaveBambuLiveIntegrationInput } from "./tauri_client";

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
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    input: CreatePrinterInput;
  }> = [];

  await createManagedPrinter(
    printerInput(),
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
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

  await createManagedPrinter(
    input,
    { clientReadOnly: false },
    {
      createLocalPrinter: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("createManagedPrinterWithBambuLive saves live setup after creating the printer", async () => {
  const calls: string[] = [];
  await createManagedPrinterWithBambuLive(
    printerInput(),
    bambuLiveInput(),
    {},
    {
      createLocalPrinter: async () => {
        calls.push("create");
      },
      saveLocalBambuLiveIntegration: async () => {
        calls.push("live");
      },
      deleteLocalPrinter: async () => {
        calls.push("delete");
      },
    },
  );
  assert.deepEqual(calls, ["create", "live"]);
});

test("createManagedPrinterWithBambuLive rolls back a printer when live setup fails", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () =>
      createManagedPrinterWithBambuLive(
        printerInput(),
        bambuLiveInput(),
        {},
        {
          createLocalPrinter: async () => {
            calls.push("create");
          },
          saveLocalBambuLiveIntegration: async () => {
            calls.push("live");
            throw new Error("identity changed");
          },
          deleteLocalPrinter: async () => {
            calls.push("delete");
          },
        },
      ),
    /identity changed/,
  );
  assert.deepEqual(calls, ["create", "live", "delete"]);
});

test("deleteManagedPrinter routes client writes to the host", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    printerId: string;
  }> = [];

  await deleteManagedPrinter(
    "printer-1",
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    {
      deleteHostPrinter: async (baseUrl, libraryId, printerId) => {
        calls.push({ baseUrl, libraryId, printerId });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", printerId: "printer-1" }]);
});

test("deleteManagedPrinter writes locally outside client mode", async () => {
  const calls: string[] = [];

  await deleteManagedPrinter(
    "printer-1",
    { clientReadOnly: false },
    {
      deleteLocalPrinter: async (printerId) => {
        calls.push(printerId);
      },
    },
  );

  assert.deepEqual(calls, ["printer-1"]);
});

test("printer host writes reject missing host details", async () => {
  await assert.rejects(() => createManagedPrinter(printerInput(), { clientReadOnly: true }), /Host connection details/);
});

function bambuLiveInput(overrides: Partial<SaveBambuLiveIntegrationInput> = {}): SaveBambuLiveIntegrationInput {
  return {
    printer_id: "printer-1",
    enabled: true,
    host: "192.168.1.42",
    access_code_action: "REPLACE",
    access_code: "access",
    printer_serial: "serial",
    tls_trust_action: "KEEP",
    ...overrides,
  };
}

test("saveManagedBambuLiveIntegration routes client writes to the host", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    input: SaveBambuLiveIntegrationInput;
  }> = [];
  const input = bambuLiveInput();

  await saveManagedBambuLiveIntegration(
    input,
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    {
      saveHostBambuLiveIntegration: async (baseUrl, libraryId, hostInput) => {
        calls.push({ baseUrl, libraryId, input: hostInput });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", input }]);
});

test("saveManagedBambuLiveIntegration writes locally outside client mode", async () => {
  const calls: SaveBambuLiveIntegrationInput[] = [];
  const input = bambuLiveInput({ printer_id: "local-printer" });

  await saveManagedBambuLiveIntegration(
    input,
    { clientReadOnly: false },
    {
      saveLocalBambuLiveIntegration: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("deleteManagedBambuLiveIntegration routes client writes to the host", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    printerId: string;
  }> = [];

  await deleteManagedBambuLiveIntegration(
    "printer-1",
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-1",
    },
    {
      deleteHostBambuLiveIntegration: async (baseUrl, libraryId, printerId) => {
        calls.push({ baseUrl, libraryId, printerId });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", printerId: "printer-1" }]);
});

test("deleteManagedBambuLiveIntegration writes locally outside client mode", async () => {
  const calls: string[] = [];

  await deleteManagedBambuLiveIntegration(
    "printer-1",
    { clientReadOnly: false },
    {
      deleteLocalBambuLiveIntegration: async (printerId) => {
        calls.push(printerId);
      },
    },
  );

  assert.deepEqual(calls, ["printer-1"]);
});
