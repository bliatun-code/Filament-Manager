import { useDocumentVisiblePolling } from "../lib/use_document_visible_polling";

type UseSettingsSilentReloadInput = {
  reloadSettings: (options?: {
    revisionCheck?: boolean;
    silent?: boolean;
  }) => Promise<void>;
  tauri: boolean;
};

export function useSettingsSilentReload({
  reloadSettings,
  tauri,
}: UseSettingsSilentReloadInput) {
  useDocumentVisiblePolling({
    enabled: tauri,
    intervalMs: 15_000,
    poll: async () => {
      try {
        await reloadSettings({ revisionCheck: true, silent: true });
        return true;
      } catch {
        return false;
      }
    },
  });
}
