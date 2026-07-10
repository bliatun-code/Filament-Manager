import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { inventoryCatalogRowStyle } from "../lib/inventory_swatch_style";
import {
  filterLoanableSpoolsBySearch,
  resolveContainedSelectionScrollTop,
} from "../lib/loan_out_candidate_model";
import type { LoanableSpool } from "../lib/loan_out_data_source";
import { useResolvedTheme } from "../lib/theme_mode";
import { formatLoanOutGrams } from "../lib/loan_out_weight_model";
import { modalFormInputClassName } from "./form_control_class";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import {
  countPillClassName,
  loanOutSpoolButtonClassName,
  panelCardClassName,
  panelTitleClassName,
} from "./loan_out_modal_styles";

type LoanOutCandidateListProps = {
  disabled: boolean;
  searchQuery: string;
  selectedSpoolId: string | null;
  spools: LoanableSpool[];
  onSearchQueryChange: (value: string) => void;
  onSelectSpool: (spool: LoanableSpool) => void;
  renderVendorBadge: (vendor: string) => ReactNode;
};

export function LoanOutCandidateList({
  disabled,
  searchQuery,
  selectedSpoolId,
  spools,
  onSearchQueryChange,
  onSelectSpool,
  renderVendorBadge,
}: LoanOutCandidateListProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const searchId = useId();
  const listId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [hoveredSpoolId, setHoveredSpoolId] = useState<string | null>(null);
  const visibleSpools = useMemo(
    () => filterLoanableSpoolsBySearch(spools, searchQuery),
    [searchQuery, spools],
  );
  const candidateUnit = t(
    spools.length === 1 ? "inventory.loanCandidateOne" : "inventory.loanCandidateMany",
    spools.length === 1 ? "roll" : "rolls",
  );
  const resultCount = searchQuery.trim()
    ? t("inventory.loanSearchFilteredCount", "{visible} of {total} {unit}")
        .replace("{visible}", String(visibleSpools.length))
        .replace("{total}", String(spools.length))
        .replace("{unit}", candidateUnit)
    : `${spools.length} ${candidateUnit}`;

  useEffect(() => {
    if (!selectedSpoolId) {
      return;
    }
    const list = listRef.current;
    const row = rowRefs.current.get(selectedSpoolId);
    if (!list || !row) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const nextScrollTop = resolveContainedSelectionScrollTop({
      containerBottom: listRect.bottom,
      containerTop: listRect.top,
      currentScrollTop: list.scrollTop,
      rowBottom: rowRect.bottom,
      rowTop: rowRect.top,
    });
    if (nextScrollTop !== list.scrollTop) {
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = Math.min(maxScrollTop, nextScrollTop);
    }
  }, [searchQuery, selectedSpoolId, visibleSpools.length]);

  return (
    <div className={`${panelCardClassName} flex min-h-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={panelTitleClassName}>
          {t("inventory.availableToLoan", "Available to loan")}
        </div>
        <span className={countPillClassName} aria-live="polite" aria-atomic="true">
          {resultCount}
        </span>
      </div>

      <div className="mt-4">
        <label
          htmlFor={searchId}
          className="block text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          {t("inventory.loanSearchLabel", "Search available rolls")}
        </label>
        <input
          id={searchId}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          placeholder={t(
            "inventory.loanSearchPlaceholder",
            "Search material, color, vendor, location or reference",
          )}
          aria-controls={listId}
          className={modalFormInputClassName}
          disabled={disabled}
        />
      </div>

      <div
        ref={listRef}
        id={listId}
        role="group"
        aria-label={t("inventory.availableToLoan", "Available to loan")}
        className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 max-h-[min(52vh,36rem)]"
      >
        {visibleSpools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {t(
              "inventory.noLoanSearchResults",
              "No available rolls match your search.",
            )}
          </div>
        ) : (
          visibleSpools.map((spool) => {
            const isActive = selectedSpoolId === spool.id;
            const placementLabel = formatPlacementLabel(t, spool.location);
            const referenceLabel = formatSpoolReference(spool.id);
            return (
              <button
                key={spool.id}
                ref={(node) => {
                  if (node) {
                    rowRefs.current.set(spool.id, node);
                  } else {
                    rowRefs.current.delete(spool.id);
                  }
                }}
                type="button"
                aria-pressed={isActive}
                onMouseEnter={() => setHoveredSpoolId(spool.id)}
                onMouseLeave={() => setHoveredSpoolId(null)}
                onClick={() => onSelectSpool(spool)}
                className={loanOutSpoolButtonClassName(isActive)}
                style={inventoryCatalogRowStyle(
                  spool.hexColor,
                  isActive,
                  resolvedTheme,
                  hoveredSpoolId === spool.id,
                )}
                disabled={disabled}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <InventorySwatchChip
                    className="h-8 w-8 rounded-md"
                    swatchColor={spool.hexColor}
                    tone="tiny"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                      title={formatFilamentDisplayTitle(
                        spool.material,
                        spool.filamentName,
                        spool.colorName,
                      )}
                    >
                      {formatFilamentDisplayTitle(
                        spool.material,
                        spool.filamentName,
                        spool.colorName,
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {renderVendorBadge(spool.vendor)}
                      <span className="font-mono" title={`#${spool.id}`}>
                        {referenceLabel}
                      </span>
                      <span>{formatLoanOutGrams(spool.remainingGrams)}</span>
                      <span className="truncate max-w-[11rem]" title={placementLabel}>
                        {placementLabel}
                      </span>
                    </span>
                  </span>
                </span>
                {isActive ? (
                  <span className="shrink-0 rounded-full border border-sky-300/80 bg-sky-50/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-800 shadow-sm dark:border-sky-400/50 dark:bg-sky-500/15 dark:text-sky-100 dark:shadow-none">
                    ✓ {t("common.selected", "Selected")}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
