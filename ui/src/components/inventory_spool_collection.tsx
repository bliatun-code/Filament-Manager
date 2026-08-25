import { useEffect, useId, useMemo, useState } from "react";
import { PageHeaderButton } from "./page_header_button";
import { VendorBadge } from "./vendor_badge";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { formatPlacementLabel } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import {
  formatInventoryDisplayTitle,
  formatInventoryOwnershipLabel,
  formatRollReference,
  inventoryOwnershipTone,
  remainingBarClass,
  resolveInventoryCollectionEmptyState,
  spoolRemainingRatio,
  type InventorySpool,
  type SpoolGroup,
} from "../lib/inventory_list_model";
import {
  inventorySwatchCardStyle,
  inventorySwatchInteractiveInsetStyle,
} from "../lib/inventory_swatch_style";
import { materialTone } from "../lib/material_theme";
import { formatDisplayInteger } from "../lib/number_display";
import type { ResolvedTheme } from "../lib/theme_mode";
import { formatGrams } from "../lib/weight_display";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import type { InventoryViewMode } from "./inventory_controls_panel";
import {
  buildInventoryCollectionWindow,
  initialInventoryCollectionLimit,
  nextInventoryCollectionLimit,
} from "../lib/inventory_collection_window";

type InventorySpoolCollectionProps = {
  addSpoolDisabled: boolean;
  bulkSelectionActive: boolean;
  bulkSelectionDisabled: boolean;
  filteredSpools: InventorySpool[];
  groupedSpools: SpoolGroup[];
  inventoryView: InventoryViewMode;
  loading: boolean;
  onAddSpool: () => void;
  onBulkSelectionChange: (spoolId: string, selected: boolean) => void;
  onResetFilters: () => void;
  onSelectRoll: (spoolId: string) => void;
  recentlyAddedSpoolId: string | null;
  resolvedTheme: ResolvedTheme;
  selectedSpoolId: string | null;
  selectedBulkSpoolIds: ReadonlySet<string>;
  totalSpoolCount: number;
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
  if (!isBorrowedInOwnership(ownershipType)) {
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
        style={{
          width: `${rollFillRatio <= 0 ? 0 : Math.max(4, Math.round(rollFillRatio * 100))}%`,
        }}
      />
    </div>
  );
}

