import { resolveSpoolRowTareWeight } from "./companion_spool_weight.js";

export function createCompanionPrinterMutations({
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
}) {
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
          resolveSpoolRowTareWeight(currentRow),
        );
      }

      if (mode === "clear" || mode === "assign") {
        await fetchJson(
          `/api/v1/printers/${encodeURIComponent(task.printerId)}/slots/${encodeURIComponent(task.slotId)}/operation`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": state.csrfToken,
            },
            body: JSON.stringify({
              expected_current_spool_id: currentSpoolId || null,
              target_spool_id: mode === "assign" ? targetSpoolId || null : null,
              outgoing_measured_total_g: requiresOutgoing
                ? Math.max(0, Math.round(outgoingMeasured))
                : null,
              incoming_measured_total_g: requiresIncoming
                ? Math.max(0, Math.round(incomingMeasured))
                : null,
            }),
          },
        );
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

  return {
    submitPrinterSlotAssignment,
    submitPrinterSlotOperation,
  };
}
