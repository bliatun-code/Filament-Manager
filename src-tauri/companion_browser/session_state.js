export function createBorrowedInDraft() {
  return {
    source: "bambu",
    catalogSearch: "",
    catalogStatusFilter: "ACTIVE",
    selectedMasterId: "",
    ownershipType: "OWNED",
    ownerName: "",
    ownerContact: "",
    manualVendor: "Generic",
    material: "PLA",
    filamentName: "",
    colorName: "",
    hexColor: "",
    initialWeight: "1000",
    location: "",
    note: "",
    wishlistQuantity: "1",
    wishlistNote: "",
    wishlistFilter: "ALL",
  };
}

export function createInitialCompanionState() {
  return {
    apiReady: false,
    accessMode: "trusted-lan",
    authMode: "pairing-session",
    csrfToken: "",
    pairingToken: "",
    pairingRequired: false,
    reauthPromise: null,
    statusMessage: "Waiting for a trusted-LAN pairing link.",
    statusTone: "default",
    locale: "en",
    themeMode: "auto",
    resolvedTheme: "light",
    search: "",
    loanSearch: "",
    spools: [],
    catalogMasters: [],
    wishlistItems: [],
    printers: [],
    activeLoans: [],
    loanHistory: [],
    selectedSpoolId: "",
    selectedDetail: null,
    detailRequestId: 0,
    detailFeedback: null,
    detailOpen: false,
    detailReturnRootFlow: "storage",
    selectionRecoveryReason: "",
    recoveryOpeningTarget: null,
    skipNextAutoSelect: false,
    busy: false,
    detailBusy: false,
    layoutMode: "desktop",
    compactLayout: false,
    activeRootFlow: "storage",
    activePrinterId: "",
    pendingPrinterSlotTarget: null,
    activeSection: "inventory",
    detailReturnSection: "inventory",
    loanStatusFilter: "ACTIVE",
    activeTaskSheet: null,
    expandedLoanReturnId: "",
    printerSpoolSearch: "",
    showBorrowedInForm: false,
    borrowedInDraft: createBorrowedInDraft(),
  };
}

export function resetSessionState(state) {
  const nextState = createInitialCompanionState();
  if (!state || typeof state !== "object") {
    return nextState;
  }

  const compactLayout = Boolean(state.compactLayout);
  const layoutMode = compactLayout ? "phone" : String(state.layoutMode || "desktop");
  const locale = String(state.locale || nextState.locale || "en");
  const themeMode = String(state.themeMode || nextState.themeMode || "auto");
  const resolvedTheme = String(state.resolvedTheme || nextState.resolvedTheme || "light");
  Object.assign(state, nextState, {
    compactLayout,
    layoutMode,
    locale,
    themeMode,
    resolvedTheme,
  });
  return state;
}
