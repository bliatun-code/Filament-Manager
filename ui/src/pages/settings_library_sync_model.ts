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
