export type EmptyWeightDisplay = "dash" | "zero";

export function formatGrams(
  value?: number | null,
  empty: EmptyWeightDisplay = "dash",
): string {
  if (value == null) {
    return empty === "zero" ? "0 g" : "—";
  }
  return `${Math.max(0, value)} g`;
}

export function parsePositiveWeight(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
