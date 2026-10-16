import { normalizeSwatchValue } from "../lib/color_utils";
import type { FilamentConsumptionRow } from "../lib/tauri_client";

export type StatisticsAnalysisView = "CONSUMPTION" | "VALUE" | "PRINTERS";
export const STATISTICS_ANALYSIS_VIEWS: readonly StatisticsAnalysisView[] = [
  "CONSUMPTION",
  "VALUE",
  "PRINTERS",
];

export function statisticsAnalysisTabId(view: StatisticsAnalysisView): string {
  return `statistics-view-${view.toLowerCase()}`;
}

export function statisticsAnalysisPanelId(view: StatisticsAnalysisView): string {
  return `statistics-panel-${view.toLowerCase()}`;
}

export function nextStatisticsAnalysisView(
  current: StatisticsAnalysisView,
  key: string,
): StatisticsAnalysisView | null {
  const currentIndex = STATISTICS_ANALYSIS_VIEWS.indexOf(current);
  if (key === "Home") return STATISTICS_ANALYSIS_VIEWS[0];
  if (key === "End") return STATISTICS_ANALYSIS_VIEWS[STATISTICS_ANALYSIS_VIEWS.length - 1];
  if (key === "ArrowRight") {
    return STATISTICS_ANALYSIS_VIEWS[(currentIndex + 1) % STATISTICS_ANALYSIS_VIEWS.length];
  }
  if (key === "ArrowLeft") {
    return STATISTICS_ANALYSIS_VIEWS[
      (currentIndex - 1 + STATISTICS_ANALYSIS_VIEWS.length) % STATISTICS_ANALYSIS_VIEWS.length
    ];
  }
  return null;
}

export type StatisticsMaterialBreakdownRow = {
  material: string;
  usedGrams: number;
  colors: { color: string | null; usedGrams: number }[];
};

/** A material split of real period rows, never a synthesized time series or job count. */
export function buildStatisticsMaterialBreakdown(
  rows: readonly FilamentConsumptionRow[],
): StatisticsMaterialBreakdownRow[] {
  const materials = new Map<string, { usedGrams: number; colors: Map<string | null, number> }>();
  for (const row of rows) {
    if (!Number.isFinite(row.used_grams) || row.used_grams <= 0) continue;
    const material = row.material.trim();
    const current = materials.get(material) ?? { usedGrams: 0, colors: new Map() };
    const color = normalizeSwatchValue(row.hex_color, { uppercase: true });
    current.usedGrams += row.used_grams;
    current.colors.set(color, (current.colors.get(color) ?? 0) + row.used_grams);
    materials.set(material, current);
  }
  return Array.from(materials, ([material, row]) => ({
    material,
    usedGrams: row.usedGrams,
    colors: Array.from(row.colors, ([color, usedGrams]) => ({ color, usedGrams }))
      .sort((left, right) => right.usedGrams - left.usedGrams),
  })).sort((left, right) => right.usedGrams - left.usedGrams || left.material.localeCompare(right.material));
}
