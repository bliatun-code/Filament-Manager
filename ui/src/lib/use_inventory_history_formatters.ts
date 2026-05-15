import { useCallback, useMemo } from "react";
import { formatDateTime } from "./date_time";
import type { Locale, useI18n } from "./i18n";
import {
  formatInventoryHistoryEventDetails,
  formatInventoryHistoryEventType,
} from "./inventory_history";
import { formatInventoryStatusLabel } from "./inventory_list_model";
import type { SpoolHistoryEventRow } from "./tauri_client";

type InventoryHistoryFormattersInput = {
  historyRows: SpoolHistoryEventRow[];
  locale: Locale;
  printerNameById: Map<string, string>;
  slotLabelById: Map<string, string>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryHistoryFormatters({
  historyRows,
  locale,
  printerNameById,
  slotLabelById,
  t,
}: InventoryHistoryFormattersInput) {
  const formatStatusLabel = useCallback(
    (statusRaw: string) => formatInventoryStatusLabel(t, statusRaw),
    [t],
  );

  const formatHistoryEventType = useCallback(
    (eventType: string) => formatInventoryHistoryEventType(eventType, t),
    [t],
  );

  const formatHistoryEventDetails = useCallback(
    (event: SpoolHistoryEventRow) =>
      formatInventoryHistoryEventDetails(event, {
        t,
        formatDateTime,
        formatStatusLabel,
        locale,
        printerNameById,
        slotLabelById,
      }),
    [formatStatusLabel, locale, printerNameById, slotLabelById, t],
  );

  const visibleHistoryRows = useMemo(
    () => historyRows.filter((event) => event.event_type !== "ASSIGNED_TO_AMS"),
    [historyRows],
  );

  return {
    formatHistoryEventDetails,
    formatHistoryEventType,
    hasHiddenHistoryRows: visibleHistoryRows.length !== historyRows.length,
    visibleHistoryRows,
  };
}
