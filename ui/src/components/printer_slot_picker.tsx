import type { CSSProperties, Dispatch, SetStateAction } from "react";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  formatGrams,
  printerSwatchInteractiveInsetStyle,
  swatchCssBackground,
} from "../lib/printer_live_display";
import {
  filterSlotOptionsBySearch,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type {
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { formInputChromeClassName } from "./form_control_class";

const slotOptionSwatchClassName =
  "h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600";

function slotOptionButtonClassName(selected: boolean, selectedExtraClassName = ""): string {
  const selectedClasses =
    `border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 ${selectedExtraClassName}`.trim();
  const idleClasses =
    "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70";
  return `flex w-full items-center justify-between gap-2.5 rounded-xl px-3 text-left text-sm ${
    selected ? selectedClasses : idleClasses
  }`;
}

type PrinterSlotPickerProps = {
  printerId: string;
  slot: PrinterAmsSlotRow;
  busy: boolean;
  tauri: boolean;
  resolvedTheme: ResolvedTheme;
  isDropdownOpen: boolean;
  selectedTargetSpool: SpoolWithMasterRow | null;
  slotSwatchHex: string | null;
  slotSelectorStyle?: CSSProperties;
  slotPanelStyle?: CSSProperties;
  slotOptions: SpoolWithMasterRow[];
  draft: SlotSwapDraft;
  setOpenDropdownSlotId: Dispatch<SetStateAction<string | null>>;
  setSlotDraft: (slotId: string, next: SlotSwapDraft) => void;
  openIncomingWeightDialog: (
    printerId: string,
    slot: PrinterAmsSlotRow,
    row: SpoolWithMasterRow,
  ) => void;
  openEmptySlotWeightDialog: (printerId: string, slot: PrinterAmsSlotRow) => void;
};

export function PrinterSlotPicker({
  printerId,
  slot,
  busy,
  tauri,
  resolvedTheme,
  isDropdownOpen,
  selectedTargetSpool,
  slotSwatchHex,
  slotSelectorStyle,
  slotPanelStyle,
  slotOptions,
  draft,
  setOpenDropdownSlotId,
  setSlotDraft,
  openIncomingWeightDialog,
  openEmptySlotWeightDialog,
}: PrinterSlotPickerProps) {
  const { t } = useI18n();
  const filteredSlotOptions = isDropdownOpen
    ? filterSlotOptionsBySearch(slotOptions, draft.search)
    : [];

  return (
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
            style={{ background: swatchCssBackground(slotSwatchHex) }}
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
            className={`w-full text-slate-700 ${formInputChromeClassName}`}
            disabled={!tauri || busy}
          />
          <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-600">
            <button
              type="button"
              className={`${slotOptionButtonClassName(draft.targetSpoolId === "", "font-semibold")} py-2`}
              onClick={() => {
                setSlotDraft(slot.slot_id, {
                  ...draft,
                  targetSpoolId: "",
                });
                setOpenDropdownSlotId(null);
                if (!slot.spool_id) {
                  return;
                }
                openEmptySlotWeightDialog(printerId, slot);
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
                  className={slotOptionSwatchClassName}
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
                  className={`${slotOptionButtonClassName(draft.targetSpoolId === row.spool.id)} py-1.5`}
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
                    openIncomingWeightDialog(printerId, slot, row);
                  }}
                  disabled={!tauri || busy}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={slotOptionSwatchClassName}
                      style={{ background: swatchCssBackground(row.master.hex_color) }}
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
  );
}
