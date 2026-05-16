import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsPrinterMessages(t: SettingsTranslator) {
  const settingsPrinterMessageLabels = useCallback(() => ({
    bambuLiveFieldsRequired: t(
      "settings.error.bambuLiveFieldsRequired",
      "Host, access code and printer serial are required when live Bambu status is enabled.",
    ),
    confirmDeleteTapAgain: t(
      "settings.confirmDeleteTapAgain",
      "Click Remove again to confirm deleting printer",
    ),
    deletePrinterFailed: t("settings.error.deletePrinter", "Failed to delete printer."),
    printerRequired: t("settings.error.printerRequired", "Printer name and model are required."),
    removedPrinter: t("settings.removedPrinter", "Removed printer"),
    updatePrinterFailed: t("settings.error.updatePrinter", "Failed to update printer."),
    updatedPrinter: t("settings.updatedPrinter", "Updated printer"),
    writeRequiresPairing: t(
      "settings.error.librarySyncPrinterWriteRequiresPairing",
      "Pair this desktop client with the host before changing printers.",
    ),
  }), [t]);

  return { settingsPrinterMessageLabels };
}
