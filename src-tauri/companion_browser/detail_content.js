import { t } from "./companion_i18n.js";
import { resolveSpoolTareWeight } from "./companion_spool_weight.js";
import { formatInventoryDisplayTitle, formatRollReference, formatStatusLabel } from "./formatters.js";
import { styleObjectToString, swatchCssVars } from "./companion_theme.js";

export function renderSelectedSpoolDetailBody(options) {
  const {
    selectedSpool,
    selectedDetail,
    detailFeedback,
    busy,
    compactDetail,
    findAssignedSlotForSpool,
    escapeHtml,
    formatDate,
    formatGrams,
    formatPlacementLabel,
    ownershipLabel,
    rfidCaptureSources = [],
    locale = "en",
  } = options;

  const selectedAssignment = findAssignedSlotForSpool(selectedSpool.spool.id);
  const detailTareWeight = resolveSpoolTareWeight(selectedSpool.spool, selectedSpool.master?.vendor);
  const normalizedDetailStatus = (selectedSpool.spool.status || "").trim().toUpperCase();
  const detailStatus = ["IN_STOCK", "EMPTY", "LOST"].includes(normalizedDetailStatus)
    ? normalizedDetailStatus
    : "IN_STOCK";
  const detailStatusLabel = formatStatusLabel(detailStatus, locale);
  const detailLocation = selectedSpool.spool.location_id || "";
  const detailHomeLocation = selectedSpool.spool.home_location_id || "";
  const detailPlacementLabel = formatPlacementLabel(detailLocation, locale);
  const detailHomePlacementLabel = detailHomeLocation
    ? formatPlacementLabel(detailHomeLocation, locale)
    : t(locale, "format.unassigned", "Unassigned");
  const detailTitle = formatInventoryDisplayTitle(
    selectedSpool.master.material,
    selectedSpool.master.filament_name,
    selectedSpool.master.color_name,
  );
  const detailReference = formatRollReference(selectedSpool.spool);
  const defaultMeasuredWeight =
    (selectedSpool?.spool?.remaining_g ?? selectedSpool?.spool?.current_weight_g ?? 0) +
    detailTareWeight;
  const detailQrImageSrc = `/api/v1/spools/${encodeURIComponent(selectedSpool.spool.id)}/qr-image.svg`;
  const detailAssignmentLabel = selectedAssignment
    ? `${selectedAssignment.printerName} · ${t(locale, "printers.slot", "Slot")} ${selectedAssignment.slotIndex}`
    : t(locale, "detail.notLoaded", "Not loaded");
  const detailSummaryBits = [];
  if (selectedSpool.master.vendor) {
    detailSummaryBits.push(selectedSpool.master.vendor);
  }
  detailSummaryBits.push(detailReference);
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
  const selectedCaptureSource = rfidCaptureSources.find((source) => source.rfidTag) || rfidCaptureSources[0] || null;
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

      <details class="surface-card detail-section-card detail-collapsible" data-collapsible="details">
        <summary class="detail-collapsible-summary">
          <span>${escapeHtml(t(locale, "detail.details", "Details"))}</span>
        </summary>
        <div class="detail-collapsible-body">
          <form class="stack detail-form detail-edit-pane" data-action="update-spool-details-form">
            <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
            <div class="meta-line">${escapeHtml(`${detailReference} · ${detailPlacementLabel}`)}</div>
            <div class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "detail.currentLocation", "Current location"))}</span>
              <div class="meta-line">${escapeHtml(detailPlacementLabel)}</div>
            </div>
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "detail.status", "Status"))}</span>
              <select class="text-input" name="status" ${busy ? "disabled" : ""}>
                ${[
                  ["IN_STOCK", t(locale, "format.inStock", "In stock")],
                  ["EMPTY", t(locale, "format.empty", "Empty")],
                  ["LOST", t(locale, "format.lost", "Lost")],
                ]
                  .map(
                    ([value, label]) =>
                      `<option value="${escapeHtml(value)}" ${detailStatus === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
                  )
                  .join("")}
              </select>
            </label>
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "detail.homeLocationOptional", "Home location (optional)"))}</span>
              <input type="hidden" name="location" value="${escapeHtml(detailLocation)}" />
              <input
                class="text-input"
                name="home-location"
                type="text"
                value="${escapeHtml(detailHomeLocation)}"
                placeholder="${escapeHtml(t(locale, "detail.homeLocationPlaceholder", "Shelf, drawer, or cart"))}"
                ${busy ? "disabled" : ""}
              />
              <div class="meta-line">${escapeHtml(detailHomePlacementLabel)}</div>
            </label>
            <div class="detail-actions form-action-block">
              <button class="primary-button" type="submit" ${busy ? "disabled" : ""}>
                ${escapeHtml(t(locale, "detail.saveDetails", "Save details"))}
              </button>
            </div>
          </form>
          <div class="stack detail-form detail-edit-pane">
            <span class="muted">${escapeHtml(t(locale, "detail.qrPreview", "QR code"))}</span>
            <img
              class="detail-qr-preview"
              src="${escapeHtml(detailQrImageSrc)}"
              alt="${escapeHtml(t(locale, "detail.qrPreviewAlt", "Filament QR code for quick companion detail lookup"))}"
            />
          </div>
        </div>
      </details>

      <details class="surface-card detail-section-card detail-collapsible" data-collapsible="rfid">
        <summary class="detail-collapsible-summary">
          <span>${escapeHtml(t(locale, "inventory.rfidButton", "RFID"))}</span>
          <span class="detail-history-summary">${escapeHtml(t(locale, "inventory.rfidHintReady", "Capture and save observed AMS identity to this spool."))}</span>
        </summary>
        <div class="detail-collapsible-body">
          <form class="stack detail-form detail-edit-pane" data-action="update-spool-rfid-form">
            <input type="hidden" name="spool-id" value="${escapeHtml(selectedSpool.spool.id)}" />
            <div class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "inventory.rfidCurrentTag", "Saved RFID"))}</span>
              <div class="meta-line">${escapeHtml(selectedSpool.spool.rfid_tag?.trim() || "—")}</div>
            </div>
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "inventory.rfidSourceSlot", "RFID source slot"))}</span>
              <select class="text-input" name="rfid-source" ${busy || !selectedCaptureSource ? "disabled" : ""}>
                ${
                  rfidCaptureSources.length > 0
                    ? rfidCaptureSources
                        .map(
                          (source, index) => `
                            <option value="${escapeHtml(`${encodeURIComponent(source.rfidTag || "")}|${encodeURIComponent(source.observedAt || "")}`)}" ${index === 0 ? "selected" : ""}>
                              ${escapeHtml([source.printerName, source.slotLabel, source.filamentLabel || source.statusLabel].filter(Boolean).join(" · "))}
                            </option>
                          `,
                        )
                        .join("")
                    : `<option value="">${escapeHtml(t(locale, "inventory.rfidNoCaptureSource", "No live AMS slot available"))}</option>`
                }
              </select>
            </label>
            <div class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "inventory.rfidObservedTag", "Observed RFID"))}</span>
              <div class="meta-line">${escapeHtml(selectedCaptureSource?.rfidTag || "—")}</div>
            </div>
            <div class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "inventory.rfidCaptureStatus", "Capture status"))}</span>
              <div class="meta-line">${escapeHtml(selectedCaptureSource?.statusLabel || t(locale, "inventory.rfidCaptureUnavailable", "No live capture available right now."))}</div>
            </div>
            <input type="hidden" name="rfid-tag" value="${escapeHtml(selectedCaptureSource?.rfidTag || "")}" />
            <input type="hidden" name="rfid-observed-at" value="${escapeHtml(selectedCaptureSource?.observedAt || "")}" />
            <div class="detail-actions form-action-block">
              <button class="primary-button" type="submit" ${busy || !selectedCaptureSource?.rfidTag ? "disabled" : ""}>
                ${escapeHtml(t(locale, "inventory.rfidSaveAction", "Save RFID"))}
              </button>
            </div>
          </form>
        </div>
      </details>

      ${renderHistorySection({
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
          <div class="muted">${escapeHtml(formatUsageSourceLabel(point.source, locale))}</div>
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

  return `
    <details class="surface-card detail-section-card detail-history-card detail-collapsible detail-history-collapsible">
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
  const normalizedKey = label.toLowerCase();
  const compactKey = normalizedKey.replace(/[\s-]+/g, "_");
  const normalized = normalizedKey.replaceAll("_", " ");
  const eventKeys = {
    weight_update: "detail.eventWeightUpdate",
    weight_updated: "detail.eventWeightUpdate",
    tare_weight_updated: "detail.eventTareWeightUpdate",
    created: "detail.eventCreated",
    details_updated: "detail.eventDetailsUpdated",
    rfid_tag_updated: "detail.eventRfidSaved",
    status_updated: "detail.eventStatusUpdated",
    location_updated: "detail.eventLocationUpdated",
    qr_code_update: "detail.eventQrCodeUpdate",
    status_location_update: "detail.eventStatusLocationUpdate",
    assigned_to_ams: "detail.eventAssignedToAms",
    cleared_from_ams: "detail.eventClearedFromAms",
    loan_out: "detail.eventLoanedOut",
    loaned_out: "detail.eventLoanedOut",
    loan_return: "detail.eventLoanReturned",
    loan_returned: "detail.eventLoanReturned",
    returned_loan: "detail.eventLoanReturned",
    deleted: "detail.eventDeleted",
  };
  return t(locale, eventKeys[normalizedKey] || eventKeys[compactKey] || "", normalized);
}

function formatUsageSourceLabel(value, locale = "en") {
  const label = String(value || "").trim();
  if (!label) {
    return t(locale, "detail.unknownSource", "Unknown source");
  }
  const normalizedKey = label.toLowerCase().replace(/[\s-]+/g, "_");
  const sourceKeys = {
    manual: "detail.usageSourceManual",
    rfid: "detail.usageSourceRfid",
    live_rfid: "detail.usageSourceRfid",
    printer: "detail.usageSourcePrinter",
    printer_slot: "detail.usageSourcePrinter",
    ams: "detail.usageSourcePrinter",
    loan_return: "detail.usageSourceLoanReturn",
    loan_returned: "detail.usageSourceLoanReturn",
    loan_out: "detail.usageSourceLoanOut",
    loaned_out: "detail.usageSourceLoanOut",
  };
  return t(locale, sourceKeys[normalizedKey] || "", label.replaceAll("_", " "));
}
