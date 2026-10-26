import { useEffect, useId, useMemo, useState } from "react";
import { PageHeaderButton } from "./page_header_button";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { formatPlacementLabel } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import {
  formatInventoryDisplayTitle,
  formatInventoryOwnershipLabel,
  formatRollReference,
  inventoryOwnershipTone,
  isInventorySpoolLowStockCandidate,
  normalizeStatus,
  resolveInventoryCollectionEmptyState,
  spoolRemainingRatio,
  type InventorySpool,
  type SpoolGroup,
} from "../lib/inventory_list_model";
import { FilamentSpoolVisual } from "./filament_spool_visual";
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
  slotLabelById?: ReadonlyMap<string, string>;
};

function formatInventoryPlacement(
  t: ReturnType<typeof useI18n>["t"],
  value: string | null | undefined,
  slotLabelById?: ReadonlyMap<string, string>,
) {
  return formatPlacementLabel(t, value, slotLabelById);
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
  const lowStock = isInventorySpoolLowStockCandidate(spool);
  return (
    <div
      className={`${className} inventory-remaining-track`} aria-hidden="true"
    >
      <div
        className={`inventory-remaining-fill ${lowStock ? "is-low" : ""}`}
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
  return `inventory-roll-row app-control-focus ${mode}`;
}
function inventorySpoolListButtonClassName(state: "default" | "recent" | "selected"): string {
  return `inventory-list-row app-control-focus is-${state}`;
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
  selectedSpoolId,
  selectedBulkSpoolIds,
  totalSpoolCount,
  slotLabelById,
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
          ? "inventory-product-grid"
          : "inventory-product-list"
      }
    >
      {inventoryView === "CARDS"
        ? collectionWindow.groupedSpools.map((group, groupIndex) => {
            const hasRecentRoll = group.rolls.some(roll => roll.id === recentlyAddedSpoolId);
            const sortedRolls = [...group.rolls].sort((left, right) =>
              left.id === recentlyAddedSpoolId ? -1 : right.id === recentlyAddedSpoolId ? 1 : 0);
            const groupRollLimit = visibleRollLimitsByGroup.get(group.key) ?? 3;
            const visibleRolls = sortedRolls.slice(0, groupRollLimit);
            const groupExpanded = groupRollLimit > 3;
            const allGroupRollsVisible = visibleRolls.length >= group.rolls.length;
            const hiddenRollCount = Math.max(0, group.rolls.length - visibleRolls.length);
            const rollListId = `${collectionId}-group-${groupIndex}-rolls`;
            return <article key={group.key} className={`inventory-product-card ${hasRecentRoll ? "is-recent" : ""}`}>
              <FilamentSpoolVisual color={group.hexColor} className="inventory-product-spool" />
              <div className="inventory-product-content">
                <header className="inventory-product-header">
                  <InventorySwatchChip className="inventory-product-swatch" swatchColor={group.hexColor} />
                  <div className="min-w-0 flex-1">
                    <h2 title={formatInventoryDisplayTitle(group.material, group.filamentName, group.colorName)}>
                      {formatInventoryDisplayTitle(group.material, group.filamentName, group.colorName)}
                    </h2>
                    <div className="inventory-product-meta">
                      <span>{group.vendor}</span><span aria-hidden="true">·</span><span>{group.material}</span>
                      <OwnershipChip ownershipType={group.ownershipType} t={t} />
                    </div>
                  </div>
                  <details className="inventory-product-menu">
                    <summary aria-label={`${t("common.actions", "Actions")} · ${formatInventoryDisplayTitle(group.material, group.filamentName, group.colorName)}`}>⋮</summary>
                    <div>{group.rolls.map(roll => <button key={roll.id} type="button" onClick={event => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      onSelectRoll(roll.id);
                    }}>{t("inventory.openCreatedRoll", "Open roll")} · {formatRollReference(roll)}</button>)}</div>
                  </details>
                </header>
                {group.rolls.length > 1 ? <div className="inventory-product-total">
                  {group.rolls.length} {t("inventory.spoolResults", "spools")} · {formatGrams(group.totalRemaining, "dash", locale)}
                </div> : null}
                <div id={rollListId} className="inventory-product-rolls">
                  {visibleRolls.map(roll => <div key={roll.id} className="inventory-roll-line">
                    {bulkSelectionActive ? <InventoryBulkSpoolSelectionCheckbox
                      checked={selectedBulkSpoolIds.has(roll.id)} disabled={bulkSelectionDisabled}
                      label={t("inventory.bulkSelectSpool", "Select {reference}", { reference: formatRollReference(roll) })}
                      onCheckedChange={selected => onBulkSelectionChange(roll.id, selected)} /> : null}
                    <button type="button" onClick={() => onSelectRoll(roll.id)}
                      className={`${group.rolls.length === 1 ? inventorySpoolRollButtonClassName("single") : inventorySpoolRollButtonClassName("compact")} ${selectedSpoolId === roll.id ? "is-selected" : ""}`}>
                      <span className="inventory-roll-reference">{formatRollReference(roll)}</span>
                      <span className="inventory-roll-placement" title={formatInventoryPlacement(t, roll.location, slotLabelById)}>
                        {formatInventoryPlacement(t, roll.location, slotLabelById)}
                        {isBorrowedInOwnership(roll.ownershipType) && roll.ownerName ? <span className="block">{t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}</span> : null}
                        {normalizeStatus(roll.status) === "EMPTY" ? <span className="block">{t("inventory.statusEmpty", "Empty")}</span> : null}
                        {normalizeStatus(roll.status) === "LOST" ? <span className="block">{t("inventory.statusLost", "Lost")}</span> : null}
                      </span>
                      <span className="inventory-roll-weight">{formatGrams(roll.remainingGrams, "dash", locale)}</span>
                      <RemainingMeter className="inventory-roll-meter" spool={roll} />
                    </button>
                  </div>)}
                </div>
                {group.rolls.length > 3 ? <button type="button" aria-expanded={groupExpanded}
                  aria-controls={rollListId} onClick={() => updateGroupRollLimit(group.key, group.rolls.length)}
                  className="inventory-more-rolls app-control-focus">
                  {allGroupRollsVisible ? t("inventory.showFewerRolls", "Show fewer rolls") :
                    `${t("inventory.showAllRolls", "Show all rolls")} (+${hiddenRollCount})`}
                </button> : null}
              </div>
            </article>;
          })
        : collectionWindow.filteredSpools.map(roll => {
            const listButtonState = selectedSpoolId === roll.id ? "selected" : roll.id === recentlyAddedSpoolId ? "recent" : "default";
            return <div key={roll.id} className="inventory-list-line">
              {bulkSelectionActive ? <InventoryBulkSpoolSelectionCheckbox
                checked={selectedBulkSpoolIds.has(roll.id)} disabled={bulkSelectionDisabled}
                label={t("inventory.bulkSelectSpool", "Select {reference}", {reference: formatRollReference(roll)})}
                onCheckedChange={selected => onBulkSelectionChange(roll.id, selected)} /> : null}
              <button type="button" onClick={() => onSelectRoll(roll.id)} className={inventorySpoolListButtonClassName(listButtonState)}>
                <InventorySwatchChip className="inventory-product-swatch" swatchColor={roll.hexColor} />
                <span className="inventory-list-name">
                  <strong>{formatInventoryDisplayTitle(roll.material, roll.filamentName, roll.colorName)}</strong>
                  <span className="inventory-product-meta">{roll.vendor} · {roll.material} <OwnershipChip ownershipType={roll.ownershipType} t={t} /></span>
                  <span className="inventory-list-reference">{formatRollReference(roll)}</span>
                </span>
                <span className="inventory-roll-placement">{formatInventoryPlacement(t, roll.location, slotLabelById)}
                  {isBorrowedInOwnership(roll.ownershipType) && roll.ownerName ? <span className="block">{t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}</span> : null}
                </span>
                <span className="inventory-roll-reference">{formatRollReference(roll)}</span>
                <span className="inventory-roll-weight">{formatGrams(roll.remainingGrams, "dash", locale)}</span>
                <RemainingMeter className="inventory-roll-meter" spool={roll} />
              </button>
            </div>;
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
