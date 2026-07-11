import { useId, type Dispatch, type SetStateAction } from "react";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import type { I18nContextValue } from "../lib/i18n";
import {
  DEFAULT_BORROWER_PREFS,
  DEFAULT_CONSUMPTION_PREFS,
  isInboundLoanDirection,
  ownershipBadgeClass,
  ownershipLabel,
  parseConsumptionSort,
  parseOwnershipFilter,
  type BorrowerFilamentUsageRow,
  type BorrowerPopupPrefs,
  type ConsumptionPopupPrefs,
  type LoanDirection,
} from "../lib/statistics_model";
import type { FilamentConsumptionRow } from "../lib/tauri_client";
import {
  statisticsFilterButtonClass,
  statisticsFilterInputClass,
  statisticsFilterSelectClass,
} from "./statistics_view_helpers";
import {
  StatisticsEmptyState,
  StatisticsFilamentUsageRowCard,
  SummaryMetricTile,
} from "./statistics_ui";

type Translate = I18nContextValue["t"];

const statisticsFilterLabelClass =
  "grid min-w-0 gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400";

function statisticsFilteredResultCount(
  t: Translate,
  visible: number,
  total: number,
): string {
  return t(
    "statistics.filteredResultCount",
    "{visible} / {total, plural, one {# result} other {# results}}",
    { visible, total },
  );
}

function consumptionSortLabel(t: Translate, sort: ConsumptionPopupPrefs["sort"]): string {
  switch (sort) {
    case "USED_ASC":
      return t("statistics.sortUsedAsc", "Least used");
    case "JOBS_DESC":
      return t("statistics.sortJobsDesc", "Most jobs");
    case "NAME_ASC":
      return t("statistics.sortNameAsc", "Name (A-Z)");
    case "USED_DESC":
    default:
      return t("statistics.sortUsedDesc", "Most used");
  }
}

