export const SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY =
  "filament-manager:settings-full-backup-activity:v1";

const SETTINGS_FULL_BACKUP_ACTIVITY_VERSION = 1;

type SettingsFullBackupActivityRecord = {
  version: typeof SETTINGS_FULL_BACKUP_ACTIVITY_VERSION;
  exportedAt: string;
};

export type SettingsFullBackupActivityStorage = Pick<Storage, "getItem" | "setItem">;

function normalizeExportedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveLocalStorage(): SettingsFullBackupActivityStorage | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

export function readLatestFullBackupExport(
  storage: SettingsFullBackupActivityStorage | null = resolveLocalStorage(),
): string | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SettingsFullBackupActivityRecord> | null;
    if (
      !parsed ||
      parsed.version !== SETTINGS_FULL_BACKUP_ACTIVITY_VERSION
    ) {
      return null;
    }
    return normalizeExportedAt(parsed.exportedAt);
  } catch {
    return null;
  }
}

export function recordLatestFullBackupExport(
  exportedAt: string,
  storage: SettingsFullBackupActivityStorage | null = resolveLocalStorage(),
): string | null {
  const normalized = normalizeExportedAt(exportedAt);
  if (!normalized) {
    return null;
  }
  if (storage) {
    const record: SettingsFullBackupActivityRecord = {
      version: SETTINGS_FULL_BACKUP_ACTIVITY_VERSION,
      exportedAt: normalized,
    };
    try {
      storage.setItem(SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Persistence is best-effort. The caller can still keep the returned value in memory.
    }
  }
  return normalized;
}
