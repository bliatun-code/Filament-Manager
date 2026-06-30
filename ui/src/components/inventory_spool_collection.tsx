import { VendorBadge } from "./vendor_badge";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { swatchCssBackground } from "../lib/color_utils";
import { formatPlacementLabel } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  formatInventoryDisplayTitle,
  formatInventoryOwnershipLabel,
  formatRollReference,
  inventoryOwnershipTone,
  remainingBarClass,
  spoolRemainingRatio,
  type InventorySpool,
  type SpoolGroup,
} from "../lib/inventory_list_model";
import {
  inventorySwatchCardStyle,
  inventorySwatchInteractiveInsetStyle,
} from "../lib/inventory_swatch_style";
import { materialTone } from "../lib/material_theme";
import type { ResolvedTheme } from "../lib/theme_mode";
import { formatGrams } from "../lib/weight_display";
import type { InventoryViewMode } from "./inventory_controls_panel";

type InventorySpoolCollectionProps = {
  filteredSpools: InventorySpool[];
  groupedSpools: SpoolGroup[];
  inventoryView: InventoryViewMode;
  loading: boolean;
  onSelectRoll: (spoolId: string) => void;
  recentlyAddedSpoolId: string | null;
  resolvedTheme: ResolvedTheme;
  selectedSpoolId: string | null;
};

function formatInventoryPlacement(
  t: ReturnType<typeof useI18n>["t"],
  value: string | null | undefined,
) {
  return formatPlacementLabel(t, value);
}

function OwnershipChip({
  ownershipType,
  t,
}: {
  ownershipType: InventorySpool["ownershipType"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (ownershipType !== "BORROWED_IN") {
    return null;
  }
  return (
    <span className={inlineStatusSignalClass(inventoryOwnershipTone(ownershipType), "text-[10px]")}>
      {formatInventoryOwnershipLabel(t, ownershipType)}
    </span>
  );
}

function RemainingMeter({
  className = "mt-2",
  spool,
}: {
  className?: string;
  spool: InventorySpool;
}) {
  const rollFillRatio = spoolRemainingRatio(spool);
  return (
    <div
      className={`${className} h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80`}
    >
      <div
        className={`h-full rounded-full ${remainingBarClass(rollFillRatio)}`}
        style={{ width: `${Math.max(4, Math.round(rollFillRatio * 100))}%` }}
      />
    </div>
  );
}

function inventorySpoolRollButtonClassName(mode: "single" | "compact"): string {
  const base =
    "rounded-xl border px-3.5 py-3 text-left outline-none transition hover:-translate-y-[1px] focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (mode === "compact") {
    return `flex w-full items-start justify-between gap-3 ${base}`;
  }

  return base;
}

type InventorySpoolListButtonState = "default" | "recent" | "selected";

function inventorySpoolListButtonClassName(state: InventorySpoolListButtonState): string {
  const base =
    "w-full rounded-xl border px-4 py-3 text-left shadow-sm outline-none transition hover:-translate-y-[1px] focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (state === "selected") {
    return `${base} border-slate-900 ring-1 ring-slate-300 dark:border-slate-300 dark:ring-slate-600`;
  }

  if (state === "recent") {
    return `${base} border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-400/60 dark:ring-emerald-400/20`;
  }

  return base;
}

