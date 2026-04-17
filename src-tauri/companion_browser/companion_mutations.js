import { t } from "./companion_i18n.js";
import { normalizeHex, suggestSwatchHex } from "./companion_theme.js";
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

  function translateKnownCompanionError(message) {
    const normalized = String(message || "").trim();
    if (!normalized) {
      return "";
    }
    switch (normalized) {
      case "Loaded spools use printer-slot actions instead of manual status/location edits":
        return tr(
          "status.loadedSpoolEditBlocked",
          "Loaded spools use printer-slot actions instead of manual status/location edits",
        );
      case "Loaned-out spools use the companion loan return flow instead of manual status/location edits":
        return tr(
          "status.loanedOutEditBlocked",
          "Loaned-out spools use the companion loan return flow instead of manual status/location edits",
        );
      case "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST":
        return tr(
          "status.browserStatusLocationLimited",
          "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST",
        );
      default:
        return normalized;
    }
  }

  function catalogMatchesSource(master, source) {
    const vendor = String(master?.vendor || "").trim().toLowerCase();
    if (source === "esun") {
      return vendor.includes("esun");
    }
    return vendor.includes("bambu");
  }

  function defaultSpoolTareWeightForVendor(vendor) {
    const normalized = String(vendor || "").trim().toLowerCase();
    if (normalized.includes("bambu")) {
      return 250;
    }
    if (normalized.includes("esun")) {
      return 224;
    }
    return 0;
  }

  function resolveSpoolTareWeight(row) {
    const explicit = row?.spool?.spool_tare_weight_g;
    if (Number.isFinite(explicit)) {
      return Math.max(0, Math.round(explicit));
    }
    return defaultSpoolTareWeightForVendor(row?.master?.vendor);
  }

  function findSpoolRow(spoolId) {
    const normalizedSpoolId = String(spoolId || "").trim();
    if (!normalizedSpoolId) {
      return null;
    }
    return (Array.isArray(state.spools) ? state.spools : []).find(
      (row) => String(row?.spool?.id || "").trim() === normalizedSpoolId,
    ) || null;
  }

  function normalizeMeasuredFilamentWeight(row, measuredWeight) {
    const tareWeight = resolveSpoolTareWeight(row);
    return Math.max(0, Math.round(measuredWeight - tareWeight));
  }

  function resolveCatalogMaster(masterIdValue, sourceValue) {
    const source = String(sourceValue || "").trim().toLowerCase();
    if (source === "manual") {
      return null;
    }

    const masterId = String(masterIdValue || "").trim();
    const catalogMasters = Array.isArray(state.catalogMasters) ? state.catalogMasters : [];
    const selected = catalogMasters.find((master) => master?.id === masterId) || null;
    if (catalogMatchesSource(selected, source)) {
      return selected;
    }
    return catalogMasters.find((master) => catalogMatchesSource(master, source)) || null;
  }

  function normalizeAddSpoolValues(values) {
    const source = String(values.source || "bambu").trim().toLowerCase();
    const ownershipType =
      String(values.ownershipType || "").trim().toUpperCase() === "BORROWED_IN"
        ? "BORROWED_IN"
        : "OWNED";
    const ownerName = String(values.ownerName || "").trim();
    const ownerContact = String(values.ownerContact || "").trim();
    const note = String(values.note || "").trim();
    const location = String(values.location || "").trim();
    const initialWeightText = String(values.initialWeight || "").trim();
    const parsedInitialWeight = Number.parseInt(initialWeightText, 10);
    const manualVendor = String(values.vendor || "").trim() || "Generic";
    const master = resolveCatalogMaster(values.masterId, source);
    const material =
      source === "manual" ? String(values.material || "").trim() : String(master?.material || "").trim();
    const filamentName =
      source === "manual"
        ? String(values.filamentName || "").trim()
        : String(master?.filament_name || "").trim();
    const colorName =
      source === "manual"
        ? String(values.colorName || "").trim()
        : String(master?.color_name || "").trim();
    const vendor = source === "manual" ? manualVendor : String(master?.vendor || "").trim();
    const hexColorText = String(values.hexColor || "").trim();
    const normalizedHexColor = hexColorText ? normalizeHex(hexColorText) : null;
    const fallbackWeight = master?.default_weight ?? 1000;

    return {
      source,
      ownershipType,
      ownerName,
      ownerContact,
      note,
      location,
      initialWeightText,
      parsedInitialWeight,
      initialWeight: initialWeightText ? parsedInitialWeight : fallbackWeight,
      master,
      material,
      filamentName,
      colorName,
      vendor,
      hexColorText,
      normalizedHexColor,
    };
  }

  async function postJson(path, body) {
    return fetchJson(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": state.csrfToken,
      },
      body: JSON.stringify(body),
    });
  }

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
      setDetailFeedback(trimmedSpoolId, tr("status.spoolDetailsUpdatedJustNow", "Details updated just now."));
      setStatus(tr("status.spoolDetailsUpdated", "Spool details updated."), "success");
    } catch (error) {
      setStatus(
        translateKnownCompanionError(error.message) ||
          tr("status.spoolDetailsUpdateFailed", "Failed to update spool details."),
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

  async function submitPrinterSlotAssignment(printerId, slotId, spoolId, mutationOptions = {}) {
    const trimmedPrinterId = printerId.trim();
    const trimmedSlotId = slotId.trim();
    const normalizedSpoolId = spoolId.trim();
    const normalizedFeedbackSpoolId = String(mutationOptions.feedbackSpoolId || spoolId || "").trim();
    const normalizedFeedbackLabel = String(mutationOptions.feedbackLabel || "").trim();
    if (!trimmedPrinterId || !trimmedSlotId) {
      setStatus(
        tr("status.printerSlotRequired", "Printer and slot are required for slot updates."),
        "error",
      );
      render();
      return;
    }

    clearDetailFeedback(normalizedFeedbackSpoolId);
    setBusy(true);
    setStatus(
      normalizedSpoolId
        ? tr("status.updatingPrinterSlot", "Updating printer slot assignment...")
        : tr("status.clearingPrinterSlot", "Clearing printer slot..."),
      "default",
    );
    try {
      await fetchJson(
        `/api/v1/printers/${encodeURIComponent(trimmedPrinterId)}/slots/${encodeURIComponent(trimmedSlotId)}/assignment`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": state.csrfToken,
          },
          body: JSON.stringify({
            spool_id: normalizedSpoolId || null,
          }),
        },
      );
      state.activeTaskSheet = null;
      state.pendingPrinterSlotTarget = null;
      state.printerSpoolSearch = "";
      if (normalizedFeedbackSpoolId) {
        state.selectedSpoolId = normalizedFeedbackSpoolId;
      }
      await refreshOverview();
      if (normalizedFeedbackSpoolId) {
        const feedbackMessage = normalizedSpoolId
          ? normalizedFeedbackLabel
              ? tr("status.loadedIntoSlotJustNow", "Loaded into {label} just now.", {
                label: normalizedFeedbackLabel,
              })
            : tr("status.printerSlotAssignedJustNow", "Printer slot assigned just now.")
          : normalizedFeedbackLabel
            ? tr("status.clearedFromSlotJustNow", "Cleared from {label} just now.", {
                label: normalizedFeedbackLabel,
              })
            : tr("status.printerSlotClearedJustNow", "Printer slot cleared just now.");
        setDetailFeedback(normalizedFeedbackSpoolId, feedbackMessage);
      }
      setStatus(
        normalizedSpoolId
          ? tr("status.printerSlotAssigned", "Printer slot assigned.")
          : tr("status.printerSlotCleared", "Printer slot cleared."),
        "success",
      );
    } catch (error) {
      setStatus(error.message || tr("status.printerSlotFailed", "Failed to update printer slot."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function postPrinterUsage(printerId, spoolId, grams) {
    await fetchJson(
      `/api/v1/printers/${encodeURIComponent(printerId)}/spools/${encodeURIComponent(spoolId)}/usage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          grams,
          job_name: null,
          success: true,
        }),
      },
    );
  }

  async function applyMeasuredWeightWithUsage(printerId, spoolId, previousRemaining, measuredTotalWeight, tareWeight) {
    const safeMeasuredTotal = Math.max(0, Math.round(measuredTotalWeight));
    const safeTareWeight = Math.max(0, Math.round(tareWeight));
    const measuredFilament = Math.max(0, safeMeasuredTotal - safeTareWeight);
    const baseline =
      previousRemaining != null && Number.isFinite(previousRemaining)
        ? Math.max(0, Math.round(previousRemaining))
        : null;
    const usedGrams = baseline != null ? Math.max(0, baseline - measuredFilament) : 0;

    if (baseline != null && usedGrams > 0) {
      await postPrinterUsage(printerId, spoolId, usedGrams);
      return;
    }
    if (baseline == null || measuredFilament !== baseline) {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(spoolId)}/weight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({ grams: safeMeasuredTotal }),
      });
    }
  }

  async function submitPrinterSlotOperation(currentGramsValue, incomingGramsValue, outgoingGramsValue) {
    const task = state.activeTaskSheet || null;
    if (!task || task.type !== "printer-weight") {
      setStatus(tr("status.printerSlotFailed", "Failed to update printer slot."), "error");
      render();
      return;
    }

    const mode = String(task.mode || "update").trim().toLowerCase();
    const currentSpoolId = String(task.currentSpoolId || "").trim();
    const targetSpoolId = String(task.targetSpoolId || "").trim();
    const requiresOutgoing =
      Boolean(currentSpoolId) && (mode === "clear" || (mode === "assign" && currentSpoolId !== targetSpoolId));
    const requiresIncoming = mode === "assign" && Boolean(targetSpoolId);
    const currentMeasured =
      mode === "update" ? Number.parseInt(String(currentGramsValue || "").trim(), 10) : null;
    const incomingMeasured =
      requiresIncoming ? Number.parseInt(String(incomingGramsValue || "").trim(), 10) : null;
    const outgoingMeasured =
      requiresOutgoing ? Number.parseInt(String(outgoingGramsValue || "").trim(), 10) : null;

    if (mode === "update" && (!Number.isFinite(currentMeasured) || currentMeasured < 0)) {
      setStatus(tr("status.weightInvalid", "Enter a valid non-negative weight in grams."), "error");
      render();
      return;
    }
    if (requiresIncoming && (!Number.isFinite(incomingMeasured) || incomingMeasured < 0)) {
      setStatus(tr("status.weightInvalid", "Enter a valid non-negative weight in grams."), "error");
      render();
      return;
    }
    if (requiresOutgoing && (!Number.isFinite(outgoingMeasured) || outgoingMeasured < 0)) {
      setStatus(tr("status.weightInvalid", "Enter a valid non-negative weight in grams."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(
      mode === "clear"
        ? tr("status.clearingPrinterSlot", "Clearing printer slot...")
        : mode === "assign"
          ? tr("status.updatingPrinterSlot", "Updating printer slot assignment...")
          : tr("status.weightSaving", "Saving weight update..."),
      "default",
    );
    try {
      if (mode === "update" && currentSpoolId) {
        const currentRow = findSpoolRow(currentSpoolId);
        await applyMeasuredWeightWithUsage(
          task.printerId,
          currentSpoolId,
          currentRow?.spool?.remaining_g,
          currentMeasured,
          resolveSpoolTareWeight(currentRow),
        );
      }

      if ((mode === "clear" || mode === "assign") && currentSpoolId && requiresOutgoing) {
        const currentRow = findSpoolRow(currentSpoolId);
        await applyMeasuredWeightWithUsage(
          task.printerId,
          currentSpoolId,
          currentRow?.spool?.remaining_g,
          outgoingMeasured,
          resolveSpoolTareWeight(currentRow),
        );
      }

      if (mode === "clear" || mode === "assign") {
        await fetchJson(
          `/api/v1/printers/${encodeURIComponent(task.printerId)}/slots/${encodeURIComponent(task.slotId)}/assignment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": state.csrfToken,
            },
            body: JSON.stringify({
              spool_id: mode === "assign" ? targetSpoolId || null : null,
            }),
          },
        );
      }

      if (mode === "assign" && targetSpoolId && requiresIncoming) {
        await fetchJson(`/api/v1/spools/${encodeURIComponent(targetSpoolId)}/weight`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": state.csrfToken,
          },
          body: JSON.stringify({ grams: Math.max(0, Math.round(incomingMeasured)) }),
        });
      }

      state.activeTaskSheet = null;
      state.pendingPrinterSlotTarget = null;
      state.printerSpoolSearch = "";
      await refreshOverview();
      setStatus(
        mode === "clear"
          ? tr("status.printerSlotCleared", "Printer slot cleared.")
          : mode === "assign"
            ? tr("status.printerSlotAssigned", "Printer slot assigned.")
            : tr("status.printerSlotWeightUpdated", "Printer slot weight updated."),
        "success",
      );
    } catch (error) {
      setStatus(error.message || tr("status.printerSlotFailed", "Failed to update printer slot."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitSpoolLoan(spoolId, borrowerNameValue, gramsValue, noteValue) {
    const trimmedSpoolId = spoolId.trim();
    const borrowerName = borrowerNameValue.trim();
    const normalizedNote = noteValue.trim();
    const measuredWeight = Number.parseInt(gramsValue, 10);
    const spoolRow = findSpoolRow(trimmedSpoolId);

    if (!trimmedSpoolId) {
      setStatus(tr("status.loanSelectSpool", "Select a spool before creating a loan."), "error");
      render();
      return;
    }
    if (!borrowerName) {
      setStatus(tr("status.loanBorrowerRequired", "Enter a borrower name before creating a loan."), "error");
      render();
      return;
    }
    if (!Number.isFinite(measuredWeight) || measuredWeight < 0) {
      setStatus(
        tr("status.loanOutgoingWeightInvalid", "Enter a valid non-negative outgoing weight in grams."),
        "error",
      );
      render();
      return;
    }
    const grams = normalizeMeasuredFilamentWeight(spoolRow, measuredWeight);

    clearDetailFeedback(trimmedSpoolId);
    setBusy(true);
    setStatus(tr("status.loanCreating", "Creating outbound loan..."), "default");
    try {
      await fetchJson(`/api/v1/spools/${encodeURIComponent(trimmedSpoolId)}/lend`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          borrower_name: borrowerName,
          grams_out: grams,
          note: normalizedNote || null,
        }),
      });
      state.activeRootFlow = "loans";
      state.activeTaskSheet = null;
      await refreshOverview();
      setDetailFeedback(trimmedSpoolId, tr("status.loanCreatedJustNow", "Outbound loan created just now."));
      setStatus(tr("status.loanCreated", "Outbound loan created."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.loanCreateFailed", "Failed to create outbound loan."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitSpoolLoanReturn(loanId, spoolId, gramsValue, noteValue) {
    const trimmedLoanId = loanId.trim();
    const trimmedSpoolId = spoolId.trim();
    const normalizedNote = noteValue.trim();
    const measuredWeight = Number.parseInt(gramsValue, 10);
    const spoolRow = findSpoolRow(trimmedSpoolId);

    if (!trimmedLoanId) {
      setStatus(tr("status.loanReturnSelectActive", "Select an active loan before returning it."), "error");
      render();
      return;
    }
    if (!Number.isFinite(measuredWeight) || measuredWeight < 0) {
      setStatus(
        tr("status.loanReturnWeightInvalid", "Enter a valid non-negative returned weight in grams."),
        "error",
      );
      render();
      return;
    }
    const grams = normalizeMeasuredFilamentWeight(spoolRow, measuredWeight);

    clearDetailFeedback(trimmedSpoolId);
    setBusy(true);
    setStatus(tr("status.loanReturning", "Returning outbound loan..."), "default");
    try {
      await fetchJson(`/api/v1/loans/${encodeURIComponent(trimmedLoanId)}/return`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          returned_grams: grams,
          note: normalizedNote || null,
        }),
      });
      state.activeTaskSheet = null;
      state.expandedLoanReturnId = "";
      await refreshOverview();
      setDetailFeedback(trimmedSpoolId, tr("status.loanReturnedJustNow", "Outbound loan returned just now."));
      setStatus(tr("status.loanReturned", "Outbound loan returned."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.loanReturnFailed", "Failed to return outbound loan."), "error");
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
      state.showStorageQr = false;
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

  async function submitWishlistCreate(values) {
    const draft = normalizeAddSpoolValues(values);
    const quantity = Number.parseInt(String(values.quantity || "").trim(), 10);
    if (draft.source !== "manual" && !draft.master) {
      setStatus(tr("status.wishlistCatalogRequired", "Choose a catalog filament before adding it to wishlist."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && (!draft.material || !draft.filamentName || !draft.colorName)) {
      setStatus(tr("status.wishlistManualIncomplete", "Finish the manual filament details before adding to wishlist."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(tr("status.wishlistAdding", "Adding filament to wishlist..."), "default");
    try {
      await postJson("/api/v1/wishlist", {
        master_id: draft.master?.id || null,
        material: draft.material,
        filament_name: draft.filamentName,
        color_name: draft.colorName,
        vendor: draft.vendor || null,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        note: String(values.note || "").trim() || null,
      });
      state.borrowedInDraft.wishlistQuantity = "1";
      state.borrowedInDraft.wishlistNote = "";
      await refreshOverview();
      setStatus(tr("status.wishlistAdded", "Wishlist item added."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistAddFailed", "Failed to add wishlist item."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitWishlistStatus(itemIdValue, statusValue) {
    const itemId = String(itemIdValue || "").trim();
    const status = String(statusValue || "").trim().toUpperCase();
    if (!itemId) {
      setStatus(tr("status.wishlistSelectBeforeStatus", "Choose a wishlist item before changing its status."), "error");
      render();
      return;
    }
    if (!["WISHLIST", "ON_ORDER", "RECEIVED"].includes(status)) {
      setStatus(tr("status.wishlistStatusInvalid", "Choose a valid wishlist status."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(tr("status.wishlistStatusUpdating", "Updating wishlist status..."), "default");
    try {
      await postJson(`/api/v1/wishlist/${encodeURIComponent(itemId)}/status`, { status });
      await refreshOverview();
      setStatus(tr("status.wishlistStatusUpdated", "Wishlist status updated."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistStatusUpdateFailed", "Failed to update wishlist status."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitWishlistStock(itemIdValue) {
    const itemId = String(itemIdValue || "").trim();
    const item = Array.isArray(state.wishlistItems)
      ? state.wishlistItems.find((row) => String(row?.id || "").trim() === itemId)
      : null;
    if (!item) {
      setStatus(tr("status.wishlistSelectBeforeStock", "Choose a wishlist item before stocking it."), "error");
      render();
      return;
    }

    const linkedMaster = item.master_id
      ? (Array.isArray(state.catalogMasters)
          ? state.catalogMasters.find((master) => master?.id === item.master_id)
          : null)
      : null;

    setBusy(true);
    setStatus(tr("status.wishlistStocking", "Adding wishlist spool to inventory..."), "default");
    try {
      const payload = await postJson("/api/v1/spools/owned", linkedMaster
        ? {
            master_id: linkedMaster.id,
            initial_weight_g: linkedMaster.default_weight,
          }
        : {
            material: item.material,
            filament_name: item.filament_name,
            color_name: item.color_name,
            vendor: item.vendor,
            initial_weight_g: 1000,
            hex_color: null,
          });
      const spoolId = String(payload?.spool_id || "").trim();
      await postJson(`/api/v1/wishlist/${encodeURIComponent(item.id)}/status`, {
        status: "RECEIVED",
      });
      state.activeTaskSheet = null;
      await refreshOverview();
      if (spoolId) {
        state.selectedSpoolId = spoolId;
        setDetailReturnContext("storage");
        state.detailOpen = true;
        setDetailFeedback(spoolId, tr("status.wishlistStockedJustNow", "Wishlist spool stocked just now."));
      }
      setStatus(tr("status.wishlistStocked", "Wishlist spool added to inventory."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistStockFailed", "Failed to stock spool from wishlist."), "error");
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
      state.qrLookup = String(qrCodeValue || "").trim();
      state.activeRootFlow = "storage";
      state.activeTaskSheet = null;
      state.showStorageQr = false;
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

  async function submitBorrowedInHandBack(loanId, spoolId, gramsValue, noteValue) {
    const trimmedLoanId = loanId.trim();
    const trimmedSpoolId = spoolId.trim();
    const normalizedNote = noteValue.trim();
    const measuredWeight = Number.parseInt(gramsValue, 10);
    const currentSelectedSpoolId = state.selectedSpoolId;
    const effectiveSpoolId = trimmedSpoolId || currentSelectedSpoolId;
    const spoolRow = findSpoolRow(effectiveSpoolId);

    if (!trimmedLoanId) {
      setStatus(tr("status.borrowedInHandBackSelectActive", "Select an active borrowed-in loan before handing it back."), "error");
      render();
      return;
    }
    if (!Number.isFinite(measuredWeight) || measuredWeight < 0) {
      setStatus(
        tr("status.borrowedInHandBackWeightInvalid", "Enter a valid non-negative handed-back weight in grams."),
        "error",
      );
      render();
      return;
    }
    const grams = normalizeMeasuredFilamentWeight(spoolRow, measuredWeight);

    setBusy(true);
    setStatus(tr("status.borrowedInHandingBack", "Handing back borrowed-in spool..."), "default");
    try {
      if (currentSelectedSpoolId) {
        clearDetailFeedback(currentSelectedSpoolId);
        state.selectionRecoveryReason = "borrowed_in_hand_back";
        state.skipNextAutoSelect = true;
      }
      await fetchJson(`/api/v1/loans/${encodeURIComponent(trimmedLoanId)}/hand-back`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": state.csrfToken,
        },
        body: JSON.stringify({
          returned_grams: grams,
          note: normalizedNote || null,
        }),
      });
      state.activeRootFlow = "loans";
      state.detailOpen = false;
      state.activeTaskSheet = null;
      await refreshOverview();
      setStatus(tr("status.borrowedInHandedBack", "Borrowed-in spool handed back."), "success");
      render();
    } catch (error) {
      state.selectionRecoveryReason = "";
      state.skipNextAutoSelect = false;
      setStatus(error.message || tr("status.borrowedInHandBackFailed", "Failed to hand back borrowed-in spool."), "error");
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