export function StatisticsConsumptionModal({
  consumptionError,
  consumptionLoading,
  consumptionMaterialOptions,
  consumptionModalTitle,
  consumptionPrefs,
  consumptionRows,
  consumptionVendorOptions,
  filteredConsumptionRows,
  onClose,
  setConsumptionPrefs,
  t,
}: {
  consumptionError: string | null;
  consumptionLoading: boolean;
  consumptionMaterialOptions: string[];
  consumptionModalTitle: string;
  consumptionPrefs: ConsumptionPopupPrefs;
  consumptionRows: FilamentConsumptionRow[];
  consumptionVendorOptions: string[];
  filteredConsumptionRows: FilamentConsumptionRow[];
  onClose: () => void;
  setConsumptionPrefs: Dispatch<SetStateAction<ConsumptionPopupPrefs>>;
  t: Translate;
}) {
  const searchId = useId();
  const vendorId = useId();
  const materialId = useId();
  const ownershipId = useId();
  const sortId = useId();

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      panelClassName={modalPanelClassName("xl")}
    >
      <ModalHeader
        eyebrow={t("nav.statistics", "Statistics")}
        title={consumptionModalTitle}
        onClose={onClose}
        closeLabel={t("common.close", "Close")}
        className="-mx-5 -mt-5"
      />

      {consumptionLoading ? (
        <div className="mt-4 text-sm text-slate-500">
          {t("statistics.loadingFilamentBreakdown", "Loading filament breakdown...")}
        </div>
      ) : null}
      {consumptionError ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {consumptionError}
        </FeedbackBanner>
      ) : null}
      {!consumptionLoading && !consumptionError && consumptionRows.length > 0 ? (
        <div className="surface-subtle mt-4 grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
          <label
            htmlFor={searchId}
            className={`${statisticsFilterLabelClass} sm:col-span-2`}
          >
            <span>
              {t(
                "statistics.searchFilamentPlaceholder",
                "Search filament, color, vendor or owner",
              )}
            </span>
            <input
              id={searchId}
              type="search"
              value={consumptionPrefs.search}
              onChange={(event) =>
                setConsumptionPrefs((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder={t(
                "statistics.searchFilamentPlaceholder",
                "Search filament, color, vendor or owner",
              )}
              className={`w-full ${statisticsFilterInputClass}`}
            />
          </label>
          <label htmlFor={vendorId} className={statisticsFilterLabelClass}>
            <span>{t("statistics.filterVendor", "Vendor")}</span>
            <select
              id={vendorId}
              value={consumptionPrefs.vendorFilter}
              onChange={(event) =>
                setConsumptionPrefs((current) => ({
                  ...current,
                  vendorFilter: event.target.value,
                }))
              }
              className={`w-full ${statisticsFilterSelectClass}`}
            >
              {consumptionVendorOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL"
                    ? `${t("statistics.filterVendor", "Vendor")}: ${t("common.all", "All")}`
                    : option}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={materialId} className={statisticsFilterLabelClass}>
            <span>{t("statistics.filterMaterial", "Material")}</span>
            <select
              id={materialId}
              value={consumptionPrefs.materialFilter}
              onChange={(event) =>
                setConsumptionPrefs((current) => ({
                  ...current,
                  materialFilter: event.target.value,
                }))
              }
              className={`w-full ${statisticsFilterSelectClass}`}
            >
              {consumptionMaterialOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL"
                    ? `${t("statistics.filterMaterial", "Material")}: ${t("common.all", "All")}`
                    : option}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={ownershipId} className={statisticsFilterLabelClass}>
            <span>{t("inventory.ownershipGroup", "Ownership")}</span>
            <select
              id={ownershipId}
              value={consumptionPrefs.ownershipFilter}
              onChange={(event) =>
                setConsumptionPrefs((current) => ({
                  ...current,
                  ownershipFilter: parseOwnershipFilter(event.target.value),
                }))
              }
              className={`w-full ${statisticsFilterSelectClass}`}
            >
              <option value="ALL">
                {`${t("inventory.ownershipGroup", "Ownership")}: ${t("common.all", "All")}`}
              </option>
              <option value="OWNED">
                {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.ownedByUs", "Owned")}`}
              </option>
              <option value="BORROWED_IN">
                {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.borrowedIn", "Borrowed in")}`}
              </option>
            </select>
          </label>
          <label htmlFor={sortId} className={statisticsFilterLabelClass}>
            <span>{consumptionSortLabel(t, consumptionPrefs.sort)}</span>
            <select
              id={sortId}
              value={consumptionPrefs.sort}
              onChange={(event) =>
                setConsumptionPrefs((current) => ({
                  ...current,
                  sort: parseConsumptionSort(event.target.value),
                }))
              }
              className={`w-full ${statisticsFilterSelectClass}`}
            >
              <option value="USED_DESC">{t("statistics.sortUsedDesc", "Most used")}</option>
              <option value="USED_ASC">{t("statistics.sortUsedAsc", "Least used")}</option>
              <option value="JOBS_DESC">{t("statistics.sortJobsDesc", "Most jobs")}</option>
              <option value="NAME_ASC">{t("statistics.sortNameAsc", "Name (A-Z)")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              setConsumptionPrefs({
                ...DEFAULT_CONSUMPTION_PREFS,
              })
            }
            className={`${statisticsFilterButtonClass} w-full self-end sm:col-span-2`}
          >
            {t("statistics.resetFilters", "Reset filters")}
          </button>
          <span
            className="w-full self-end rounded-full border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 sm:col-span-2"
            aria-live="polite"
            aria-atomic="true"
          >
            {statisticsFilteredResultCount(
              t,
              filteredConsumptionRows.length,
              consumptionRows.length,
            )}
          </span>
        </div>
      ) : null}
      {!consumptionLoading && !consumptionError && consumptionRows.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noFilamentBreakdown", "No filament consumption has been logged yet.")}
        </StatisticsEmptyState>
      ) : null}
      {!consumptionLoading &&
      !consumptionError &&
      consumptionRows.length > 0 &&
      filteredConsumptionRows.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noFilamentFilterMatch", "No rows match current filters.")}
        </StatisticsEmptyState>
      ) : null}
      {!consumptionLoading && !consumptionError && filteredConsumptionRows.length > 0 ? (
        <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
          {filteredConsumptionRows.map((row, index) => (
            <StatisticsFilamentUsageRowCard
              key={`${row.printer_id ?? "all"}-${row.material}-${row.filament_name}-${row.color_name}-${row.vendor}-${row.ownership_type}-${row.owner_name ?? ""}-${index}`}
              colorName={row.color_name}
              filamentName={row.filament_name}
              material={row.material}
              metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]"
              meta={
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ownershipBadgeClass(row.ownership_type)}`}
                >
                  {ownershipLabel(t, row.ownership_type, row.owner_name)}
                </span>
              }
              swatchColor={row.hex_color}
              vendor={row.vendor}
            >
              <SummaryMetricTile
                label={t("printers.jobs", "Jobs")}
                value={row.jobs.toString()}
                tone="sky"
              />
              <SummaryMetricTile
                label={t("printers.used", "Used")}
                value={`${row.used_grams} g`}
                tone="amber"
              />
            </StatisticsFilamentUsageRowCard>
          ))}
        </div>
      ) : null}
    </AppModal>
  );
}

export function StatisticsBorrowerUsageModal({
  borrowerError,
  borrowerLoading,
  borrowerModalDirection,
  borrowerModalTitle,
  borrowerPrefs,
  borrowerRows,
  filteredBorrowerRows,
  onClose,
  setBorrowerPrefs,
  t,
}: {
  borrowerError: string | null;
  borrowerLoading: boolean;
  borrowerModalDirection: LoanDirection;
  borrowerModalTitle: string;
  borrowerPrefs: BorrowerPopupPrefs;
  borrowerRows: BorrowerFilamentUsageRow[];
  filteredBorrowerRows: BorrowerFilamentUsageRow[];
  onClose: () => void;
  setBorrowerPrefs: Dispatch<SetStateAction<BorrowerPopupPrefs>>;
  t: Translate;
}) {
  const inboundDirection = isInboundLoanDirection(borrowerModalDirection);
  const searchId = useId();

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      panelClassName={modalPanelClassName("xl")}
    >
      <ModalHeader
        eyebrow={
          inboundDirection
            ? t("statistics.inboundUsage", "Borrowed-in usage by owner")
            : t("statistics.borrowerUsage", "Loan usage by person")
        }
        title={borrowerModalTitle}
        onClose={onClose}
        closeLabel={t("common.close", "Close")}
        className="-mx-5 -mt-5"
      />

      {borrowerLoading ? (
        <div className="mt-4 text-sm text-slate-500">
          {inboundDirection
            ? t("statistics.loadingInboundBreakdown", "Loading owner breakdown...")
            : t("statistics.loadingBorrowerBreakdown", "Loading borrower breakdown...")}
        </div>
      ) : null}
      {borrowerError ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {borrowerError}
        </FeedbackBanner>
      ) : null}
      {!borrowerLoading && !borrowerError && borrowerRows.length > 0 ? (
        <div className="surface-subtle mt-4 grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label htmlFor={searchId} className={statisticsFilterLabelClass}>
            <span>
              {t(
                "statistics.searchBorrowerFilamentPlaceholder",
                "Search filament, color or vendor",
              )}
            </span>
            <input
              id={searchId}
              type="search"
              value={borrowerPrefs.search}
              onChange={(event) =>
                setBorrowerPrefs((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder={t(
                "statistics.searchBorrowerFilamentPlaceholder",
                "Search filament, color or vendor",
              )}
              className={`w-full ${statisticsFilterInputClass}`}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setBorrowerPrefs({
                ...DEFAULT_BORROWER_PREFS,
              })
            }
            className={`${statisticsFilterButtonClass} self-end sm:w-auto`}
          >
            {t("statistics.resetFilters", "Reset filters")}
          </button>
          <span
            className="justify-self-end rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 sm:col-span-2"
            aria-live="polite"
            aria-atomic="true"
          >
            {statisticsFilteredResultCount(
              t,
              filteredBorrowerRows.length,
              borrowerRows.length,
            )}
          </span>
        </div>
      ) : null}
      {!borrowerLoading && !borrowerError && borrowerRows.length === 0 ? (
        <StatisticsEmptyState>
          {inboundDirection
            ? t("statistics.noInboundBreakdown", "No borrowed-in owner usage recorded yet.")
            : t("statistics.noBorrowerBreakdown", "No borrower usage recorded yet.")}
        </StatisticsEmptyState>
      ) : null}
      {!borrowerLoading &&
      !borrowerError &&
      borrowerRows.length > 0 &&
      filteredBorrowerRows.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noBorrowerFilterMatch", "No rows match current filters.")}
        </StatisticsEmptyState>
      ) : null}
      {!borrowerLoading && !borrowerError && filteredBorrowerRows.length > 0 ? (
        <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
          {filteredBorrowerRows.map((row, index) => (
            <StatisticsFilamentUsageRowCard
              key={`${row.material}-${row.filamentName}-${row.colorName}-${row.vendor}-${index}`}
              colorName={row.colorName}
              filamentName={row.filamentName}
              material={row.material}
              metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-3"
              swatchColor={row.hexColor}
              vendor={row.vendor}
            >
              <SummaryMetricTile
                label={t("printers.used", "Used")}
                value={`${row.consumedGrams} g`}
                tone="amber"
              />
              <SummaryMetricTile
                label={
                  inboundDirection
                    ? t("statistics.borrowedInShort", "In")
                    : t("statistics.lentOutShort", "Out")
                }
                value={`${row.lentOutGrams} g`}
                tone="sky"
              />
              <SummaryMetricTile
                label={t("statistics.loansShort", "Loans")}
                value={`${row.loans} · ${row.activeLoans} ${t("common.active", "Active")}`}
                tone="slate"
                className="col-span-2 min-[960px]:col-span-1"
              />
            </StatisticsFilamentUsageRowCard>
          ))}
        </div>
      ) : null}
    </AppModal>
  );
}
