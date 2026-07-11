import { useState } from "react";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import {
  inventoryDetailEyebrowClassName,
  inventoryDetailPanelClassName,
  inventoryPanelToggleButtonClassName,
} from "./inventory_detail_panel_class";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { SpoolHistoryEventRow } from "../lib/tauri_client";

type InventoryRollHistoryPanelProps = {
  formatHistoryEventDetails: (event: SpoolHistoryEventRow) => string;
  formatHistoryEventType: (eventType: string) => string;
  hasHiddenHistoryRows: boolean;
  historyLoading: boolean;
  onToggle: () => void;
  resolvedTheme: ResolvedTheme;
  showRollHistory: boolean;
  spoolHexColor?: string | null;
  visibleHistoryRows: SpoolHistoryEventRow[];
};

const INITIAL_HISTORY_EVENT_LIMIT = 8;

export function InventoryRollHistoryPanel({
  formatHistoryEventDetails,
  formatHistoryEventType,
  hasHiddenHistoryRows,
  historyLoading,
  onToggle,
  resolvedTheme,
  showRollHistory,
  spoolHexColor,
  visibleHistoryRows,
}: InventoryRollHistoryPanelProps) {
  const { locale, t } = useI18n();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const historyEventCount = visibleHistoryRows.length;
  const hasMoreHistory = historyEventCount > INITIAL_HISTORY_EVENT_LIMIT;
  const displayedHistoryRows = showAllHistory
    ? visibleHistoryRows
    : visibleHistoryRows.slice(0, INITIAL_HISTORY_EVENT_LIMIT);
  const historyEventCountLabel = t(
    "inventory.historyEventCount",
    "{count, plural, one {# event} other {# events}}",
    { count: historyEventCount },
  );

  function handlePanelToggle() {
    if (showRollHistory) {
      setShowAllHistory(false);
    }
    onToggle();
  }

  return (
    <div
      id="inventory-roll-history-panel"
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className={inventoryDetailEyebrowClassName}>
            {t("inventory.rollHistory", "Roll history")}
          </div>
          {!historyLoading ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
              {historyEventCountLabel}
            </span>
          ) : null}
        </div>
        <button
          id="inventory-roll-history-toggle"
          type="button"
          className={inventoryPanelToggleButtonClassName}
          onClick={handlePanelToggle}
          aria-controls="inventory-roll-history-events"
          aria-expanded={showRollHistory}
        >
          {showRollHistory ? t("common.hide", "Hide") : t("common.show", "Show")}
        </button>
      </div>
      <div
        id="inventory-roll-history-events"
        className="mt-3"
        aria-busy={historyLoading}
        hidden={!showRollHistory}
      >
          {historyLoading ? (
            <div className="text-xs text-slate-500">
              {t("inventory.loadingHistory", "Loading history...")}
            </div>
          ) : null}
          {!historyLoading && visibleHistoryRows.length === 0 ? (
            <div className="surface-subtle border-dashed px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
              {hasHiddenHistoryRows
                ? t(
                    "inventory.noVisibleHistory",
                    "No roll history beyond printer slot assignments yet.",
                  )
                : t("inventory.noHistory", "No history events yet.")}
            </div>
          ) : null}
          {!historyLoading && displayedHistoryRows.length > 0 ? (
            <ol
              id="inventory-roll-history-list"
              className="overflow-hidden rounded-lg border border-slate-200/80 bg-white/50 divide-y divide-slate-200/80 dark:border-slate-700 dark:bg-slate-950/35 dark:divide-slate-700"
            >
              {displayedHistoryRows.map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:bg-slate-500 dark:ring-slate-800"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {formatHistoryEventType(event.event_type)}
                      </span>
                      <time
                        dateTime={event.created_at}
                        className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
                      >
                        {formatDateTime(event.created_at, locale)}
                      </time>
                    </div>
                    <div className="mt-0.5 break-words text-slate-600 dark:text-slate-300">
                      {formatHistoryEventDetails(event)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {!historyLoading && hasMoreHistory ? (
            <button
              type="button"
              className={`${inventoryPanelToggleButtonClassName} mt-2`}
              onClick={() => setShowAllHistory((current) => !current)}
              aria-controls="inventory-roll-history-list"
              aria-expanded={showAllHistory}
            >
              {showAllHistory
                ? t("inventory.showLessHistory", "Show fewer")
                : t("inventory.showMoreHistory", "Show more")}
            </button>
          ) : null}
      </div>
      {!showRollHistory ? (
        <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t(
            "inventory.rollHistoryCollapsed",
            "Roll history is collapsed by default. Expand it to view the events.",
          )}
        </div>
      ) : null}
    </div>
  );
}
