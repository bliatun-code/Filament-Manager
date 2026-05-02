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

export function parsePositiveWeight(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
