import { t } from "./companion_i18n.js";
import { formatInventoryDisplayTitle, formatRollReference, formatStatusLabel } from "./formatters.js";
import { styleObjectToString, swatchCssVars } from "./companion_theme.js";

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

function resolveSpoolTareWeight(spool, master) {
  const explicit = spool?.spool_tare_weight_g;
  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(master?.vendor);
}

export function renderSelectedSpoolDetailBody(options) {
  const {
    selectedSpool,
    selectedDetail,
    detailFeedback,
    busy,
    compactDetail,
    findAssignedSlotForSpool,
    loanActionState,
    escapeHtml,
    formatDate,
    formatGrams,
    formatPlacementLabel,
    ownershipLabel,
    locale = "en",
  } = options;

  const activeLoan = selectedDetail?.active_loan || null;
  const activeLoanRow = activeLoan?.loan || null;
  const activeLoanDirection = activeLoanRow?.loan_direction?.trim().toUpperCase() || "";
  const activeLoanIsOutbound = Boolean(activeLoanRow) && activeLoanDirection !== "INBOUND";
  const selectedSpoolIsBorrowedIn =
    (selectedSpool?.spool?.ownership_type || "").trim().toUpperCase() === "BORROWED_IN";
  const borrowedInOwner =
    selectedSpool.spool.owner_name ||
    activeLoanRow?.counterparty_name ||
    activeLoanRow?.borrower_name ||
    "";
  const borrowedInContact =
    selectedSpool.spool.owner_contact || activeLoanRow?.counterparty_contact || "";
  const borrowedInNote =
    selectedSpool.spool.ownership_note ||
    activeLoanRow?.counterparty_note ||
    activeLoanRow?.lent_note ||
    "";
  const selectedAssignment = findAssignedSlotForSpool(selectedSpool.spool.id);
  const loanState = loanActionState(selectedSpool);
  const defaultLoanGrams =
    selectedSpool?.spool?.remaining_g ?? selectedSpool?.spool?.current_weight_g ?? "";
  const defaultReturnedGrams =
    selectedSpool?.spool?.remaining_g ?? activeLoanRow?.grams_out ?? "";
  const normalizedDetailStatus = (selectedSpool.spool.status || "").trim().toUpperCase();
  const detailStatus = ["IN_STOCK", "EMPTY", "LOST"].includes(normalizedDetailStatus)
    ? normalizedDetailStatus
    : "IN_STOCK";
  const detailStatusLabel = formatStatusLabel(detailStatus, locale);
  const detailLocation = selectedSpool.spool.location_id || "";
  const detailPlacementLabel = formatPlacementLabel(detailLocation);
  const detailTitle = formatInventoryDisplayTitle(
    selectedSpool.master.material,
    selectedSpool.master.filament_name,
    selectedSpool.master.color_name,
  );
  const detailReference = formatRollReference(selectedSpool.spool);
  const detailTareWeight = resolveSpoolTareWeight(selectedSpool.spool, selectedSpool.master);
  const defaultMeasuredWeight =
    (selectedSpool?.spool?.remaining_g ?? selectedSpool?.spool?.current_weight_g ?? 0) +
    detailTareWeight;
  const detailQrImageSrc = `/api/v1/spools/${encodeURIComponent(selectedSpool.spool.id)}/qr-image.svg`;
  const detailAssignmentLabel = selectedAssignment
    ? `${selectedAssignment.printerName} · ${t(locale, "printers.slot", "Slot")} ${selectedAssignment.slotIndex}`
    : t(locale, "detail.notLoaded", "Not loaded");
  const detailSummaryBits = [detailReference];
  if (selectedAssignment) {
    detailSummaryBits.push(detailAssignmentLabel);
  } else if (detailLocation) {
    detailSummaryBits.push(detailPlacementLabel);
  } else {
    detailSummaryBits.push(detailAssignmentLabel);
  }
  const usageCount = selectedDetail?.usage?.length || 0;
  const historyCount = selectedDetail?.history?.length || 0;
  const usageTimeline = renderUsageTimeline(selectedDetail?.usage || [], { escapeHtml, formatDate, formatGrams, locale });
  const historyTimeline = renderHistoryTimeline(selectedDetail?.history || [], { escapeHtml, formatDate, locale });
  const loanSectionTitle = selectedSpoolIsBorrowedIn
    ? t(locale, "format.borrowedIn", "Borrowed in")
    : activeLoanRow
      ? t(locale, "detail.loan", "Loan")
      : t(locale, "detail.lendSpool", "Lend spool");
  const loanSectionCopy = selectedSpoolIsBorrowedIn
    ? t(locale, "detail.borrowedInHelp", "Owner details and hand-back.")
    : activeLoanIsOutbound
      ? t(locale, "detail.currentlyOnLoan", "Currently on loan.")
      : activeLoanRow
        ? t(locale, "detail.activeInbound", "Active inbound record.")
        : t(locale, "detail.createOutboundLoan", "Create an outbound loan.");

  return `
    <div class="detail-stack">
      <div
        class="surface-card detail-summary-card detail-section-card swatch-surface"
        style="${escapeHtml(styleObjectToString(swatchCssVars(selectedSpool.master.hex_color)))}"
      >
        <div class="stack">
          <div class="detail-summary-head">
            <div class="detail-summary-copy">
              <div class="detail-title">${escapeHtml(detailTitle)}</div>
              <div class="detail-subtitle">${escapeHtml(selectedSpool.master.vendor)}</div>
            </div>
            <div class="pill-row detail-summary-pills">
              <span class="pill">${escapeHtml(detailStatusLabel)}</span>
              <span class="pill">${escapeHtml(ownershipLabel(selectedSpool.spool))}</span>
            </div>
          </div>
          <div class="meta-line detail-summary-meta">
            ${escapeHtml(detailSummaryBits.join(" · "))}
          </div>
          ${
            detailFeedback
              ? `<div class="info-card detail-feedback-card detail-feedback-success">${escapeHtml(detailFeedback)}</div>`
              : ""
          }
          <div class="detail-summary-stats">
            <div class="detail-summary-stat">
              <div class="muted">${escapeHtml(t(locale, "detail.started", "Started"))}</div>
              <div class="detail-summary-stat-value">${escapeHtml(formatGrams(selectedSpool.spool.initial_weight_g))}</div>
            </div>
            <div class="detail-summary-stat">
              <div class="muted">${escapeHtml(t(locale, "detail.now", "Now"))}</div>
              <div class="detail-summary-stat-value">${escapeHtml(formatGrams(selectedSpool.spool.current_weight_g))}</div>
            </div>
          </div>
          <form
            class="stack detail-form detail-quick-form ${compactDetail ? "detail-quick-form-compact" : "detail-quick-form-inline"}"
            data-action="update-weight-form"
          >
            <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "detail.measuredWeightGrams", "Measured total weight (g)"))}</span>
              <input class="weight-input" name="grams" type="number" min="0" step="1" value="${escapeHtml(defaultMeasuredWeight)}" />
            </label>
            <div class="detail-actions form-action-block">
              <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "detail.saveWeight", "Save weight"))}</button>
            </div>
          </form>
          <form
            class="stack detail-form detail-quick-form ${compactDetail ? "detail-quick-form-compact" : "detail-quick-form-inline"}"
            data-action="update-tare-weight-form"
          >
            <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "detail.emptySpoolWeight", "Empty spool weight (g)"))}</span>
              <input class="weight-input" name="tare-grams" type="number" min="0" step="1" value="${escapeHtml(detailTareWeight)}" />
            </label>
            <div class="detail-actions form-action-block">
              <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "detail.saveEmptySpoolWeight", "Save empty spool weight"))}</button>
            </div>
          </form>
        </div>
      </div>

      <div class="surface-card detail-section-card">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(t(locale, "detail.details", "Details"))}</h3>
            <p class="section-copy">${escapeHtml(t(locale, "detail.detailsHelp", "Code, status, and placement."))}</p>
          </div>
        </div>
        <div class="stack">
          <div class="stack detail-form detail-edit-pane">
            <span class="muted">${escapeHtml(t(locale, "detail.qrPreview", "QR code"))}</span>
            <img
              class="detail-qr-preview"
              src="${escapeHtml(detailQrImageSrc)}"
              alt="${escapeHtml(t(locale, "detail.qrPreviewAlt", "Filament QR code for quick companion detail lookup"))}"
            />
          </div>
        </div>
      </div>

      <div class="surface-card detail-section-card">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(loanSectionTitle)}</h3>
            <p class="section-copy">${escapeHtml(loanSectionCopy)}</p>
          </div>
        </div>
        ${
          selectedSpoolIsBorrowedIn
            ? renderBorrowedInLoanPanel({
                activeLoanRow,
                borrowedInContact,
                borrowedInNote,
              borrowedInOwner,
              busy,
              defaultReturnedGrams,
              escapeHtml,
              formatDate,
              selectedSpool,
              locale,
            })
            : activeLoanRow
              ? renderActiveLoanPanel({
                  activeLoanIsOutbound,
                  activeLoanRow,
                  busy,
                  defaultReturnedGrams,
                  escapeHtml,
                  formatDate,
                  formatGrams,
                  selectedSpool,
                  locale,
                })
              : renderCreateLoanPanel({
                  busy,
                  defaultLoanGrams,
                  escapeHtml,
                  loanState,
                  selectedAssignment,
                  selectedSpool,
                  locale,
                })
        }
      </div>

      ${renderHistorySection({
        compactDetail,
        usageCount,
        historyCount,
        usageTimeline,
        historyTimeline,
        escapeHtml,
        locale,
      })}
    </div>
  `;
}

