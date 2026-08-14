import { invoke, isTauri } from "./tauri_invoke";

export type BackupValidationStats = {
  format: string;
  expected_tables: number;
  present_tables: number;
  total_rows: number;
  missing_tables: string[];
  extra_tables: string[];
};

export type ImportDataStats = {
  detected_format: string;
  imported_count: number;
  created_count: number;
  updated_count: number;
};

export type DiagnosticCheckStatus = "ok" | "issues_found" | "unavailable";

export type DatabaseDiagnostics = {
  available: boolean;
  schema_version: number | null;
  supported_schema_version: number;
  quick_check: DiagnosticCheckStatus;
  foreign_key_check: DiagnosticCheckStatus;
  journal_mode: string | null;
  size_bytes: number | null;
  local_db_path: string;
};

export type ApplicationDiagnostics = {
  generated_at_ms: number;
  app_version: string;
  database: DatabaseDiagnostics;
};

export type AppUpdateStatus =
  | "UPDATE_AVAILABLE"
  | "UP_TO_DATE"
  | "DEVELOPMENT_BUILD"
  | "RELEASE_INFO_UNAVAILABLE"
  | "UPDATE_CHANNEL_DISABLED";

export type AppUpdateChannel = "DISABLED" | "PUBLIC_METADATA";

export type DesktopLifecycleSettings = {
  continue_in_background: boolean;
  launch_at_login: boolean;
  tray_available: boolean;
};

export type AppUpdateCheckResult = {
  current_version: string;
  latest_version: string | null;
  latest_tag: string | null;
  release_url: string;
  status: AppUpdateStatus;
  update_channel: AppUpdateChannel;
};

export async function getAppVersion() {
  return invoke<string>("get_app_version");
}

export async function getDesktopLifecycleSettings() {
  return invoke<DesktopLifecycleSettings>("get_desktop_lifecycle_settings");
}

export async function setContinueInBackground(enabled: boolean) {
  return invoke<DesktopLifecycleSettings>("set_continue_in_background", { enabled });
}

export async function setLaunchAtLogin(enabled: boolean) {
  return invoke<DesktopLifecycleSettings>("set_launch_at_login", { enabled });
}

export async function setDesktopTrayMenuLabels(openLabel: string, quitLabel: string) {
  return invoke<void>("set_desktop_tray_menu_labels", { openLabel, quitLabel });
}

export async function getApplicationDiagnostics() {
  return invoke<ApplicationDiagnostics>("get_application_diagnostics");
}

export async function getSanitizedSupportBundleJson() {
  return invoke<string>("get_sanitized_support_bundle_json");
}

export async function checkForAppUpdate() {
  return invoke<AppUpdateCheckResult>("check_for_app_update");
}

export async function resetAppData() {
  return invoke<void>("reset_app_data");
}

export async function exportFullBackupJson() {
  return invoke<{ content: string }>("export_full_backup_json");
}

export async function fetchLibrarySyncFullBackupJson(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
) {
  return invoke<{ content: string }>("fetch_library_sync_full_backup_json", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
}

export async function importFullBackupJson(content: string) {
  return invoke<void>("import_full_backup_json", { content });
}

export async function validateFullBackupJson(content: string) {
  return invoke<BackupValidationStats>("validate_full_backup_json", { content });
}

export async function setDockIconTheme(theme: "light" | "dark") {
  return invoke<void>("set_dock_icon_theme", { theme });
}

function openInBrowser(url: string) {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openExternalUrl(url: string) {
  if (!isTauri()) {
    openInBrowser(url);
    return;
  }

  try {
    await invoke<void>("open_external_url", { url });
  } catch {
    openInBrowser(url);
  }
}

export async function setWindowTitle(title: string) {
  if (typeof document !== "undefined") {
    document.title = title;
  }

  if (!isTauri()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}
