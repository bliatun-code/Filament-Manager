import { useId, useMemo, useRef, useState } from "react";

import type { DashboardLowStockAction } from "../lib/dashboard_action_model";
import { useI18n } from "../lib/i18n";
import { formatInventoryDisplayTitle } from "../lib/inventory_list_model";
import { formatGrams } from "../lib/weight_display";
import { PageHeaderButton } from "./page_header_button";
import { appControlFocusClassName } from "./ui_class_names";

type DashboardLowStockPanelProps = {
  busyIds?: ReadonlySet<string>;
  defaultExpanded?: boolean;
  error?: string | null;
  hiddenProductKeys: ReadonlySet<string>;
  items: DashboardLowStockAction[];
  message?: string | null;
  onHideLowStock: (item: DashboardLowStockAction) => void;
  onOpenLowStock: () => void;
  onQueueLowStock: (item: DashboardLowStockAction) => void;
  onRestoreLowStock: (item: DashboardLowStockAction) => void;
};

function lowStockTitle(item: DashboardLowStockAction): string {
  return formatInventoryDisplayTitle(
    item.candidate.material,
    item.candidate.filamentName,
    item.candidate.colorName,
  );
}

export function DashboardLowStockPanel({
  busyIds = new Set<string>(),
  defaultExpanded = false,
  error = null,
  hiddenProductKeys,
  items,
  message = null,
  onHideLowStock,
  onOpenLowStock,
  onQueueLowStock,
  onRestoreLowStock,
}: DashboardLowStockPanelProps) {
  const { locale, t } = useI18n();
  const contentId = useId();
  const titleId = useId();
  const hiddenTitleId = useId();
  const disclosureButtonRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [lastHidden, setLastHidden] = useState<DashboardLowStockAction | null>(
    null,
  );
  const { hiddenItems, visibleItems } = useMemo(() => {
    const visible: DashboardLowStockAction[] = [];
    const hidden: DashboardLowStockAction[] = [];
    for (const item of items) {
      if (hiddenProductKeys.has(item.candidate.productKey)) {
        hidden.push(item);
      } else {
        visible.push(item);
      }
    }
    return { hiddenItems: hidden, visibleItems: visible };
  }, [hiddenProductKeys, items]);

  const suggestionCount = t(
    "dashboard.lowStockSuggestionCount",
    "{count, plural, one {# suggestion} other {# suggestions}}",
    { count: visibleItems.length },
  );
  const hiddenCount = t(
    "dashboard.lowStockHiddenCount",
    "{count, plural, one {# hidden} other {# hidden}}",
    { count: hiddenItems.length },
  );

  const handleHide = (item: DashboardLowStockAction) => {
    onHideLowStock(item);
    setLastHidden(item);
    disclosureButtonRef.current?.focus();
  };

  const handleRestore = (item: DashboardLowStockAction) => {
    onRestoreLowStock(item);
    if (lastHidden?.candidate.productKey === item.candidate.productKey) {
      setLastHidden(null);
    }
    disclosureButtonRef.current?.focus();
  };

  const handleUndo = () => {
    if (lastHidden) {
      handleRestore(lastHidden);
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-slate-200/90 bg-white/55 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-950/25"
      data-testid="dashboard-low-stock-suggestions"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            id={titleId}
          >
            {t("dashboard.lowStockSuggestionsTitle", "Low-stock suggestions")}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t(
              "dashboard.lowStockSuggestionsHint",
              "Optional purchase suggestions based on your low-stock thresholds.",
            )}
          </p>
        </div>
        <button
          ref={disclosureButtonRef}
          type="button"
          aria-controls={contentId}
          aria-expanded={expanded}
          className={`inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/65 dark:text-slate-200 dark:hover:bg-slate-900 ${appControlFocusClassName}`}
          onClick={() => setExpanded((current) => !current)}
        >
          <span>
            {expanded
              ? t("dashboard.hideLowStockSuggestions", "Hide suggestions")
              : t("dashboard.showLowStockSuggestions", "Show suggestions")}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {suggestionCount}
            {hiddenItems.length > 0 ? ` · ${hiddenCount}` : ""}
          </span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </div>

      {error ? (
        <div
          className="mt-3 rounded-lg border border-rose-300/75 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/35 dark:bg-rose-950/30 dark:text-rose-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {lastHidden || message ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/90 bg-slate-50/75 px-3 py-2 text-sm text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/55 dark:text-slate-200">
          <span role="status">
            {lastHidden
              ? t(
                  "dashboard.lowStockSuggestionHidden",
                  "Hidden the suggestion for {name} on this device.",
                  { name: lowStockTitle(lastHidden) },
                )
              : message}
          </span>
          {lastHidden ? (
            <button
              type="button"
              className={`rounded px-1.5 py-0.5 text-sm font-semibold text-sky-700 outline-none underline decoration-sky-300 underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200 ${appControlFocusClassName}`}
              onClick={handleUndo}
            >
              {t("dashboard.lowStockUndo", "Undo")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div id={contentId} className="mt-3" hidden={!expanded}>
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
      </div>
    </section>
  );
}
