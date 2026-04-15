import {
  formatInventoryDisplayTitle,
  formatPlacementLabel,
  formatRollReference,
  formatStatusLabel,
} from "./formatters.js";
import { t } from "./companion_i18n.js";
import {
  printerBrandCssVars,
  styleObjectToString,
  suggestSwatchHex,
  swatchCssVars,
  toSwatchColor,
} from "./companion_theme.js";
import { formatPrinterSlotLabelForModel } from "./printer_slot_labels.js";

export function formatPrinterSlotLabel(slot, locale = "en", printerModel = "") {
  return formatPrinterSlotLabelForModel(slot, locale, printerModel);
}

export function renderPrinterPickerTaskSheetBody(options) {
  const { state, printerSpoolOptions, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";
  const pendingSlotTarget = state.pendingPrinterSlotTarget || null;

  if (!pendingSlotTarget) {
    return `
      <div class="info-card">
        ${escapeHtml(t(locale, "printers.chooseSlotFirst", "Choose a slot first."))}
      </div>
    `;
  }

  const searchTerm = String(state.printerSpoolSearch || "").trim().toLowerCase();
  const availableCount = printerSpoolOptions.length;
  const filteredOptions = printerSpoolOptions.filter((row) => {
    const haystack = [
      row.master.material,
      row.master.filament_name,
      row.master.color_name,
      row.master.vendor,
      row.spool.id,
      row.spool.location_id,
      row.spool.qr_code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });
  const visibleRows = filteredOptions.slice(0, 18);

  return `
    <div class="stack printer-spool-picker printer-picker-sheet">
      <div class="meta-line">${escapeHtml(t(locale, "printers.readyToLoad", "{count} ready to load", { count: availableCount }))}</div>
      <input
        class="search-input"
        name="printer-spool-search"
        value="${escapeHtml(state.printerSpoolSearch)}"
        placeholder="${escapeHtml(t(locale, "printers.pickerPlaceholder", "Search by material, color, vendor, or reference"))}"
        autocomplete="off"
      />
      <div class="dense-list printer-spool-picker-list">
        ${
          visibleRows.length > 0
            ? visibleRows
                .map((row) => {
                  const swatch =
                    row.master.hex_color ||
                    suggestSwatchHex(
                      row.master.color_name,
                      row.master.filament_name,
                      row.master.vendor,
                      row.master.material,
                    );
                  const rowMeta = [
                    row.master.vendor,
                    formatRollReference(row.spool),
                    row.spool.location_id ? formatPlacementLabel(row.spool.location_id, locale) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return `
                    <button
                      class="list-row dense-list-row spool-list-row printer-picker-row swatch-surface"
                      type="button"
                      data-action="assign-selected-spool"
                      data-spool-id="${escapeHtml(row.spool.id)}"
                      data-printer-id="${escapeHtml(pendingSlotTarget.printerId)}"
                      data-printer-name="${escapeHtml(pendingSlotTarget.printerName)}"
                      data-slot-id="${escapeHtml(pendingSlotTarget.slotId)}"
                      data-slot-index="${escapeHtml(pendingSlotTarget.slotIndex)}"
                      data-slot-label="${escapeHtml(pendingSlotTarget.slotLabel || `${t(locale, "printers.slot", "Slot")} ${pendingSlotTarget.slotIndex || "?"}`)}"
                      style="${escapeHtml(styleObjectToString(swatchCssVars(swatch)))}"
                    >
                      <div class="dense-list-main">
                        <div class="swatch-line spool-row-title">
                          <span class="swatch-dot" style="background:${escapeHtml(toSwatchColor(swatch))};"></span>
                          <span class="list-title">${escapeHtml(formatInventoryDisplayTitle(row.master.material, row.master.filament_name, row.master.color_name))}</span>
                        </div>
                        <div class="meta-line spool-row-meta printer-picker-row-meta">${escapeHtml(rowMeta)}</div>
                      </div>
                      <div class="dense-list-side">
                        <div class="spool-row-weight">${escapeHtml(formatGrams(row.spool.remaining_g))}</div>
                      </div>
                    </button>
                  `;
                })
                .join("")
            : `<div class="empty-card">${escapeHtml(t(locale, "printers.noReadyMatch", "No ready-to-load spools matched this search."))}</div>`
        }
      </div>
    </div>
  `;
}

export function renderPrinterWeightTaskSheetBody(options) {
  const { state, activeTaskSheet, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";
  const task = activeTaskSheet || null;

  if (!task || task.type !== "printer-weight") {
    return `
      <div class="info-card">
        ${escapeHtml(t(locale, "printers.chooseSlotFirst", "Choose a slot first."))}
      </div>
    `;
  }

  const printerLabel = [task.printerName, task.slotLabel].filter(Boolean).join(" · ");
  const currentSpoolMeta = [task.currentVendor, task.currentReference, formatGrams(task.currentRemainingWeight)]
    .filter(Boolean)
    .join(" · ");
  const currentPlacementLabel = formatPlacementLabel(task.currentLocationId, locale);
  const targetSpoolMeta = [task.targetVendor, task.targetReference, formatGrams(task.targetRemainingWeight)]
    .filter(Boolean)
    .join(" · ");
  const targetPlacementLabel = formatPlacementLabel(task.targetLocationId, locale);
  const mode = String(task.mode || "update").trim();
  const requiresOutgoing =
    Boolean(task.currentSpoolId) && (mode === "clear" || (mode === "assign" && task.currentSpoolId !== task.targetSpoolId));
  const requiresIncoming = mode === "assign" && Boolean(task.targetSpoolId);
  const defaultCurrentMeasuredWeight =
    task.currentMeasuredWeight != null && task.currentMeasuredWeight !== ""
      ? task.currentMeasuredWeight
      : task.currentRemainingWeight != null && task.currentRemainingWeight !== ""
        ? task.currentRemainingWeight
        : "";
  const defaultIncomingMeasuredWeight =
    task.targetMeasuredWeight != null && task.targetMeasuredWeight !== ""
      ? task.targetMeasuredWeight
      : task.targetRemainingWeight != null && task.targetRemainingWeight !== ""
        ? task.targetRemainingWeight
        : "";
  const submitLabel =
    mode === "clear"
      ? t(locale, "printers.clearSlot", "Clear slot")
      : mode === "assign"
        ? t(locale, "printers.loadFilament", "Load filament")
        : t(locale, "detail.saveWeight", "Save weight");

  return `
    <div class="stack printer-weight-sheet">
      ${
        task.currentSpoolId
          ? `
            <div class="surface-card detail-section-card printer-weight-summary">
              <div class="detail-header printer-weight-summary-header">
                <div class="swatch-line spool-row-title">
                  <span class="swatch-dot" style="background:${escapeHtml(toSwatchColor(task.currentSwatchColor))};"></span>
                  <span class="list-title">${escapeHtml(task.currentSpoolTitle || t(locale, "detail.spoolDetailsFallback", "Spool details"))}</span>
                </div>
                <span class="pill">${escapeHtml(t(locale, "format.inUse", "In use"))}</span>
              </div>
              <div class="meta-line">${escapeHtml(printerLabel)}</div>
              <div class="meta-line">${escapeHtml(currentSpoolMeta)}</div>
              <div class="meta-line">${escapeHtml(currentPlacementLabel)}</div>
            </div>
          `
          : ""
      }
      ${
        requiresIncoming
          ? `
            <div class="surface-card detail-section-card printer-weight-summary">
              <div class="detail-header printer-weight-summary-header">
                <div class="swatch-line spool-row-title">
                  <span class="swatch-dot" style="background:${escapeHtml(toSwatchColor(task.targetSwatchColor))};"></span>
                  <span class="list-title">${escapeHtml(task.targetSpoolTitle || t(locale, "detail.spoolDetailsFallback", "Spool details"))}</span>
                </div>
                <span class="pill">${escapeHtml(t(locale, "printers.loadTarget", "Load target"))}</span>
              </div>
              <div class="meta-line">${escapeHtml(printerLabel)}</div>
              <div class="meta-line">${escapeHtml(targetSpoolMeta)}</div>
              <div class="meta-line">${escapeHtml(targetPlacementLabel)}</div>
            </div>
          `
          : ""
      }

      <form class="stack detail-form" data-action="printer-slot-operation-form">
        ${
          mode === "update"
            ? `
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.measuredWeightGrams", "Measured total weight (g)"))}</span>
                <input
                  class="weight-input"
                  name="current-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultCurrentMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />
              </label>
            `
            : ""
        }
        ${
          requiresOutgoing
            ? `
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "printers.outgoingWeight", "Outgoing weight (g)"))}</span>
                <input
                  class="weight-input"
                  name="outgoing-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultCurrentMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />
              </label>
            `
            : ""
        }
        ${
          requiresIncoming
            ? `
              <label class="stack detail-field">
                <span class="muted">${escapeHtml(t(locale, "detail.measuredWeightGrams", "Measured total weight (g)"))}</span>
                <input
                  class="weight-input"
                  name="incoming-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultIncomingMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />
              </label>
            `
            : ""
        }
        <div class="detail-actions form-action-block">
          <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>${escapeHtml(submitLabel)}</button>
        </div>
      </form>
    </div>
  `;
}

