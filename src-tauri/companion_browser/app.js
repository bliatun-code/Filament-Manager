import { createCompanionApiClient } from "./companion_api_client.js";
import { createCompanionAppShellRenderer } from "./companion_app_shell.js";
import { createCompanionDataController } from "./companion_data_controller.js";
import { installCompanionDomEvents } from "./companion_dom_events.js";
import {
  COMPANION_LOCALE_STORAGE_KEY,
  normalizeCompanionLocale,
  resolveInitialCompanionLocale,
  t,
} from "./companion_i18n.js";
import { createCompanionLogic } from "./companion_logic.js";
import { createCompanionMutations } from "./companion_mutations.js";
import { createCompanionRuntimeState } from "./companion_runtime_state.js";
import { renderMarkupPreservingFocus } from "./companion_render_focus.js";
import { createCompanionShellState, detectCompanionLayoutMode } from "./companion_shell_state.js";
import {
  applyCompanionThemeMode,
  COMPANION_THEME_STORAGE_KEY,
  normalizeThemeMode,
  readCompanionMediaQuery,
  readStoredCompanionThemeMode,
  resolveCompanionTheme,
  subscribeToMediaQueryChange,
} from "./companion_theme.js";
import { parseQrPayload } from "./qr_payload.js";
import { createInitialCompanionState, createBorrowedInDraft, resetSessionState } from "./session_state.js";

const root = document.getElementById("app");
const THEME_STORAGE_KEY = COMPANION_THEME_STORAGE_KEY;
const LOCALE_STORAGE_KEY = COMPANION_LOCALE_STORAGE_KEY;
const COMPANION_ICON_LIGHT_HREF = "/companion/icon-light.png";
const COMPANION_ICON_DARK_HREF = "/companion/icon-dark.png";
const RECOVERY_SECTIONS = new Set(["inventory", "printers", "detail", "loans"]);
const RECOVERY_SECTION_LABELS = {
  inventory: "Storage",
  printers: "Printers",
  detail: "Detail",
  loans: "Loans",
};

function syncRecoverySectionLabels(locale) {
  const nextLocale = normalizeCompanionLocale(locale);
  RECOVERY_SECTION_LABELS.inventory = t(nextLocale, "nav.storage", "Storage");
  RECOVERY_SECTION_LABELS.printers = t(nextLocale, "nav.printers", "Printers");
  RECOVERY_SECTION_LABELS.detail = t(nextLocale, "detail.openDetail", "Detail");
  RECOVERY_SECTION_LABELS.loans = t(nextLocale, "nav.loans", "Loans");
}

const state = createInitialCompanionState();
const companionLogic = createCompanionLogic({
  state,
  sections: RECOVERY_SECTIONS,
  sectionLabels: RECOVERY_SECTION_LABELS,
});
const { selectionClearedAfterBorrowedInHandBack } = companionLogic;

const companionRuntimeState = createCompanionRuntimeState({
  state,
  render,
});
const { setStatus, setBusy, setDetailFeedback, clearDetailFeedback } = companionRuntimeState;

const companionApiClient = createCompanionApiClient({
  session: state,
  setStatus,
  render,
});
const { pairSession, renewSession, readSessionStatus, fetchJson } = companionApiClient;

const companionShellState = createCompanionShellState({
  state,
  render,
  resetSessionState,
});
const {
  applyLayoutMode,
  clearInventorySearch,
  closeActiveTaskSheet,
  closeDetailModal,
  ensureActivePrinterSelection,
  openDetailModal,
  selectPrinter,
  selectCatalogMaster,
  setAddSpoolSource,
  setCatalogStatusFilter,
  setFilamentOwnership,
  setBorrowedInDraftField,
  setDetailReturnContext,
  setLoanStatusFilter,
  setPrinterSpoolSearch,
  startLoanPicker,
  startLoanCreate,
  startPrinterWeightUpdate,
  setWishlistQueueFilter,
  startPrinterSlotAssignment,
  setRootFlow,
  showAllLoans,
  syncLegacySectionState,
  toggleBorrowedInForm,
  toggleLoanReturn,
} = companionShellState;

const companionDataController = createCompanionDataController({
  state,
  pairSession,
  renewSession,
  fetchJson,
  render,
  setBusy,
  setStatus,
  setDetailReturnContext,
  openDetailModal,
  ensureActivePrinterSelection,
  selectionClearedAfterBorrowedInHandBack,
  readLocationHref: () => window.location.href,
  replaceLocationHref: (nextUrl) => {
    window.history.replaceState({}, "", nextUrl);
  },
});
const { pairAndLoad, renewAndLoad, openSpoolDetail, refreshOverview } = companionDataController;

const companionAppShellRenderer = createCompanionAppShellRenderer({
  state,
  companionLogic,
  syncLegacySectionState,
});

function detectLayoutMode() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  return detectCompanionLayoutMode(width);
}

function readBrowserGlobal(name) {
  try {
    return globalThis?.[name] ?? null;
  } catch {
    return null;
  }
}