function renderBorrowedInLoanPanel(options) {
  const {
    activeLoanRow,
    borrowedInContact,
    borrowedInNote,
    borrowedInOwner,
    busy,
    defaultReturnedGrams,
    escapeHtml,
    formatDate,
    selectedSpool,
    locale = "en",
  } = options;

  return `
    <div class="stack">
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.borrowedFrom", "Borrowed from"))}</div>
          <div class="metric-value">${escapeHtml(borrowedInOwner || t(locale, "format.unknown", "Unknown"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.contact", "Contact"))}</div>
          <div class="metric-value">${escapeHtml(borrowedInContact || t(locale, "detail.notSet", "Not set"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.borrowedInDate", "Borrowed in"))}</div>
          <div class="metric-value">${escapeHtml(formatDate(activeLoanRow?.lent_at))}</div>
        </div>
      </div>
      <form class="stack detail-form" data-action="update-borrowed-in-form">
        <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
        <div class="borrowed-in-grid">
          <label class="stack detail-field">
            <span class="muted">${escapeHtml(t(locale, "detail.borrowedFrom", "Borrowed from"))}</span>
            <input
              class="text-input"
              name="borrowed-edit-owner-name"
              type="text"
              autocomplete="name"
              value="${escapeHtml(borrowedInOwner)}"
              placeholder="${escapeHtml(t(locale, "detail.borrowedFromPlaceholder", "Owner or counterparty name"))}"
            />
          </label>
          <label class="stack detail-field">
            <span class="muted">${escapeHtml(t(locale, "detail.ownerContactOptional", "Owner contact (optional)"))}</span>
            <input
              class="text-input"
              name="borrowed-edit-owner-contact"
              type="text"
              autocomplete="email"
              value="${escapeHtml(borrowedInContact)}"
              placeholder="${escapeHtml(t(locale, "detail.ownerContactPlaceholder", "Phone, email, or handle"))}"
            />
          </label>
          <label class="stack detail-field borrowed-in-field-wide">
            <span class="muted">${escapeHtml(t(locale, "detail.noteOptional", "Note (optional)"))}</span>
            <textarea
              class="detail-textarea borrowed-note-textarea"
              name="borrowed-edit-note"
              rows="3"
              placeholder="${escapeHtml(t(locale, "detail.notePlaceholder", "Return timing or other context"))}"
            >${escapeHtml(borrowedInNote)}</textarea>
          </label>
        </div>
        <div class="detail-actions form-action-block">
          <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "detail.saveOwnerDetails", "Save owner details"))}</button>
        </div>
      </form>
      ${
        activeLoanRow
          ? `
            <form class="stack detail-form" data-action="hand-back-loan-form">
              <input type="hidden" name="loan-id" value="${escapeHtml(activeLoanRow.id)}" />
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.handBackWeight", "Hand-back weight (g)"))}</span>
                <input class="weight-input" name="returned-grams" type="number" min="0" step="1" value="${escapeHtml(defaultReturnedGrams)}" />
              </label>
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.handBackNoteOptional", "Hand-back note (optional)"))}</span>
                <textarea class="detail-textarea" name="return-note" rows="3" placeholder="${escapeHtml(t(locale, "detail.handBackPlaceholder", "Condition or hand-back note"))}"></textarea>
              </label>
              <div class="detail-actions form-action-block">
                <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "detail.handBackSpool", "Hand back spool"))}</button>
              </div>
            </form>
          `
          : `
            <div class="info-card">
              ${escapeHtml(t(locale, "detail.noBorrowedRecord", "No active borrowed-in record was found for this spool."))}
            </div>
          `
      }
    </div>
  `;
}

