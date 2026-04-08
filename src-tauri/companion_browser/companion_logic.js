import { t } from "./companion_i18n.js";

export function createCompanionLogic({ state, sections, sectionLabels }) {
  const locale = () => state.locale || "en";

  function normalizeDetailReturnSection(sectionId) {
    if (!sectionId || sectionId === "detail" || !sections.has(sectionId)) {
      return "inventory";
    }
    return sectionId;
  }

  function detailReturnSection() {
    return normalizeDetailReturnSection(state.detailReturnSection);
  }

  function detailReturnLabel() {
    const sectionId = detailReturnSection();
    return sectionLabels[sectionId] || sectionLabels.inventory || t(locale(), "recovery.sourceInventory", "Storage");
  }

  function openingSpoolLabel(spoolId = "", options = {}) {
    const normalizedSpoolId = String(spoolId || "").trim();
    const noun = String(options.noun || "").trim();
    const fromLabel = String(options.fromLabel || "").trim();
    if (normalizedSpoolId) {
      return noun
        ? t(locale(), "logic.openingNamedSpool", "Opening {noun} {id}...", {
            noun,
            id: normalizedSpoolId,
          })
        : t(locale(), "logic.openingId", "Opening {id}...", { id: normalizedSpoolId });
    }
    if (noun && fromLabel) {
      return t(locale(), "logic.openingFrom", "Opening {noun} from {from}...", {
        noun,
        from: fromLabel,
      });
    }
    return noun ? t(locale(), "logic.openingNoun", "Opening {noun}...", { noun }) : t(locale(), "logic.opening", "Opening...");
  }

  function detailBusyStatusLabel(spoolId = state.selectedSpoolId) {
    if (!state.detailBusy) {
      return "";
    }
    const normalizedSpoolId = String(spoolId || "").trim();
    const existingDetailSpoolId = String(state.selectedDetail?.spool?.spool?.id || "").trim();
    if (normalizedSpoolId && existingDetailSpoolId && normalizedSpoolId === existingDetailSpoolId) {
      return t(locale(), "shell.refreshing", "Refreshing...");
    }
    return openingSpoolLabel(normalizedSpoolId);
  }

  function detailOpenButtonLabel(spoolId = state.selectedSpoolId) {
    return state.detailBusy
      ? detailBusyStatusLabel(spoolId) || t(locale(), "logic.opening", "Opening...")
      : t(locale(), "detail.openDetail", "Open detail");
  }

  function heroRefreshButtonLabel() {
    if (state.busy) {
      return t(locale(), "shell.refreshing", "Refreshing...");
    }
    if (state.detailBusy) {
      return (
        detailBusyStatusLabel(state.selectedSpoolId || state.recoveryOpeningTarget?.spoolId) ||
        t(locale(), "shell.openingDetail", "Opening detail...")
      );
    }
    return t(locale(), "shell.refreshCompanionData", "Refresh companion data");
  }

  function recoverySelectButtonLabel(spoolId, sectionId = state.activeSection) {
    return recoveryOpeningActiveForSection(sectionId)
      ? openingSpoolLabel(spoolId)
      : t(locale(), "recovery.selectSuggested", "Select suggested spool");
  }

  function recoveryCueLabel(sectionId = state.activeSection) {
    return recoveryOpeningActiveForSection(sectionId)
      ? t(locale(), "recovery.openingSpool", "Opening spool")
      : t(locale(), "recovery.suggested", "Suggested recovery");
  }

  function recoveryItemCueLabel(sectionId = state.activeSection) {
    return recoveryOpeningActiveForSection(sectionId)
      ? t(locale(), "recovery.openingNow", "Opening now")
      : recoveryCueLabel(sectionId);
  }

  function recoveryPreviewLabel(sectionId = state.activeSection) {
    return recoveryOpeningActiveForSection(sectionId)
      ? t(locale(), "recovery.openingSpool", "Opening spool")
      : t(locale(), "recovery.nextSpool", "Suggested next spool");
  }

  function selectionClearedAfterBorrowedInHandBack() {
    return !state.selectedSpoolId && state.selectionRecoveryReason === "borrowed_in_hand_back";
  }

  function recoveryOpeningActive() {
    return selectionClearedAfterBorrowedInHandBack() && state.detailBusy;
  }

  function normalizeRecoverySection(sectionId) {
    if (sectionId === "detail") {
      return detailReturnSection();
    }
    if (!sectionId || !sections.has(sectionId)) {
      return "inventory";
    }
    return sectionId;
  }

  function filteredSpools() {
    const visibleRows = state.spools.filter((row) => {
      const status = String(row?.spool?.status || "").trim().toUpperCase();
      return status !== "EMPTY";
    });
    const query = state.search.trim().toLowerCase();
    if (!query) {
      return visibleRows;
    }
    return visibleRows.filter((row) => {
      const values = [
        row.spool.id,
        row.master.material,
        row.master.filament_name,
        row.master.color_name,
        row.master.vendor,
        row.spool.owner_name,
        row.spool.status,
        row.spool.location_id,
      ];
      return values.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }

  function filteredLoanRows() {
    const query = state.loanSearch.trim().toLowerCase();
    return state.loanHistory.filter((row) => {
      const matchesStatus =
        state.loanStatusFilter === "ALL"
          ? true
          : state.loanStatusFilter === "RETURNED"
            ? Boolean(row.loan.returned_at)
            : !row.loan.returned_at;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const values = [
        row.loan.borrower_name,
        row.loan.counterparty_name,
        row.loan.spool_id,
        row.material,
        row.filament_name,
        row.color_name,
        row.vendor,
        row.loan.lent_note,
        row.loan.return_note,
      ];
      return values.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }

  function loanHistorySummary() {
    const active = state.loanHistory.filter((row) => !row.loan.returned_at).length;
    const returned = state.loanHistory.filter((row) => Boolean(row.loan.returned_at)).length;
    return {
      active,
      returned,
      total: state.loanHistory.length,
    };
  }

  function selectedSpoolRow() {
    if (state.selectedDetail?.spool?.spool?.id === state.selectedSpoolId) {
      return state.selectedDetail.spool;
    }
    return state.spools.find((row) => row.spool.id === state.selectedSpoolId) ?? null;
  }

  function findAssignedSlotForSpool(spoolId) {
    if (!spoolId) {
      return null;
    }
    for (const printer of state.printers) {
      for (const slot of printer.slots || []) {
        if (slot.spool_id === spoolId) {
          return {
            printerId: printer.printer.id,
            printerName: printer.printer.name,
            slotId: slot.slot_id,
            slotIndex: slot.slot_index,
          };
        }
      }
    }
    return null;
  }

  function canLoadSpoolIntoPrinter(row) {
    const status = row?.spool?.status?.trim().toUpperCase() || "";
    return !["BORROWED", "EMPTY", "LOST"].includes(status);
  }

  function loanActionState(row) {
    if (!row) {
      return {
        allowed: false,
        reason: t(locale(), "logic.loanSelectSpool", "Select a spool from storage before creating a loan."),
      };
    }

    const ownership = row.spool?.ownership_type?.trim().toUpperCase() || "";
    if (ownership === "BORROWED_IN") {
      return {
        allowed: false,
        reason: t(
          locale(),
          "logic.loanBorrowedInBlocked",
          "Borrowed-in spools cannot be loaned out from the browser companion.",
        ),
      };
    }

    const status = row.spool?.status?.trim().toUpperCase() || "";
    if (status === "BORROWED") {
      return {
        allowed: false,
        reason: t(locale(), "logic.loanAlreadyLoanedOut", "This spool is already loaned out."),
      };
    }
    if (status === "EMPTY" || status === "LOST") {
      return {
        allowed: false,
        reason: t(
          locale(),
          "logic.loanEmptyOrLostBlocked",
          "Empty or lost spools cannot be loaned out here.",
        ),
      };
    }

    return {
      allowed: true,
      reason: "",
    };
  }

  function firstVisibleInventorySpoolRow() {
    return filteredSpools()[0] || null;
  }

  function firstRecoverableSpoolTarget(sectionId = state.activeSection) {
    const normalizedSection = normalizeRecoverySection(sectionId);
    const visibleInventoryRows = filteredSpools();
    const visibleInventorySpoolIds = new Set(
      visibleInventoryRows.map((row) => String(row?.spool?.id || "").trim()).filter(Boolean),
    );
    const activeInventorySpoolIds = new Set(
      state.spools.map((row) => String(row?.spool?.id || "").trim()).filter(Boolean),
    );
    const fallbackRow = firstVisibleInventorySpoolRow();
    const fallbackSpoolId = String(fallbackRow?.spool?.id || "").trim();
    const fallbackMaterial = String(fallbackRow?.master?.material || "").trim();
    const fallbackFilament = String(fallbackRow?.master?.filament_name || "").trim();
    const fallbackTarget = fallbackSpoolId
      ? {
          spoolId: fallbackSpoolId,
          inventorySpoolId: fallbackSpoolId,
          sourceTag: t(locale(), "recovery.sourceInventory", "Storage"),
          previewLabel:
            fallbackMaterial && fallbackFilament
              ? `${fallbackSpoolId} · ${fallbackMaterial} ${fallbackFilament}`
              : fallbackSpoolId,
          buttonLabel: t(locale(), "recovery.selectSuggested", "Select suggested spool"),
        }
      : null;

    if (normalizedSection === "printers") {
      for (const printer of state.printers) {
        for (const slot of printer.slots || []) {
          const slotSpoolId = String(slot?.spool_id || "").trim();
          if (slotSpoolId && visibleInventorySpoolIds.has(slotSpoolId)) {
            const slotContext =
              printer?.printer?.name && slot?.slot_index
                ? t(locale(), "recovery.slotOnPrinter", "{printer} slot {slot}", {
                    printer: printer.printer.name,
                    slot: slot.slot_index,
                  })
                : t(locale(), "recovery.currentPrinterSlot", "current printer slot");
            return {
              spoolId: slotSpoolId,
              slotId: String(slot?.slot_id || "").trim(),
              sourceTag: t(locale(), "recovery.sourcePrinterSlot", "Printer slot"),
              previewLabel: `${slotSpoolId} · ${slotContext}`,
              buttonLabel: t(locale(), "recovery.selectSuggested", "Select suggested spool"),
            };
          }
        }
      }
      for (const printer of state.printers) {
        for (const slot of printer.slots || []) {
          const slotSpoolId = String(slot?.spool_id || "").trim();
          if (slotSpoolId && activeInventorySpoolIds.has(slotSpoolId)) {
            const slotContext =
              printer?.printer?.name && slot?.slot_index
                ? t(locale(), "recovery.slotOnPrinter", "{printer} slot {slot}", {
                    printer: printer.printer.name,
                    slot: slot.slot_index,
                  })
                : t(locale(), "recovery.currentPrinterSlot", "current printer slot");
            return {
              spoolId: slotSpoolId,
              slotId: String(slot?.slot_id || "").trim(),
              sourceTag: t(locale(), "recovery.sourcePrinterSlot", "Printer slot"),
              previewLabel: `${slotSpoolId} · ${slotContext}`,
              buttonLabel: t(locale(), "recovery.selectSuggested", "Select suggested spool"),
            };
          }
        }
      }
      return fallbackTarget;
    }

    if (normalizedSection === "loans") {
      for (const row of filteredLoanRows()) {
        const spoolId = String(row?.loan?.spool_id || "").trim();
        if (spoolId && visibleInventorySpoolIds.has(spoolId)) {
          const borrowerLabel = String(
            row?.loan?.borrower_name || row?.loan?.counterparty_name || "",
          ).trim();
          return {
            spoolId,
            loanId: String(row?.loan?.id || "").trim(),
            sourceTag: t(locale(), "recovery.sourceLoanHistory", "Loan history"),
            previewLabel: borrowerLabel ? `${spoolId} · ${borrowerLabel}` : spoolId,
            buttonLabel: t(locale(), "recovery.selectSuggested", "Select suggested spool"),
          };
        }
      }
      for (const row of filteredLoanRows()) {
        const spoolId = String(row?.loan?.spool_id || "").trim();
        if (spoolId && activeInventorySpoolIds.has(spoolId)) {
          const borrowerLabel = String(
            row?.loan?.borrower_name || row?.loan?.counterparty_name || "",
          ).trim();
          return {
            spoolId,
            loanId: String(row?.loan?.id || "").trim(),
            sourceTag: t(locale(), "recovery.sourceLoanHistory", "Loan history"),
            previewLabel: borrowerLabel ? `${spoolId} · ${borrowerLabel}` : spoolId,
            buttonLabel: t(locale(), "recovery.selectSuggested", "Select suggested spool"),
          };
        }
      }
      return fallbackTarget;
    }

    return fallbackTarget;
  }

  function snapshotRecoveryTarget(sectionId = state.activeSection, spoolId = "") {
    const normalizedSection = normalizeRecoverySection(sectionId);
    const target = firstRecoverableSpoolTarget(normalizedSection);
    const normalizedSpoolId = String(spoolId || target?.spoolId || "").trim();
    if (!normalizedSpoolId) {
      return null;
    }
    return {
      sectionId: normalizedSection,
      spoolId: normalizedSpoolId,
      inventorySpoolId: String(target?.inventorySpoolId || "").trim(),
      slotId: String(target?.slotId || "").trim(),
      loanId: String(target?.loanId || "").trim(),
      sourceTag: String(
        target?.sourceTag || sectionLabels[normalizedSection] || t(locale(), "recovery.sourceInventory", "Storage"),
      ).trim(),
      previewLabel: String(target?.previewLabel || normalizedSpoolId).trim(),
      buttonLabel: String(target?.buttonLabel || t(locale(), "recovery.selectSuggested", "Select suggested spool")).trim(),
    };
  }

  function recoveryTargetForSection(sectionId = state.activeSection) {
    const normalizedSection = normalizeRecoverySection(sectionId);
    const openingTarget = state.recoveryOpeningTarget;
    if (
      recoveryOpeningActive() &&
      openingTarget?.spoolId &&
      normalizeRecoverySection(openingTarget.sectionId) === normalizedSection
    ) {
      return openingTarget;
    }
    return firstRecoverableSpoolTarget(normalizedSection);
  }

  function recoveryOpeningActiveForSection(sectionId = state.activeSection) {
    if (!recoveryOpeningActive()) {
      return false;
    }
    if (!state.recoveryOpeningTarget?.spoolId) {
      return true;
    }
    return normalizeRecoverySection(state.recoveryOpeningTarget.sectionId) === normalizeRecoverySection(sectionId);
  }

  function recoveryOpeningAttr(active = true, sectionId = state.activeSection) {
    return active && recoveryOpeningActiveForSection(sectionId) ? "true" : "false";
  }

  function recoveryTargetSourceLabel(sectionId = state.activeSection) {
    const recoverySection = normalizeRecoverySection(sectionId);
    const recoveryTarget = recoveryTargetForSection(recoverySection);
    return String(
      recoveryTarget?.sourceTag || sectionLabels[recoverySection] || t(locale(), "recovery.sourceInventory", "Storage"),
    ).trim();
  }

  function recoveryTabNoteLabel(sectionId) {
    if (!recoveryOpeningActiveForSection(sectionId)) {
      return recoveryCueLabel(sectionId);
    }
    const sourceLabel = recoveryTargetSourceLabel(sectionId);
    return sourceLabel
      ? t(locale(), "recovery.fromSource", "From {source}", { source: sourceLabel })
      : recoveryCueLabel(sectionId);
  }

  function recoverySectionStatusLabel(sectionLabel, sectionId = state.activeSection) {
    if (!sectionLabel) {
      return t(locale(), "recovery.selectSpool", "Select a spool");
    }
    const sourceLabel = recoveryTargetSourceLabel(sectionId);
    return recoveryOpeningActiveForSection(sectionId)
      ? t(locale(), "recovery.openingFromSource", "Opening from {source}", {
          source: sourceLabel || sectionLabel,
        })
      : t(locale(), "recovery.recoveryInSection", "Recovery in {section}", { section: sectionLabel });
  }

  function recoveryOpeningSummary(sectionId = state.activeSection) {
    const recoveryTarget = recoveryTargetForSection(sectionId);
    const recoverySpoolId = String(recoveryTarget?.spoolId || "").trim();
    const recoverySourceLabel = recoveryTargetSourceLabel(sectionId);
    if (recoverySpoolId) {
      return t(locale(), "recovery.openingSpoolFromSourceNow", "Opening {spool} from {source} now.", {
        spool: recoverySpoolId,
        source: recoverySourceLabel,
      });
    }
    return t(
      locale(),
      "recovery.openingSuggestedFromSourceNow",
      "Opening the suggested spool from {source} now.",
      { source: recoverySourceLabel },
    );
  }

  function recoveryOpeningProgressLabel(sectionId = state.activeSection) {
    const recoveryTarget = recoveryTargetForSection(sectionId);
    const recoverySpoolId = String(recoveryTarget?.spoolId || "").trim();
    const recoverySourceLabel = recoveryTargetSourceLabel(sectionId);
    return recoverySpoolId
      ? t(locale(), "recovery.openingSpoolNow", "Opening {spool} now", { spool: recoverySpoolId })
      : t(locale(), "recovery.openingFromSourceNow", "Opening from {source} now", { source: recoverySourceLabel });
  }

  function recoveryOpeningTabMeta(sectionId, fallbackMeta) {
    if (!recoveryOpeningActiveForSection(sectionId)) {
      return fallbackMeta;
    }
    const recoveryTarget = recoveryTargetForSection(sectionId);
    const recoverySpoolId = String(recoveryTarget?.spoolId || "").trim();
    return recoverySpoolId
      ? t(locale(), "recovery.openingSpoolShort", "Opening {spool}", { spool: recoverySpoolId })
      : fallbackMeta;
  }

  function detailRecoveryReferenceSection() {
    if (
      selectionClearedAfterBorrowedInHandBack() &&
      state.compactLayout &&
      state.activeSection === "detail" &&
      state.recoveryOpeningTarget?.sectionId
    ) {
      return normalizeRecoverySection(state.recoveryOpeningTarget.sectionId);
    }
    return "detail";
  }

  function detailSectionMetaLabel() {
    if (state.selectedSpoolId) {
      return state.selectedSpoolId;
    }
    if (!selectionClearedAfterBorrowedInHandBack()) {
      return t(locale(), "recovery.selectSpool", "Select a spool");
    }
    const recoverySection = detailRecoveryReferenceSection();
    if (!recoveryOpeningActiveForSection(recoverySection)) {
      return t(locale(), "recovery.handedBack", "Handed back");
    }
    const recoveryTarget = recoveryTargetForSection(recoverySection);
    const recoverySpoolId = String(recoveryTarget?.spoolId || "").trim();
    return recoverySpoolId
      ? t(locale(), "recovery.openingSpoolShort", "Opening {spool}", { spool: recoverySpoolId })
      : t(locale(), "recovery.openingSpool", "Opening spool");
  }

  function activeRecoverySection(sectionId = state.activeSection) {
    if (!selectionClearedAfterBorrowedInHandBack()) {
      return "";
    }
    if (state.recoveryOpeningTarget?.sectionId) {
      return normalizeRecoverySection(state.recoveryOpeningTarget.sectionId);
    }
    return normalizeRecoverySection(sectionId);
  }

  return {
    activeRecoverySection,
    canLoadSpoolIntoPrinter,
    detailBusyStatusLabel,
    detailOpenButtonLabel,
    detailRecoveryReferenceSection,
    detailReturnLabel,
    detailReturnSection,
    detailSectionMetaLabel,
    filteredLoanRows,
    filteredSpools,
    findAssignedSlotForSpool,
    firstRecoverableSpoolTarget,
    heroRefreshButtonLabel,
    loanActionState,
    loanHistorySummary,
    normalizeDetailReturnSection,
    normalizeRecoverySection,
    openingSpoolLabel,
    recoveryCueLabel,
    recoveryItemCueLabel,
    recoveryOpeningActive,
    recoveryOpeningActiveForSection,
    recoveryOpeningAttr,
    recoveryOpeningProgressLabel,
    recoveryOpeningSummary,
    recoveryOpeningTabMeta,
    recoveryPreviewLabel,
    recoverySectionStatusLabel,
    recoverySelectButtonLabel,
    recoveryTabNoteLabel,
    recoveryTargetForSection,
    recoveryTargetSourceLabel,
    selectedSpoolRow,
    selectionClearedAfterBorrowedInHandBack,
    snapshotRecoveryTarget,
  };
}
