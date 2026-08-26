import {
  liveSlotHasLoadedRoll,
  liveSlotObservedRfid,
  rowCanReceiveLiveBambuRfid,
} from "./companion_live_rfid_candidates.js";
import {
  buildPurchaseReceiptMetadataDraft,
  isEditableSpoolStatus,
  normalizeEditableSpoolStatus,
  parseSpoolStatus,
  preparePurchaseReceiptMetadataUpdate,
  purchaseReceiptMetadataValidationMessage,
} from "./companion_domain.js";
import { parseQrPayload } from "./qr_payload.js";

export function createCompanionSpoolMutations({
  state,
  fetchJson,
  refreshOverview,
  setBusy,
  setStatus,
  render,
  clearDetailFeedback,
  setDetailFeedback,
  tr,
  translateKnownCompanionError,
  openSpoolDetail,
}) {
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

  async function submitSpoolDetailsUpdate(
    spoolId,
    statusValue,
    locationValue,
    homeLocationValue,
    receiptDraft = null,
  ) {
    const trimmedSpoolId = String(spoolId || "").trim();
    const normalizedLocation = String(locationValue || "").trim();
    const normalizedHomeLocation = String(homeLocationValue || "").trim();
    const selectedDetailSpool = state.selectedDetail?.spool;
    const currentSpool =
      (String(selectedDetailSpool?.spool?.id || "").trim() === trimmedSpoolId
        ? selectedDetailSpool
        : null) ||
      (Array.isArray(state.spools) ? state.spools : []).find(
        (row) => String(row?.spool?.id || "").trim() === trimmedSpoolId,
      ) ||
      null;
    const currentStatus =
      parseSpoolStatus(currentSpool?.spool?.status) ||
      normalizeEditableSpoolStatus(currentSpool?.spool?.status);
    const requestedStatus = parseSpoolStatus(statusValue);
    const preservesAssignedStatus =
      currentStatus === "ASSIGNED" && requestedStatus === "ASSIGNED";
    const preservesBorrowedStatus =
      currentStatus === "BORROWED" && requestedStatus === "BORROWED";
    const preservesPlacementLockedStatus =
      preservesAssignedStatus || preservesBorrowedStatus;
    const normalizedStatus = preservesPlacementLockedStatus
      ? currentStatus
      : normalizeEditableSpoolStatus(statusValue);
    const currentLocation = String(currentSpool?.spool?.location_id || "").trim();
    const currentHomeLocation = String(currentSpool?.spool?.home_location_id || "").trim();

    if (!trimmedSpoolId) {
      setStatus(tr("status.selectSpoolBeforeEdit", "Select a spool before editing its details."), "error");
      render();
      return;
    }
    if (!isEditableSpoolStatus(statusValue) && !preservesPlacementLockedStatus) {
      setStatus(tr("status.invalidDetailStatus", "Choose a valid status before saving details."), "error");
      render();
      return;
    }
    const effectiveReceiptDraft =
      receiptDraft ?? buildPurchaseReceiptMetadataDraft(currentSpool?.spool);
    const receiptUpdate = preparePurchaseReceiptMetadataUpdate(
      currentSpool?.spool,
      effectiveReceiptDraft,
    );
    if (!receiptUpdate.ok) {
      setStatus(
        purchaseReceiptMetadataValidationMessage(receiptUpdate.errors, tr),
        "error",
      );
      render();
      return;
    }
    if (
      currentStatus === "BORROWED" &&
      (!preservesBorrowedStatus ||
        normalizedLocation !== currentLocation ||
        normalizedHomeLocation !== currentHomeLocation ||
        !receiptUpdate.changed)
    ) {
      setStatus(
        tr(
          "status.loanedOutEditBlocked",
          "Loaned-out spools use the companion loan return flow instead of manual status/location edits.",
        ),
        "error",
      );
      render();
      return;
    }
    const homeLocationOnlyUpdate =
      normalizedStatus === currentStatus &&
      normalizedLocation === currentLocation &&
      normalizedHomeLocation !== currentHomeLocation &&
      !receiptUpdate.changed;

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
        body: JSON.stringify(
          preservesBorrowedStatus
            ? {
                status: "BORROWED",
                purchase_metadata: receiptUpdate.value,
              }
            : {
                status: normalizedStatus,
                location: normalizedLocation || null,
                home_location: normalizedHomeLocation || null,
                ...(receiptUpdate.changed ? { purchase_metadata: receiptUpdate.value } : {}),
              },
        ),
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

  async function submitLiveSlotCandidateRfidUpdate(
    spoolId,
    printerId,
    slotId,
    rfidTagValue,
    observedAtValue,
  ) {
    const trimmedSpoolId = String(spoolId || "").trim();
    const trimmedPrinterId = String(printerId || "").trim();
    const trimmedSlotId = String(slotId || "").trim();
    const normalizedRfidTag = String(rfidTagValue || "").trim();
    const candidateRow =
      state.spools.find((row) => String(row?.spool?.id || "").trim() === trimmedSpoolId) || null;
    const printerRow =
      state.printers.find((row) => String(row?.printer?.id || "").trim() === trimmedPrinterId) || null;
    const currentSlot =
      printerRow?.slots?.find((slot) => String(slot?.slot_id || "").trim() === trimmedSlotId) || null;
    const currentObservedRfid = liveSlotObservedRfid(currentSlot);
    const currentSlotSpoolId = String(currentSlot?.spool_id || "").trim();

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
    if (!candidateRow) {
      setStatus(
        tr(
          "status.rfidLiveCandidateStale",
          "Refresh Companion data; the live slot identity changed before RFID could be saved.",
        ),
        "error",
      );
      render();
      return;
    }
    if (String(candidateRow?.spool?.rfid_tag || "").trim()) {
      setStatus(
        tr("status.rfidCandidateAlreadyRegistered", "This roll already has an RFID saved."),
        "error",
      );
      render();
      return;
    }
    if (!rowCanReceiveLiveBambuRfid(candidateRow)) {
      setStatus(
        tr(
          "status.rfidLiveCandidateStale",
          "Refresh Companion data; the live slot identity changed before RFID could be saved.",
        ),
        "error",
      );
      render();
      return;
    }
    if (
      !currentSlot ||
      (currentSlotSpoolId && currentSlotSpoolId !== trimmedSpoolId) ||
      !liveSlotHasLoadedRoll(currentSlot) ||
      currentSlot.live_match_status !== "unknown_rfid" ||
      currentObservedRfid !== normalizedRfidTag
    ) {
      setStatus(
        tr(
          "status.rfidLiveCandidateStale",
          "Refresh Companion data; the live slot identity changed before RFID could be saved.",
        ),
        "error",
      );
      render();
      return;
    }

    const currentObservedAt =
      String(currentSlot?.live_last_identity_seen_at || currentSlot?.live_printer_last_seen_at || "").trim() ||
      observedAtValue;

    await submitSpoolRfidUpdate(trimmedSpoolId, normalizedRfidTag, currentObservedAt);
  }

  async function submitQrLookup(qrCodeValue) {
    const parsedPayload = parseQrPayload(qrCodeValue);
    if (!parsedPayload?.ref) {
      setStatus(tr("status.qrLookupRequired", "Open a valid spool link before loading a spool."), "error");
      render();
      return;
    }
    const qrCode = parsedPayload.ref;

    setBusy(true);
    setStatus(tr("status.qrLookupSearching", "Opening spool link..."), "default");
    try {
      const spool = await fetchJson(`/api/v1/spools/by-qr?qr_code=${encodeURIComponent(qrCode)}`);
      const spoolId = String(spool?.spool?.id || "").trim();
      if (!spoolId) {
        throw new Error(tr("status.qrLookupMissingSpoolId", "Spool link returned no spool id"));
      }
      state.activeRootFlow = "storage";
      state.activeTaskSheet = null;
      setStatus(tr("status.qrLookupMatched", "Spool link opened."), "success");
      openSpoolDetail(spoolId, { rootFlow: "storage" });
    } catch (error) {
      setStatus(error.message || tr("status.qrLookupFailed", "Failed to open spool link."), "error");
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
    submitBorrowedInUpdate,
    submitLiveSlotCandidateRfidUpdate,
    submitPrinterSlotWeightUpdate,
    submitQrLookup,
    submitSpoolDetailsUpdate,
    submitSpoolRfidUpdate,
    submitTareWeightUpdate,
    submitWeightUpdate,
  };
}
