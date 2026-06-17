import { renderSelectedSpoolDetailBody } from "./detail_content.js";
import { formatCountLabel, t } from "./companion_i18n.js";
import {
  escapeHtml,
  formatDate,
  formatGrams,
  formatInventoryDisplayTitle,
  formatPlacementLabel,
  ownershipLabel,
  sortSpoolRowsAlphabetically,
} from "./formatters.js";
import {
  renderLoanCreateTaskSheetBody,
  renderLoanPickerTaskSheetBody,
  renderLoanReturnTaskSheetBody,
  renderLoansShell,
} from "./loans_shell.js";
import { renderPrintersShell } from "./printers_shell.js";
import {
  formatPrinterSlotLabel,
  renderPrinterPickerTaskSheetBody,
  renderPrinterWeightTaskSheetBody,
} from "./printer_workspace.js";
import { renderSettingsShell } from "./settings_shell.js";
import {
  renderDesktopRail,
  renderDetailModalShell,
  renderPhoneBottomNav,
  renderTaskSheetShell,
  renderTopbar,
  renderTrustedLanPairingApp,
} from "./shell_chrome.js";
import {
  renderAddFilamentTaskSheetBody,
  renderStorageShell,
} from "./storage_shell.js";

function createRootFlowItems(state, spools) {
  const locale = state.locale || "en";
  return [
    {
      flow: "storage",
      label: t(locale, "nav.storage", "Storage"),
      meta: t(locale, "nav.visibleCount", "{count} visible", { count: spools.length }),
      compactMeta: `${spools.length}`,
    },
    {
      flow: "loans",
      label: t(locale, "nav.loans", "Loans"),
      meta: t(locale, "nav.activeCount", "{count} active", { count: state.activeLoans.length }),
      compactMeta: `${state.activeLoans.length}`,
    },
    {
      flow: "printers",
      label: t(locale, "nav.printers", "Printers"),
      meta: t(locale, "nav.configuredCount", "{count} configured", { count: state.printers.length }),
      compactMeta: `${state.printers.length}`,
    },
    {
      flow: "settings",
      label: t(locale, "nav.settings", "Settings"),
      meta: state.apiReady
        ? t(locale, "nav.trustedLanSession", "Trusted-LAN session")
        : t(locale, "nav.disconnected", "Disconnected"),
      compactMeta: state.apiReady ? "On" : "Off",
    },
  ];
}

function renderWorkflowShell(options) {
  const { state, loanRows, spools, activePrinter, selectedSpool } = options;

  if (state.activeRootFlow === "printers") {
    return renderPrintersShell({
      state,
      activePrinter,
      printerSpoolOptions: options.printerSpoolOptions,
      escapeHtml,
      formatGrams,
    });
  }

  if (state.activeRootFlow === "loans") {
    return renderLoansShell({
      state,
      loanRows,
      loanSummary: options.loanSummary,
      loanSpoolOptions: options.loanSpoolOptions,
      selectedSpool,
      escapeHtml,
      formatDate,
      formatGrams,
    });
  }

  if (state.activeRootFlow === "settings") {
    const locale = state.locale || "en";
    return renderSettingsShell({
      state,
      connectionSummary: [
        state.apiReady
          ? t(locale, "settings.connected", "Connected")
          : t(locale, "settings.disconnected", "Disconnected"),
        formatCountLabel(locale, state.spools.length, {
          en: { one: "spool", other: "spools" },
          nb: { one: "spole", other: "spoler" },
        }),
        formatCountLabel(locale, state.printers.length, {
          en: { one: "printer", other: "printers" },
          nb: { one: "printer", other: "printere" },
        }),
        formatCountLabel(locale, state.activeLoans.length, {
          en: { one: "active loan", other: "active loans" },
          nb: { one: "aktivt utlån", other: "aktive utlån" },
        }),
      ].join(" · "),
      escapeHtml,
    });
  }

  return renderStorageShell({
    state,
    spools,
    selectedSpool,
    escapeHtml,
    formatGrams,
    formatPlacementLabel: (value) => formatPlacementLabel(value, state.locale),
    ownershipLabel: (spool) => ownershipLabel(spool, state.locale),
  });
}

