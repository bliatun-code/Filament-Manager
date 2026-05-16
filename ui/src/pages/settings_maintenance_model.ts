import type { CatalogResetStats } from "../lib/tauri_client";

export type SettingsCatalogResetMessageLabels = {
  catalogResetDone: string;
  reactivated: string;
  remaining: string;
  removed: string;
};

export type SettingsResetAction = "app" | "catalog";
export type SettingsResetConfirmAction = "APP" | "CATALOG";

export type SettingsMaintenanceResetMessageLabels = {
  appResetDone: string;
  confirmResetAppTapAgain: string;
  confirmResetCatalogsTapAgain: string;
  resetAppFailed: string;
  resetCatalogsFailed: string;
};

export type SettingsMaintenanceErrorAction = "app" | "catalog";

export function buildSettingsCatalogResetMessage(
  result: CatalogResetStats,
  labels: SettingsCatalogResetMessageLabels,
): string {
  return `${labels.catalogResetDone}. ${labels.removed} ${result.removed_count}, ${labels.remaining} ${result.remaining_count}, ${labels.reactivated} ${result.reactivated_count}.`;
}

export function buildSettingsResetConfirmMessage(
  action: SettingsResetAction,
  labels: Pick<
    SettingsMaintenanceResetMessageLabels,
    "confirmResetAppTapAgain" | "confirmResetCatalogsTapAgain"
  >,
): string {
  return action === "app" ? labels.confirmResetAppTapAgain : labels.confirmResetCatalogsTapAgain;
}

export function shouldArmSettingsResetAction(
  current: SettingsResetConfirmAction | null,
  target: SettingsResetConfirmAction,
): boolean {
  return current !== target;
}

export function buildSettingsAppResetSuccessMessage(
  labels: Pick<SettingsMaintenanceResetMessageLabels, "appResetDone">,
): string {
  return labels.appResetDone;
}

export function buildSettingsMaintenanceErrorMessage(
  action: SettingsMaintenanceErrorAction,
  labels: Pick<SettingsMaintenanceResetMessageLabels, "resetAppFailed" | "resetCatalogsFailed">,
): string {
  return action === "app" ? labels.resetAppFailed : labels.resetCatalogsFailed;
}
