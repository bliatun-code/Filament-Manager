import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "../lib/i18n";
import {
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  printerSwatchActionButtonStyle,
  printerSwatchInteractiveInsetStyle,
  printerSwatchSurfaceStyle,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import { type SlotSwapDraft } from "../lib/printer_slot_model";
import type { PrinterSnapshotSource } from "../lib/printer_data_source";
import type { ResolvedTheme } from "../lib/theme_mode";
import type {
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { PrinterSlotAssignmentStatus } from "./printer_slot_assignment_status";
import { PrinterSlotPicker } from "./printer_slot_picker";

type PrinterSlotCardProps = {
  printer: PrinterOverviewRow;
  slot: PrinterAmsSlotRow;
  busy: boolean;
  tauri: boolean;
  clientReadOnly: boolean;
  clientPrinterSource: PrinterSnapshotSource;
  resolvedTheme: ResolvedTheme;
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  openDropdownSlotId: string | null;
  setOpenDropdownSlotId: Dispatch<SetStateAction<string | null>>;
  allowedSpoolsForSlot: (slotSpoolId?: string | null) => SpoolWithMasterRow[];
  findAllowedSpoolForSlot: (
    slotSpoolId: string | null | undefined,
    targetSpoolId: string,
  ) => SpoolWithMasterRow | null;
  getSlotDraft: (slot: PrinterAmsSlotRow) => SlotSwapDraft;
  setSlotDraft: (slotId: string, next: SlotSwapDraft) => void;
  findSpoolById: (spoolId?: string | null) => SpoolWithMasterRow | null;
  openIncomingWeightDialog: (
    printerId: string,
    slot: PrinterAmsSlotRow,
    row: SpoolWithMasterRow,
  ) => void;
  openEmptySlotWeightDialog: (printerId: string, slot: PrinterAmsSlotRow) => void;
  openRfidOverrideDialog: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: BambuLiveObservedTray,
  ) => void;
  openWeightPromptForDraft: (
    printer: PrinterOverviewRow["printer"],
    slot: PrinterAmsSlotRow,
    draft: SlotSwapDraft,
  ) => void;
};

export function PrinterSlotCard({
  printer,
  slot,
  busy,
  tauri,
  clientReadOnly,
  clientPrinterSource,
  resolvedTheme,
  bambuLiveIntegrations,
  openDropdownSlotId,
  setOpenDropdownSlotId,
  allowedSpoolsForSlot,
  findAllowedSpoolForSlot,
  getSlotDraft,
  setSlotDraft,
  findSpoolById,
  openIncomingWeightDialog,
  openEmptySlotWeightDialog,
  openRfidOverrideDialog,
  openWeightPromptForDraft,
}: PrinterSlotCardProps) {
  const { t, locale } = useI18n();
  const { liveConfig, tray: liveTray } = resolveLiveTrayForSlot(
    printer.printer.id,
    slot,
    bambuLiveIntegrations,
    clientReadOnly,
    clientPrinterSource,
  );
  const slotOptions = allowedSpoolsForSlot(slot.spool_id);
  const draft = getSlotDraft(slot);
  const isDropdownOpen = openDropdownSlotId === slot.slot_id;
  const selectedTargetSpool =
    draft.targetSpoolId.length > 0
      ? findAllowedSpoolForSlot(slot.spool_id, draft.targetSpoolId)
      : null;
  const slotDisplay = derivePrinterSlotDisplayState({
    slot,
    liveConfig,
    liveTray,
    selectedTargetSpool,
    clientReadOnly,
    clientPrinterSource,
    locale,
    t,
    findSpoolById,
  });
  const { slotSwatchHex } = slotDisplay;
  const slotInnerShadow =
    resolvedTheme === "dark"
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.45)";
  const slotSelectorStyle = slotSwatchHex
    ? {
        ...printerSwatchInteractiveInsetStyle(
          slotSwatchHex,
          resolvedTheme,
          selectedTargetSpool ? "selected" : "default",
        ),
        borderColor: "transparent",
        boxShadow: slotInnerShadow,
      }
    : undefined;
  const slotCurrentRollStyle = slot.spool_id
    ? {
        ...printerSwatchInteractiveInsetStyle(slotSwatchHex, resolvedTheme, "selected"),
        borderColor: "transparent",
        boxShadow: slotInnerShadow,
      }
    : undefined;
  const slotActionStyle = slotSwatchHex
    ? printerSwatchActionButtonStyle(slotSwatchHex, resolvedTheme)
    : undefined;
  const slotPanelStyle = slotSwatchHex
    ? printerSwatchSurfaceStyle(slotSwatchHex, "panel", resolvedTheme)
    : undefined;

  return (
    <div
      className={`surface-subtle relative flex h-full flex-col p-2.5 ${
        isDropdownOpen ? "z-50" : "z-0"
      }`}
      style={slotPanelStyle}
    >
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {formatPrinterSlotLabelForModel(t, printer.printer.model, {
          ams_id: slot.ams_id,
          slot_index: slot.slot_index,
        })}
      </div>

      <PrinterSlotPicker
        printerId={printer.printer.id}
        slot={slot}
        busy={busy}
        tauri={tauri}
        resolvedTheme={resolvedTheme}
        isDropdownOpen={isDropdownOpen}
        selectedTargetSpool={selectedTargetSpool}
        slotSwatchHex={slotSwatchHex}
        slotSelectorStyle={slotSelectorStyle}
        slotPanelStyle={slotPanelStyle}
        slotOptions={slotOptions}
        draft={draft}
        setOpenDropdownSlotId={setOpenDropdownSlotId}
        setSlotDraft={setSlotDraft}
        openIncomingWeightDialog={openIncomingWeightDialog}
        openEmptySlotWeightDialog={openEmptySlotWeightDialog}
      />

      <PrinterSlotAssignmentStatus
        printer={printer}
        slot={slot}
        busy={busy}
        displayState={slotDisplay}
        currentRollStyle={slotCurrentRollStyle}
        openRfidOverrideDialog={openRfidOverrideDialog}
      />

      <button
        type="button"
        className={`mt-2 w-full self-end rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 min-[720px]:w-auto ${
          slotActionStyle
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
        }`}
        style={slotActionStyle}
        onClick={() => openWeightPromptForDraft(printer.printer, slot, draft)}
        disabled={!tauri || busy || !draft.targetSpoolId}
      >
        {t("printers.updateWeight", "Update weight")}
      </button>
    </div>
  );
}
