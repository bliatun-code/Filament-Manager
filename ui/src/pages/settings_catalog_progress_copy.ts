import type { CatalogRefreshOperationKind } from "../lib/catalog_refresh_operation";
import type { useI18n } from "../lib/i18n";
import type { SettingsCatalogVendor } from "./settings_catalog_model";

type TranslateFn = ReturnType<typeof useI18n>["t"];

/** Keep backend diagnostics out of the primary status and translate at render time. */
export function settingsCatalogProgressCopy({
  kind,
  phase,
  unavailable,
  vendor,
  t,
}: {
  kind: CatalogRefreshOperationKind;
  phase: string;
  unavailable: boolean;
  vendor: SettingsCatalogVendor;
  t: TranslateFn;
}): { phase: string; message: string } {
  let phaseLabel: string;
  let message: string;
  switch (phase) {
    case "PREPARE":
      phaseLabel = t("printers.liveTelemetryPreparing", "Preparing");
      message = kind === "AUDIT"
        ? t("settings.discoveringCatalogMaterials", "Discovering available materials")
        : vendor === "eSUN"
          ? t("wishlist.refreshPreparingEsun", "Preparing eSUN catalog refresh...")
          : t("wishlist.refreshPreparingBambu", "Preparing Bambu catalog refresh...");
      break;
    case "DISCOVER":
      phaseLabel = t("settings.librarySyncChecking", "Checking...");
      message = t("settings.discoveringCatalogMaterials", "Discovering available materials");
      break;
    case "FETCH":
      phaseLabel = t("common.loading", "Loading...");
      message = phaseLabel;
      break;
    case "IMPORT":
      phaseLabel = t("settings.librarySyncSaving", "Saving...");
      message = phaseLabel;
      break;
    case "RUNNING":
      // Host job receipts report RUNNING for the whole operation, not a subphase.
      phaseLabel = t("wishlist.refreshing", "Refreshing");
      message = phaseLabel;
      break;
    case "SUCCEEDED":
      phaseLabel = t("statistics.completed", "Completed");
      message = phaseLabel;
      break;
    case "FAILED":
      phaseLabel = t("printers.failed", "Failed");
      message = kind === "AUDIT"
        ? t(
            "settings.catalogAuditFailedNextStep",
            "The check was not completed. Check the refresh log, then use Discover available materials to try again.",
          )
        : t(
            "settings.catalogRefreshFailedNextStep",
            "The update was not completed. Check the refresh log before starting another update.",
          );
      break;
    case "INTERRUPTED":
      phaseLabel = t("printers.failed", "Failed");
      message = t(
        "settings.catalogRefreshInterruptedNextStep",
        "The update was interrupted. Check the catalog and refresh log before starting again.",
      );
      break;
    default:
      // An older/newer Host may send a phase this client does not understand.
      phaseLabel = t("common.loading", "Loading...");
      message = phaseLabel;
  }
  return {
    phase: phaseLabel,
    // A later status-read failure cannot undo an authoritative terminal receipt.
    message: unavailable && !["SUCCEEDED", "FAILED", "INTERRUPTED"].includes(phase)
      ? t(
          "settings.catalogRefreshStatusUncertain",
          "Status could not be confirmed. Check the refresh log; the update may still be running.",
        )
      : message,
  };
}