function InventoryBulkSpoolSelectionCheckbox({
  checked,
  disabled,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900"
      />
      <span className="sr-only">{label}</span>
    </label>
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
  addSpoolDisabled,
  bulkSelectionActive,
  bulkSelectionDisabled,
  filteredSpools,
  groupedSpools,
  inventoryView,
  loading,
  onAddSpool,
  onBulkSelectionChange,
  onResetFilters,
  onSelectRoll,
  recentlyAddedSpoolId,
  resolvedTheme,
  selectedSpoolId,
  selectedBulkSpoolIds,
  totalSpoolCount,
}: InventorySpoolCollectionProps) {
  const { locale, t } = useI18n();
  const collectionId = useId();
  const [visibleRollLimitsByGroup, setVisibleRollLimitsByGroup] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [renderLimit, setRenderLimit] = useState(() =>
    initialInventoryCollectionLimit(inventoryView),
  );
  useEffect(() => {
    setRenderLimit(initialInventoryCollectionLimit(inventoryView));
  }, [filteredSpools, groupedSpools, inventoryView]);
  const collectionWindow = useMemo(
    () =>
      buildInventoryCollectionWindow({
        filteredSpools,
        groupedSpools,
        inventoryView,
        limit: renderLimit,
      }),
    [filteredSpools, groupedSpools, inventoryView, renderLimit],
  );
  const emptyState = resolveInventoryCollectionEmptyState({
    loading,
    totalSpoolCount,
    visibleSpoolCount: filteredSpools.length,
  });

  const updateGroupRollLimit = (groupKey: string, rollCount: number) => {
    setVisibleRollLimitsByGroup((current) => {
      const next = new Map(current);
      const currentLimit = next.get(groupKey) ?? 3;
      if (currentLimit >= rollCount) {
        next.delete(groupKey);
      } else {
        next.set(groupKey, Math.min(rollCount, currentLimit + 100));
      }
      return next;
    });
  };

  return (
    <div
      className={
        inventoryView === "CARDS"
          ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          : "space-y-3"
      }
    >
      {inventoryView === "CARDS"
        ? collectionWindow.groupedSpools.map((group, groupIndex) => {
            const hasRecentRoll = group.rolls.some(
              (roll) => roll.id === recentlyAddedSpoolId,
            );
            const sortedRolls = [...group.rolls].sort((left, right) => {
              if (left.id === recentlyAddedSpoolId) {
                return -1;
              }
              if (right.id === recentlyAddedSpoolId) {
                return 1;
              }
              return 0;
            });
            const groupRollLimit = visibleRollLimitsByGroup.get(group.key) ?? 3;
            const visibleRolls = sortedRolls.slice(0, groupRollLimit);
            const groupExpanded = groupRollLimit > 3;
            const allGroupRollsVisible = visibleRolls.length >= group.rolls.length;
            const hiddenRollCount = Math.max(0, group.rolls.length - visibleRolls.length);
            const rollListId = `${collectionId}-group-${groupIndex}-rolls`;
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
                    <InventorySwatchChip
                      className="h-full w-full rounded-xl"
                      swatchColor={group.hexColor}
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
                        {t("inventory.total", "Total")}:{" "}
                        {formatGrams(group.totalRemaining, "dash", locale)}
                      </span>
                    </div>
                    {isBorrowedInOwnership(group.ownershipType) && group.ownerName ? (
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                        {t("inventory.borrowedFrom", "Borrowed from")}: {group.ownerName}
                      </div>
                    ) : null}
                  </div>
                </div>

                {singleVisibleRoll ? (
                  <div className="flex items-start gap-1">
                    {bulkSelectionActive ? (
                      <InventoryBulkSpoolSelectionCheckbox
                        checked={selectedBulkSpoolIds.has(singleVisibleRoll.id)}
                        disabled={bulkSelectionDisabled}
                        label={t(
                          "inventory.bulkSelectSpool",
                          "Select {reference}",
                          { reference: formatRollReference(singleVisibleRoll) },
                        )}
                        onCheckedChange={(selected) =>
                          onBulkSelectionChange(singleVisibleRoll.id, selected)
                        }
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelectRoll(singleVisibleRoll.id)}
                      className={`${inventorySpoolRollButtonClassName("single")} min-w-0 flex-1`}
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
                            {isBorrowedInOwnership(singleVisibleRoll.ownershipType) &&
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
                            {formatGrams(singleVisibleRoll.remainingGrams, "dash", locale)}
                          </div>
                        </div>
                      </div>
                      <RemainingMeter className="mt-3" spool={singleVisibleRoll} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div id={rollListId} className="space-y-2.5">
                      {visibleRolls.map((roll) => {
                        const emphasis =
                          selectedSpoolId === roll.id
                            ? "selected"
                            : roll.id === recentlyAddedSpoolId
                              ? "recent"
                              : "default";
                        return (
                          <div key={roll.id} className="flex items-start gap-1">
                            {bulkSelectionActive ? (
                              <InventoryBulkSpoolSelectionCheckbox
                                checked={selectedBulkSpoolIds.has(roll.id)}
                                disabled={bulkSelectionDisabled}
                                label={t(
                                  "inventory.bulkSelectSpool",
                                  "Select {reference}",
                                  { reference: formatRollReference(roll) },
                                )}
                                onCheckedChange={(selected) =>
                                  onBulkSelectionChange(roll.id, selected)
                                }
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onSelectRoll(roll.id)}
                              className={`${inventorySpoolRollButtonClassName("compact")} min-w-0 flex-1`}
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
                              {isBorrowedInOwnership(roll.ownershipType) && roll.ownerName ? (
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
                                {formatGrams(roll.remainingGrams, "dash", locale)}
                              </div>
                            </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {group.rolls.length > 3 ? (
                      <button
                        type="button"
                        aria-expanded={groupExpanded}
                        aria-controls={rollListId}
                        onClick={() => updateGroupRollLimit(group.key, group.rolls.length)}
                        className="surface-subtle flex w-full items-center justify-between gap-3 border-dashed px-3.5 py-2 text-left text-[11px] font-semibold text-slate-700 outline-none transition hover:border-slate-400/70 hover:bg-white/80 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-900/70 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20"
                      >
                        <span>
                          {allGroupRollsVisible
                            ? t("inventory.showFewerRolls", "Show fewer")
                            : hiddenRollCount <= 100
                              ? t("inventory.showAllRolls", "Show all")
                              : t("inventory.showMoreHistory", "Show more")}
                        </span>
                        {allGroupRollsVisible ? (
                          <span aria-hidden="true">&#9652;</span>
                        ) : (
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            + {hiddenRollCount} {t("inventory.moreRolls", "more roll(s)")}
                          </span>
                        )}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        : collectionWindow.filteredSpools.map((roll) => {
            const listButtonState =
              selectedSpoolId === roll.id
                ? "selected"
                : roll.id === recentlyAddedSpoolId
                  ? "recent"
                  : "default";
            return (
              <div key={roll.id} className="flex items-start gap-1">
                {bulkSelectionActive ? (
                  <InventoryBulkSpoolSelectionCheckbox
                    checked={selectedBulkSpoolIds.has(roll.id)}
                    disabled={bulkSelectionDisabled}
                    label={t(
                      "inventory.bulkSelectSpool",
                      "Select {reference}",
                      { reference: formatRollReference(roll) },
                    )}
                    onCheckedChange={(selected) =>
                      onBulkSelectionChange(roll.id, selected)
                    }
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectRoll(roll.id)}
                  className={`${inventorySpoolListButtonClassName(listButtonState)} min-w-0 flex-1`}
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
                    {isBorrowedInOwnership(roll.ownershipType) && roll.ownerName ? (
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
                      {formatGrams(roll.remainingGrams, "dash", locale)}
                    </div>
                  </div>
                </div>
                </button>
              </div>
            );
          })}

      {collectionWindow.hasMore ? (
        <div className={inventoryView === "CARDS" ? "col-span-full" : undefined}>
          <div className="surface-subtle flex flex-col items-center justify-center gap-2 border-dashed px-4 py-3 sm:flex-row sm:gap-3">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300" aria-live="polite">
              <span className="tabular-nums">
                {formatDisplayInteger(collectionWindow.representedSpoolCount, locale)}
              </span>
              {" / "}
              <span className="tabular-nums">
                {formatDisplayInteger(collectionWindow.totalSpoolCount, locale)}
              </span>{" "}
              {collectionWindow.totalSpoolCount === 1
                ? t("inventory.spoolResult", "spool")
                : t("inventory.spoolResults", "spools")}
            </div>
            <button
              type="button"
              onClick={() =>
                setRenderLimit((current) =>
                  nextInventoryCollectionLimit(inventoryView, current),
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm outline-none transition hover:border-slate-400 hover:bg-slate-50 focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20"
            >
              {t("inventory.showMoreHistory", "Show more")}
            </button>
          </div>
        </div>
      ) : null}

      {emptyState ? (
        <div
          aria-live="polite"
          className="surface-subtle col-span-full border-dashed px-5 py-7"
        >
          <div className="flex max-w-xl items-start gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300 bg-white shadow-[0_0_0_5px_rgba(148,163,184,0.12)] dark:border-slate-600 dark:bg-slate-800" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {emptyState === "LOADING"
                  ? t("inventory.loading", "Loading spools...")
                  : emptyState === "EMPTY_INVENTORY"
                    ? t("dashboard.onboardingInventoryTitle", "Add or import inventory")
                    : t("inventory.noMatch", "No spools match current filters.")}
              </div>
              {emptyState === "EMPTY_INVENTORY" ? (
                <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {t(
                    "dashboard.onboardingInventoryBody",
                    "Start with one spool, or import an existing inventory or backup.",
                  )}
                </div>
              ) : null}
              {emptyState === "NO_RESULTS" ? (
                <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {t(
                    "inventory.noMatchHint",
                    "Try adjusting search, status, material or ownership filters.",
                  )}
                </div>
              ) : null}
              {emptyState === "EMPTY_INVENTORY" ? (
                <PageHeaderButton
                  className="mt-4"
                  disabled={addSpoolDisabled}
                  onClick={onAddSpool}
                  responsive={false}
                  variant="primary"
                >
                  {t("inventory.addSpoolAction", "Add spool")}
                </PageHeaderButton>
              ) : null}
              {emptyState === "NO_RESULTS" ? (
                <PageHeaderButton
                  className="mt-4"
                  onClick={onResetFilters}
                  responsive={false}
                >
                  {t("inventory.resetFilters", "Reset filters")}
                </PageHeaderButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
