import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import {
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

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          {t("inventory.rollHistory", "Roll history")}
        </div>
        <button
          type="button"
          className={inventoryPanelToggleButtonClassName}
          onClick={onToggle}
        >
          {showRollHistory ? t("common.hide", "Hide") : t("common.show", "Show")}
        </button>
      </div>
      {showRollHistory ? (
        <div className="mt-3 space-y-2">
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
          {visibleHistoryRows.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/55 dark:text-slate-200"
            >
              <div className="font-semibold text-slate-900 dark:text-slate-50">
                {formatHistoryEventType(event.event_type)} ·{" "}
                {formatDateTime(event.created_at, locale)}
              </div>
              <div className="mt-1 break-words text-slate-600 dark:text-slate-300">
                {formatHistoryEventDetails(event)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t(
            "inventory.rollHistoryCollapsed",
            "Filamenthistorikk er kollapset som standard. Utvid når du vil se hendelsene.",
          )}
        </div>
      )}
    </div>
  );
}
