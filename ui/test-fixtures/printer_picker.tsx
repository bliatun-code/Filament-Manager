import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrinterSlotPicker } from "../src/components/printer_slot_picker";
import { I18nContext, type I18nContextValue } from "../src/lib/i18n";
import { PrinterPickerPageContext, type ReadPrinterPickerPage } from "../src/lib/printer_picker_page";
import type { SpoolWithMasterRow } from "../src/lib/tauri_client";

const win = window as Window & {
  readPage: (generation: number, query: Parameters<ReadPrinterPickerPage>[0]) => ReturnType<ReadPrinterPickerPage>;
  fullRows: () => Promise<SpoolWithMasterRow[]>;
};
const i18n = {
  locale: "en", t: (_key: string, fallback: string, values?: { count?: number }) =>
    values?.count == null ? fallback : String(values.count) + " rolls"
} as I18nContextValue;
const slot = { slot_id: "slot", ams_id: "ams", slot_index: 1 };

export function Picker() {
  const [open, setOpen] = useState<string | null>(null);
  const [generation, setGeneration] = useState(1);
  const [full, setFull] = useState<SpoolWithMasterRow[] | null>(null);
  const [picked, setPicked] = useState("");
  const [draft, setDraft] = useState({ targetSpoolId: "", search: "", incomingWeight: "", outgoingWeight: "" });
  const read = useCallback<ReadPrinterPickerPage>(query => win.readPage(generation, query), [generation]);
  const fallback = useCallback(() => { void win.fullRows().then(setFull); }, []);
  return <I18nContext.Provider value={i18n}>
    <button onClick={() => setGeneration(g => g + 1)}>Switch Host</button><output>{picked}</output>
    <PrinterPickerPageContext.Provider value={full ? null : read}>
      <PrinterSlotPicker compact printerId="printer" slot={slot} slotLabel="Slot 1" resolvedTheme="light"
        busy={false} tauri isDropdownOpen={open === "slot"} selectedTargetSpool={null} slotSwatchHex={null}
        draft={draft} setSlotDraft={(_, next) => setDraft(next)} slotOptions={full ?? []}
        spoolPickerNotice={full ? null : "Loading..."} requestPickerSpools={fallback}
        setOpenDropdownSlotId={setOpen} openIncomingWeightDialog={(_, __, row) => setPicked(row.spool.id)}
        openEmptySlotWeightDialog={() => { }} />
    </PrinterPickerPageContext.Provider>
  </I18nContext.Provider>;
}

createRoot(document.getElementById("root")!).render(<Picker />);