function renderDetailModal(options) {
  const {
    state,
    detailBusyLabel,
    findAssignedSlotForSpool,
    loanActionState,
    openingSpoolLabel,
    selectedSpool,
    selectionClearedAfterBorrowedInHandBack,
  } = options;
  const selectedDetailSpoolId = String(state.selectedDetail?.spool?.spool?.id || "").trim();
  const selectedSpoolId = String(selectedSpool?.spool?.id || "").trim();
  const detailMatchesSelection =
    Boolean(selectedSpoolId) && Boolean(selectedDetailSpoolId) && selectedDetailSpoolId === selectedSpoolId;

  let body = "";
  if (state.detailBusy && !detailMatchesSelection) {
    const localizedSpoolNoun = t(state.locale || "en", "detail.spoolHeading", "Spool").toLowerCase();
    body = `<div class="empty-card detail-empty-card">${escapeHtml(
      openingSpoolLabel(state.selectedSpoolId, { noun: localizedSpoolNoun }),
    )}</div>`;
  } else if (!selectedSpool) {
    const locale = state.locale || "en";
    body = `
      <div class="empty-card detail-empty-card">
        <div class="detail-empty-copy">
          <div class="list-title">${escapeHtml(
            selectionClearedAfterBorrowedInHandBack
              ? t(locale, "detail.noSelectedSpool", "No selected spool")
              : t(locale, "detail.selectSpool", "Select a spool"),
          )}</div>
          <div class="section-copy">
            ${
              selectionClearedAfterBorrowedInHandBack
                ? escapeHtml(
                    t(
                      locale,
                      "detail.borrowedInRemovedHint",
                      "The last borrowed-in spool was removed from inventory after hand-back. Pick another spool from Storage to continue.",
                    ),
                  )
                : escapeHtml(
                    t(
                      locale,
                      "detail.selectSpoolHint",
                      "Choose a spool from Storage, Loans, or Printers to inspect it here.",
                    ),
                  )
            }
          </div>
        </div>
      </div>
    `;
  } else {
    const rfidCaptureSources = [];
    const printerRows = Array.isArray(state.printers) ? state.printers : [];
    for (const printerRow of printerRows) {
      for (const slot of Array.isArray(printerRow?.slots) ? printerRow.slots : []) {
        const observedRfid = String(slot?.live_tray_uuid || slot?.live_observed_rfid_tag || "").trim();
        const hasLiveSignal =
          Boolean(slot?.live_loaded) ||
          Boolean(slot?.live_tray_uuid) ||
          Boolean(slot?.live_observed_rfid_tag) ||
          Boolean(slot?.live_match_status) ||
          Boolean(slot?.live_mqtt_connected);
        if (!hasLiveSignal) {
          continue;
        }
        rfidCaptureSources.push({
          slotId: String(slot.slot_id || "").trim(),
          printerId: String(printerRow?.printer?.id || "").trim(),
          printerName: String(printerRow?.printer?.name || "").trim(),
          slotLabel: formatPrinterSlotLabel(slot, state.locale || "en", printerRow?.printer?.model || ""),
          rfidTag: observedRfid || "",
          observedAt: String(slot?.live_last_identity_seen_at || slot?.live_printer_last_seen_at || "").trim(),
          filamentLabel:
            formatInventoryDisplayTitle(slot?.live_filament_type, slot?.live_filament_name, slot?.live_tray_id_name) || "",
          statusLabel:
            slot?.live_match_status === "unknown_rfid"
              ? t(state.locale || "en", "printers.liveMatchUnknownRfid", "RFID not registered")
              : slot?.live_matched_inventory_mode === "exact_rfid"
                ? t(state.locale || "en", "printers.liveMatchClear", "Live inventory match")
                : slot?.live_match_status || slot?.live_match_note
                  ? t(state.locale || "en", "printers.liveMatchNoClear", "No clear inventory match")
                  : t(state.locale || "en", "printers.liveObserved", "Live observed"),
        });
      }
    }
    const detailFeedback =
      state.detailFeedback?.spoolId === selectedSpool.spool.id ? state.detailFeedback.message : "";
    body = renderSelectedSpoolDetailBody({
      selectedSpool,
      selectedDetail: detailMatchesSelection ? state.selectedDetail : null,
      detailFeedback,
      busy: state.busy,
      compactDetail: state.layoutMode === "phone",
      findAssignedSlotForSpool,
      loanActionState,
      escapeHtml,
      formatDate,
      formatGrams,
      formatPlacementLabel: (value) => formatPlacementLabel(value, state.locale),
      ownershipLabel: (spool) => ownershipLabel(spool, state.locale),
      rfidCaptureSources,
      locale: state.locale || "en",
    });
  }

  return renderDetailModalShell({
    layoutMode: state.layoutMode,
    locale: state.locale,
    selectedSpool,
    detailBusy: state.detailBusy,
    detailBusyLabel,
    body,
    escapeHtml,
  });
}

