import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildBambuFilamentCodeBatch } from "./bambu_filament_code_batch";
import { useInventoryCreateActions } from "./use_inventory_create_actions";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (_key: string, fallback = "") => fallback;

test("handleCreateBambuCodeBatch rejects stale calls outside Bambu mode", async () => {
  let error: string | null = null;
  const busyCalls: boolean[] = [];
  let actions: ReturnType<typeof useInventoryCreateActions> | null = null;

  function Harness() {
    actions = useInventoryCreateActions({
      borrowedFromContact: "",
      borrowedFromName: "",
      borrowedInNote: "",
      bambuCodeBatch: buildBambuFilamentCodeBatch({ masters: [], rawInput: "" }),
      busy: false,
      canUseClientHostWrite: () => true,
      clientHostBaseUrl: null,
      clientLibraryId: null,
      clientReadOnly: false,
      confirmWishlistRemoveId: null,
      createMode: "esun",
      ensureLocalWriteAllowed: () => true,
      manualColorName: "",
      manualFilamentName: "",
      manualHexColor: "",
      manualMaterial: "PLA",
      manualVendor: "Generic",
      masters: [],
      newInitialWeight: "1000",
      newLocation: "",
      newOwnershipType: "OWNED",
      reloadCatalog: async () => {},
      reloadSpools: async () => {},
      reloadWishlist: async () => {},
      resetAfterCreatedSpool: () => {},
      resetBambuBatchInput: () => {},
      selectedBambuMaster: null,
      selectedEsunMaster: null,
      setBusy: (value) => {
        busyCalls.push(typeof value === "function" ? value(false) : value);
      },
      setConfirmWishlistRemoveId: () => {},
      setError: (value) => {
        error = typeof value === "function" ? value(error) : value;
      },
      setInfoMessage: () => {},
      setRecentlyAddedSpoolId: () => {},
      setSelectedSpoolId: () => {},
      tauriAvailable: true,
      t,
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  assert.ok(actions);

  await actions.handleCreateBambuCodeBatch();

  assert.equal(
    error,
    "Switch to Bambu source before creating a Filament Code batch.",
  );
  assert.deepEqual(busyCalls, []);
});
