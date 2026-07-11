import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  formatGrams,
  printerSwatchInteractiveInsetStyle,
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
import { InventorySwatchChip } from "./inventory_swatch_chip";

const slotOptionSwatchClassName =
  "h-4.5 w-4.5 shrink-0 rounded";
const slotSelectorButtonClassName =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-600/70 bg-white/70 px-2.5 py-2 text-left text-sm text-slate-800 outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-slate-900/55 dark:text-slate-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

function slotOptionButtonClassName(selected: boolean, selectedExtraClassName = ""): string {
  const base =
    "flex w-full items-center justify-between gap-2.5 rounded-xl px-3 text-left text-sm outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
  const selectedClasses =
    `border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 ${selectedExtraClassName}`.trim();
  const idleClasses =
    "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70";
  return `${base} ${selected ? selectedClasses : idleClasses}`;
}

type PrinterSlotPickerProps = {
  printerId: string;
  slot: PrinterAmsSlotRow;
  slotLabel: string;
  busy: boolean;
  tauri: boolean;
  resolvedTheme: ResolvedTheme;
  isDropdownOpen: boolean;
  selectedTargetSpool: SpoolWithMasterRow | null;
  slotSwatchHex: string | null;
  slotSelectorStyle?: CSSProperties;
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
  slotLabel,
  busy,
  tauri,
  resolvedTheme,
  isDropdownOpen,
  selectedTargetSpool,
  slotSwatchHex,
  slotSelectorStyle,
  slotOptions,
  draft,
  setOpenDropdownSlotId,
  setSlotDraft,
  openIncomingWeightDialog,
  openEmptySlotWeightDialog,
}: PrinterSlotPickerProps) {
  const { t } = useI18n();
  const popupId = useId();
  const searchInputId = useId();
  const selectorButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const dropdownFallbackScrolledRef = useRef(false);
  const [selectorHovered, setSelectorHovered] = useState(false);
  const [hoveredTargetSpoolId, setHoveredTargetSpoolId] = useState<string | null>(null);
  const [dropdownPlacement, setDropdownPlacement] = useState<"above" | "below">("below");
  const filteredSlotOptions = isDropdownOpen
    ? filterSlotOptionsBySearch(slotOptions, draft.search)
    : [];
  const selectorEmphasis =
    isDropdownOpen
      ? "selected"
      : selectorHovered
        ? "hovered"
        : "default";
  const renderedSlotSelectorStyle =
    resolvedTheme === "light" && (slotSelectorStyle || selectorEmphasis !== "default")
      ? {
          ...slotSelectorStyle,
          ...printerSwatchInteractiveInsetStyle(
            slotSwatchHex,
            resolvedTheme,
            selectorEmphasis,
          ),
          borderWidth: 1,
        }
      : slotSelectorStyle;

  useLayoutEffect(() => {
    if (!isDropdownOpen) {
      dropdownFallbackScrolledRef.current = false;
      return;
    }

    const syncDropdownPlacement = () => {
      const selectorBounds = selectorButtonRef.current?.getBoundingClientRect();
      const popupHeight = popupRef.current?.getBoundingClientRect().height ?? 352;
      if (!selectorBounds) {
        return;
      }

      const spaceAbove = selectorBounds.top - 16;
      const spaceBelow = window.innerHeight - selectorBounds.bottom - 16;
      const nextPlacement =
        spaceBelow < popupHeight && spaceAbove > spaceBelow ? "above" : "below";
      setDropdownPlacement((current) =>
        current === nextPlacement ? current : nextPlacement,
      );
      if (
        Math.max(spaceAbove, spaceBelow) < popupHeight &&
        !dropdownFallbackScrolledRef.current
      ) {
        dropdownFallbackScrolledRef.current = true;
        selectorButtonRef.current?.scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "nearest",
        });
      }
    };

    syncDropdownPlacement();
    const frameId = window.requestAnimationFrame(syncDropdownPlacement);
    const timerIds = [100, 350, 900].map((delay) =>
      window.setTimeout(syncDropdownPlacement, delay),
    );
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncDropdownPlacement);
    if (document.body) {
      resizeObserver?.observe(document.body);
    }
    if (selectorButtonRef.current) {
      resizeObserver?.observe(selectorButtonRef.current);
    }
    window.addEventListener("resize", syncDropdownPlacement);
    window.addEventListener("scroll", syncDropdownPlacement, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncDropdownPlacement);
      window.removeEventListener("scroll", syncDropdownPlacement, true);
    };

  }, [isDropdownOpen]);

  return (
    <div className="relative mt-2" data-slot-dropdown={slot.slot_id}>
      <button
        ref={selectorButtonRef}
        type="button"
        className={slotSelectorButtonClassName}
        aria-controls={popupId}
        aria-expanded={isDropdownOpen}
        aria-haspopup="dialog"
        aria-label={`${t("printers.chooseRollForSlot", "Choose roll for slot")} ${slotLabel}`}
        onMouseEnter={() => setSelectorHovered(true)}
        onMouseLeave={() => setSelectorHovered(false)}
        onClick={() => {
          if (!isDropdownOpen) {
            const selectorBounds = selectorButtonRef.current?.getBoundingClientRect();
            if (selectorBounds) {
              const spaceAbove = selectorBounds.top - 16;
              const spaceBelow = window.innerHeight - selectorBounds.bottom - 16;
              setDropdownPlacement(
                spaceBelow < 352 && spaceAbove > spaceBelow ? "above" : "below",
              );
            }
          }
          setOpenDropdownSlotId((current) =>
            current === slot.slot_id ? null : slot.slot_id,
          );
        }}
        disabled={!tauri || busy}
        style={renderedSlotSelectorStyle}
      >
        <span className="flex min-w-0 items-center gap-2">
          <InventorySwatchChip
            className="h-4.5 w-4.5 rounded"
            swatchColor={slotSwatchHex}
            tone="current"
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
          ref={popupRef}
          id={popupId}
          role="dialog"
          aria-label={`${t("printers.availableRollsForSlot", "Available rolls for")} ${slotLabel}`}
          className={`absolute left-0 right-0 z-30 max-h-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/20 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/30 ${
            dropdownPlacement === "above" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor={searchInputId}
              className="text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t("printers.searchAvailableRolls", "Search available rolls")}
            </label>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
                aria-live="polite"
              >
                {t(
                  "printers.rollResultCount",
                  "{count, plural, one {# roll} other {# rolls}}",
                  { count: filteredSlotOptions.length },
                )}
              </span>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setOpenDropdownSlotId(null)}
              >
                {t("common.close", "Close")}
              </button>
            </div>
          </div>
          <input
            id={searchInputId}
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
          <div className="mt-2.5 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-600">
            <button
              type="button"
              className={`${slotOptionButtonClassName(draft.targetSpoolId === "", "font-semibold")} py-2`}
              onMouseEnter={() => setHoveredTargetSpoolId("")}
              onMouseLeave={() => setHoveredTargetSpoolId(null)}
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
                draft.targetSpoolId === "" ||
                (resolvedTheme === "light" && hoveredTargetSpoolId === "")
                  ? printerSwatchInteractiveInsetStyle(
                      null,
                      resolvedTheme,
                      draft.targetSpoolId === "" ? "selected" : "hovered",
                    )
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
              const displayTitle = formatFilamentDisplayTitle(
                row.master.material,
                row.master.filament_name,
                row.master.color_name,
              );
              return (
                <button
                  key={row.spool.id}
                  type="button"
                  className={`${slotOptionButtonClassName(draft.targetSpoolId === row.spool.id)} py-1.5`}
                  onMouseEnter={() => setHoveredTargetSpoolId(row.spool.id)}
                  onMouseLeave={() => setHoveredTargetSpoolId(null)}
                  style={printerSwatchInteractiveInsetStyle(
                    row.master.hex_color,
                    resolvedTheme,
                    draft.targetSpoolId === row.spool.id
                      ? "selected"
                      : hoveredTargetSpoolId === row.spool.id
                        ? "hovered"
                        : "default",
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
                    <InventorySwatchChip
                      className={slotOptionSwatchClassName}
                      swatchColor={row.master.hex_color}
                      tone="tiny"
                    />
                    <span className="min-w-0">
                      <span
                        className="block truncate font-semibold leading-tight"
                        title={displayTitle}
                      >
                        {displayTitle}
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
