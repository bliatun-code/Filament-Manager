import { useSettingsBackupMessages } from "./use_settings_backup_messages";
import { useSettingsCatalogMessages } from "./use_settings_catalog_messages";
import { useSettingsInventoryPrintMessages } from "./use_settings_inventory_print_messages";
import { useSettingsLibrarySyncMessages } from "./use_settings_library_sync_messages";
import { useSettingsMaintenanceMessages } from "./use_settings_maintenance_messages";
import { useSettingsPrinterMessages } from "./use_settings_printer_messages";
import { useSettingsSwatchMessages } from "./use_settings_swatch_messages";
import { useSettingsTrustedLanMessages } from "./use_settings_trusted_lan_messages";

type TranslateFn = (key: string, fallback?: string) => string;

export function useSettingsMessageLabels(t: TranslateFn) {
  return {
    backup: useSettingsBackupMessages(t),
    catalog: useSettingsCatalogMessages(t),
    inventoryPrint: useSettingsInventoryPrintMessages(t),
    librarySync: useSettingsLibrarySyncMessages(t),
    maintenance: useSettingsMaintenanceMessages(t),
    printer: useSettingsPrinterMessages(t),
    swatch: useSettingsSwatchMessages(t),
    trustedLan: useSettingsTrustedLanMessages(t),
  };
}
