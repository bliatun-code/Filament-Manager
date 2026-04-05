import { renderSelectedSpoolDetailBody } from "./detail_content.js";
import { formatCountLabel, t } from "./companion_i18n.js";
import {
  escapeHtml,
  formatDate,
  formatGrams,
  formatInventoryDisplayTitle,
  formatPlacementLabel,
  ownershipLabel,
} from "./formatters.js";
import { renderLoanReturnTaskSheetBody, renderLoansShell } from "./loans_shell.js";
import { renderPrintersShell } from "./printers_shell.js";
import { renderPrinterPickerTaskSheetBody } from "./printer_workspace.js";
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
      escapeHtml,
      formatGrams,
    });
  }

  if (state.activeRootFlow === "loans") {
    return renderLoansShell({
      state,
      loanRows,
      loanSummary: options.loanSummary,
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
      title: t(state.locale || "en", "storage.addFilament", "Add filament"),
      subtitle: t(
        state.locale || "en",
        "storage.addFilamentHelp",
        "Pick a source, then add to stock or keep it in wishlist/order.",
      ),
      body: renderAddFilamentTaskSheetBody(state, state.busy, escapeHtml),
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
    const printerSpoolOptions = state.spools.filter((row) => row?.spool?.id && canLoadSpoolIntoPrinter(row));
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
                printerSpoolOptions,
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