function readBrowserStorage() {
  return readBrowserGlobal("localStorage");
}

function readStoredThemeMode() {
  return readStoredCompanionThemeMode(THEME_STORAGE_KEY, readBrowserStorage());
}

function persistCompanionPreference(storageKey, value) {
  try {
    readBrowserStorage()?.setItem?.(storageKey, value);
  } catch {
    // Browser storage is best-effort; the in-memory companion state still updates.
  }
}

function iconHrefForTheme(theme) {
  return theme === "dark" ? COMPANION_ICON_DARK_HREF : COMPANION_ICON_LIGHT_HREF;
}

function syncCompanionIconLinks(resolvedTheme = state.resolvedTheme) {
  const effectiveTheme =
    resolvedTheme === "dark" || resolvedTheme === "light"
      ? resolvedTheme
      : resolveCompanionTheme(state.themeMode || "auto", window);
  const nextHref = iconHrefForTheme(effectiveTheme);
  const favicon = document.getElementById("companion-favicon");
  if (favicon && favicon.getAttribute("href") !== nextHref) {
    favicon.setAttribute("href", nextHref);
  }
  const appleTouchIcon = document.getElementById("companion-apple-touch-icon");
  if (appleTouchIcon && appleTouchIcon.getAttribute("href") !== nextHref) {
    appleTouchIcon.setAttribute("href", nextHref);
  }
}

function setThemeMode(nextMode) {
  const normalizedMode = normalizeThemeMode(nextMode);
  state.themeMode = normalizedMode;
  state.resolvedTheme = applyCompanionThemeMode(normalizedMode, document, window);
  syncCompanionIconLinks(state.resolvedTheme);
  persistCompanionPreference(THEME_STORAGE_KEY, normalizedMode);
  render();
}

function setLocale(nextLocale) {
  const normalizedLocale = normalizeCompanionLocale(nextLocale);
  state.locale = normalizedLocale;
  syncRecoverySectionLabels(normalizedLocale);
  persistCompanionPreference(LOCALE_STORAGE_KEY, normalizedLocale);
  setStatus(
    normalizedLocale === "nb"
      ? t(normalizedLocale, "status.languageSetNb", "Language set to Norwegian.")
      : t(normalizedLocale, "status.languageSetEn", "Language set to English."),
    "success",
  );
}

function installThemeWatcher() {
  const media = readCompanionMediaQuery(window, "(prefers-color-scheme: dark)");
  let lastResolvedTheme = state.resolvedTheme;
  const sync = () => {
    if (state.themeMode !== "auto") {
      return;
    }
    const nextResolved = resolveCompanionTheme("auto", window);
    applyCompanionThemeMode("auto", document, window);
    if (nextResolved !== lastResolvedTheme) {
      lastResolvedTheme = nextResolved;
      state.resolvedTheme = nextResolved;
      syncCompanionIconLinks(nextResolved);
      render();
      return;
    }
    state.resolvedTheme = nextResolved;
    syncCompanionIconLinks(nextResolved);
  };

  subscribeToMediaQueryChange(media, sync);
  // iOS Safari/PWA can miss media-query change events while backgrounded.
  // Re-sync whenever the page becomes active again.
  window.addEventListener("focus", sync);
  window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      sync();
    }
  });
  // Fallback for iOS cases where media-query change events are unreliable.
  window.setInterval(sync, 1500);
  return sync;
}

function installLayoutWatcher() {
  const sync = () => {
    applyLayoutMode(detectLayoutMode());
  };

  sync();
  window.addEventListener("resize", sync);
}

function clearUrlParam(paramName) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete(paramName);
  window.history.replaceState({}, "", nextUrl.toString());
}

function readQrLookupFromUrl() {
  const currentUrl = new URL(window.location.href);
  const rawPayload =
    currentUrl.searchParams.get("spool_qr") ||
    currentUrl.searchParams.get("qr_code") ||
    "";
  const parsed = parseQrPayload(rawPayload);
  return parsed ? rawPayload.trim() : "";
}

async function openQrFromUrlIfPresent() {
  const rawPayload = readQrLookupFromUrl();
  if (!rawPayload) {
    return;
  }
  clearUrlParam("spool_qr");
  clearUrlParam("qr_code");
  await submitQrLookup(rawPayload);
}

async function initializeCompanionEntry() {
  const url = new URL(window.location.href);
  const pairTokenFromUrl = url.searchParams.get("pairing")?.trim() ?? "";
  state.pairingToken = pairTokenFromUrl;
  render();

  try {
    const sessionStatus = await readSessionStatus();
    if (sessionStatus?.authenticated) {
      await refreshOverview();
      await openQrFromUrlIfPresent();
      return;
    }

    if (state.pairingToken) {
      await pairAndLoad(state.pairingToken, { fromUrl: true });
      await openQrFromUrlIfPresent();
      return;
    }
    if (sessionStatus?.can_renew) {
      await renewAndLoad();
      await openQrFromUrlIfPresent();
      return;
    }
    state.pairingRequired = true;
    setStatus(
      t(
        state.locale || "en",
        "status.trustedLanAwaitPairing",
        "Open a pairing link from desktop Settings to start this trusted-LAN browser session.",
      ),
      "default",
    );
    render();
  } catch (error) {
    setStatus(
      error?.message ||
        t(
          state.locale || "en",
          "status.sessionStatusFailed",
          "Failed to verify current companion session.",
        ),
      "error",
    );
    render();
  }

}

