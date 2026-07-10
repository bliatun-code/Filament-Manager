import { useId, useState, type Dispatch, type SetStateAction } from "react";
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
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { PrinterOverviewCardHeader } from "./printer_overview_card_header";
import { PrinterSlotCard } from "./printer_slot_card";
import { PrinterSlotSummaryStrip } from "./printer_slot_summary_strip";

type PrinterOverviewCardProps = {
  printer: PrinterOverviewRow;
  defaultSlotsExpanded?: boolean;
  busy: boolean;
  tauri: boolean;
  clientReadOnly: boolean;
  clientPrinterSource: PrinterSnapshotSource;
  resolvedTheme: ResolvedTheme;
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  catalogMasters: MasterCatalogRow[];
  openDropdownSlotId: string | null;
  setOpenDropdownSlotId: Dispatch<SetStateAction<string | null>>;
  spools: SpoolWithMasterRow[];
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
  registerLiveRfidCandidate: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: BambuLiveObservedTray,
    row: SpoolWithMasterRow,
  ) => void;
  createLiveBambuCatalogSpool: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: BambuLiveObservedTray,
    master: MasterCatalogRow,
  ) => void;
  openWeightPromptForDraft: (
    printer: PrinterOverviewRow["printer"],
    slot: PrinterAmsSlotRow,
    draft: SlotSwapDraft,
  ) => void;
};

export function PrinterOverviewCard({
  printer,
  defaultSlotsExpanded = true,
  busy,
  tauri,
  clientReadOnly,
  clientPrinterSource,
  resolvedTheme,
  bambuLiveIntegrations,
  catalogMasters,
  openDropdownSlotId,
  setOpenDropdownSlotId,
  spools,
  allowedSpoolsForSlot,
  findAllowedSpoolForSlot,
  getSlotDraft,
  setSlotDraft,
  findSpoolById,
  openIncomingWeightDialog,
  openEmptySlotWeightDialog,
  openRfidOverrideDialog,
  registerLiveRfidCandidate,
  createLiveBambuCatalogSpool,
  openWeightPromptForDraft,
}: PrinterOverviewCardProps) {
  const { t } = useI18n();
  const slotGridId = useId();
  const [slotsExpanded, setSlotsExpanded] = useState(defaultSlotsExpanded);
  const hasMultiMaterial = hasConfiguredMultiMaterial(printer.slots);
  const hasOpenDropdown = printer.slots.some((slot) => slot.slot_id === openDropdownSlotId);
  const showSlots = slotsExpanded || hasOpenDropdown;
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
        liveConfig={printerLiveConfig}
        resolvedTheme={resolvedTheme}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {printer.slots.length}{" "}
          {t(
            printer.slots.length === 1 ? "printers.slotCountOne" : "printers.slotCountMany",
            printer.slots.length === 1 ? "slot" : "slots",
          )}
        </span>
        {!showSlots ? (
          <PrinterSlotSummaryStrip
            model={printer.printer.model}
            slots={printer.slots}
            findSpoolById={findSpoolById}
          />
        ) : null}
        {printer.slots.length > 0 ? (
          <button
            type="button"
            className="ml-auto rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-controls={slotGridId}
            aria-expanded={showSlots}
            onClick={() => {
              if (showSlots) {
                if (hasOpenDropdown) {
                  setOpenDropdownSlotId(null);
                }
                setSlotsExpanded(false);
                return;
              }
              setSlotsExpanded(true);
            }}
          >
            {showSlots
              ? t("printers.hideSlots", "Hide slots")
              : t("printers.showSlots", "Show slots")}
          </button>
        ) : null}
      </div>
      {showSlots ? (
        <div id={slotGridId} className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
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
              catalogMasters={catalogMasters}
              openDropdownSlotId={openDropdownSlotId}
              setOpenDropdownSlotId={setOpenDropdownSlotId}
              spools={spools}
              allowedSpoolsForSlot={allowedSpoolsForSlot}
              findAllowedSpoolForSlot={findAllowedSpoolForSlot}
              getSlotDraft={getSlotDraft}
              setSlotDraft={setSlotDraft}
              findSpoolById={findSpoolById}
              openIncomingWeightDialog={openIncomingWeightDialog}
              openEmptySlotWeightDialog={openEmptySlotWeightDialog}
              openRfidOverrideDialog={openRfidOverrideDialog}
              registerLiveRfidCandidate={registerLiveRfidCandidate}
              createLiveBambuCatalogSpool={createLiveBambuCatalogSpool}
              openWeightPromptForDraft={openWeightPromptForDraft}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
