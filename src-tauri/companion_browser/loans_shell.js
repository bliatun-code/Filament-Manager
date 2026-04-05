import { t } from "./companion_i18n.js";
import { formatInventoryDisplayTitle, formatRollReference } from "./formatters.js";
import { styleObjectToString, suggestSwatchHex, swatchCssVars, toSwatchColor } from "./companion_theme.js";

function loanStateLabel(returned, locale = "en") {
  return returned ? t(locale, "loans.returned", "Returned") : t(locale, "loans.active", "Active");
}

function renderLoanFilterButton(filterValue, label, active, escapeHtml) {
  return `
    <button
      class="loan-filter-button"
      type="button"
      data-action="set-loan-status"
      data-loan-status="${escapeHtml(filterValue)}"
      data-active="${active ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderHiddenSelectionBanner(selectedSpool, selectedLoanRows, escapeHtml, formatGrams) {
  const locale = selectedSpool?.locale || "en";
  const activeCount = selectedLoanRows.filter((row) => !row.loan.returned_at).length;
  const returnedCount = Math.max(selectedLoanRows.length - activeCount, 0);
  const selectedTitle = formatInventoryDisplayTitle(
    selectedSpool.master.material,
    selectedSpool.master.filament_name,
    selectedSpool.master.color_name,
  );
  const summaryLine = [
    formatRollReference(selectedSpool.spool),
    formatGrams(selectedSpool.spool.remaining_g),
    t(locale, "loans.activeFilter", "Active {count}", { count: activeCount }),
    t(locale, "loans.returnedFilter", "Returned {count}", { count: returnedCount }),
  ]
    .filter(Boolean)
    .map((value) => escapeHtml(value))
    .join(" · ");
  return `
    <div
      class="selection-banner selection-banner-muted swatch-surface"
      style="${escapeHtml(styleObjectToString(swatchCssVars(selectedSpool.master.hex_color)))}"
    >
      <div class="selection-banner-copy">
        <div class="list-title">${escapeHtml(t(locale, "loans.hiddenSelectedTitle", "Selected spool hidden"))}</div>
        <div class="section-copy">${escapeHtml(t(locale, "loans.hiddenSelectedBody", "{title} still has loan rows. Clear filters to see them here.", { title: selectedTitle }))}</div>
      </div>
      <div class="selection-banner-summary meta-line">${summaryLine}</div>
      <div class="selection-banner-actions">
        <button class="secondary-button" type="button" data-action="show-all-loans">${escapeHtml(t(locale, "loans.showAll", "Show all loans"))}</button>
        <button class="ghost-button" type="button" data-action="set-root-flow" data-root-flow="storage">${escapeHtml(t(locale, "nav.storage", "Storage"))}</button>
        <button class="ghost-button" type="button" data-action="open-current-detail">${escapeHtml(t(locale, "detail.openDetail", "Open details"))}</button>
      </div>
    </div>
  `;
}

function renderLoanRows(options) {
  const { state, loanRows, escapeHtml, formatDate, formatGrams } = options;
  const locale = state.locale || "en";

  if (loanRows.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "loans.noMatch", "No outbound loans match this search or filter."))}</div>`;
  }

  return loanRows
    .map((row) => {
      const borrowerName =
        row.loan.borrower_name ||
        row.loan.counterparty_name ||
        t(locale, "loans.unknownBorrower", "Unknown");
      const returned = Boolean(row.loan.returned_at);
      const isSelected = row.loan.spool_id === state.selectedSpoolId;
      const swatch =
        row.hex_color ||
        suggestSwatchHex(row.color_name, row.filament_name, row.vendor, row.material);
      const displayTitle = formatInventoryDisplayTitle(row.material, row.filament_name, row.color_name);
      const loanReference = formatRollReference({ id: row.loan.spool_id });
      const vendorName = row.vendor || t(locale, "loans.unknownVendor", "Unknown vendor");
      const subtitleBits = [
        borrowerName,
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
        returned ? "" : `${formatGrams(row.spool_remaining_g)} on spool`,
      ]
        .filter(Boolean)
        .map((value) => escapeHtml(value))
        .join(" · ");
      return `
        <article
          class="surface-card loan-card compact-loan-card swatch-surface"
          data-selected="${isSelected ? "true" : "false"}"
          style="${escapeHtml(styleObjectToString(swatchCssVars(swatch)))}"
        >
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
              <span class="pill">${escapeHtml(loanStateLabel(returned, locale))}</span>
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
              !returned
                ? `
                  <button
                    class="primary-button loan-action-button"
                    type="button"
                    data-action="toggle-loan-return"
                    data-loan-id="${escapeHtml(row.loan.id)}"
                  >
                    ${escapeHtml(t(locale, "loans.returnLoan", "Return loan"))}
                  </button>
                `
                : ""
            }
            <button
              class="secondary-button loan-action-button"
              type="button"
              data-action="open-loan-spool"
              data-spool-id="${escapeHtml(row.loan.spool_id)}"
            >
              ${escapeHtml(t(locale, "loans.openSpool", "Open spool"))}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderLoanReturnTaskSheetBody(options) {
  const { state, loanRow, escapeHtml, formatDate, formatGrams } = options;
  const locale = state.locale || "en";

  if (!loanRow) {
    return `<div class="empty-card">${escapeHtml(t(locale, "loans.unavailable", "This loan is no longer available."))}</div>`;
  }

  const borrowerName =
    loanRow.loan.borrower_name ||
    loanRow.loan.counterparty_name ||
    t(locale, "loans.unknownBorrower", "Unknown");

  return `
    <div class="stack loan-return-task-sheet">
      <div class="metric-grid compact-loan-metadata">
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "loans.borrower", "Borrower"))}</div>
          <div class="metric-value">${escapeHtml(borrowerName)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "loans.lentOut", "Lent out"))}</div>
          <div class="metric-value">${escapeHtml(formatGrams(loanRow.loan.grams_out))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "loans.lentAtLabel", "Lent at"))}</div>
          <div class="metric-value">${escapeHtml(formatDate(loanRow.loan.lent_at))}</div>
        </div>
      </div>
      <form class="stack loan-return-sheet" data-action="return-loan-history-form">
        <input type="hidden" name="loan-id" value="${escapeHtml(loanRow.loan.id)}" />
        <input type="hidden" name="spool-id" value="${escapeHtml(loanRow.loan.spool_id)}" />
        <label class="stack detail-field">
          <span class="muted">${escapeHtml(t(locale, "loans.returnedWeight", "Returned weight (grams)"))}</span>
          <input
            class="weight-input"
            name="returned-grams"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(loanRow.spool_remaining_g ?? loanRow.loan.grams_out ?? "")}"
          />
        </label>
        <label class="stack detail-field">
          <span class="muted">${escapeHtml(t(locale, "loans.returnNoteOptional", "Return note (optional)"))}</span>
          <textarea
            class="detail-textarea loan-return-textarea"
            name="return-note"
            rows="3"
            placeholder="${escapeHtml(t(locale, "loans.returnPlaceholder", "Condition or handoff note"))}"
          ></textarea>
        </label>
        <div class="detail-actions form-action-block">
          <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>
            ${escapeHtml(t(locale, "loans.completeReturn", "Complete return"))}
          </button>
        </div>
      </form>
    </div>
  `;
}

export function renderLoansShell(options) {
  const {
    state,
    loanRows,
    loanSummary,
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
            <button class="ghost-button" type="button" data-action="show-all-loans">
              ${escapeHtml(t(locale, "loans.showAll", "Show all loans"))}
            </button>
          </div>
        </div>
        <div class="loan-filter-row" role="group" aria-label="Loan status filters">
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
