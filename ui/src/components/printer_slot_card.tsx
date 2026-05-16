import type { Dispatch, SetStateAction } from "react";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  formatGrams,
  printerSwatchActionButtonStyle,
  printerSwatchInteractiveInsetStyle,
  printerSwatchSurfaceStyle,
  toSwatchColor,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import {
  filterSlotOptionsBySearch,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
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
  const filteredSlotOptions = isDropdownOpen
    ? filterSlotOptionsBySearch(slotOptions, draft.search)
    : [];
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

      <div className="relative mt-2" data-slot-dropdown={slot.slot_id}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/70 px-2.5 py-2 text-left text-sm text-slate-800 disabled:opacity-50 dark:bg-slate-900/55 dark:text-slate-100"
          onClick={() =>
            setOpenDropdownSlotId((current) =>
              current === slot.slot_id ? null : slot.slot_id,
            )
          }
          disabled={!tauri || busy}
          style={slotSelectorStyle}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-4.5 w-4.5 shrink-0 rounded border border-slate-500/20 shadow-inner shadow-black/10 dark:border-white/10 dark:shadow-black/20"
              style={{ backgroundColor: toSwatchColor(slotSwatchHex) }}
            />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {selectedTargetSpool
                  ? formatFilamentDisplayTitle(
                      selectedTargetSpool.master.material,
                      selectedTargetSpool.master.filament_name,
                      selectedTargetSpool.master.color_name,
                    )
                  : t("printers.emptySlot", "Empty slot")}
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {selectedTargetSpool
                  ? `${selectedTargetSpool.master.vendor} · ${formatSpoolReference(selectedTargetSpool.spool.id)} · ${formatGrams(selectedTargetSpool.spool.remaining_g)}`
                  : t("printers.targetEmpty", "Target: Empty slot")}
              </span>
            </span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">▾</span>
        </button>

        {isDropdownOpen ? (
          <div
            className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/20 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/30"
            style={slotPanelStyle}
          >
            <input
              type="text"
              value={draft.search}
              onChange={(event) =>
                setSlotDraft(slot.slot_id, {
                  ...draft,
                  search: event.target.value,
                })
              }
              placeholder={t("printers.searchRolls", "Search rolls by name/vendor")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
              disabled={!tauri || busy}
            />
            <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-600">
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${
                  draft.targetSpoolId === ""
                    ? "border border-slate-300 bg-slate-100 font-semibold text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                    : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                }`}
                onClick={() => {
                  setSlotDraft(slot.slot_id, {
                    ...draft,
                    targetSpoolId: "",
                  });
                  setOpenDropdownSlotId(null);
                  if (!slot.spool_id) {
                    return;
                  }
                  openEmptySlotWeightDialog(printer.printer.id, slot);
                }}
                disabled={!tauri || busy}
                style={
                  draft.targetSpoolId === ""
                    ? printerSwatchInteractiveInsetStyle(null, resolvedTheme, "selected")
                    : undefined
                }
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                    style={{ backgroundColor: "#CBD5E1" }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {t("printers.emptySlot", "Empty slot")}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                      {t(
                        "printers.clearSlotOptionHint",
                        "Remove current roll from this slot",
                      )}
                    </span>
                  </span>
                </span>
              </button>
              {filteredSlotOptions.map((row) => {
                const placementLabel = formatPlacementLabel(t, row.spool.location_id);
                return (
                  <button
                    key={row.spool.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm ${
                      draft.targetSpoolId === row.spool.id
                        ? "border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                        : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                    }`}
                    style={printerSwatchInteractiveInsetStyle(
                      row.master.hex_color,
                      resolvedTheme,
                      draft.targetSpoolId === row.spool.id ? "selected" : "default",
                    )}
                    onClick={() => {
                      setSlotDraft(slot.slot_id, {
                        ...draft,
                        targetSpoolId: row.spool.id,
                      });
                      setOpenDropdownSlotId(null);
                      openIncomingWeightDialog(printer.printer.id, slot, row);
                    }}
                    disabled={!tauri || busy}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                        style={{ backgroundColor: toSwatchColor(row.master.hex_color) }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold leading-tight">
                          {formatFilamentDisplayTitle(
                            row.master.material,
                            row.master.filament_name,
                            row.master.color_name,
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                          {row.master.vendor} · {formatSpoolReference(row.spool.id)} ·{" "}
                          {formatGrams(row.spool.remaining_g)}
                        </span>
                        <span className="mt-px block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                          {placementLabel}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredSlotOptions.length === 0 ? (
                <div className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {t("inventory.noMatch", "No spools match current filters.")}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

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
