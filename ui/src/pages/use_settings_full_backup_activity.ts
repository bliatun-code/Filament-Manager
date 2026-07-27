import { useCallback, useState } from "react";
import {
  readLatestFullBackupExport,
  recordLatestFullBackupExport,
} from "./settings_full_backup_activity";

export function useSettingsFullBackupActivity() {
  const [latestFullBackupExportedAt, setLatestFullBackupExportedAt] = useState<string | null>(
    readLatestFullBackupExport,
  );

  const recordFullBackupExport = useCallback((exportedAt: string) => {
    const normalized = recordLatestFullBackupExport(exportedAt);
    if (normalized) {
      setLatestFullBackupExportedAt(normalized);
    }
  }, []);

  return {
    latestFullBackupExportedAt,
    recordFullBackupExport,
  };
}