function renderActiveLoanPanel(options) {
  const {
    activeLoanIsOutbound,
    activeLoanRow,
    busy,
    defaultReturnedGrams,
    escapeHtml,
    formatDate,
    formatGrams,
    selectedSpool,
    locale = "en",
  } = options;

  return `
    <div class="stack">
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.counterparty", "Counterparty"))}</div>
          <div class="metric-value">${escapeHtml(activeLoanRow.borrower_name || activeLoanRow.counterparty_name || t(locale, "format.unknown", "Unknown"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.lentOut", "Lent out"))}</div>
          <div class="metric-value">${escapeHtml(formatGrams(activeLoanRow.grams_out))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(t(locale, "detail.lentAt", "Lent at"))}</div>
          <div class="metric-value">${escapeHtml(formatDate(activeLoanRow.lent_at))}</div>
        </div>
      </div>
      ${activeLoanRow.lent_note ? `<div class="info-card">${escapeHtml(activeLoanRow.lent_note)}</div>` : ""}
      ${
        activeLoanIsOutbound
          ? `
            <form class="stack detail-form" data-action="return-loan-form">
              <input type="hidden" name="loan-id" value="${escapeHtml(activeLoanRow.id)}" />
              <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.returnedWeight", "Returned weight (g)"))}</span>
                <input class="weight-input" name="returned-grams" type="number" min="0" step="1" value="${escapeHtml(defaultReturnedGrams)}" />
              </label>
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.returnNoteOptional", "Return note (optional)"))}</span>
                <textarea class="detail-textarea" name="return-note" rows="3" placeholder="${escapeHtml(t(locale, "detail.returnPlaceholder", "Condition or return note"))}"></textarea>
              </label>
              <div class="detail-actions form-action-block">
                <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "loans.returnLoan", "Return loan"))}</button>
              </div>
            </form>
          `
          : `
            <div class="info-card">
              ${escapeHtml(t(locale, "detail.useBorrowedInSection", "Hand back this borrowed-in spool from the borrowed-in section above."))}
            </div>
          `
      }
    </div>
  `;
}

