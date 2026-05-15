import type { CatalogResetStats } from "../lib/tauri_client";

export type SettingsCatalogResetMessageLabels = {
  catalogResetDone: string;
  reactivated: string;
  remaining: string;
  removed: string;
};

export function buildSettingsCatalogResetMessage(
  result: CatalogResetStats,
  labels: SettingsCatalogResetMessageLabels,
): string {
  return `${labels.catalogResetDone}. ${labels.removed} ${result.removed_count}, ${labels.remaining} ${result.remaining_count}, ${labels.reactivated} ${result.reactivated_count}.`;
}
