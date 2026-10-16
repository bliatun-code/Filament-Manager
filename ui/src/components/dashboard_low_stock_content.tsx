import { useId } from "react";
import type { DashboardLowStockAction } from "../lib/dashboard_action_model";
import { useI18n } from "../lib/i18n";
import { formatFilamentDisplayTitle as formatInventoryDisplayTitle } from "../lib/display_format";
import { formatGrams } from "../lib/weight_display";
import { PageHeaderButton } from "./page_header_button";
import { appControlFocusClassName } from "./ui_class_names";

function lowStockTitle(item: DashboardLowStockAction): string {
  return formatInventoryDisplayTitle(item.candidate.material, item.candidate.filamentName, item.candidate.colorName);
}

export default function DashboardLowStockContent({
  busyIds, hiddenItems, visibleItems, onQueueLowStock, onOpenLowStock, handleHide, handleRestore,
}: {
  busyIds: ReadonlySet<string>;
  hiddenItems: DashboardLowStockAction[];
  visibleItems: DashboardLowStockAction[];
  onQueueLowStock: (item: DashboardLowStockAction) => void;
  onOpenLowStock: () => void;
  handleHide: (item: DashboardLowStockAction) => void;
  handleRestore: (item: DashboardLowStockAction) => void;
}) {
  const { locale, t } = useI18n();
  const hiddenTitleId = useId();
  return (<>
        {visibleItems.length > 0 ? (
          <ul className="divide-y divide-slate-200/90 border-y border-slate-200/90 dark:divide-slate-700/80 dark:border-slate-700/80">
            {visibleItems.map((item) => {
              const title = lowStockTitle(item);
              const busy = busyIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 py-3 first:pt-2.5 last:pb-2.5 sm:flex-row sm:items-center sm:justify-between"
                  data-low-stock-state="visible"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {t(
                        "dashboard.lowStockSuggestionReason",
                        "{count, plural, one {# spool} other {# spools}} at or below the threshold; lowest is {remaining} of {threshold}.",
                        {
                          count: item.spoolCount,
                          remaining: formatGrams(
                            item.lowestRemainingG,
                            "zero",
                            locale,
                          ),
                          threshold: formatGrams(
                            item.thresholdG,
                            "zero",
                            locale,
                          ),
                        },
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <PageHeaderButton
                      aria-label={t(
                        "dashboard.queueLowStockSuggestionAria",
                        "Add {name} to the wishlist or an order",
                        { name: title },
                      )}
                      aria-busy={busy || undefined}
                      disabled={busy}
                      onClick={() => onQueueLowStock(item)}
                      responsive={false}
                      variant="secondary"
                    >
                      {busy
                        ? t("common.loading", "Loading...")
                        : t(
                            "dashboard.queueLowStockSuggestion",
                            "Add to wishlist / order",
                          )}
                    </PageHeaderButton>
                    <PageHeaderButton
                      aria-label={t(
                        "dashboard.hideLowStockSuggestionAria",
                        "Hide the suggestion for {name}",
                        { name: title },
                      )}
                      disabled={busy}
                      onClick={() => handleHide(item)}
                      responsive={false}
                      variant="soft"
                    >
                      {t("dashboard.hideLowStockSuggestion", "Hide suggestion")}
                    </PageHeaderButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300/80 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t(
              "dashboard.noVisibleLowStockSuggestions",
              "No visible purchase suggestions.",
            )}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <PageHeaderButton
            onClick={onOpenLowStock}
            responsive={false}
            variant="soft"
          >
            {t("dashboard.openLowStockInventory", "Open low-stock inventory")}
          </PageHeaderButton>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              "dashboard.lowStockSuggestionsOptional",
              "These suggestions are optional and can be hidden on this device.",
            )}
          </span>
        </div>

        {hiddenItems.length > 0 ? (
          <section
            aria-labelledby={hiddenTitleId}
            className="mt-3 border-t border-slate-200/90 pt-3 dark:border-slate-700/80"
          >
            <h3
              className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
              id={hiddenTitleId}
            >
              {t("dashboard.hiddenLowStockSuggestionsTitle", "Hidden suggestions")}
            </h3>
            <ul className="mt-1 divide-y divide-slate-200/80 dark:divide-slate-700/70">
              {hiddenItems.map((item) => {
                const title = lowStockTitle(item);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    data-low-stock-state="hidden"
                  >
                    <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                      {title}
                    </span>
                    <button
                      type="button"
                      aria-label={t(
                        "dashboard.restoreLowStockSuggestionAria",
                        "Show the suggestion for {name} again",
                        { name: title },
                      )}
                      className={`rounded px-1.5 py-1 text-xs font-semibold text-sky-700 outline-none hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:text-sky-200 ${appControlFocusClassName}`}
                      disabled={busyIds.has(item.id)}
                      onClick={() => handleRestore(item)}
                    >
                      {t("dashboard.restoreLowStockSuggestion", "Show again")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

  </>);
}