function renderTaskSheet(options) {
  const { loanRows, state } = options;
  const activeTaskSheet = state.activeTaskSheet || null;

  if (!activeTaskSheet || state.detailOpen) {
    return "";
  }

  if (activeTaskSheet.type === "storage-add") {
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      kicker: t(state.locale || "en", "storage.stockEntry", "Stock entry"),
      title: t(state.locale || "en", "storage.addFilament", "Add filament"),
      body: renderAddFilamentTaskSheetBody(state, state.busy, escapeHtml),
      shellClass: "task-sheet-shell-wide",
      panelClass: "add-filament-sheet",
      locale: state.locale,
      escapeHtml,
    });
  }

  if (activeTaskSheet.type === "loan-return") {
    const loanId = String(activeTaskSheet.loanId || "").trim();
    const loanRow =
      loanRows.find((row) => String(row?.loan?.id || "").trim() === loanId) ||
      state.loanHistory.find((row) => String(row?.loan?.id || "").trim() === loanId) ||
      null;
    const borrowerName =
      loanRow?.loan?.borrower_name ||
      loanRow?.loan?.counterparty_name ||
      t(state.locale || "en", "loans.unknownBorrower", "Unknown");
    const displayTitle = loanRow
      ? formatInventoryDisplayTitle(loanRow.material, loanRow.filament_name, loanRow.color_name)
      : t(state.locale || "en", "loans.outboundLoan", "Outbound loan");
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      title: t(state.locale || "en", "loans.returnLoan", "Return loan"),
      subtitle: `${displayTitle} · ${borrowerName}`,
      body: renderLoanReturnTaskSheetBody({
        state,
        loanRow,
        escapeHtml,
        formatDate,
        formatGrams,
      }),
      locale: state.locale,
      escapeHtml,
    });
  }

  if (activeTaskSheet.type === "loan-picker") {
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      title: t(state.locale || "en", "detail.lendSpool", "Lend spool"),
      subtitle: t(
        state.locale || "en",
        "loans.loanPickerHelp",
        "Choose a spool to lend out. Loaning is completed when outgoing weight is saved.",
      ),
      body: renderLoanPickerTaskSheetBody({
        state,
        loanSpoolOptions: options.loanSpoolOptions,
        escapeHtml,
        formatGrams,
      }),
      locale: state.locale,
      escapeHtml,
    });
  }

  if (activeTaskSheet.type === "loan-create") {
    const spoolId = String(activeTaskSheet.spoolId || state.selectedSpoolId || "").trim();
    const selectedSpool =
      options.spools.find((row) => String(row?.spool?.id || "").trim() === spoolId) ||
      state.spools.find((row) => String(row?.spool?.id || "").trim() === spoolId) ||
      null;
    const displayTitle = selectedSpool
      ? formatInventoryDisplayTitle(
          selectedSpool.master.material,
          selectedSpool.master.filament_name,
          selectedSpool.master.color_name,
        )
      : t(state.locale || "en", "detail.lendSpool", "Lend spool");
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      title: t(state.locale || "en", "detail.lendSpool", "Lend spool"),
      subtitle: displayTitle,
      body: renderLoanCreateTaskSheetBody({
        state,
        selectedSpool,
        selectedAssignment: selectedSpool
          ? options.findAssignedSlotForSpool(selectedSpool.spool.id)
          : null,
        escapeHtml,
        formatGrams,
      }),
      locale: state.locale,
      escapeHtml,
    });
  }

  if (activeTaskSheet.type === "printer-picker") {
    const pendingTarget = state.pendingPrinterSlotTarget || activeTaskSheet;
    const slotLabel =
      String(pendingTarget?.slotLabel || "").trim() ||
      `${t(state.locale || "en", "printers.slot", "Slot")} ${pendingTarget?.slotIndex || "?"}`;
    const subtitle = pendingTarget?.printerName
      ? `${pendingTarget.printerName} · ${slotLabel}`
      : t(state.locale || "en", "printers.chooseSlotFirst", "Choose an open slot on the board first.");
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      title: t(state.locale || "en", "printers.loadFilament", "Load filament"),
      subtitle,
      body: renderPrinterPickerTaskSheetBody({
        state,
        printerSpoolOptions: options.printerSpoolOptions,
        escapeHtml,
        formatGrams,
      }),
      locale: state.locale,
      escapeHtml,
    });
  }

  if (activeTaskSheet.type === "printer-weight") {
    const slotLabel =
      String(activeTaskSheet.slotLabel || "").trim() ||
      `${t(state.locale || "en", "printers.slot", "Slot")} ${activeTaskSheet.slotIndex || "?"}`;
    const subtitle = activeTaskSheet.printerName
      ? `${activeTaskSheet.printerName} · ${slotLabel}`
      : slotLabel;
    return renderTaskSheetShell({
      layoutMode: state.layoutMode,
      title:
        activeTaskSheet.mode === "clear"
          ? t(state.locale || "en", "printers.clearSlot", "Clear slot")
          : activeTaskSheet.mode === "assign"
            ? t(state.locale || "en", "printers.loadFilament", "Load filament")
            : t(state.locale || "en", "printers.updateWeight", "Update weight"),
      subtitle,
      body: renderPrinterWeightTaskSheetBody({
        state,
        activeTaskSheet,
        escapeHtml,
        formatGrams,
      }),
      locale: state.locale,
      escapeHtml,
    });
  }

  return "";
}

