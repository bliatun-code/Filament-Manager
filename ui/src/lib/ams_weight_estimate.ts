import {
  formatDisplayGrams,
  formatDisplayNumber,
  formatDisplayPercent,
  type NumberDisplayLocale,
} from "./number_display";

export function finiteAmsWeightNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function saneAmsRemainingGrams(value: number | null | undefined): number | null {
  const finite = finiteAmsWeightNumber(value);
  return finite != null && finite >= 0 ? finite : null;
}

export function saneAmsRemainingPercent(value: number | null | undefined): number | null {
  const finite = finiteAmsWeightNumber(value);
  return finite != null && finite >= 0 && finite <= 100 ? finite : null;
}

export function saneAmsSpoolWeight(value: number | null | undefined): number | null {
  const finite = finiteAmsWeightNumber(value);
  return finite != null && finite > 0 ? finite : null;
}

export function formatAmsWeightNumber(
  value: number,
  locale: NumberDisplayLocale = "en",
): string {
  return formatDisplayNumber(value, locale, {
    maximumFractionDigits: 1,
  });
}

export function deriveAmsRemainingGrams(
  remainingPercent: number | null | undefined,
  trayWeightG: number | null | undefined,
): number | null {
  const percent = saneAmsRemainingPercent(remainingPercent);
  const weight = saneAmsSpoolWeight(trayWeightG);
  return percent != null && weight != null ? Math.round((weight * percent) / 100) : null;
}

export function formatAmsWeightEstimate({
  basisLabel = "AMS spool basis",
  estimateLabel = "AMS estimate",
  locale = "en",
  remainingGrams,
  remainingPercent,
  trayWeightG,
}: {
  basisLabel?: string;
  estimateLabel?: string;
  locale?: NumberDisplayLocale;
  remainingGrams?: number | null;
  remainingPercent?: number | null;
  trayWeightG?: number | null;
}): string | null {
  const grams = saneAmsRemainingGrams(remainingGrams);
  const percent = saneAmsRemainingPercent(remainingPercent);
  const trayWeight = saneAmsSpoolWeight(trayWeightG);

  if (grams != null && trayWeight != null) {
    const percentNote =
      percent != null ? ` · ${formatDisplayPercent(percent, locale, 1)}` : "";
    return `${estimateLabel}: ${formatDisplayGrams(grams, locale)} / ${formatDisplayGrams(trayWeight, locale)}${percentNote}`;
  }
  if (grams != null) {
    return `${estimateLabel}: ${formatDisplayGrams(grams, locale)}`;
  }
  if (percent != null) {
    return `${estimateLabel}: ${formatDisplayPercent(percent, locale, 1)}`;
  }
  if (trayWeight != null) {
    return `${basisLabel}: ${formatDisplayGrams(trayWeight, locale)}`;
  }
  return null;
}
