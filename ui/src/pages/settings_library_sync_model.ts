import type { LibrarySyncSettings } from "../lib/tauri_client";

export type LibrarySyncMode = "STANDALONE" | "HOST" | "CLIENT";

export type LibrarySyncMigrationStepId =
  | "host_access"
  | "export"
  | "validate"
  | "import"
  | "save";

export type LibrarySyncMigrationModel = {
  kind: "host" | "client" | "takeover";
  showSaveAction: boolean;
  steps: Array<{
    id: LibrarySyncMigrationStepId;
    done: boolean;
  }>;
};

export type LibraryRoleChangeState = {
  target: LibrarySyncMode | null;
  fromClient: boolean;
  toHost: boolean;
  toClient: boolean;
  toStandalone: boolean;
  roleActuallyChanges: boolean;
  leavingClient: boolean;
  requiresExport: boolean;
  requiresValidate: boolean;
  requiresImport: boolean;
  validateDone: boolean;
  ready: boolean;
};

export type LibrarySyncVisibilityState = {
  showDeviceFields: boolean;
  showWebappDetails: boolean;
  standaloneWebappEnabled: boolean;
  clientHasStatusDetails: boolean;
  clientHasSnapshot: boolean;
};

export type LibrarySyncRoleOption = {
  mode: LibrarySyncMode;
  label: string;
};

export type LibrarySyncRoleOptionLabels = Record<LibrarySyncMode, string>;

export type LibrarySyncTabLabels = {
  title: string;
};

export type LibrarySyncClientState = {
  savedMode: LibrarySyncMode;
  readOnly: boolean;
  hostBaseUrl: string | null;
  libraryId: string | null;
  hostWritePaired: boolean;
  hostNeedsRepair: boolean;
  hostPairingValid: boolean;
};

export type LibrarySyncActionMessageKey =
  | "clientAuthCleared"
  | "clientPaired"
  | "deviceNameSaved"
  | "hostCheckPassed"
  | "renewPairing"
  | "settingsSaved"
  | "snapshotRefreshed";

export type LibrarySyncActionMessageLabels = Record<LibrarySyncActionMessageKey, string>;

export type LibrarySyncPairingMessageKey =
  | "pairHostFailed"
  | "pairingInvalid"
  | "pairingLinkRequired";

export type LibrarySyncPairingMessageLabels = Record<LibrarySyncPairingMessageKey, string>;

export type LibrarySyncErrorMessageKey =
  | "clearClientAuthFailed"
  | "deviceNameSaveFailed"
  | "hostCheckFailed"
  | "settingsSaveFailed"
  | "snapshotFailed";

export type LibrarySyncErrorMessageLabels = Record<LibrarySyncErrorMessageKey, string>;

export function normalizeLibrarySyncMode(mode: string | null | undefined): LibrarySyncMode {
  return mode === "HOST" || mode === "CLIENT" ? mode : "STANDALONE";
}

export function buildLibrarySyncActionMessage(
  action: LibrarySyncActionMessageKey,
  labels: LibrarySyncActionMessageLabels,
): string {
  return labels[action];
}

export function buildLibrarySyncPairingMessage(
  key: LibrarySyncPairingMessageKey,
  labels: LibrarySyncPairingMessageLabels,
): string {
  return labels[key];
}

export function buildLibrarySyncErrorMessage(
  key: LibrarySyncErrorMessageKey,
  labels: LibrarySyncErrorMessageLabels,
): string {
  return labels[key];
}

export function buildLibrarySyncRoleOptions(
  labels: LibrarySyncRoleOptionLabels,
): LibrarySyncRoleOption[] {
  return [
    { mode: "STANDALONE", label: labels.STANDALONE },
    { mode: "HOST", label: labels.HOST },
    { mode: "CLIENT", label: labels.CLIENT },
  ];
}

export function buildLibrarySyncTabLabels(labels: LibrarySyncTabLabels): LibrarySyncTabLabels {
  return labels;
}

export function buildLibrarySyncClientState(input: {
  mode: string | null | undefined;
  hostBaseUrl: string | null | undefined;
  libraryId: string | null | undefined;
  clientAuthPaired: boolean | null | undefined;
  pairingChecked: boolean | null | undefined;
  pairingValid: boolean | null | undefined;
}): LibrarySyncClientState {
  const savedMode = normalizeLibrarySyncMode(input.mode);
  const hostWritePaired = Boolean(input.clientAuthPaired);
  const pairingChecked = Boolean(input.pairingChecked);
  const pairingValid = input.pairingValid !== false;

  return {
    savedMode,
    readOnly: savedMode === "CLIENT",
    hostBaseUrl: input.hostBaseUrl ?? null,
    libraryId: input.libraryId ?? null,
    hostWritePaired,
    hostNeedsRepair: hostWritePaired && pairingChecked && !pairingValid,
    hostPairingValid: !hostWritePaired || !pairingChecked || pairingValid,
  };
}

