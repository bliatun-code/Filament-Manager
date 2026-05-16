import { t } from "./companion_i18n.js";
import { createCompanionLoanMutations } from "./companion_loan_mutations.js";
import { createCompanionMutationHelpers } from "./companion_mutation_helpers.js";
import { createCompanionPrinterMutations } from "./companion_printer_mutations.js";
import { createCompanionWishlistMutations } from "./companion_wishlist_mutations.js";
import { suggestSwatchHex } from "./companion_theme.js";
import { parseQrPayload } from "./qr_payload.js";

export function createCompanionMutations(options) {
  const {
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
  } = options;
  const locale = () => state.locale || "en";
  const tr = (key, fallback, params = undefined) => t(locale(), key, fallback, params);
  const {
    findSpoolRow,
    normalizeAddSpoolValues,
    normalizeMeasuredFilamentWeight,
    postJson,
    translateKnownCompanionError,
  } = createCompanionMutationHelpers({ state, fetchJson, tr });
  const { submitPrinterSlotAssignment, submitPrinterSlotOperation } =
    createCompanionPrinterMutations({
      state,
      fetchJson,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      clearDetailFeedback,
      setDetailFeedback,
      tr,
      findSpoolRow,
    });
  const { submitBorrowedInHandBack, submitSpoolLoan, submitSpoolLoanReturn } =
    createCompanionLoanMutations({
      state,
      fetchJson,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      clearDetailFeedback,
      setDetailFeedback,
      tr,
      findSpoolRow,
      normalizeMeasuredFilamentWeight,
    });
  const { submitWishlistCreate, submitWishlistStatus, submitWishlistStock } =
    createCompanionWishlistMutations({
      state,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      setDetailFeedback,
      setDetailReturnContext,
      tr,
      normalizeAddSpoolValues,
      postJson,
    });

  async function submitWeightUpdate(spoolId, gramsValue, mutationOptions = {}) {
    const grams = Number.parseInt(gramsValue, 10);
    if (!Number.isFinite(grams) || grams < 0) {
      setStatus(
        tr("status.weightInvalid", "Enter a valid non-negative weight in grams."),
        "error",
      );
      render();
      return;
    }

    clearDetailFeedback(spoolId);
    setBusy(true);
    setStatus(tr("status.weightSaving", "Saving weight update..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(spoolId)}/weight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({ grams }),
      });
      if (mutationOptions.closeTaskSheet) {
        state.activeTaskSheet = null;
      }
      await refreshOverview();
      setDetailFeedback(
        spoolId,
        mutationOptions.detailFeedbackMessage ||
          tr("status.weightUpdatedJustNow", "Weight updated just now."),
      );
      setStatus(
        mutationOptions.statusMessage || tr("status.weightUpdated", "Weight updated."),
        "success",
      );
    } catch (error) {
      setStatus(error.message || tr("status.weightFailed", "Failed to update weight."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitPrinterSlotWeightUpdate(spoolId, gramsValue) {
    await submitWeightUpdate(spoolId, gramsValue, {
      closeTaskSheet: true,
      statusMessage: tr("status.printerSlotWeightUpdated", "Printer slot weight updated."),
      detailFeedbackMessage: tr(
        "status.printerSlotWeightUpdatedJustNow",
        "Printer slot weight updated just now.",
      ),
    });
  }

  async function submitTareWeightUpdate(spoolId, gramsValue) {
    const grams = Number.parseInt(gramsValue, 10);
    if (!Number.isFinite(grams) || grams < 0) {
      setStatus(
        tr("status.weightInvalid", "Enter a valid non-negative weight in grams."),
        "error",
      );
      render();
      return;
    }

    clearDetailFeedback(spoolId);
    setBusy(true);
    setStatus(tr("status.tareWeightSaving", "Saving empty spool weight..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(spoolId)}/tare-weight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({ grams }),
      });
      await refreshOverview();
      setDetailFeedback(spoolId, tr("status.tareWeightUpdatedJustNow", "Empty spool weight updated just now."));
      setStatus(tr("status.tareWeightUpdated", "Empty spool weight updated."), "success");
    } catch (error) {
      setStatus(
        error.message || tr("status.tareWeightFailed", "Failed to update empty spool weight."),
        "error",
      );
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitSpoolDetailsUpdate(spoolId, statusValue, locationValue, homeLocationValue) {
    const trimmedSpoolId = String(spoolId || "").trim();
    const normalizedStatus = String(statusValue || "").trim().toUpperCase();
    const normalizedLocation = String(locationValue || "").trim();
    const normalizedHomeLocation = String(homeLocationValue || "").trim();
    const currentSpool = state.spools.find((row) => String(row?.spool?.id || "").trim() === trimmedSpoolId) || null;
    const currentStatus = String(currentSpool?.spool?.status || "").trim().toUpperCase();
    const currentLocation = String(currentSpool?.spool?.location_id || "").trim();
    const currentHomeLocation = String(currentSpool?.spool?.home_location_id || "").trim();
    const homeLocationOnlyUpdate =
      normalizedStatus === currentStatus &&
      normalizedLocation === currentLocation &&
      normalizedHomeLocation !== currentHomeLocation;

    if (!trimmedSpoolId) {
      setStatus(tr("status.selectSpoolBeforeEdit", "Select a spool before editing its details."), "error");
      render();
      return;
    }
    if (!["IN_STOCK", "EMPTY", "LOST"].includes(normalizedStatus)) {
      setStatus(tr("status.invalidDetailStatus", "Choose a valid status before saving details."), "error");
      render();
      return;
    }

    clearDetailFeedback(trimmedSpoolId);
    setBusy(true);
    setStatus(tr("status.savingSpoolDetails", "Saving spool details..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(trimmedSpoolId)}/details`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          status: normalizedStatus,
          location: normalizedLocation || null,
          home_location: normalizedHomeLocation || null,
        }),
      });
      await refreshOverview();
      setDetailFeedback(
        trimmedSpoolId,
        homeLocationOnlyUpdate
          ? tr("status.homeLocationSaved", "Home location saved.")
          : tr("status.spoolDetailsUpdatedJustNow", "Details updated just now."),
      );
      setStatus(
        homeLocationOnlyUpdate
          ? tr("status.homeLocationSaved", "Home location saved.")
          : tr("status.spoolDetailsUpdated", "Spool details updated."),
        "success",
      );
    } catch (error) {
      setStatus(
        translateKnownCompanionError(error.message) ||
          (homeLocationOnlyUpdate
            ? tr("status.homeLocationSaveFailed", "Failed to save home location.")
            : tr("status.spoolDetailsUpdateFailed", "Failed to update spool details.")),
        "error",
      );
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitSpoolRfidUpdate(spoolId, rfidTagValue, observedAtValue) {
    const trimmedSpoolId = String(spoolId || "").trim();
    const normalizedRfidTag = String(rfidTagValue || "").trim();
    const normalizedObservedAt = String(observedAtValue || "").trim() || new Date().toISOString();

    if (!trimmedSpoolId) {
      setStatus(tr("status.selectSpoolBeforeEdit", "Select a spool before editing its details."), "error");
      render();
      return;
    }
    if (!normalizedRfidTag) {
      setStatus(tr("status.rfidCaptureNothingToSave", "No observed RFID was available to save."), "error");
      render();
      return;
    }

    clearDetailFeedback(trimmedSpoolId);
    setBusy(true);
    setStatus(tr("status.savingSpoolRfid", "Saving RFID..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(trimmedSpoolId)}/rfid`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          rfid_tag: normalizedRfidTag,
          rfid_observed_at: normalizedObservedAt,
        }),
      });
      await refreshOverview();
      setDetailFeedback(trimmedSpoolId, tr("status.rfidSavedJustNow", "RFID saved just now."));
      setStatus(tr("status.rfidSaved", "RFID saved."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.rfidSaveFailed", "Failed to save RFID."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitManualSpoolRegistration(values) {
    const draft = normalizeAddSpoolValues(values);
    if (draft.source !== "manual" && !draft.master) {
      setStatus(tr("status.stockCatalogRequired", "Choose a catalog filament before adding stock."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.material) {
      setStatus(tr("status.manualMaterialRequired", "Enter a material before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.filamentName) {
      setStatus(tr("status.manualFilamentRequired", "Enter a filament name before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.colorName) {
      setStatus(tr("status.manualColorRequired", "Enter a color before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.ownershipType === "BORROWED_IN" && !draft.ownerName) {
      setStatus(tr("status.borrowedInOwnerRequired", "Enter who the borrowed-in spool is borrowed from."), "error");
      render();
      return;
    }
    if (draft.hexColorText && !draft.normalizedHexColor) {
      setStatus(tr("status.swatchHexInvalid", "Enter a valid swatch hex with #RGB or #RRGGBB."), "error");
      render();
      return;
    }
    if (
      draft.initialWeightText &&
      (!Number.isFinite(draft.parsedInitialWeight) || draft.parsedInitialWeight < 0)
    ) {
      setStatus(
        tr("status.startingWeightInvalid", "Enter a valid non-negative starting weight in grams."),
        "error",
      );
      render();
      return;
    }

    const requestPath =
      draft.ownershipType === "BORROWED_IN" ? "/api/v1/spools/borrowed-in" : "/api/v1/spools/owned";
    const requestBody =
      draft.source === "manual"
        ? {
            material: draft.material,
            filament_name: draft.filamentName,
            color_name: draft.colorName,
            vendor: draft.vendor || null,
            initial_weight_g: draft.initialWeight,
            location: draft.location || null,
            hex_color:
              draft.normalizedHexColor ||
              suggestSwatchHex(
                draft.colorName,
                draft.filamentName,
                draft.vendor,
                draft.material,
              ),
            ...(draft.ownershipType === "BORROWED_IN"
              ? {
                  owner_name: draft.ownerName,
                  owner_contact: draft.ownerContact || null,
                  ownership_note: draft.note || null,
                }
              : {}),
          }
        : {
            master_id: draft.master.id,
            initial_weight_g: draft.initialWeight,
            location: draft.location || null,
            ...(draft.ownershipType === "BORROWED_IN"
              ? {
                  owner_name: draft.ownerName,
                  owner_contact: draft.ownerContact || null,
                  ownership_note: draft.note || null,
                }
              : {}),
          };

    setBusy(true);
    setStatus(
      draft.ownershipType === "BORROWED_IN"
        ? tr("status.borrowedInRegistering", "Registering borrowed-in spool...")
        : tr("status.stockAdding", "Adding spool to inventory..."),
      "default",
    );
    try {
      const payload = await postJson(requestPath, requestBody);
      const spoolId = String(payload?.spool_id || "").trim();
      state.activeTaskSheet = null;
      state.showBorrowedInForm = false;
      state.borrowedInDraft = createBorrowedInDraft();
      state.activeRootFlow = "storage";
      if (spoolId) {
        state.selectedSpoolId = spoolId;
        setDetailReturnContext("storage");
        state.detailOpen = true;
      }
      await refreshOverview();
      if (spoolId) {
        setDetailFeedback(
          spoolId,
          draft.ownershipType === "BORROWED_IN"
            ? tr("status.borrowedInRegisteredJustNow", "Borrowed-in spool registered just now.")
            : tr("status.stockAddedJustNow", "Spool added to inventory just now."),
        );
      }
      setStatus(
        draft.ownershipType === "BORROWED_IN"
          ? tr("status.borrowedInRegistered", "Borrowed-in spool registered.")
          : tr("status.stockAdded", "Spool added to inventory."),
        "success",
      );
    } catch (error) {
      setStatus(
        error.message ||
          (draft.ownershipType === "BORROWED_IN"
            ? tr("status.borrowedInRegisterFailed", "Failed to register borrowed-in spool.")
            : tr("status.stockAddFailed", "Failed to add spool to inventory.")),
        "error",
      );
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitQrLookup(qrCodeValue) {
    const parsedPayload = parseQrPayload(qrCodeValue);
    if (!parsedPayload?.ref) {
      setStatus(tr("status.qrLookupRequired", "Enter a QR code before looking up a spool."), "error");
      render();
      return;
    }
    const qrCode = parsedPayload.ref;

    setBusy(true);
    setStatus(tr("status.qrLookupSearching", "Looking up QR code..."), "default");
    try {
      const spool = await fetchJson(`/api/v1/spools/by-qr?qr_code=${encodeURIComponent(qrCode)}`);
      const spoolId = String(spool?.spool?.id || "").trim();
      if (!spoolId) {
        throw new Error(tr("status.qrLookupMissingSpoolId", "QR lookup returned no spool id"));
      }
      state.activeRootFlow = "storage";
      state.activeTaskSheet = null;
      setStatus(tr("status.qrLookupMatched", "QR code matched local spool."), "success");
      openSpoolDetail(spoolId, { rootFlow: "storage" });
    } catch (error) {
      setStatus(error.message || tr("status.qrLookupFailed", "Failed to look up QR code."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitBorrowedInUpdate(spoolId, ownerNameValue, ownerContactValue, noteValue) {
    const trimmedSpoolId = spoolId.trim();
    const ownerName = ownerNameValue.trim();
    const ownerContact = ownerContactValue.trim();
    const note = noteValue.trim();

    if (!trimmedSpoolId) {
      setStatus(tr("status.borrowedInSelectBeforeUpdate", "Select a borrowed-in spool before updating its details."), "error");
      render();
      return;
    }
    if (!ownerName) {
      setStatus(tr("status.borrowedInOwnerRequired", "Enter who the borrowed-in spool is borrowed from."), "error");
      render();
      return;
    }

    clearDetailFeedback(trimmedSpoolId);
    setBusy(true);
    setStatus(tr("status.borrowedInSaving", "Saving borrowed-in details..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(trimmedSpoolId)}/borrowed-in`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          owner_name: ownerName,
          owner_contact: ownerContact || null,
          ownership_note: note || null,
        }),
      });
      await refreshOverview();
      setDetailFeedback(trimmedSpoolId, tr("status.borrowedInUpdatedJustNow", "Borrowed-in details updated just now."));
      setStatus(tr("status.borrowedInUpdated", "Borrowed-in details updated."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.borrowedInUpdateFailed", "Failed to update borrowed-in details."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  return {
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
  };
}