function renderCreateLoanPanel(options) {
  const {
    busy,
    defaultLoanGrams,
    escapeHtml,
    loanState,
    selectedAssignment,
    selectedSpool,
    locale = "en",
  } = options;

  if (!loanState.allowed) {
    return `
      <div class="info-card">
        ${escapeHtml(loanState.reason)}
      </div>
    `;
  }

  return `
    <form class="stack detail-form" data-action="loan-spool-form">
      <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
      <label class="stack detail-field">
        <span class="muted">${escapeHtml(t(locale, "detail.borrowerName", "Borrower name"))}</span>
        <input class="text-input" name="borrower-name" type="text" autocomplete="name" placeholder="${escapeHtml(t(locale, "detail.borrowerPlaceholder", "Who is taking this spool?"))}" />
      </label>
      <label class="stack detail-field">
        <span class="muted">${escapeHtml(t(locale, "detail.outgoingWeight", "Outgoing weight (g)"))}</span>
        <input class="weight-input" name="grams-out" type="number" min="0" step="1" value="${escapeHtml(defaultLoanGrams)}" />
      </label>
      <label class="stack detail-field">
        <span class="muted">${escapeHtml(t(locale, "detail.loanNoteOptional", "Loan note (optional)"))}</span>
        <textarea class="detail-textarea" name="loan-note" rows="3" placeholder="${escapeHtml(t(locale, "detail.loanNotePlaceholder", "Project or return timing"))}"></textarea>
      </label>
      ${
        selectedAssignment
          ? `<div class="info-card">${escapeHtml(t(locale, "detail.loadedInSlot", "Loaded in slot {slot} on {printer}. Creating the loan will clear that slot.", { slot: selectedAssignment.slotIndex, printer: selectedAssignment.printerName }))}</div>`
          : ""
      }
      <div class="detail-actions form-action-block">
        <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>${escapeHtml(t(locale, "detail.lendSpool", "Lend spool"))}</button>
      </div>
    </form>
  `;
}

