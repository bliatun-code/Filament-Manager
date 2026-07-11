import { intlLocaleFor } from "../../../src-tauri/companion_browser/supported_locales.js";

export function dashboardSyncTimeLocale(locale: string): string {
  return intlLocaleFor(locale);
}

export function formatDashboardSyncTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(dashboardSyncTimeLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}
