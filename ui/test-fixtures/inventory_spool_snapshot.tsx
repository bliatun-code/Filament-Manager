import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useInventoryPageData } from "../src/lib/use_inventory_page_data";

const translate = (_key: string, fallback: string) => fallback;
const ignoreRfid = () => {};

export function InventorySnapshotView() {
  const { librarySyncReady, reloadSpools, spools, clientInventorySource, clientInventoryUpdatedAt } =
    useInventoryPageData({ tauriAvailable: true, t: translate, setRfidCaptureFieldsBySlotId: ignoreRfid });
  useEffect(() => {
    if (librarySyncReady) void reloadSpools();
  }, [librarySyncReady, reloadSpools]);
  return <output>{[clientInventorySource, clientInventoryUpdatedAt, ...spools.map(row => row.id)].join(" ")}</output>;
}

createRoot(document.getElementById("root")!).render(<InventorySnapshotView />);
