import React from "react";
import { createRoot } from "react-dom/client";
import { useLibrarySyncState } from "../src/pages/use_library_sync_state";
import { usePrinterPageData } from "../src/pages/use_printer_page_data";

const models = ["Generic"];
const onReload = () => {};

export function PrinterView() {
  const role = useLibrarySyncState(true);
  const data = usePrinterPageData({
    ...role, tauri: true, supportedPrinterModels: models, loadErrorMessage: "Load failed",
    onInteractiveReload: onReload, onTargetChanged: role.retryLibrarySyncRole,
  });
  return <><button onClick={data.requestPickerSpools}>Open picker</button><output data-spools={data.spoolReadState} data-assigned={data.printers.flatMap(row => row.slots.filter(slot => slot.assigned_spool_details).map(slot => slot.spool_id)).join(" ")}>{[
    ...data.printers.map(row => row.printer.id),
    ...data.spools.map(row => row.spool.id),
    ...data.catalogMasters.map(row => row.id),
  ].join(" ")}</output></>;
}

createRoot(document.getElementById("root")!).render(<PrinterView />);
