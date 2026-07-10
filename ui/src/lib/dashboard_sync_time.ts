export function dashboardSyncTimeLocale(locale: string): string {
  if (locale === "nb") {
    return "nb-NO";
  }
  if (locale === "en") {
    return "en-US";
  }
  return locale;
}

export function formatDashboardSyncTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(dashboardSyncTimeLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}
