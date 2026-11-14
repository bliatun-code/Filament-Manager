import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import { trustedUpdateInstaller } from "../lib/app_update_check";
import { openExternalUrl, type AppUpdateCheckResult } from "../lib/tauri_maintenance_client";

export function AppUpdateDownloadLink({ className, result, t }: {
  className: string;
  result: AppUpdateCheckResult;
  t: (key: string, fallback: string, params?: MessageParams) => string;
}) {
  const installer = trustedUpdateInstaller(result);
  if (!installer) return null;
  const platform = installer.platform === "macos" ? "macOS" : "Windows x64";

  return (
    <a
      className={className}
      href={installer.url}
      onClick={(event) => {
        event.preventDefault();
        void openExternalUrl(installer.url);
      }}
    >
      {t("settings.downloadInstaller", "Download for {platform}", { platform })}
    </a>
  );
}
