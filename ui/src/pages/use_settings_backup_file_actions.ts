import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SettingsTabKey } from "./settings_page_model";
import type { Locale } from "../lib/i18n";
import { clearDashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";
import { toErrorMessage } from "../lib/error_text";
import {
  importDataFile,
  validateFullBackupJson,
  type BackupValidationStats,
  type CatalogResetStats,
  type LibrarySyncHostValidationResult,
  type LibrarySyncRemoteSnapshot,
} from "../lib/tauri_client";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupValidationSuccessMessage,
  buildSettingsImportSuccessMessage,
  resolveSettingsFullBackupImportedAt,
  shouldPrepareImportedFullBackupAsHost,
  type SettingsBackupErrorMessageLabels,
  type SettingsBackupValidationMessageLabels,
  type SettingsImportMessageLabels,
} from "./settings_backup_model";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsBackupFileActionsInput = {
  busy: boolean;
  clearBackupValidation: () => void;
  clearConfirmResetAction: () => void;
  librarySyncModeDraft: LibrarySyncMode;
  locale: Locale;
  recordBackupValidation: (summary: BackupValidationStats, validatedAt: string) => void;
  recordImportedFullBackup: (importedAt: string) => void;
  reloadSettings: () => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<SettingsTabKey>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setLastCatalogReset: Dispatch<SetStateAction<CatalogResetStats | null>>;
  setLibrarySyncHostBaseUrlDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncModeDraft: Dispatch<SetStateAction<LibrarySyncMode>>;
  setLibrarySyncSnapshot: Dispatch<SetStateAction<LibrarySyncRemoteSnapshot | null>>;
  setLibrarySyncValidation: Dispatch<SetStateAction<LibrarySyncHostValidationResult | null>>;
  settingsBackupErrorMessageLabels: () => SettingsBackupErrorMessageLabels;
  settingsBackupValidationMessageLabels: () => SettingsBackupValidationMessageLabels;
  settingsClientReadOnly: boolean;
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientTargetGeneration: number | null;
  settingsImportMessageLabels: () => SettingsImportMessageLabels;
  tauri: boolean;
  t: (key: string, fallback?: string) => string;
};

type BackupFileActionScope = { key: string; active: boolean };
type BackupImportConfirmation = {
  fileName: string;
  returnFocusElement: HTMLElement | null;
  scope: BackupFileActionScope;
  resolve: (confirmed: boolean) => void;
};

function declaresFullBackupFormat(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content.replace(/^\uFEFF+/, "").trim());
    return typeof parsed === "object" && parsed !== null &&
      "format" in parsed && typeof parsed.format === "string" &&
      parsed.format.startsWith("filament-manager-backup-");
  } catch {
    return false;
  }
}