export function buildLibrarySyncSaveSettingsInput(input: {
  current: LibrarySyncSettings;
  targetMode: LibrarySyncMode;
  deviceName: string;
  hostBaseUrlDraft: string;
}): LibrarySyncSettings {
  const clientMode = input.targetMode === "CLIENT";

  return {
    mode: input.targetMode,
    device_name: input.deviceName,
    library_id: input.current.library_id,
    host_base_url: clientMode ? input.hostBaseUrlDraft : null,
    host_device_name: clientMode ? input.current.host_device_name ?? null : null,
    client_auth_paired: clientMode ? input.current.client_auth_paired ?? false : false,
    client_auth_paired_at: clientMode ? input.current.client_auth_paired_at ?? null : null,
    client_auth_expires_at: clientMode ? input.current.client_auth_expires_at ?? null : null,
  };
}

export function buildLibrarySyncPairingSettingsInput(input: {
  deviceName: string;
  libraryId: string;
  hostBaseUrl: string;
  hostDeviceName: string | null | undefined;
}): LibrarySyncSettings {
  return {
    mode: "CLIENT",
    device_name: input.deviceName,
    library_id: input.libraryId,
    host_base_url: input.hostBaseUrl,
    host_device_name: input.hostDeviceName ?? null,
    client_auth_paired: false,
    client_auth_paired_at: null,
    client_auth_expires_at: null,
  };
}

export function shouldShowLibraryWebappDetails(input: {
  draftMode: LibrarySyncMode;
  trustedLanEnabledDraft: boolean;
  trustedLanStatusEnabled: boolean;
  showTrustedLanNetworkEditor: boolean;
  hasTrustedLanPairingLink: boolean;
  pairedBrowserCount: number;
}): boolean {
  return (
    input.draftMode === "HOST" ||
    input.trustedLanEnabledDraft ||
    input.trustedLanStatusEnabled ||
    input.showTrustedLanNetworkEditor ||
    input.hasTrustedLanPairingLink ||
    input.pairedBrowserCount > 0
  );
}

export function buildLibrarySyncVisibilityState(input: {
  draftMode: LibrarySyncMode;
  trustedLanEnabledDraft: boolean;
  trustedLanStatusEnabled: boolean;
  showTrustedLanNetworkEditor: boolean;
  hasTrustedLanPairingLink: boolean;
  pairedBrowserCount: number;
  lastCheckedAt: string | null | undefined;
  lastReachableAt: string | null | undefined;
  lastValidationMessage: string | null | undefined;
  hasSnapshot: boolean;
}): LibrarySyncVisibilityState {
  return {
    showDeviceFields: input.draftMode === "HOST",
    showWebappDetails: shouldShowLibraryWebappDetails(input),
    standaloneWebappEnabled: input.draftMode === "STANDALONE" && input.trustedLanEnabledDraft,
    clientHasStatusDetails: Boolean(
      input.lastCheckedAt || input.lastReachableAt || input.lastValidationMessage,
    ),
    clientHasSnapshot: input.hasSnapshot,
  };
}

export function buildLibraryRoleChangeState(input: {
  target: LibrarySyncMode | null;
  savedMode: LibrarySyncMode;
  hasExportedFullBackup: boolean;
  hasImportedFullBackup: boolean;
  hasValidatedFullBackup: boolean;
  hasValidatedLatestFullBackup: boolean;
}): LibraryRoleChangeState {
  const roleActuallyChanges = Boolean(input.target) && input.target !== input.savedMode;
  const leavingClient = input.savedMode === "CLIENT";
  const requiresExport = roleActuallyChanges && !leavingClient;
  const requiresValidate = requiresExport;
  const requiresImport = false;
  const validateDone = requiresExport
    ? input.hasExportedFullBackup && input.hasValidatedFullBackup
    : input.hasValidatedLatestFullBackup;

  return {
    target: input.target,
    fromClient: input.savedMode === "CLIENT",
    toHost: input.target === "HOST",
    toClient: input.target === "CLIENT",
    toStandalone: input.target === "STANDALONE",
    roleActuallyChanges,
    leavingClient,
    requiresExport,
    requiresValidate,
    requiresImport,
    validateDone,
    ready:
      (!requiresExport || input.hasExportedFullBackup) &&
      (!requiresValidate || validateDone) &&
      (!requiresImport || input.hasImportedFullBackup),
  };
}

export function buildLibrarySyncMigrationModel(input: {
  draftMode: LibrarySyncMode;
  savedMode: LibrarySyncMode;
  hostReadyForClients: boolean;
  hasValidatedFullBackup: boolean;
  hasExportedFullBackup: boolean;
  hasImportedFullBackup: boolean;
}): LibrarySyncMigrationModel {
  const {
    draftMode,
    savedMode,
    hostReadyForClients,
    hasValidatedFullBackup,
    hasExportedFullBackup,
    hasImportedFullBackup,
  } = input;

  const takeoverDraft = savedMode !== "HOST" && draftMode === "HOST";
  if (takeoverDraft) {
    return {
      kind: "takeover",
      showSaveAction: true,
      steps: [
        { id: "validate", done: hasValidatedFullBackup },
        { id: "import", done: hasImportedFullBackup },
        { id: "save", done: false },
      ],
    };
  }

  if (draftMode === "HOST") {
    return {
      kind: "host",
      showSaveAction: false,
      steps: [
        { id: "host_access", done: hostReadyForClients },
        { id: "export", done: hasExportedFullBackup },
      ],
    };
  }

  return {
    kind: "client",
    showSaveAction: false,
    steps: [
      { id: "validate", done: hasValidatedFullBackup },
      { id: "import", done: hasImportedFullBackup },
    ],
  };
}
