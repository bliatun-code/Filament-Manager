import { formatDisplayGrams, type NumberDisplayLocale } from "./number_display";

export type EmptyWeightDisplay = "dash" | "zero";

export function formatGrams(
  value?: number | null,
  empty: EmptyWeightDisplay = "dash",
  locale: NumberDisplayLocale = "en",
): string {
  if (value == null) {
    return empty === "zero" ? formatDisplayGrams(0, locale) : "—";
  }
  return formatDisplayGrams(Math.max(0, value), locale);
}

export function parsePositiveWeight(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