export function createCompanionAppShellRenderer(options) {
  const { companionLogic, state, syncLegacySectionState } = options;
  const {
    canLoadSpoolIntoPrinter,
    detailBusyStatusLabel,
    filteredLoanRows,
    filteredSpools,
    findAssignedSlotForSpool,
    loanActionState,
    loanHistorySummary,
    openingSpoolLabel,
    selectedSpoolRow,
    selectionClearedAfterBorrowedInHandBack,
  } = companionLogic;

  function renderRoot() {
    if (!state.apiReady) {
      return renderTrustedLanPairingApp({
        locale: state.locale,
        busy: state.busy,
        statusTone: state.statusTone,
        statusMessage: state.statusMessage,
        escapeHtml,
      });
    }

    syncLegacySectionState();

    const spools = filteredSpools();
    const loanRows = filteredLoanRows();
    const selectedSpool = selectedSpoolRow();
    const rootFlowItems = createRootFlowItems(state, spools);
    const activeRootFlowItem = rootFlowItems.find((item) => item.flow === state.activeRootFlow) || rootFlowItems[0];
    const activePrinter =
      state.printers.find((row) => row?.printer?.id === state.activePrinterId) ||
      state.printers[0] ||
      null;
    const pendingPrinterTarget = state.pendingPrinterSlotTarget || state.activeTaskSheet || null;
    const currentTargetSlotSpoolId =
      pendingPrinterTarget?.slotId && activePrinter
        ? String(
            activePrinter.slots.find((slot) => String(slot?.slot_id || "").trim() === String(pendingPrinterTarget.slotId || "").trim())
              ?.spool_id || "",
          ).trim()
        : "";
    const printerSpoolOptions = sortSpoolRowsAlphabetically(
      state.spools.filter((row) => {
        if (!row?.spool?.id) {
          return false;
        }
        const status = String(row.spool.status || "").trim().toUpperCase();
        const ownershipType = String(row.spool.ownership_type || "OWNED").trim().toUpperCase();
        if (
          status === "EMPTY" ||
          status === "LOST" ||
          status === "MISSING" ||
          (status === "BORROWED" && ownershipType !== "BORROWED_IN")
        ) {
          return false;
        }
        if (currentTargetSlotSpoolId && String(row.spool.id).trim() === currentTargetSlotSpoolId) {
          return true;
        }
        if (status === "IN_USE" || status === "ASSIGNED") {
          return false;
        }
        return canLoadSpoolIntoPrinter(row);
      }),
    );
    const loanSpoolOptions = sortSpoolRowsAlphabetically(
      state.spools.filter((row) => {
        if (!loanActionState(row).allowed) {
          return false;
        }
        return !findAssignedSlotForSpool(String(row?.spool?.id || "").trim());
      }),
    );
    const selectionCleared = selectionClearedAfterBorrowedInHandBack();
    const detailBusyLabel = detailBusyStatusLabel(selectedSpool?.spool?.id || state.selectedSpoolId);

    return `
      <div class="companion-shell" data-layout="${escapeHtml(state.layoutMode)}">
        <div class="shell-scaffold" data-layout="${escapeHtml(state.layoutMode)}">
          ${
            state.layoutMode === "desktop"
              ? renderDesktopRail({
                  locale: state.locale,
                  activeRootFlow: state.activeRootFlow,
                  rootFlowItems,
                  activeLoansCount: state.activeLoans.length,
                  escapeHtml,
                })
              : ""
          }

          <div class="shell-main">
            ${renderTopbar({
              layoutMode: state.layoutMode,
              locale: state.locale,
              activeRootFlow: state.activeRootFlow,
              activeRootFlowItem,
              rootFlowItems,
              busy: state.busy,
              statusMessage: state.statusMessage,
              statusTone: state.statusTone,
              escapeHtml,
            })}
            <div class="workflow-stage">
              ${renderWorkflowShell({
                state,
                loanRows,
                loanSummary: loanHistorySummary(),
                spools,
                activePrinter,
                printerSpoolOptions,
                loanSpoolOptions,
              })}
            </div>
            ${
              state.layoutMode === "phone"
                ? renderPhoneBottomNav({
                    activeRootFlow: state.activeRootFlow,
                    rootFlowItems,
                    escapeHtml,
                  })
                : ""
            }
          </div>
        </div>
        ${
          state.activeTaskSheet
            ? renderTaskSheet({
                state,
                loanRows,
                spools,
                loanSpoolOptions,
                printerSpoolOptions,
                findAssignedSlotForSpool,
              })
            : ""
        }
        ${
          state.detailOpen
            ? renderDetailModal({
                state,
                detailBusyLabel,
                findAssignedSlotForSpool,
                loanActionState,
                openingSpoolLabel,
                selectedSpool,
                selectionClearedAfterBorrowedInHandBack: selectionCleared,
              })
            : ""
        }
      </div>
    `;
  }

  return {
    renderRoot,
  };
}
