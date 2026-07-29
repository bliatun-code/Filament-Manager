import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "../lib/number_display";
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
  locale: NumberDisplayLocale = "en",
): string {
  return `${labels.catalogResetDone}. ${labels.removed} ${formatDisplayInteger(
    result.removed_count,
    locale,
  )}, ${labels.remaining} ${formatDisplayInteger(
    result.remaining_count,
    locale,
  )}, ${labels.reactivated} ${formatDisplayInteger(result.reactivated_count, locale)}.`;
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
