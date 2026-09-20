import { appErrorCode, toErrorMessage } from "../lib/error_text";

type Translate = (key: string, fallback?: string) => string;

export function settingsBackupFileError(error: unknown, fileName: string, fallback: string, t: Translate): string {
  let message: string;
  switch (appErrorCode(error)) {
    case "document.file_empty":
      message = t("settings.importFileEmpty", "This file is empty. Choose an export containing data.");
      break;
    case "document.json_invalid":
      message = t("settings.importJsonInvalid", "The JSON file is damaged or incomplete. Export or download it again, then retry.");
      break;
    case "document.backup_unsupported":
      message = t("settings.importBackupUnsupported", "This backup version is not supported. Update Filament Manager or choose a backup exported by this version.");
      break;
    case "document.backup_invalid":
      message = t("settings.importBackupInvalid", "This is not a complete Filament Manager backup. Choose a full backup JSON exported from Program maintenance.");
      break;
    case "document.inventory_invalid":
      message = t("settings.importInventoryInvalid", "Invalid inventory data. Use an exported inventory CSV or JSON. Each row needs spool_id, material, filament_name and color_name; weights must be non-negative whole grams.");
      break;
    default:
      message = toErrorMessage(error, fallback, t);
  }
  return `${fileName}: ${message}`;
}