function renderUsageTimeline(usageRows, helpers) {
  const { escapeHtml, formatDate, formatGrams, locale = "en" } = helpers;
  if (usageRows.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "detail.noUsage", "No usage points recorded yet."))}</div>`;
  }

  return usageRows
    .slice(0, 10)
    .map(
      (point) => `
        <div class="timeline-item">
          <div class="list-title">${escapeHtml(formatGrams(point.grams))}</div>
          <div class="muted">${escapeHtml(point.source || t(locale, "detail.unknownSource", "Unknown source"))}</div>
          <div class="meta-line">${escapeHtml(formatDate(point.captured_at))}</div>
        </div>
      `,
    )
    .join("");
}

function renderHistoryTimeline(historyRows, helpers) {
  const { escapeHtml, formatDate, locale = "en" } = helpers;
  if (historyRows.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "detail.noHistory", "No history recorded yet."))}</div>`;
  }

  return historyRows
    .slice(0, 12)
    .map(
      (event) => `
        <div class="timeline-item">
          <div class="list-title">${escapeHtml(formatHistoryEventLabel(event.event_type, locale))}</div>
          <div class="meta-line">${escapeHtml(formatDate(event.created_at))}</div>
        </div>
      `,
    )
    .join("");
}

function renderHistorySection(options) {
  const {
    compactDetail,
    usageCount,
    historyCount,
    usageTimeline,
    historyTimeline,
    escapeHtml,
    locale = "en",
  } = options;
  const historySummaryBits = [];
  if (usageCount > 0) {
    historySummaryBits.push(
      locale === "nb"
        ? `${usageCount} vektkontroll${usageCount === 1 ? "" : "er"}`
        : `${usageCount} weight check${usageCount === 1 ? "" : "s"}`,
    );
  }
  if (historyCount > 0) {
    historySummaryBits.push(
      locale === "nb"
        ? `${historyCount} aktivitet${historyCount === 1 ? "" : "er"}`
        : `${historyCount} activity item${historyCount === 1 ? "" : "s"}`,
    );
  }
  const historySummary = historySummaryBits.join(" · ") || t(locale, "detail.noRecentHistory", "No recent history");
  const historyOpen = !compactDetail || historySummaryBits.length <= 0;

  return `
    <details class="surface-card detail-section-card detail-history-card detail-collapsible detail-history-collapsible" ${historyOpen ? "open" : ""}>
      <summary class="detail-collapsible-summary">
        <span>${escapeHtml(t(locale, "detail.history", "History"))}</span>
        <span class="detail-history-summary">${escapeHtml(historySummary)}</span>
      </summary>
      <div class="detail-collapsible-body">
        <div class="detail-history-grid">
          <div class="stack detail-history-block">
            <div class="list-title">${escapeHtml(t(locale, "detail.weightChecks", "Weight checks"))}</div>
            <div class="timeline-list">
              ${usageTimeline}
            </div>
          </div>
          <div class="stack detail-history-block">
            <div class="list-title">${escapeHtml(t(locale, "detail.recentActivity", "Recent activity"))}</div>
            <div class="timeline-list">
              ${historyTimeline}
            </div>
          </div>
        </div>
      </div>
    </details>
  `;
}

function formatHistoryEventLabel(value, locale = "en") {
  const label = String(value || "").trim();
  if (!label) {
    return t(locale, "detail.activity", "Activity");
  }
  const normalized = label.replaceAll("_", " ");
  const eventKeys = {
    weight_update: "detail.eventWeightUpdate",
    qr_code_update: "detail.eventQrCodeUpdate",
    status_location_update: "detail.eventStatusLocationUpdate",
    assigned_to_ams: "detail.eventAssignedToAms",
    cleared_from_ams: "detail.eventClearedFromAms",
  };
  return t(locale, eventKeys[label] || "", normalized);
}
