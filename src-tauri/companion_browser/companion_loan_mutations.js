export function createCompanionLoanMutations({
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
}) {
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
    submitBorrowedInHandBack,
    submitSpoolLoan,
    submitSpoolLoanReturn,
  };
}
