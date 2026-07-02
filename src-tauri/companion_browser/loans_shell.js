import { t } from "./companion_i18n.js";
import {
  isLoanCurrentlyActive,
  isLoanReturned,
  normalizeLoanDirection,
} from "./companion_loan_state.js";
import { resolveSpoolTareWeight } from "./companion_spool_weight.js";
import { formatInventoryDisplayTitle, formatRollReference } from "./formatters.js";
import { suggestSwatchHex, toSwatchColor } from "./companion_theme.js";
import {
  renderCompanionActionButton,
  renderDetailField,
  renderFilterChipButton,
  renderFormActionBlock,
  renderSelectionBanner,
  renderSwatchListRow,
  renderSwatchSelectionCard,
  renderSwatchSurface,
} from "./shell_chrome.js";

function loanStateLabel(row, locale = "en") {
  const returned = isLoanReturned(row);
  const direction = normalizeLoanDirection(row);
  if (returned) {
    return t(locale, "loans.returned", "Returned");
  }
  if (!isLoanCurrentlyActive(row)) {
    return t(locale, "loans.inactive", "Inactive");
  }
  return direction === "INBOUND"
    ? t(locale, "loans.borrowedInActive", "Borrowed in")
    : t(locale, "loans.active", "Active");
}

function renderLoanFilterButton(filterValue, label, active, escapeHtml) {
  return renderFilterChipButton({
    active,
    attributes: {
      "data-action": "set-loan-status",
      "data-loan-status": filterValue,
    },
    className: "loan-filter-button",
    escapeHtml,
    label,
  });
}

function renderHiddenSelectionBanner(selectedSpool, loanRows, escapeHtml, formatGrams) {
  const locale = selectedSpool.locale || "en";
  const displayTitle = formatInventoryDisplayTitle(
    selectedSpool.master?.material,
    selectedSpool.master?.filament_name,
    selectedSpool.master?.color_name,
  );
  const summaryItems = [
    formatRollReference(selectedSpool.spool),
    formatGrams(selectedSpool.spool?.remaining_g),
    selectedSpool.spool?.location_id || t(locale, "format.unassigned", "Unassigned"),
  ].filter(Boolean);
  return renderSelectionBanner({
    actions: `
      ${renderCompanionActionButton({
        variant: "secondary",
        swatch: true,
        attributes: { "data-action": "show-all-loans" },
        escapeHtml,
        label: t(locale, "loans.showAll", "Show all loans"),
      })}
      ${
        loanRows.length
          ? renderCompanionActionButton({
              variant: "ghost",
              attributes: { "data-action": "set-root-flow", "data-root-flow": "storage" },
              escapeHtml,
              label: t(locale, "nav.storage", "Inventory"),
            })
          : ""
      }
      ${renderCompanionActionButton({
        variant: "ghost",
        attributes: { "data-action": "open-current-detail" },
        escapeHtml,
        label: t(locale, "detail.openDetail", "Detail"),
      })}
    `,
    className: "storage-hidden-banner",
    escapeHtml,
    message: t(locale, "loans.hiddenSelectedMessage", "{title} stays selected for detail and loan actions.", {
      title: displayTitle,
    }),
    summary: summaryItems,
    swatch: selectedSpool.master?.hex_color || "",
    title: t(locale, "storage.hiddenSelectedTitle", "Selected spool hidden"),
  });
}

function renderLoanPickerRows(options) {
  const { locale, loanSpoolOptions, escapeHtml, formatGrams } = options;
  return loanSpoolOptions
    .map((row) => {
      const swatch =
        row.master?.hex_color ||
        suggestSwatchHex(row.master?.color_name, row.master?.filament_name, row.master?.vendor, row.master?.material);
      const displayTitle = formatInventoryDisplayTitle(
        row.master?.material,
        row.master?.filament_name,
        row.master?.color_name,
      );
      const metadata = [
        row.master?.vendor || "",
        formatRollReference(row.spool),
        formatGrams(row.spool?.remaining_g),
        row.spool?.location_id || t(locale, "format.unassigned", "Unassigned"),
      ].filter(Boolean);
      return renderSwatchListRow({
        action: "select-loan-spool",
        attributes: { "data-spool-id": row.spool.id },
        className: "loan-picker-option",
        escapeHtml,
        meta: metadata,
        swatch,
        title: displayTitle,
      });
    })
    .join("");
}

