import type { useI18n } from "../lib/i18n";
import {
  buildLibrarySyncRoleOptions,
  buildLibrarySyncTabLabels,
} from "./settings_library_sync_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsLibraryChrome(t: SettingsTranslator) {
  const librarySyncRoleOptions = buildLibrarySyncRoleOptions({
    STANDALONE: t("settings.librarySyncStandalone", "Standalone"),
    HOST: t("settings.librarySyncHost", "Host"),
    CLIENT: t("settings.librarySyncClient", "Client"),
  });
  const librarySyncTabLabels = buildLibrarySyncTabLabels({
    title: t("settings.libraryTabTitle", "Library and web app"),
  });

  return {
    librarySyncRoleOptions,
    librarySyncTabLabels,
  };
}