export function InventorySpoolCollection({
  filteredSpools,
  groupedSpools,
  inventoryView,
  loading,
  onSelectRoll,
  recentlyAddedSpoolId,
  resolvedTheme,
  selectedSpoolId,
}: InventorySpoolCollectionProps) {
  const { t } = useI18n();
  const isEmpty =
    inventoryView === "CARDS" ? groupedSpools.length === 0 : filteredSpools.length === 0;

  return (
    <div
      className={
        inventoryView === "CARDS"
          ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          : "space-y-3"
      }
    >
      {inventoryView === "CARDS"
        ? groupedSpools.map((group) => {
            const hasRecentRoll = group.rolls.some(
              (roll) => roll.id === recentlyAddedSpoolId,
            );
            const visibleRolls = [...group.rolls]
              .sort((left, right) => {
                if (left.id === recentlyAddedSpoolId) {
                  return -1;
                }
                if (right.id === recentlyAddedSpoolId) {
                  return 1;
                }
                return 0;
              })
              .slice(0, 3);
            const singleVisibleRoll = group.rolls.length === 1 ? visibleRolls[0] : null;

            return (
              <div
                key={group.key}
                className={`surface-card-compact flex flex-col gap-4 self-start overflow-hidden ${
                  hasRecentRoll ? "ring-2 ring-emerald-200/80 dark:ring-emerald-400/20" : ""
                }`}
                style={inventorySwatchCardStyle(group.hexColor, resolvedTheme)}
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                    <span
                      className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                      style={{
                        background: swatchCssBackground(group.hexColor),
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className="overflow-hidden break-words text-[1.02rem] font-semibold leading-tight text-slate-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                      title={formatInventoryDisplayTitle(
                        group.material,
                        group.filamentName,
                        group.colorName,
                      )}
                    >
                      {formatInventoryDisplayTitle(
                        group.material,
                        group.filamentName,
                        group.colorName,
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                      <VendorBadge vendor={group.vendor} compact />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${materialTone(group.material).badge} ${materialTone(group.material).badgeText}`}
                      >
                        {group.material}
                      </span>
                      <OwnershipChip ownershipType={group.ownershipType} t={t} />
                      <span>
                        {t("inventory.rolls", "Rolls")}: {group.rolls.length}
                      </span>
                      <span>
                        {t("inventory.total", "Total")}: {formatGrams(group.totalRemaining)}
                      </span>
                    </div>
                    {group.ownershipType === "BORROWED_IN" && group.ownerName ? (
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                        {t("inventory.borrowedFrom", "Borrowed from")}: {group.ownerName}
                      </div>
                    ) : null}
                  </div>
                </div>

                {singleVisibleRoll ? (
                  <button
                    type="button"
                    onClick={() => onSelectRoll(singleVisibleRoll.id)}
                    className={inventorySpoolRollButtonClassName("single")}
                    style={inventorySwatchInteractiveInsetStyle(
                      singleVisibleRoll.hexColor ?? group.hexColor,
                      resolvedTheme,
                      selectedSpoolId === singleVisibleRoll.id
                        ? "selected"
                        : singleVisibleRoll.id === recentlyAddedSpoolId
                          ? "recent"
                          : "default",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatInventoryPlacement(t, singleVisibleRoll.location)}
                        </div>
                        <div className="mt-1 truncate text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                          {formatRollReference(singleVisibleRoll)}
                          {singleVisibleRoll.ownershipType === "BORROWED_IN" &&
                          singleVisibleRoll.ownerName
                            ? ` · ${t("inventory.borrowedFrom", "Borrowed from")}: ${
                                singleVisibleRoll.ownerName
                              }`
                            : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {t("inventory.remaining", "Remaining")}
                        </div>
                        <div className="mt-1 text-sm font-semibold leading-tight text-slate-900 dark:text-slate-50">
                          {formatGrams(singleVisibleRoll.remainingGrams)}
                        </div>
                      </div>
                    </div>
                    <RemainingMeter className="mt-3" spool={singleVisibleRoll} />
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {visibleRolls.map((roll) => {
                      const emphasis =
                        selectedSpoolId === roll.id
                          ? "selected"
                          : roll.id === recentlyAddedSpoolId
                            ? "recent"
                            : "default";
                      return (
                        <button
                          key={roll.id}
                          type="button"
                          onClick={() => onSelectRoll(roll.id)}
                          className={inventorySpoolRollButtonClassName("compact")}
                          style={inventorySwatchInteractiveInsetStyle(
                            roll.hexColor ?? group.hexColor,
                            resolvedTheme,
                            emphasis,
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                                {formatInventoryPlacement(t, roll.location)}
                              </div>
                              <OwnershipChip ownershipType={roll.ownershipType} t={t} />
                            </div>
                            <div className="mt-1 truncate text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                              {formatRollReference(roll)}
                            </div>
                            {roll.ownershipType === "BORROWED_IN" && roll.ownerName ? (
                              <div className="mt-1 truncate text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                                {t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}
                              </div>
                            ) : null}
                            <RemainingMeter spool={roll} />
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {t("inventory.remaining", "Remaining")}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-tight text-slate-900 dark:text-slate-50">
                              {formatGrams(roll.remainingGrams)}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {group.rolls.length > 3 ? (
                      <div className="surface-subtle border-dashed px-3.5 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        + {group.rolls.length - 3} {t("inventory.moreRolls", "more roll(s)")}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        : filteredSpools.map((roll) => {
            const listButtonState =
              selectedSpoolId === roll.id
                ? "selected"
                : roll.id === recentlyAddedSpoolId
                  ? "recent"
                  : "default";
            return (
              <button
                key={roll.id}
                type="button"
                onClick={() => onSelectRoll(roll.id)}
                className={inventorySpoolListButtonClassName(listButtonState)}
                style={inventorySwatchCardStyle(roll.hexColor, resolvedTheme)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {formatInventoryDisplayTitle(
                        roll.material,
                        roll.filamentName,
                        roll.colorName,
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <VendorBadge vendor={roll.vendor} compact />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${materialTone(roll.material).badge} ${materialTone(roll.material).badgeText}`}
                      >
                        {roll.material}
                      </span>
                      <OwnershipChip ownershipType={roll.ownershipType} t={t} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatInventoryPlacement(t, roll.location)} · {formatRollReference(roll)}
                    </div>
                    {roll.ownershipType === "BORROWED_IN" && roll.ownerName ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}
                      </div>
                    ) : null}
                    <RemainingMeter className="mt-3" spool={roll} />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t("inventory.remaining", "Remaining")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatGrams(roll.remainingGrams)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

      {isEmpty ? (
        <div className="surface-subtle col-span-full border-dashed px-5 py-7">
          <div className="flex max-w-xl items-start gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300 bg-white shadow-[0_0_0_5px_rgba(148,163,184,0.12)] dark:border-slate-600 dark:bg-slate-800" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {loading
                  ? t("inventory.loading", "Loading spools...")
                  : t("inventory.noMatch", "No spools match current filters.")}
              </div>
              {!loading ? (
                <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {t(
                    "inventory.noMatchHint",
                    "Try adjusting search, status, material or ownership filters.",
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
