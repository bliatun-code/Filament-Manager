import assert from "node:assert/strict";
import test from "node:test";

import {
  writePreparedMeasuredWeightUpdate,
  writePreparedPrinterSlotAssignment,
  writePrinterSlotAssignment,
} from "./printer_slot_writes";
import type { AssignPrinterSlotInput } from "./tauri_client";

function assignInput(overrides: Partial<AssignPrinterSlotInput> = {}): AssignPrinterSlotInput {
  return {
    printer_id: "printer-1",
    slot_id: "ams_0_0",
    spool_id: "spool-1",
    ...overrides,
  };
}

test("writePrinterSlotAssignment routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string; input: AssignPrinterSlotInput }> = [];

  await writePrinterSlotAssignment(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    assignInput(),
    {
      assignHostPrinterSlot: async (baseUrl, libraryId, input) => {
        calls.push({ baseUrl, libraryId, input });
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1", input: assignInput() },
  ]);
});

test("writePrinterSlotAssignment writes locally outside client mode", async () => {
  const calls: AssignPrinterSlotInput[] = [];
  const input = assignInput({ spool_id: null });

  await writePrinterSlotAssignment(
    { clientReadOnly: false, clientHostBaseUrl: null, clientLibraryId: null },
    input,
    {
      assignLocalPrinterSlot: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("writePreparedPrinterSlotAssignment writes the prepared assign input", async () => {
  const calls: AssignPrinterSlotInput[] = [];
  const input = assignInput({
    spool_id: null,
    clear_live_cache_before_next_refresh: true,
  });

  await writePreparedPrinterSlotAssignment(
    { clientReadOnly: false, clientHostBaseUrl: null, clientLibraryId: null },
    {
      currentSpoolId: "spool-1",
      targetSpoolId: null,
      hasChange: true,
      overrideChanged: false,
      shouldAssignSlot: true,
      assignInput: input,
    },
    {
      assignLocalPrinterSlot: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("writePreparedMeasuredWeightUpdate routes client usage writes to the host", async () => {
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    input: {
      printer_id: string;
      spool_id: string;
      grams: number;
      job_name: string | null;
      success: boolean;
    };
  }> = [];

  await writePreparedMeasuredWeightUpdate(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    "printer-1",
    "spool-1",
    {
      safeMeasuredTotal: 700,
      safeTareWeight: 250,
      measuredFilament: 450,
      baseline: 500,
      usedGrams: 50,
      clientAction: "record_usage",
      localAction: "record_usage",
    },
    {
      recordHostPrintUsage: async (baseUrl, libraryId, input) => {
        calls.push({ baseUrl, libraryId, input });
      },
    },
  );

  assert.deepEqual(calls, [
    {
      baseUrl: "http://host",
      libraryId: "library-1",
      input: {
        printer_id: "printer-1",
        spool_id: "spool-1",
        grams: 50,
        job_name: null,
        success: true,
      },
    },
  ]);
});

test("writePreparedMeasuredWeightUpdate routes client weight writes to the host", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string; spoolId: string; grams: number }> = [];

  await writePreparedMeasuredWeightUpdate(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    "printer-1",
    "spool-1",
    {
      safeMeasuredTotal: 820,
      safeTareWeight: 250,
      measuredFilament: 570,
      baseline: 500,
      usedGrams: 0,
      clientAction: "update_weight",
      localAction: "update_weight",
    },
    {
      updateHostSpoolWeight: async (baseUrl, libraryId, spoolId, grams) => {
        calls.push({ baseUrl, libraryId, spoolId, grams });
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", libraryId: "library-1", spoolId: "spool-1", grams: 820 },
  ]);
});

test("printer slot host writes reject missing host details", async () => {
  await assert.rejects(
    () =>
      writePrinterSlotAssignment(
        { clientReadOnly: true, clientHostBaseUrl: "", clientLibraryId: "library-1" },
        assignInput(),
      ),
    /Host connection details/,
  );
});
