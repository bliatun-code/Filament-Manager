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