export function renderPrinterRoster(printers, activePrinterId, escapeHtml, locale = "en") {
  if (printers.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "printers.noPrinters", "No printers configured yet."))}</div>`;
  }

  return printers
    .map((row) => {
      const active = row.printer.id === activePrinterId;
      const brandToneStyle = styleObjectToString(printerBrandCssVars(row.printer.model));
      return `
        <button
          class="printer-roster-item${brandToneStyle ? " printer-brand-surface" : ""}"
          type="button"
          data-action="select-printer"
          data-printer-id="${escapeHtml(row.printer.id)}"
          data-active="${active ? "true" : "false"}"
          ${brandToneStyle ? `style="${escapeHtml(brandToneStyle)}"` : ""}
        >
          <div class="printer-roster-inline">
            <div class="printer-roster-inline-main">
              <span class="printer-roster-name">${escapeHtml(row.printer.name)}</span>
              <span class="printer-roster-separator" aria-hidden="true">·</span>
              <span class="printer-roster-model">${escapeHtml(row.printer.model)}</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderSlotCards(options) {
  const { activePrinter, state, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";

  const slots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  if (slots.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "printers.noSlots", "No slots configured for this printer."))}</div>`;
  }

  return slots
    .map((slot) => {
      const slotLabel = formatPrinterSlotLabel(slot, locale, activePrinter?.printer?.model || "");
      const materialBits = formatInventoryDisplayTitle(
        slot.spool_material,
        slot.spool_filament_name,
        slot.spool_color_name,
      );
      const slotIsPendingTarget =
        !slot.spool_id &&
        Boolean(state.pendingPrinterSlotTarget) &&
        String(state.pendingPrinterSlotTarget.slotId || "") === String(slot.slot_id || "");
      const slotSwatch = slot.spool_id
        ? slot.spool_hex_color ||
          suggestSwatchHex(
            slot.spool_color_name,
            slot.spool_filament_name,
            slot.spool_vendor,
            slot.spool_material,
          )
        : "#ced8e3";
      const slotToneStyle = slot.spool_id ? styleObjectToString(swatchCssVars(slotSwatch)) : "";
      const slotContentTitle = slot.spool_id ? materialBits : t(locale, "printers.empty", "Empty");
      const slotContentColor = toSwatchColor(slotSwatch);
      const slotSummary = slot.spool_id
        ? [formatStatusLabel(slot.spool_status || "ASSIGNED", locale), formatRollReference({ id: slot.spool_id })]
            .filter(Boolean)
            .join(" · ")
        : slotIsPendingTarget
          ? t(locale, "printers.loadTarget", "Load target")
          : t(locale, "printers.openSlot", "Open slot");
      const slotMeta = slot.spool_id
        ? formatGrams(slot.spool_remaining_g)
        : slotIsPendingTarget
          ? t(locale, "printers.chooseBelow", "Choose filament below.")
          : t(locale, "printers.loadHere", "Load a spool here.");

      return `
        <article
          class="slot-card ${slot.spool_id ? "slot-card-loaded swatch-surface" : "slot-card-empty"}"
          data-slot-selected="false"
          data-slot-targeted="${slotIsPendingTarget ? "true" : "false"}"
          data-slot-loaded="${slot.spool_id ? "true" : "false"}"
          ${slotToneStyle ? `style="${escapeHtml(slotToneStyle)}"` : ""}
        >
          <div class="slot-card-head">
            <div>
              <div class="list-title">${escapeHtml(slotLabel)}</div>
              <div class="muted">${escapeHtml(slot.spool_id ? t(locale, "printers.loaded", "Loaded") : t(locale, "printers.openSlot", "Open slot"))}</div>
            </div>
            <span class="pill">${escapeHtml(slot.spool_id ? t(locale, "printers.loaded", "Loaded") : t(locale, "printers.empty", "Empty"))}</span>
          </div>
          <div class="slot-content-line swatch-line">
            <span class="swatch-dot" style="background:${escapeHtml(slotContentColor)}"></span>
            <span>${escapeHtml(slotContentTitle)}</span>
          </div>
          <div class="muted slot-card-subtitle">${escapeHtml(slotSummary)}</div>
          <div class="meta-line slot-card-meta">${escapeHtml(slotMeta)}</div>
          <div class="slot-actions">
            ${
              slot.spool_id
                ? `
                  <button
                    class="primary-button slot-button slot-button-primary"
                    type="button"
                    data-action="start-printer-weight-update"
                    data-printer-task-mode="update"
                    data-printer-id="${escapeHtml(activePrinter.printer.id)}"
                    data-printer-name="${escapeHtml(activePrinter.printer.name)}"
                    data-slot-id="${escapeHtml(slot.slot_id)}"
                    data-slot-index="${escapeHtml(slot.slot_index)}"
                    data-slot-label="${escapeHtml(slotLabel)}"
                    data-spool-id="${escapeHtml(slot.spool_id)}"
                  >
                    ${escapeHtml(t(locale, "printers.updateWeight", "Update weight"))}
                  </button>
                  <button
                    class="ghost-button slot-button"
                    type="button"
                    data-action="start-printer-weight-update"
                    data-printer-task-mode="clear"
                    data-printer-id="${escapeHtml(activePrinter.printer.id)}"
                    data-printer-name="${escapeHtml(activePrinter.printer.name)}"
                    data-slot-id="${escapeHtml(slot.slot_id)}"
                    data-slot-index="${escapeHtml(slot.slot_index)}"
                    data-slot-label="${escapeHtml(slotLabel)}"
                    data-spool-id="${escapeHtml(slot.spool_id)}"
                  >
                    ${escapeHtml(t(locale, "printers.clearSlot", "Clear slot"))}
                  </button>
                `
                : ""
            }
            ${
              !slot.spool_id
                ? `
                  <button
                    class="primary-button slot-button slot-button-primary slot-button-emphasis"
                    type="button"
                    data-action="start-printer-slot-assignment"
                    data-printer-id="${escapeHtml(activePrinter.printer.id)}"
                    data-printer-name="${escapeHtml(activePrinter.printer.name)}"
                    data-slot-id="${escapeHtml(slot.slot_id)}"
                    data-slot-index="${escapeHtml(slot.slot_index)}"
                    data-slot-label="${escapeHtml(slotLabel)}"
                  >
                    ${escapeHtml(t(locale, "printers.loadFilament", "Load filament"))}
                  </button>
                `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderPrinterBoard(options) {
  const {
    state,
    activePrinter,
    escapeHtml,
    formatGrams,
  } = options;
  const locale = state.locale || "en";

  if (!activePrinter) {
    return `<div class="empty-card">${escapeHtml(t(locale, "printers.choosePrinter", "Choose a printer."))}</div>`;
  }

  const activePrinterSlots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  const loadedSlots = activePrinterSlots.filter((slot) => Boolean(slot?.spool_id)).length;
  const emptySlots = Math.max(activePrinterSlots.length - loadedSlots, 0);

  return `
    <div class="printer-board-header">
      <div class="printer-board-heading">
        <h3>${escapeHtml(activePrinter.printer.name)}</h3>
        <p class="section-copy">${escapeHtml(activePrinter.printer.model)}</p>
        <div class="meta-line printer-board-meta">
          ${escapeHtml(t(locale, "printers.loadedSummary", "{loaded} loaded · {open} open", { loaded: loadedSlots, open: emptySlots }))}
        </div>
      </div>
    </div>
    <div class="slot-grid compact-slot-grid">
      ${renderSlotCards({
        activePrinter,
        state,
        escapeHtml,
        formatGrams,
      })}
    </div>
  `;
}
