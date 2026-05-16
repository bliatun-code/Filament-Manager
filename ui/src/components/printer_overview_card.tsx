import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "../lib/i18n";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import {
  resolveLiveConnectionIndicator,
} from "../lib/printer_live_display";
import { hasConfiguredMultiMaterial } from "../lib/printer_profiles";
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
import { PrinterOverviewCardHeader } from "./printer_overview_card_header";
import { PrinterSlotCard } from "./printer_slot_card";

type PrinterOverviewCardProps = {
  printer: PrinterOverviewRow;
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

export function PrinterOverviewCard({
  printer,
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
}: PrinterOverviewCardProps) {
  const { t } = useI18n();
  const hasMultiMaterial = hasConfiguredMultiMaterial(printer.slots);
  const hasOpenDropdown = printer.slots.some((slot) => slot.slot_id === openDropdownSlotId);
  const printerLiveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
  const liveConnectionIndicator = resolveLiveConnectionIndicator(
    printerLiveConfig,
    printer.slots,
    t,
  );
  const printerCardStyle = printerBrandSurfaceStyle(
    printer.printer.model,
    "card",
    resolvedTheme,
  );
  return (
    <section
      className={`surface-card relative p-3.5 sm:p-4 ${hasOpenDropdown ? "z-40" : "z-0"}`}
      style={printerCardStyle}
    >
      <PrinterOverviewCardHeader
        printer={printer}
        hasMultiMaterial={hasMultiMaterial}
        liveConnectionIndicator={liveConnectionIndicator}
        resolvedTheme={resolvedTheme}
      />
      <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {printer.slots.map((slot) => (
          <PrinterSlotCard
            key={slot.slot_id}
            printer={printer}
            slot={slot}
            busy={busy}
            tauri={tauri}
            clientReadOnly={clientReadOnly}
            clientPrinterSource={clientPrinterSource}
            resolvedTheme={resolvedTheme}
            bambuLiveIntegrations={bambuLiveIntegrations}
            openDropdownSlotId={openDropdownSlotId}
            setOpenDropdownSlotId={setOpenDropdownSlotId}
            allowedSpoolsForSlot={allowedSpoolsForSlot}
            findAllowedSpoolForSlot={findAllowedSpoolForSlot}
            getSlotDraft={getSlotDraft}
            setSlotDraft={setSlotDraft}
            findSpoolById={findSpoolById}
            openIncomingWeightDialog={openIncomingWeightDialog}
            openEmptySlotWeightDialog={openEmptySlotWeightDialog}
            openRfidOverrideDialog={openRfidOverrideDialog}
            openWeightPromptForDraft={openWeightPromptForDraft}
          />
        ))}
      </div>
    </section>
  );
}
