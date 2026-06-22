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

export async function getAppVersion() {
  return invoke<string>("get_app_version");
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
