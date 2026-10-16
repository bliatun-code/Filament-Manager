import type { KeyboardEvent, ReactNode } from "react";
import type { TranslateFn } from "../lib/statistics_model";
import { tabButtonClass } from "../lib/settings_ui_classes";
import {
  nextStatisticsAnalysisView,
  STATISTICS_ANALYSIS_VIEWS,
  statisticsAnalysisPanelId,
  statisticsAnalysisTabId,
  type StatisticsAnalysisView,
} from "./statistics_analysis_model";

export function StatisticsAnalysisNavigation({
  onViewChange,
  t,
  view,
}: {
  onViewChange: (view: StatisticsAnalysisView) => void;
  t: TranslateFn;
  view: StatisticsAnalysisView;
}) {
  const labels: Record<StatisticsAnalysisView, string> = {
    CONSUMPTION: t("statistics.viewConsumption", "Consumption"),
    VALUE: t("statistics.viewValue", "Inventory value"),
    PRINTERS: t("nav.printers", "Printers"),
  };
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: StatisticsAnalysisView,
  ) => {
    const next = nextStatisticsAnalysisView(current, event.key);
    if (!next) return;
    event.preventDefault();
    onViewChange(next);
    event.currentTarget.ownerDocument.getElementById(statisticsAnalysisTabId(next))?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={t("statistics.analysisViews", "Statistics views")}
      aria-orientation="horizontal"
      className="mt-5 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-300/50 bg-white/44 p-1.5 dark:border-slate-700/70 dark:bg-slate-950/24"
    >
      {STATISTICS_ANALYSIS_VIEWS.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          id={statisticsAnalysisTabId(item)}
          aria-controls={statisticsAnalysisPanelId(item)}
          aria-selected={item === view}
          tabIndex={item === view ? 0 : -1}
          className={`${tabButtonClass(item === view)} min-w-0`}
          onClick={() => onViewChange(item)}
          onKeyDown={(event) => handleKeyDown(event, item)}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}

/** Keep each view mounted so filters, custom drafts and open trace details survive navigation. */
export function StatisticsAnalysisPanel({
  activeView,
  children,
  view,
}: {
  activeView: StatisticsAnalysisView;
  children: ReactNode;
  view: StatisticsAnalysisView;
}) {
  return (
    <div
      role="tabpanel"
      id={statisticsAnalysisPanelId(view)}
      aria-labelledby={statisticsAnalysisTabId(view)}
      tabIndex={0}
      hidden={view !== activeView}
      className="app-control-focus outline-none"
    >
      {children}
    </div>
  );
}
