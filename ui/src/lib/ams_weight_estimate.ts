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

export function formatAmsWeightNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
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
  remainingGrams,
  remainingPercent,
  trayWeightG,
}: {
  basisLabel?: string;
  estimateLabel?: string;
  remainingGrams?: number | null;
  remainingPercent?: number | null;
  trayWeightG?: number | null;
}): string | null {
  const grams = saneAmsRemainingGrams(remainingGrams);
  const percent = saneAmsRemainingPercent(remainingPercent);
  const trayWeight = saneAmsSpoolWeight(trayWeightG);

  if (grams != null && trayWeight != null) {
    const percentNote = percent != null ? ` · ${formatAmsWeightNumber(percent)}%` : "";
    return `${estimateLabel}: ${formatAmsWeightNumber(grams)} g / ${formatAmsWeightNumber(
      trayWeight,
    )} g${percentNote}`;
  }
  if (grams != null) {
    return `${estimateLabel}: ${formatAmsWeightNumber(grams)} g`;
  }
  if (percent != null) {
    return `${estimateLabel}: ${formatAmsWeightNumber(percent)}%`;
  }
  if (trayWeight != null) {
    return `${basisLabel}: ${formatAmsWeightNumber(trayWeight)} g`;
  }
  return null;
}
