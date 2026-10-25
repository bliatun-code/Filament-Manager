import React from "react";
import { createRoot } from "react-dom/client";
import DashboardPage from "../src/pages/dashboard";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, lookup, type Locale } from "../src/lib/i18n";
import { formatMessage } from "../../src-tauri/companion_browser/message_format.js";
import { initThemeMode } from "../src/lib/theme_mode";
import { buildDashboardDerivedState } from "../src/lib/dashboard_model";
import { buildDashboardLowStockPreview } from "../src/lib/dashboard_overview_data";
import { buildDashboardActionItems } from "../src/lib/dashboard_action_model";
import { normalizeSpoolWithMasterRows } from "../src/lib/spool_row_normalization";
import type { InventoryOverview, PrinterOverviewRow } from "../src/lib/tauri_client";
import "../src/index.css";

export async function mountLocaleDashboard(locale: Locale) {
  const dictionary = await loadLocaleDictionary(locale);
  const t = (key: string, fallback = "", params = {}) => formatMessage(lookup(dictionary, key) ?? fallback, params, locale);
  const printer: PrinterOverviewRow = {
    printer: { id: "qa-printer", name: "Workshop", model: "Bambu Lab P1S", created_at: "", updated_at: "" },
    slots: [], usage: { total_jobs: 1, successful_jobs: 1, failed_jobs: 0, total_used_g: 100 },
  };
  const overview = { total_spools: 1, total_consumption_30d: 100, consumption_12m_available: true, consumption_12m: [], total_consumption_12m: 0 } as unknown as InventoryOverview;
  const spoolRows = normalizeSpoolWithMasterRows([{
    spool: { id: "qa-roll", master_id: "qa-material", status: "IN_STOCK", ownership_type: "OWNED", remaining_g: 70, initial_weight_g: 1000 },
    master: { id: "qa-material", material: "PLA", filament_name: "PLA Basic", color_name: "Black", vendor: "Example", hex_color: "#171717" },
  }]);
  const derived = buildDashboardDerivedState({ overview, printers: [printer], spoolRows, loans: [], wishlist: [], locale, t });
  Object.assign(window, { dashboardLocaleQaData: {
    ...derived, printerOverview: [printer], printerOverviewAvailable: true,
    lowStockPreview: buildDashboardLowStockPreview(spoolRows), lowStockPreviewAvailable: true,
    bambuLiveIntegrations: [],
    actionItems: buildDashboardActionItems({ bambuLiveAttention: [], loans: [], now: new Date(), spoolRows, today: "2026-10-25", wishlist: [] }),
    clientHostCompanionTone: "live", clientHostDisplayName: "QA Host", clientHostNeedsRepair: false,
    clientHostPaired: true, companionStatus: null, dashboardSyncMode: "CLIENT", error: null,
    hasSuccessfulData: true, lastSyncLabel: "QA", libraryId: "isolated-locale-qa", loading: false,
    refreshAvailable: false, refreshing: false, setupDataAvailable: true, syncSource: "client-cached",
    refreshDashboard: async () => true,
  } });
  localStorage.setItem("bfm-locale", locale);
  localStorage.setItem("filament-manager:dashboard-onboarding:v1", JSON.stringify({version: 1, dismissedAt: "2026-10-25T00:00:00Z"}));
  initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><DashboardPage /></I18nProvider>);
  return {
    title: t("dashboard.spoolsOnHand"),
    plurals: [0, 1, 2, 5, 21].map(count => t("dashboard.printerUsageSummary", "", { count, grams: "100 g" })),
  };
}