function main() {
  installLayoutWatcher();
  installThemeWatcher();

  state.locale = resolveInitialCompanionLocale(
    readBrowserStorage(),
    readBrowserGlobal("navigator"),
  );
  syncRecoverySectionLabels(state.locale);
  state.themeMode = readStoredThemeMode();
  state.resolvedTheme = applyCompanionThemeMode(state.themeMode, document, window);
  syncCompanionIconLinks(state.resolvedTheme);

  render();
  void initializeCompanionEntry();
}

const companionMutations = createCompanionMutations({
  state,
  fetchJson,
  refreshOverview,
  setBusy,
  setStatus,
  render,
  clearDetailFeedback,
  setDetailFeedback,
  createBorrowedInDraft,
  setDetailReturnContext,
  openSpoolDetail,
});
const {
  submitWeightUpdate,
  submitPrinterSlotWeightUpdate,
  submitPrinterSlotOperation,
  submitTareWeightUpdate,
  submitSpoolDetailsUpdate,
  submitSpoolRfidUpdate,
  submitPrinterSlotAssignment,
  submitSpoolLoan,
  submitSpoolLoanReturn,
  submitManualSpoolRegistration,
  submitWishlistCreate,
  submitWishlistStatus,
  submitWishlistStock,
  submitQrLookup,
  submitBorrowedInUpdate,
  submitBorrowedInHandBack,
} = companionMutations;

let overlayScrollLocked = false;
let overlayLockedScrollY = 0;
let overlayTouchGuardEnabled = false;

function handleOverlayTouchMove(event) {
  if (!(state.detailOpen || state.activeTaskSheet)) {
    return;
  }
  const target = event?.target;
  if (target && typeof target.closest === "function") {
    const overlayScroller = target.closest(".detail-modal-body, .task-sheet-body");
    if (overlayScroller) {
      return;
    }
  }
  event.preventDefault?.();
}

function syncOverlayScrollLock() {
  const shouldLock = Boolean(state.detailOpen || state.activeTaskSheet);
  if (shouldLock === overlayScrollLocked) {
    return;
  }

  const { body, documentElement } = document;
  if (shouldLock) {
    overlayLockedScrollY = window.scrollY || window.pageYOffset || 0;
    body.dataset.overlayLocked = "true";
    body.style.position = "fixed";
    body.style.top = `-${overlayLockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    documentElement.style.overflow = "hidden";
    if (!overlayTouchGuardEnabled) {
      document.addEventListener("touchmove", handleOverlayTouchMove, { passive: false });
      overlayTouchGuardEnabled = true;
    }
    overlayScrollLocked = true;
    return;
  }

  delete body.dataset.overlayLocked;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  documentElement.style.overflow = "";
  if (overlayTouchGuardEnabled) {
    document.removeEventListener("touchmove", handleOverlayTouchMove);
    overlayTouchGuardEnabled = false;
  }
  window.scrollTo(0, overlayLockedScrollY);
  overlayScrollLocked = false;
}

function render() {
  syncOverlayScrollLock();
  renderMarkupPreservingFocus({
    root,
    documentRef: document,
    markup: companionAppShellRenderer.renderRoot(),
  });
}

installCompanionDomEvents({
  documentRef: document,
  root,
  state,
  closeActiveTaskSheet,
  closeDetailModal,
  setStatus,
  refreshOverview,
  setRootFlow,
  startLoanPicker,
  startLoanCreate,
  startPrinterSlotAssignment,
  startPrinterWeightUpdate,
  toggleBorrowedInForm,
  setAddSpoolSource,
  setCatalogStatusFilter,
  setFilamentOwnership,
  selectCatalogMaster,
  toggleLoanReturn,
  selectPrinter,
  openSpoolDetail,
  clearInventorySearch,
  showAllLoans,
  setLoanStatusFilter,
  setWishlistQueueFilter,
  setPrinterSpoolSearch,
  submitPrinterSlotAssignment,
  submitWishlistStatus,
  submitWishlistStock,
  render,
  setBorrowedInDraftField,
  submitWeightUpdate,
  submitPrinterSlotWeightUpdate,
  submitPrinterSlotOperation,
  submitTareWeightUpdate,
  submitSpoolDetailsUpdate,
  submitSpoolRfidUpdate,
  submitSpoolLoan,
  submitSpoolLoanReturn,
  submitManualSpoolRegistration,
  submitWishlistCreate,
  submitBorrowedInUpdate,
  submitBorrowedInHandBack,
  setThemeMode,
  setLocale,
});

main();
