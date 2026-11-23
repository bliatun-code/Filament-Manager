import { buildDashboardActionItems } from "../src/lib/dashboard_action_model";
import { stockMetricsFromRows } from "../src/lib/dashboard_model";
import { buildDashboardLowStockPreview } from "../src/lib/dashboard_overview_data";
import { normalizeSpoolWithMasterRows } from "../src/lib/spool_row_normalization";
import type { DashboardStock, InventoryOverview, SpoolWithMasterRow } from "../src/lib/tauri_client";

// Model a native response for browser probes and loader tests using the legacy row semantics.
export function localDashboardFixture(overview: InventoryOverview, rows: SpoolWithMasterRow[] = []) {
  const spoolRows = normalizeSpoolWithMasterRows(rows);
  const { metrics } = stockMetricsFromRows(spoolRows, overview);
  const actions = buildDashboardActionItems({
    spoolRows, wishlist: [], loans: [], bambuLiveAttention: [], now: new Date(0), today: "1970-01-01",
  });
  const stock: DashboardStock = {
    metrics,
    preview: buildDashboardLowStockPreview(spoolRows),
    groups: actions.flatMap(action => {
      if (action.kind !== "LOW_STOCK" || !action.candidate.masterId) return [];
      const { masterId, vendor, material, filamentName, colorName } = action.candidate;
      return [{ masterId, vendor, material, filamentName, colorName, lowestRemainingG: action.lowestRemainingG,
        spoolCount: action.spoolCount, thresholdG: action.thresholdG }];
    }),
  };
  return { overview, stock };
}
