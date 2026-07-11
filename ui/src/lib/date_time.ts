import type { Locale } from "./i18n";
import { formatLocaleDateTime } from "../../../src-tauri/companion_browser/locale_format.js";

export function parseDateTimeMs(raw?: string | null): number | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getTime();
}

export function parseDateTime(raw?: string | null): Date | null {
  const parsedMs = parseDateTimeMs(raw);
  return parsedMs == null ? null : new Date(parsedMs);
}

export function formatDateTime(raw: string, locale: Locale): string {
  const parsedMs = parseDateTimeMs(raw);
  if (parsedMs == null) {
    return raw;
  }
  return formatLocaleDateTime(new Date(parsedMs), locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