function renderLoanRows(options) {
  const { state, loanRows, escapeHtml, formatDate, formatGrams } = options;
  const locale = state.locale || "en";

  if (loanRows.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "loans.noMatch", "No loans match this search or filter."))}</div>`;
  }

  return loanRows
    .map((row) => {
      const direction = normalizeLoanDirection(row);
      const counterparty =
        row.loan.borrower_name ||
        row.loan.counterparty_name ||
        t(locale, "loans.unknownBorrower", "Unknown");
      const returned = isLoanReturned(row);
      const active = isLoanCurrentlyActive(row);
      const isSelected = row.loan.spool_id === state.selectedSpoolId;
      const swatch =
        row.hex_color ||
        suggestSwatchHex(row.color_name, row.filament_name, row.vendor, row.material);
      const displayTitle = formatInventoryDisplayTitle(row.material, row.filament_name, row.color_name);
      const loanReference = formatRollReference({ id: row.loan.spool_id });
      const vendorName = row.vendor || t(locale, "loans.unknownVendor", "Unknown vendor");
      const subtitleBits = [
        direction === "INBOUND"
          ? t(locale, "loans.borrowedFrom", "Borrowed from {name}", { name: counterparty })
          : counterparty,
        formatGrams(row.loan.grams_out),
        returned
          ? t(locale, "loans.returnedAt", "Returned {date}", { date: formatDate(row.loan.returned_at) })
          : t(locale, "loans.lentAt", "Lent {date}", { date: formatDate(row.loan.lent_at) }),
      ]
        .filter(Boolean)
        .map((value) => escapeHtml(value))
        .join(" · ");
      const metaBits = [
        vendorName,
        loanReference,
        active ? `${formatGrams(row.spool_remaining_g)} ${t(locale, "loans.onSpool", "on spool")}` : "",
      ]
        .filter(Boolean)
        .map((value) => escapeHtml(value))
        .join(" · ");
      return renderSwatchSurface({
        tag: "article",
        className: "loan-card compact-loan-card",
        attributes: { "data-selected": isSelected ? "true" : "false" },
        escapeHtml,
        swatch,
        body: `
          <div class="loan-card-head">
            <div class="stack loan-card-copy">
              <div class="swatch-line">
                <span class="swatch-dot" style="background:${escapeHtml(toSwatchColor(swatch))};"></span>
                <span class="list-title">${escapeHtml(displayTitle)}</span>
              </div>
              <div class="list-subtitle">${subtitleBits}</div>
              <div class="meta-line">${metaBits}</div>
            </div>
            <div class="pill-row compact-pill-row">
              <span class="pill">${escapeHtml(loanStateLabel(row, locale))}</span>
            </div>
          </div>
          ${
            row.loan.lent_note
              ? `<div class="loan-note"><strong>${escapeHtml(t(locale, "loans.loanNote", "Loan note:"))}</strong> ${escapeHtml(row.loan.lent_note)}</div>`
              : ""
          }
          ${
            returned && row.loan.return_note
              ? `<div class="loan-note loan-note-secondary"><strong>${escapeHtml(t(locale, "loans.returnNote", "Return note:"))}</strong> ${escapeHtml(row.loan.return_note)}</div>`
              : ""
          }
          <div class="loan-card-actions">
            ${
              active
                ? renderCompanionActionButton({
                    swatch: true,
                    className: "loan-action-button",
                    attributes: {
                      "data-action": "toggle-loan-return",
                      "data-loan-id": row.loan.id,
                    },
                    escapeHtml,
                    label:
                      direction === "INBOUND"
                        ? t(locale, "detail.handBackSpool", "Hand back spool")
                        : t(locale, "loans.returnLoan", "Return loan"),
                  })
              : ""
            }
          </div>
        `,
      });
    })
    .join("");
}

export function renderLoanPickerTaskSheetBody(options) {
  const { state, loanSpoolOptions, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";

  if (!loanSpoolOptions.length) {
    return `<div class="empty-card">${escapeHtml(
      t(locale, "loans.noEligibleSpools", "No spools are currently available for outbound loan."),
    )}</div>`;
  }

  return `
    <div class="stack loan-picker-sheet">
      <div class="stack loan-list">
        ${renderLoanPickerRows({ locale, loanSpoolOptions, escapeHtml, formatGrams })}
      </div>
    </div>
  `;
}

export function renderLoanReturnTaskSheetBody(options) {
  const { state, loanRow, escapeHtml, formatDate, formatGrams } = options;
  const locale = state.locale || "en";

  if (!loanRow) {
    return `<div class="empty-card">${escapeHtml(t(locale, "loans.unavailable", "This loan is no longer available."))}</div>`;
  }

  const counterparty =
    loanRow.loan.borrower_name ||
    loanRow.loan.counterparty_name ||
    t(locale, "loans.unknownBorrower", "Unknown");
  const direction = normalizeLoanDirection(loanRow);
  const tareWeight = resolveSpoolTareWeight(loanRow, loanRow.vendor);
  const defaultMeasuredReturnWeight =
    Number(loanRow.spool_remaining_g ?? loanRow.loan.grams_out ?? 0) + tareWeight;
  const actionSwatch =
    loanRow.hex_color ||
    suggestSwatchHex(loanRow.color_name, loanRow.filament_name, loanRow.vendor, loanRow.material);

  return `
    <div class="stack loan-return-task-sheet">
      <div class="metric-grid compact-loan-metadata">
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(
            direction === "INBOUND" ? t(locale, "detail.borrowedFrom", "Borrowed from") : t(locale, "loans.borrower", "Borrower"),
          )}</div>
          <div class="metric-value">${escapeHtml(counterparty)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(
            direction === "INBOUND" ? t(locale, "detail.borrowedInDate", "Borrowed in") : t(locale, "loans.lentOut", "Lent out"),
          )}</div>
          <div class="metric-value">${escapeHtml(
            direction === "INBOUND" ? formatDate(loanRow.loan.lent_at) : formatGrams(loanRow.loan.grams_out),
          )}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "loans.lentAtLabel", "Lent at"))}</div>
          <div class="metric-value">${escapeHtml(formatDate(loanRow.loan.lent_at))}</div>
        </div>
      </div>
      <form class="stack loan-return-sheet" data-action="${escapeHtml(direction === "INBOUND" ? "hand-back-loan-form" : "return-loan-history-form")}">
        <input type="hidden" name="loan-id" value="${escapeHtml(loanRow.loan.id)}" />
        <input type="hidden" name="spool-id" value="${escapeHtml(loanRow.loan.spool_id)}" />
        ${renderDetailField({
          escapeHtml,
          label:
            direction === "INBOUND"
              ? t(locale, "detail.handBackMeasuredWeight", "Hand-back total weight incl. spool (g)")
              : t(locale, "loans.returnedMeasuredWeight", "Returned total weight incl. spool (g)"),
          body: `<input
            class="weight-input"
            name="returned-grams"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(defaultMeasuredReturnWeight)}"
          />`,
        })}
        ${renderDetailField({
          escapeHtml,
          label:
            direction === "INBOUND"
              ? t(locale, "detail.handBackNoteOptional", "Hand-back note (optional)")
              : t(locale, "loans.returnNoteOptional", "Return note (optional)"),
          body: `<textarea
            class="detail-textarea loan-return-textarea"
            name="return-note"
            rows="3"
            placeholder="${escapeHtml(
              direction === "INBOUND"
                ? t(locale, "detail.handBackPlaceholder", "Condition or hand-back note")
                : t(locale, "loans.returnPlaceholder", "Condition or handoff note"),
            )}"
          ></textarea>`,
        })}
        ${renderFormActionBlock({
          escapeHtml,
          actions: renderCompanionActionButton({
            type: "submit",
            swatch: actionSwatch,
            disabled: state.busy,
            escapeHtml,
            label:
              direction === "INBOUND"
                ? t(locale, "detail.handBackSpool", "Hand back spool")
                : t(locale, "loans.completeReturn", "Complete return"),
          }),
        })}
      </form>
    </div>
  `;
}

export function renderLoanCreateTaskSheetBody(options) {
  const { state, selectedSpool, selectedAssignment, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";

  if (!selectedSpool) {
    return `<div class="empty-card">${escapeHtml(
      t(locale, "status.loanSelectSpool", "Select a spool before creating a loan."),
    )}</div>`;
  }

  const displayTitle = formatInventoryDisplayTitle(
    selectedSpool.master.material,
    selectedSpool.master.filament_name,
    selectedSpool.master.color_name,
  );
  const reference = formatRollReference(selectedSpool.spool);
  const tareWeight = resolveSpoolTareWeight(selectedSpool.spool, selectedSpool.master.vendor);
  const defaultMeasuredWeight = Number(selectedSpool.spool.remaining_g ?? 0) + tareWeight;
  const metadata = [
    selectedSpool.master.vendor || "",
    reference,
    formatGrams(selectedSpool.spool.remaining_g),
  ].filter(Boolean);

  return `
    <div class="stack loan-return-task-sheet">
      ${renderSwatchSelectionCard({
        body: `
        ${
          selectedAssignment
            ? `<div class="info-card">${escapeHtml(
                t(
                  locale,
                  "detail.loadedInSlot",
                  "Loaded in slot {slot} on {printer}. Creating the loan will clear that slot.",
                  { slot: selectedAssignment.slotIndex, printer: selectedAssignment.printerName },
                ),
              )}</div>`
            : ""
        }
        <form class="stack loan-return-sheet" data-action="loan-spool-form">
          <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
          ${renderDetailField({
            escapeHtml,
            label: t(locale, "detail.borrowerName", "Borrower name"),
            body: `<input
              class="text-input"
              name="borrower-name"
              type="text"
              autocomplete="name"
              placeholder="${escapeHtml(t(locale, "detail.borrowerPlaceholder", "Who is taking this spool?"))}"
            />`,
          })}
          ${renderDetailField({
            escapeHtml,
            label: t(locale, "detail.outgoingMeasuredWeight", "Outgoing total weight incl. spool (g)"),
            body: `<input
              class="weight-input"
              name="grams-out"
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(defaultMeasuredWeight)}"
            />`,
          })}
          ${renderDetailField({
            escapeHtml,
            label: t(locale, "detail.loanNoteOptional", "Loan note (optional)"),
            body: `<textarea
              class="detail-textarea loan-return-textarea"
              name="loan-note"
              rows="3"
              placeholder="${escapeHtml(t(locale, "detail.loanNotePlaceholder", "Project or return timing"))}"
            ></textarea>`,
          })}
          ${renderFormActionBlock({
            escapeHtml,
            actions: renderCompanionActionButton({
              type: "submit",
              swatch: true,
              disabled: state.busy,
              escapeHtml,
              label: t(locale, "detail.lendSpool", "Lend spool"),
            }),
          })}
        </form>
        `,
        className: "compact-loan-card loan-create-card",
        escapeHtml,
        meta: metadata,
        swatch: selectedSpool.master.hex_color,
        title: displayTitle,
      })}
    </div>
  `;
}

export function renderLoansShell(options) {
  const {
    state,
    loanRows,
    loanSummary,
    loanSpoolOptions,
    selectedSpool,
    escapeHtml,
    formatDate,
    formatGrams,
  } = options;
  const locale = state.locale || "en";

  const selectedLoanRows = state.selectedSpoolId
    ? state.loanHistory.filter((row) => row.loan.spool_id === state.selectedSpoolId)
    : [];
  const visibleSelectedLoanRows = state.selectedSpoolId
    ? loanRows.filter((row) => row.loan.spool_id === state.selectedSpoolId)
    : [];
  const filterLabel =
    state.loanStatusFilter === "ACTIVE"
      ? t(locale, "loans.activeOnly", "Active only")
      : state.loanStatusFilter === "RETURNED"
        ? t(locale, "loans.returnedOnly", "Returned only")
        : t(locale, "loans.allLoans", "All loans");
  const selectedLoanHiddenByFilters = Boolean(
    selectedSpool &&
      selectedLoanRows.length > 0 &&
      visibleSelectedLoanRows.length === 0 &&
      (state.loanStatusFilter !== "ALL" || state.loanSearch.trim()),
  );

  return `
    <section class="workflow-shell loans-shell">
      <div class="workflow-header">
        <div class="workflow-header-copy">
          <h2>${escapeHtml(t(locale, "loans.title", "Loans"))}</h2>
          <p class="section-copy">${escapeHtml(t(locale, "loans.subtitle", "Track loans and finish returns."))}</p>
        </div>
        <div class="workflow-header-side workflow-header-summary">
          ${escapeHtml(
            `${t(locale, "loans.activeFilter", "Active {count}", { count: loanSummary.active })} · ${t(locale, "loans.returnedFilter", "Returned {count}", { count: loanSummary.returned })} · ${filterLabel}`,
          )}
        </div>
      </div>

      <div class="workflow-toolbar">
        <div class="toolbar-row">
          <input
            class="search-input toolbar-search"
            name="loan-search"
            value="${escapeHtml(state.loanSearch)}"
            placeholder="${escapeHtml(t(locale, "loans.searchPlaceholder", "Search borrower, note, filament, or reference"))}"
            autocomplete="off"
          />
          <div class="toolbar-actions">
            ${renderCompanionActionButton({
              attributes: { "data-action": "start-loan-picker" },
              escapeHtml,
              label: t(locale, "detail.lendSpool", "Lend spool"),
            })}
            ${renderCompanionActionButton({
              variant: "ghost",
              attributes: { "data-action": "show-all-loans" },
              escapeHtml,
              label: t(locale, "loans.showAll", "Show all loans"),
            })}
          </div>
        </div>
        <div class="loan-filter-row" role="group" aria-label="${escapeHtml(t(locale, "loans.filterAria", "Loan status filters"))}">
          ${renderLoanFilterButton("ACTIVE", t(locale, "loans.activeFilter", "Active {count}", { count: loanSummary.active }), state.loanStatusFilter === "ACTIVE", escapeHtml)}
          ${renderLoanFilterButton("RETURNED", t(locale, "loans.returnedFilter", "Returned {count}", { count: loanSummary.returned }), state.loanStatusFilter === "RETURNED", escapeHtml)}
          ${renderLoanFilterButton("ALL", t(locale, "loans.allFilter", "All {count}", { count: loanSummary.total }), state.loanStatusFilter === "ALL", escapeHtml)}
        </div>
      </div>

      ${
        selectedLoanHiddenByFilters
          ? renderHiddenSelectionBanner({ ...selectedSpool, locale }, selectedLoanRows, escapeHtml, formatGrams)
          : ""
      }

      ${
        !loanSpoolOptions.length
          ? `<div class="info-card">${escapeHtml(
              t(locale, "loans.noEligibleSpools", "No spools are currently available for outbound loan."),
            )}</div>`
          : ""
      }

      <div class="workflow-body">
        <div class="stack loan-list">
          ${renderLoanRows({
            state,
            loanRows,
            escapeHtml,
            formatDate,
            formatGrams,
          })}
        </div>
      </div>
    </section>
  `;
}
