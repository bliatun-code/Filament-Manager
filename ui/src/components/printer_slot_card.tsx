import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "../lib/i18n";
import {
  findLiveTrayForSlot as resolveLiveTrayForSlot,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import { formatFilamentDisplayTitle, formatSpoolReference } from "../lib/display_format";
import { formatGrams } from "../lib/printer_live_display";
import { FilamentSpoolVisual } from "./filament_spool_visual";
import { normalizeSpoolStatus } from "../lib/inventory_domain";
import { isInventorySpoolLowStockCandidate } from "../lib/inventory_list_model";
import { resolveSpoolLowStockThreshold } from "../lib/low_stock_policy";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
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
  catalogMasters: MasterCatalogRow[];
  openDropdownSlotId: string | null;
  setOpenDropdownSlotId: Dispatch<SetStateAction<string | null>>;
  spools: SpoolWithMasterRow[];
  slotLabelById?: ReadonlyMap<string, string>;
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

export function PrinterSlotCard({
  printer,
  slot,
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
  slotLabelById,
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
    spoolRows: spools,
    catalogRows: catalogMasters,
    selectedTargetSpool,
    clientReadOnly,
    clientPrinterSource,
    locale,
    t,
    findSpoolById,
  });
  const { slotSwatchHex } = slotDisplay;
  const slotLabel = formatPrinterSlotLabelForModel(t, printer.printer.model, {
    ams_id: slot.ams_id,
    slot_index: slot.slot_index,
  });
  const current = findSpoolById(slot.spool_id);
  const observed = slotDisplay.liveSignalEnabled && slotDisplay.liveIdentityFresh &&
    slotDisplay.effectiveLiveTray?.loaded ? slotDisplay.effectiveLiveTray : null;
  const color = current?.master.hex_color ?? slot.spool_hex_color ?? observed?.color_hex;
  const title = slot.spool_id
    ? formatFilamentDisplayTitle(current?.master.material ?? slot.spool_material,
        current?.master.filament_name ?? slot.spool_filament_name,
        current?.master.color_name ?? slot.spool_color_name)
    : observed
      ? formatFilamentDisplayTitle(observed.filament_type, observed.filament_name, null)
      : t("printers.emptySlot", "Empty slot");
  const candidates = slotDisplay.liveSuggestedInventoryMatch.candidates;
  const reviewRemoval = !!slot.spool_id && slotDisplay.liveSignalEnabled &&
    !!slotDisplay.effectiveLiveTray && !slotDisplay.effectiveLiveTray.loaded;
  const showObserved = !!observed && (slotDisplay.unknownLiveRfid ||
    candidates.some(row => row.spool.id !== slot.spool_id));
  const hasDetails = showObserved || reviewRemoval || slotDisplay.rfidOverridden;
  const remaining = current?.spool.remaining_g ?? slot.spool_remaining_g;
  const initial = current?.spool.initial_weight_g ?? current?.master.default_weight ?? 1000;
  const low = !!current && isInventorySpoolLowStockCandidate({status: normalizeSpoolStatus(current.spool.status),
    remainingGrams:remaining,initialWeightGrams:initial,lowStockThresholdGrams:resolveSpoolLowStockThreshold(current).thresholdGrams});
  const ratio = remaining == null ? 0 : Math.min(1, Math.max(0, remaining / Math.max(1, initial)));

  return (
    <tbody className={`printer-slot-rowgroup ${hasDetails ? "has-observation" : ""}`}>
      <tr className="printer-slot-row">
        <th scope="row" className="printer-slot-label">{slotLabel}</th>
        <td className="printer-filament-cell">
          <div className="printer-filament-identity">
            {slot.spool_id || observed ? <FilamentSpoolVisual color={color} className="printer-filament-spool" /> : <span className="printer-empty-spool" aria-hidden="true">—</span>}
            <div className="printer-filament-text">
              <div className="printer-filament-title"><InventorySwatchChip swatchColor={color} className="h-3.5 w-3.5 rounded-sm" tone="tiny"/><span>{title}</span></div>
              <div className="printer-secondary">{current?.master.vendor ?? (slot.spool_id ? "" : observed ? t("printers.noSpoolAssigned", "No spool assigned.") : "")}</div>
            </div>
          </div>
        </td>
        <td className="printer-reference-cell">
          <span>{slot.spool_id ? formatSpoolReference(slot.spool_id) : "—"}</span>
          {slotDisplay.liveIdentityLabel ? <div className="printer-secondary">{slotDisplay.liveIdentityLabel}</div> : null}
          {slotDisplay.liveSlotInUse ? <div className="printer-in-use">{t("inventory.statusInUse", "In use")}</div> : null}
          {hasDetails ? <div className="printer-observation-label">{reviewRemoval ? t("printers.outgoingWeightPromptTitle", "Set outgoing roll weight") : t("printers.linkObserved", "Link observed roll")}</div> : null}
        </td>
        <td className="printer-weight-cell">
          <span>{slot.spool_id ? formatGrams(remaining, "dash", locale) : "—"}</span>
          {slot.spool_id && remaining != null ? <span className={`printer-weight-track ${low ? "is-low" : ""}`} aria-hidden="true"><span style={{width: `${ratio * 100}%`}} /></span> : null}
        </td>
        <td className="printer-slot-actions">
          <PrinterSlotPicker compact
            printerId={printer.printer.id} slot={slot} slotLabel={slotLabel}
            busy={busy} tauri={tauri} resolvedTheme={resolvedTheme}
            isDropdownOpen={isDropdownOpen} selectedTargetSpool={selectedTargetSpool}
            slotSwatchHex={slotSwatchHex} slotOptions={slotOptions}
            slotLabelById={slotLabelById} draft={draft}
            setOpenDropdownSlotId={setOpenDropdownSlotId} setSlotDraft={setSlotDraft}
            openIncomingWeightDialog={openIncomingWeightDialog} openEmptySlotWeightDialog={openEmptySlotWeightDialog}
          />
          {slot.spool_id ? <button type="button" className="printer-row-action"
            onClick={() => openWeightPromptForDraft(printer.printer, slot, draft)}
            disabled={!tauri || busy || !draft.targetSpoolId}>
            {t("printers.updateWeight", "Update weight")}
          </button> : null}
        </td>
      </tr>
      {hasDetails ? <tr className="printer-observation-row"><td colSpan={5}>
        <details className="printer-observation-details">
          <summary>{reviewRemoval ? t("printers.outgoingWeightPromptTitle", "Set outgoing roll weight") : t("printers.linkObserved", "Link observed roll")}</summary>
          {reviewRemoval ? <button type="button" className="printer-row-action" disabled={!tauri || busy}
            onClick={() => openEmptySlotWeightDialog(printer.printer.id, slot)}>
            {t("printers.clearSlotOptionHint", "Remove current roll from this slot")}
          </button> : <PrinterSlotAssignmentStatus
            printer={printer} slot={slot} busy={busy || !tauri} displayState={{...slotDisplay,
              liveSuggestedInventoryMatch: {...slotDisplay.liveSuggestedInventoryMatch,
                candidates: candidates.filter(row => slotOptions.some(option => option.spool.id === row.spool.id))}}}
            openRfidOverrideDialog={openRfidOverrideDialog}
            registerLiveRfidCandidate={registerLiveRfidCandidate}
            createLiveBambuCatalogSpool={createLiveBambuCatalogSpool}
            selectCandidate={(row) => {
              setOpenDropdownSlotId(null);
              openIncomingWeightDialog(printer.printer.id, slot, row);
            }}
          />}
        </details>
      </td></tr> : null}
    </tbody>
  );
}
