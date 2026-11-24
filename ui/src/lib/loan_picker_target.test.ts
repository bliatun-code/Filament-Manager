import assert from "node:assert/strict";
import test from "node:test";
import { readLoanPicker } from "./loan_out_data_source";

test("a paired picker falls back only for a live older Host with the original generation", async () => {
  const options = {
    clientReadOnly: true, clientHostBaseUrl: "http://host-a",
    clientLibraryId: "a", clientTargetGeneration: 1,
  };
  const query = { locale: "en", search: "", selected_id: null, offset: 0 };
  const expectedTarget = { base_url: "http://host-a", expected_library_id: "a", target_generation: 1 };
  const page = { rows: [], selected: null, matches: 0, total: 0, revisions: [1, 2, 3, 4] };
  let mode: "modern" | "legacy" | "offline" = "modern";
  let current = { mode: "CLIENT", host_base_url: "http://host-a", library_id: "a", target_generation: 1 };
  let switchDuringRead = false;
  const calls: string[] = [];
  const previous = globalThis.window;
  globalThis.window = { __TAURI__: {
    invoke: async (command: string, payload: Record<string, unknown>) => {
      calls.push(command);
      switch (command) {
        case "get_loan_picker_page":
          assert.deepEqual(payload.target, expectedTarget);
          if (mode === "offline") throw new Error("Host unreachable");
          return mode === "legacy" ? null : page;
        case "fetch_library_sync_printer_overview": return [];
        case "fetch_library_sync_spool_snapshot":
          if (switchDuringRead) {
            current = { ...current, host_base_url: "http://host-b", library_id: "b", target_generation: 2 };
            current = { ...current, host_base_url: "http://host-a", library_id: "a", target_generation: 3 };
          }
          return { rows: [], captured_at: null };
        case "get_library_sync_page_status": return current;
        default: throw new Error("Unexpected command: " + command);
      }
    },
  } } as unknown as Window & typeof globalThis;

  try {
    assert.deepEqual(await readLoanPicker(options, query), page);
    assert.deepEqual(calls.splice(0), ["get_loan_picker_page"]);
    mode = "offline";
    await assert.rejects(readLoanPicker(options, query), /Host unreachable/);
    assert.deepEqual(calls.splice(0), ["get_loan_picker_page"]);
    mode = "legacy";
    assert.deepEqual(await readLoanPicker(options, query), []);
    const liveReads = calls.splice(0);
    assert.equal(liveReads[0], "get_loan_picker_page");
    assert.deepEqual(liveReads.slice(1, -1).sort(), ["fetch_library_sync_printer_overview", "fetch_library_sync_spool_snapshot"]);
    assert.equal(liveReads.at(-1), "get_library_sync_page_status");
    switchDuringRead = true;
    await assert.rejects(readLoanPicker(options, query), /common.invalid_request/);
    assert.deepEqual(calls, liveReads);
  } finally {
    globalThis.window = previous;
  }
});
