import { dashboardOverviewStyles } from "../lib/dashboard_overview_styles";
import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";

import type { DashboardLowStockAction } from "../lib/dashboard_action_model";
import { useI18n } from "../lib/i18n";
import { formatFilamentDisplayTitle as formatInventoryDisplayTitle } from "../lib/display_format";
import { appControlFocusClassName } from "./ui_class_names";

const DashboardLowStockContent = lazy(() => import("./dashboard_low_stock_content"));

type DashboardLowStockPanelProps = {
  embedded?: boolean;
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
  embedded = false,
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
  const { t } = useI18n();
  const contentId = useId();
  const titleId = useId();
  const disclosureButtonRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentRequested, setContentRequested] = useState(defaultExpanded);
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

  const Heading = embedded ? "h3" : "h2";
  return (
    <section
      aria-labelledby={titleId}
      className={embedded ? "mt-3 border-t border-slate-200 pt-3 dark:border-slate-700" : "rounded-xl border border-slate-200/90 bg-white/55 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-950/25"}
      data-testid="dashboard-low-stock-suggestions"
    >
      <div className={`${dashboardOverviewStyles.between}`}>
        {!embedded ? (
        <div className="min-w-0">
          <Heading
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            id={titleId}
          >
            {t("dashboard.lowStockSuggestionsTitle", "Low-stock suggestions")}
          </Heading>
          <p className={`mt-0.5 text-xs leading-5 ${dashboardOverviewStyles.subtle}`}>
            {t(
              "dashboard.lowStockSuggestionsHint",
              "Optional purchase suggestions based on your low-stock thresholds.",
            )}
          </p>
        </div>
        ) : <h3 id={titleId} className="sr-only">{t("dashboard.lowStockSuggestionsTitle", "Low-stock suggestions")}</h3>}
        <button
          ref={disclosureButtonRef}
          type="button"
          aria-controls={contentId}
          aria-expanded={expanded}
          className={`inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/65 dark:text-slate-200 dark:hover:bg-slate-900 ${appControlFocusClassName}`}
          onClick={() => { setContentRequested(true); setExpanded((current) => !current); }}
        >
          <span>
            {expanded
              ? t("dashboard.hideLowStockSuggestions", "Hide suggestions")
              : t("dashboard.showLowStockSuggestions", "Show suggestions")}
          </span>
          <span className={dashboardOverviewStyles.subtle}>
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
        {contentRequested ? (
          <Suspense fallback={<p role="status">{t("common.loading", "Loading...")}</p>}>
            <DashboardLowStockContent busyIds={busyIds} hiddenItems={hiddenItems} visibleItems={visibleItems}
              onQueueLowStock={onQueueLowStock} onOpenLowStock={onOpenLowStock}
              handleHide={handleHide} handleRestore={handleRestore} />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