export function useSettingsBackupFileActions({
  busy,
  clearBackupValidation,
  clearConfirmResetAction,
  librarySyncModeDraft,
  locale,
  recordBackupValidation,
  recordImportedFullBackup,
  reloadSettings,
  setActiveTab,
  setBusy,
  setError,
  setInfo,
  setLastCatalogReset,
  setLibrarySyncHostBaseUrlDraft,
  setLibrarySyncModeDraft,
  setLibrarySyncSnapshot,
  setLibrarySyncValidation,
  settingsBackupErrorMessageLabels,
  settingsBackupValidationMessageLabels,
  settingsClientReadOnly,
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientTargetGeneration,
  settingsImportMessageLabels,
  tauri,
  t,
}: UseSettingsBackupFileActionsInput) {
  const scopeKey = JSON.stringify([
    tauri, settingsClientReadOnly, librarySyncModeDraft,
    settingsClientHostBaseUrl, settingsClientLibraryId, settingsClientTargetGeneration,
  ]);
  const scopeRef = useRef<BackupFileActionScope | null>(null);
  const confirmationRef = useRef<BackupImportConfirmation | null>(null);
  const [confirmation, setConfirmation] = useState<BackupImportConfirmation | null>(null);

  useLayoutEffect(() => {
    const scope: BackupFileActionScope = { key: scopeKey, active: false };
    scopeRef.current = scope;
    setConfirmation(null);
    return () => {
      scopeRef.current = null;
      confirmationRef.current?.resolve(false);
      confirmationRef.current = null;
      if (scope.active) setBusy(false);
      scope.active = false;
    };
  }, [scopeKey, setBusy]);

  function resolveConfirmation(confirmed: boolean) {
    if (!confirmation || confirmationRef.current !== confirmation) return;
    const current = scopeRef.current === confirmation.scope && confirmation.scope.key === scopeKey;
    // Enable the chooser in the same render that dismisses Cancel so the
    // modal can restore keyboard focus to it. The synchronous scope lock is
    // still held until the cancelled handler settles in finally.
    if (!confirmed && current) setBusy(false);
    confirmationRef.current = null;
    setConfirmation(null);
    confirmation.resolve(confirmed && current && tauri && !settingsClientReadOnly);
  }

  async function handleImportDataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const scope = scopeRef.current;
    if (!file || !tauri || busy || settingsClientReadOnly || !scope || scope.key !== scopeKey || scope.active) {
      return;
    }
    scope.active = true;
    const isCurrent = () => scopeRef.current === scope;
    // Busy disables the chooser before file reading/preflight completes. Keep
    // its original focus target instead of capturing the body when the dialog opens.
    const returnFocusElement = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      if (!isCurrent()) return;
      let fullBackupValidation: BackupValidationStats | null = null;
      try {
        fullBackupValidation = await validateFullBackupJson(content);
      } catch (validationError) {
        // Match the backend's declared-backup recognition. A failed preflight
        // must never turn a restore into an unconfirmed import attempt.
        if (declaresFullBackupFormat(content)) throw validationError;
        // Inventory CSV/JSON imports are not full-library restores and continue
        // through the non-destructive merge path below. Malformed input is
        // rejected by the command-side preflight before any write occurs.
      }
      if (!isCurrent()) return;
      if (fullBackupValidation) {
        const confirmed = await new Promise<boolean>((resolve) => {
          const pending = { fileName: file.name, returnFocusElement, scope, resolve };
          confirmationRef.current = pending;
          setConfirmation(pending);
        });
        if (!confirmed || !isCurrent()) return;
      }
      const result = await importDataFile(content);
      if (!isCurrent()) return;
      if (fullBackupValidation) {
        clearDashboardPageSnapshot();
      }
      setLastCatalogReset(null);
      clearBackupValidation();
      const fullBackupImportedAt = resolveSettingsFullBackupImportedAt({
        detectedFormat: result.detected_format,
        importedAt: new Date().toISOString(),
      });
      if (fullBackupImportedAt) {
        recordImportedFullBackup(fullBackupImportedAt);
      }
      // The restore is already committed. Its refresh can legitimately replace
      // this scope with the restored library's identity, or fail independently.
      setInfo(buildSettingsImportSuccessMessage({
        importedOnClient: false,
        labels: settingsImportMessageLabels(),
        locale,
        result,
      }));
      try {
        await reloadSettings();
      } catch (reloadError) {
        if (isCurrent()) {
          console.error(reloadError);
          setError(t("settings.error.load", "Failed to load settings."));
        }
        return;
      }
      if (!isCurrent()) return;
      if (fullBackupImportedAt && shouldPrepareImportedFullBackupAsHost({
        detectedFormat: result.detected_format,
        librarySyncMode: librarySyncModeDraft,
      })) {
        setLibrarySyncModeDraft("HOST");
        setLibrarySyncHostBaseUrlDraft("");
        setLibrarySyncValidation(null);
        setLibrarySyncSnapshot(null);
        setActiveTab("GENERAL");
        setInfo(buildSettingsImportSuccessMessage({
          importedOnClient: true,
          labels: settingsImportMessageLabels(),
          locale,
          result,
        }));
      }
    } catch (importError) {
      if (!isCurrent()) return;
      console.error(importError);
      setError(
        toErrorMessage(
          importError,
          buildSettingsBackupErrorMessage("importDataFailed", settingsBackupErrorMessageLabels()),
          t,
        ),
      );
    } finally {
      if (isCurrent()) {
        scope.active = false;
        setBusy(false);
      }
    }
  }

  async function handleValidateBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const scope = scopeRef.current;
    if (!file || !tauri || busy || !scope || scope.key !== scopeKey || scope.active) {
      return;
    }
    scope.active = true;
    const isCurrent = () => scopeRef.current === scope;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      if (!isCurrent()) return;
      const summary = await validateFullBackupJson(content);
      if (!isCurrent()) return;
      recordBackupValidation(summary, new Date().toISOString());
      setInfo(buildSettingsBackupValidationSuccessMessage(settingsBackupValidationMessageLabels()));
    } catch (validationError) {
      if (!isCurrent()) return;
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          buildSettingsBackupErrorMessage(
            "validateBackupFailed",
            settingsBackupErrorMessageLabels(),
          ),
          t,
        ),
      );
    } finally {
      if (isCurrent()) {
        scope.active = false;
        setBusy(false);
      }
    }
  }

  return {
    backupImportConfirmation: {
      fileName: confirmation?.scope.key === scopeKey ? confirmation.fileName : null,
      returnFocusElement: confirmation?.returnFocusElement ?? null,
      onConfirm: () => resolveConfirmation(true),
      onCancel: () => resolveConfirmation(false),
    },
    handleImportDataFile,
    handleValidateBackupFile,
  };
}
