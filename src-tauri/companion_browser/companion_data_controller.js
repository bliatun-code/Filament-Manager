import { t } from "./companion_i18n.js";
import { isLoanCurrentlyActive } from "./companion_loan_state.js";

function normalizeDetailRootFlow(rootFlow) {
  return rootFlow === "printers" || rootFlow === "loans" ? rootFlow : "storage";
}

export function createCompanionDataController(options) {
  const {
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
    readLocationHref,
    replaceLocationHref,
  } = options;

  function clearUrlParam(paramName) {
    if (typeof readLocationHref !== "function" || typeof replaceLocationHref !== "function") {
      return;
    }
    try {
      const cleanUrl = new URL(readLocationHref());
      cleanUrl.searchParams.delete(paramName);
      replaceLocationHref(cleanUrl.toString());
    } catch {
      // URL cleanup is best-effort; pairing and data refresh should still succeed.
    }
  }

  async function finishAuthenticatedLoad(message) {
    setStatus(message, "success");
    await refreshOverview();
  }

  async function pairAndLoad(token, pairOptions = {}) {
    const locale = state.locale || "en";
    const trimmed = String(token || "").trim();
    if (!trimmed) {
      setStatus(
        t(
          locale,
          "status.trustedLanPairingMissing",
          "Open a pairing link from desktop Settings to start this trusted-LAN browser session.",
        ),
        "default",
      );
      render();
      return;
    }

    setBusy(true);
    setStatus(
      t(locale, "status.trustedLanPairing", "Pairing trusted-LAN browser..."),
      "default",
    );
    try {
      await pairSession(trimmed);
      if (pairOptions.fromUrl) {
        clearUrlParam("pairing");
      }
      await finishAuthenticatedLoad(
        t(
          locale,
          "status.trustedLanReady",
          "Trusted-LAN browser session ready.",
        ),
      );
    } catch (error) {
      state.apiReady = false;
      state.csrfToken = "";
      state.pairingRequired = true;
      setStatus(
        error.message ||
          t(locale, "status.trustedLanPairFailed", "Failed to pair trusted-LAN browser."),
        "error",
      );
    } finally {
      setBusy(false);
      render();
    }
  }

  async function renewAndLoad() {
    const locale = state.locale || "en";
    setBusy(true);
    setStatus(
      t(
        locale,
        "status.trustedLanRenewing",
        "Trusted-LAN session expired. Trying paired browser renewal...",
      ),
      "default",
    );
    try {
      await renewSession();
      await finishAuthenticatedLoad(
        t(
          locale,
          "status.trustedLanRestored",
          "Trusted-LAN session restored.",
        ),
      );
    } catch (error) {
      state.apiReady = false;
      state.csrfToken = "";
      state.pairingRequired = true;
      setStatus(
        error.message ||
          t(locale, "status.trustedLanRenewFailed", "Failed to renew trusted-LAN session."),
        "error",
      );
    } finally {
      setBusy(false);
      render();
    }
  }

  async function refreshOverview() {
    setBusy(true);
    try {
      const [spools, catalogMasters, wishlistItems, printers, loanHistory] = await Promise.all([
        fetchJson("/api/v1/inventory/spools?limit=500&offset=0"),
        fetchJson("/api/v1/catalog/masters?limit=2000"),
        fetchJson("/api/v1/wishlist?limit=500"),
        fetchJson("/api/v1/printers/overview"),
        fetchJson("/api/v1/loans?limit=300&include_returned=true"),
      ]);
      state.spools = Array.isArray(spools) ? spools : [];
      state.catalogMasters = Array.isArray(catalogMasters) ? catalogMasters : [];
      state.wishlistItems = Array.isArray(wishlistItems) ? wishlistItems : [];
      state.printers = Array.isArray(printers) ? printers : [];
      state.loanHistory = Array.isArray(loanHistory) ? loanHistory : [];
      state.activeLoans = state.loanHistory.filter(isLoanCurrentlyActive);
      ensureActivePrinterSelection();

      const selectedStillExists = state.selectedSpoolId
        ? state.spools.some((row) => row.spool.id === state.selectedSpoolId)
        : false;

      if (state.selectedSpoolId && !selectedStillExists) {
        state.selectedSpoolId = "";
        state.selectedDetail = null;
        state.detailFeedback = null;
        state.detailOpen = false;
      }

      if (
        !state.selectedSpoolId &&
        state.spools.length > 0 &&
        !state.skipNextAutoSelect &&
        !selectionClearedAfterBorrowedInHandBack()
      ) {
        state.selectedSpoolId = state.spools[0].spool.id;
      }
      state.skipNextAutoSelect = false;

      if (state.selectedSpoolId) {
        await loadSpoolDetail(state.selectedSpoolId, {
          activateDetail: false,
          preserveExistingDetail: true,
        });
      } else {
        state.selectedDetail = null;
        state.detailBusy = false;
      }

      setStatus(t(state.locale || "en", "status.refreshed", "Companion data refreshed."), "success");
    } catch (error) {
      setStatus(
        error.message ||
          t(state.locale || "en", "status.refreshFailed", "Failed to load companion data."),
        "error",
      );
    } finally {
      setBusy(false);
      render();
    }
  }

  async function loadSpoolDetail(spoolId, detailOptions = {}) {
    if (!spoolId) {
      state.detailRequestId += 1;
      state.selectedDetail = null;
      state.selectedSpoolId = "";
      state.detailFeedback = null;
      state.detailBusy = false;
      state.detailOpen = false;
      render();
      return;
    }

    if (state.detailFeedback?.spoolId && state.detailFeedback.spoolId !== spoolId) {
      state.detailFeedback = null;
    }

    const deferSelectionUntilLoaded = Boolean(detailOptions.deferSelectionUntilLoaded);
    if (!deferSelectionUntilLoaded) {
      state.selectionRecoveryReason = "";
      state.recoveryOpeningTarget = null;
      state.selectedSpoolId = spoolId;
    }

    const existingDetailSpoolId = state.selectedDetail?.spool?.spool?.id || "";
    const preserveExistingDetail =
      Boolean(detailOptions.preserveExistingDetail) && existingDetailSpoolId === spoolId;
    if (!preserveExistingDetail) {
      state.selectedDetail = null;
    }

    if (detailOptions.activateDetail) {
      openDetailModal(detailOptions.rootFlow);
    }

    const requestId = state.detailRequestId + 1;
    state.detailRequestId = requestId;
    state.detailBusy = true;
    render();

    try {
      const detail = await fetchJson(
        `/api/v1/spools/${encodeURIComponent(spoolId)}?history_limit=24&usage_limit=48`,
      );
      if (state.detailRequestId !== requestId) {
        return;
      }
      state.selectedSpoolId = spoolId;
      state.selectionRecoveryReason = "";
      state.recoveryOpeningTarget = null;
      state.selectedDetail = detail;
    } catch (error) {
      if (state.detailRequestId !== requestId) {
        return;
      }
      if (deferSelectionUntilLoaded) {
        state.selectedSpoolId = "";
      }
      setStatus(
        error.message ||
          t(state.locale || "en", "status.detailLoadFailed", "Failed to load spool detail."),
        "error",
      );
    } finally {
      if (state.detailRequestId === requestId) {
        state.detailBusy = false;
        render();
      }
    }
  }

  function openSpoolDetail(spoolId, source = {}) {
    const rootFlow = normalizeDetailRootFlow(source.rootFlow);
    setDetailReturnContext(rootFlow);
    void loadSpoolDetail(spoolId, {
      activateDetail: true,
      rootFlow,
      preserveExistingDetail: true,
    });
  }

  return {
    pairAndLoad,
    renewAndLoad,
    loadSpoolDetail,
    openSpoolDetail,
    refreshOverview,
  };
}
