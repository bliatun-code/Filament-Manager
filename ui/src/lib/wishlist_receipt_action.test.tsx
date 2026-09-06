import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { buildBambuFilamentCodeBatch } from "./bambu_filament_code_batch";
import { useInventoryCreateActions } from "./use_inventory_create_actions";
import type { WishlistItemRow, WishlistReceiptResult } from "./tauri_wishlist_client";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const commands: Array<{ command: string; payload?: Record<string, unknown> }> = [];
let writeFailure: Error | null = null;
const receipt: WishlistReceiptResult = {
  spool_ids: ["received-1", "received-2"],
  received_quantity: 2,
  remaining_quantity: 1,
  status: "ON_ORDER",
};
Object.assign(globalThis, {
  window: {
    __TAURI__: {
      invoke: async (command: string, payload?: Record<string, unknown>) => {
        commands.push({ command, payload });
        if (writeFailure) throw writeFailure;
        return receipt;
      },
    },
  },
});

function createActions(clientReadOnly: boolean, refreshFailure?: "spools" | "wishlist") {
  let actions: ReturnType<typeof useInventoryCreateActions> | undefined;
  let info: string | null = null;
  let selected: string | null = null;
  let error: string | null = null;
  const busy: boolean[] = [];
  const reloads: string[] = [];
  function Harness() {
    actions = useInventoryCreateActions({
      borrowedFromContact: "", borrowedFromName: "", borrowedInNote: "",
      bambuCodeBatch: buildBambuFilamentCodeBatch({ masters: [], rawInput: "" }),
      busy: false,
      canUseClientHostWrite: () => true,
      clientHostBaseUrl: clientReadOnly ? "http://paired-host" : null,
      clientLibraryId: clientReadOnly ? "library-host" : null,
      clientReadOnly,
      confirmWishlistRemoveId: null,
      createMode: "bambu",
      ensureLocalWriteAllowed: () => true,
      manualColorName: "", manualFilamentName: "", manualHexColor: "",
      manualMaterial: "PLA", manualVendor: "Generic",
      newInitialWeight: "1000", newLocation: "", newOwnershipType: "OWNED",
      onWishlistItemCreated: () => {},
      reloadCatalog: async () => {},
      reloadSpools: async () => {
        reloads.push("spools");
        if (refreshFailure === "spools") throw new Error("Spool refresh failed");
      },
      reloadWishlist: async () => {
        reloads.push("wishlist");
        if (refreshFailure === "wishlist") throw new Error("Wishlist refresh failed");
      },
      resetAfterCreatedSpool: () => {}, resetBambuBatchInput: () => {},
      selectedBambuMaster: null, selectedEsunMaster: null,
      setBusy: (value) => { busy.push(typeof value === "function" ? value(false) : value); },
      setConfirmWishlistRemoveId: () => {},
      setError: (value) => { error = typeof value === "function" ? value(error) : value; },
      setInfoMessage: (value) => { info = typeof value === "function" ? value(info) : value; },
      setRecentlyAddedSpoolId: () => {},
      setSelectedSpoolId: (value) => { selected = typeof value === "function" ? value(selected) : value; },
      tauriAvailable: true,
      t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
    });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  assert.ok(actions);
  return { actions, reloads, busy, getInfo: () => info, getSelected: () => selected, getError: () => error };
}

const item: WishlistItemRow = {
  id: "wish-white", material: "PLA", filament_name: "PLA Basic", color_name: "Jade White",
  vendor: "Bambu Lab", status: "ON_ORDER", quantity: 8, created_at: "", updated_at: "",
};

test("receipt action sends location with the atomic local or Host receipt and reports authoritative quantities", async () => {
  for (const clientReadOnly of [false, true]) {
    commands.length = 0;
    const harness = createActions(clientReadOnly);
    assert.equal(await harness.actions.handleStockFromWishlist(item, 2, undefined, "  QA Dry box  "), true);
    assert.equal(commands.length, 1, "Receiving must not trigger a separate location mutation");
    assert.equal(commands[0].command, clientReadOnly ? "receive_library_sync_host_wishlist_item" : "receive_wishlist_item");
    assert.deepEqual(commands[0].payload, {
      input: {
        ...(clientReadOnly ? { base_url: "http://paired-host", expected_library_id: "library-host" } : {}),
        item_id: "wish-white", quantity: 2, home_location: "QA Dry box",
      },
    });
    assert.deepEqual(harness.reloads, ["spools", "wishlist"]);
    assert.equal(harness.getSelected(), "received-1");
    assert.match(harness.getInfo() ?? "", /^Received 2 × .*Jade White\. Remaining: 1\.$/);
  }
});

test("blank optional receipt location preserves the existing request contract", async () => {
  for (const homeLocation of [undefined, "", "  "]) {
    commands.length = 0;
    const harness = createActions(false);
    assert.equal(await harness.actions.handleStockFromWishlist(item, 2, undefined, homeLocation), true);
    assert.deepEqual(commands, [{ command: "receive_wishlist_item", payload: {
      input: { item_id: "wish-white", quantity: 2 },
    } }]);
  }
});

test("a successful receipt closes the retry draft even when either subsequent refresh rejects", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const clientReadOnly of [false, true]) {
    for (const failure of ["spools", "wishlist"] as const) {
      commands.length = 0;
      const harness = createActions(clientReadOnly, failure);
      const succeeded = await harness.actions.handleStockFromWishlist(item, 2, undefined, "QA Dry box");

      assert.equal(succeeded, true, "The queue must close the already committed receipt draft");
      assert.equal(commands.length, 1, "Refreshing must never retry the receipt write");
      assert.deepEqual(harness.reloads, ["spools", "wishlist"]);
      assert.deepEqual(harness.busy, [true, false]);
      assert.equal(harness.getSelected(), "received-1");
      assert.match(harness.getInfo() ?? "", /^Received 2 × .*Jade White\. Remaining: 1\.$/);
      assert.equal(harness.getError(), "Failed to load inventory.");
    }
  }
});

test("a rejected receipt still reports failure without clearing the retry draft or announcing success", async (context) => {
  context.mock.method(console, "error", () => {});
  writeFailure = new Error("Receipt was rejected");
  context.after(() => { writeFailure = null; });
  commands.length = 0;
  const harness = createActions(true);

  assert.equal(await harness.actions.handleStockFromWishlist(item, 2, undefined, "QA Dry box"), false);
  assert.equal(commands.length, 1);
  assert.deepEqual(harness.reloads, []);
  assert.deepEqual(harness.busy, [true, false]);
  assert.equal(harness.getSelected(), null);
  assert.equal(harness.getInfo(), null);
  assert.equal(harness.getError(), "Failed to stock roll from wishlist item.");
});
