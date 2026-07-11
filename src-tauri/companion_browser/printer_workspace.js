import {
  formatInventoryDisplayTitle,
  formatPlacementLabel,
  formatRollReference,
  formatStatusLabel,
} from "./formatters.js";
import { t } from "./companion_i18n.js";
import { isBorrowedInOwnership } from "./companion_domain.js";
import {
  printerBrandCssVars,
  styleObjectToString,
  suggestSwatchHex,
  toSwatchColor,
} from "./companion_theme.js";
import {
  buildLiveInventoryCandidateRows,
  liveSlotObservedRfid,
} from "./companion_live_rfid_candidates.js";
import { formatPrinterSlotLabelForModel } from "./printer_slot_labels.js";
import {
  renderCompanionActionButton,
  renderCompanionStateCard,
  renderDetailField,
  renderFormActionBlock,
  renderSwatchListRow,
  renderSwatchSelectionCard,
  renderSwatchSurface,
} from "./shell_chrome.js";

export function formatPrinterSlotLabel(slot, locale = "en", printerModel = "") {
  return formatPrinterSlotLabelForModel(slot, locale, printerModel);
}

function formatLiveRemainingPercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value}%` : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatTemperature(value) {
  const parsed = finiteNumber(value);
  return parsed == null ? "" : `${Math.round(parsed)} °C`;
}

function formatAmsTemperature(value) {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < -20 || parsed > 80) {
    return "";
  }
  return formatTemperature(parsed);
}

function formatRemainingMinutes(value, locale) {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < 0) {
    return "";
  }
  const minutes = Math.round(parsed);
  if (minutes < 60) {
    return `${minutes} ${t(locale, "common.minutes", "min")}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} ${t(locale, "common.hoursShort", "h")}`
    : `${hours} ${t(locale, "common.hoursShort", "h")} ${remainingMinutes} ${t(locale, "common.minutes", "min")}`;
}

const HUMIDITY_LETTERS = ["A", "B", "C", "D", "E"];

function normalizeAmsHumidityIndex(value) {
  const parsed = finiteNumber(value);
  if (parsed == null) {
    return null;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > HUMIDITY_LETTERS.length) {
    return null;
  }
  return HUMIDITY_LETTERS.length + 1 - rounded;
}

function buildAmsHumidityTelemetry(value, locale) {
  const index = normalizeAmsHumidityIndex(value);
  if (index == null) {
    return null;
  }
  return {
    letter: HUMIDITY_LETTERS[index - 1],
    tone:
      index <= 2
        ? t(locale, "printers.liveHumidityDry", "Dry")
        : index === 3
          ? t(locale, "printers.liveHumidityMiddle", "Mid")
          : t(locale, "printers.liveHumidityWet", "Wet"),
    scale: HUMIDITY_LETTERS.map((letter, letterIndex) => ({
      letter,
      active: letterIndex + 1 <= index,
    })),
  };
}

function buildPrinterLiveTelemetry(activePrinter, locale) {
  const slots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  const liveSlots = slots.filter(
    (slot) =>
      Boolean(slot?.live_mqtt_connected) ||
      Boolean(slot?.live_printer_last_seen_at) ||
      Boolean(slot?.live_loaded),
  );
  if (liveSlots.length === 0) {
    return null;
  }
  const source =
    liveSlots.find((slot) => Boolean(slot?.live_is_active)) ||
    liveSlots.find(
      (slot) =>
        slot?.live_progress_percent != null ||
        slot?.live_nozzle_temp_c != null ||
        slot?.live_bed_temp_c != null ||
        slot?.live_ams_humidity_index != null,
    ) ||
    liveSlots[0];
  const printCapableNozzle =
    finiteNumber(source?.live_nozzle_temp_c) != null && source.live_nozzle_temp_c >= 200;
  const hasJobTiming = source?.live_progress_percent != null || source?.live_remaining_minutes != null;
  const showJobTiming = printCapableNozzle && hasJobTiming;
  const progress = showJobTiming ? formatLiveRemainingPercent(source?.live_progress_percent) : "";
  const remaining = showJobTiming ? formatRemainingMinutes(source?.live_remaining_minutes, locale) : "";
  const nozzle = formatTemperature(source?.live_nozzle_temp_c);
  const bed = formatTemperature(source?.live_bed_temp_c);
  const amsTemp = formatAmsTemperature(source?.live_ams_temperature_c);
  const humidity = buildAmsHumidityTelemetry(source?.live_ams_humidity_index, locale);
  const hasTelemetry =
    showJobTiming ||
    Boolean(progress) ||
    Boolean(remaining) ||
    Boolean(nozzle) ||
    Boolean(bed) ||
    Boolean(amsTemp) ||
    Boolean(humidity);
  if (!hasTelemetry) {
    return null;
  }
  const stateLabel = showJobTiming
    ? t(locale, "printers.liveTelemetryPrinting", "Printing")
    : t(locale, "printers.liveTelemetryActive", "Active");

  return {
    amsTemp,
    bed,
    humidity,
    nozzle,
    progress,
    remaining,
    stateLabel,
  };
}

function renderPrinterLiveTelemetry(telemetry, locale, escapeHtml) {
  if (!telemetry) {
    return "";
  }
  const progressParts = [telemetry.progress, telemetry.remaining].filter(Boolean).join(" · ");
  const humidityScale = telemetry.humidity
    ? telemetry.humidity.scale
        .map(
          (item) =>
            `<span class="printer-live-humidity-step${item.active ? " is-active" : ""}" aria-label="${escapeHtml(item.letter)}"></span>`,
        )
        .join("")
    : "";
  const metrics = [
    {
      label: t(locale, "printers.liveTelemetryNozzle", "Nozzle"),
      value: telemetry.nozzle,
      icon: "⌬",
    },
    {
      label: t(locale, "printers.liveTelemetryBed", "Bed"),
      value: telemetry.bed,
      icon: "≋",
    },
  ].filter((item) => item.value);

  return `
    <div class="printer-live-strip">
      <span class="printer-live-state">${escapeHtml(telemetry.stateLabel)}</span>
      ${progressParts ? `<span class="printer-live-muted">${escapeHtml(progressParts)}</span>` : ""}
      ${metrics
        .map(
          (metric) => `
            <span class="printer-live-divider" aria-hidden="true"></span>
            <span class="printer-live-metric">
              <span class="printer-live-icon" aria-hidden="true">${escapeHtml(metric.icon)}</span>
              <span class="printer-live-label">${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
            </span>
          `,
        )
        .join("")}
      ${
        telemetry.humidity
          ? `
            <span class="printer-live-divider" aria-hidden="true"></span>
            <span class="printer-live-metric printer-live-humidity">
              <span class="printer-live-icon" aria-hidden="true">♢</span>
              <span class="printer-live-label">${escapeHtml(t(locale, "printers.liveTelemetryAmsHumidityShort", "AMS"))}</span>
              <strong>${escapeHtml(telemetry.humidity.letter)}</strong>
              <span class="printer-live-muted">${escapeHtml(telemetry.humidity.tone)}</span>
              <span class="printer-live-humidity-scale">${humidityScale}</span>
              ${telemetry.amsTemp ? `<span class="printer-live-muted">${escapeHtml(telemetry.amsTemp)}</span>` : ""}
            </span>
          `
          : ""
      }
    </div>
  `;
}

export function renderPrinterPickerTaskSheetBody(options) {
  const { state, printerSpoolOptions, escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";
  const pendingSlotTarget = state.pendingPrinterSlotTarget || null;

  if (!pendingSlotTarget) {
    return renderCompanionStateCard({
      escapeHtml,
      message: t(locale, "printers.chooseSlotFirst", "Choose a slot first."),
      tone: "info",
    });
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
      row.spool.home_location_id,
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
                    formatRollReference(row.spool, locale),
                    row.spool.location_id ? formatPlacementLabel(row.spool.location_id, locale) : "",
                    row.spool.home_location_id &&
                    row.spool.home_location_id !== row.spool.location_id
                      ? `${t(locale, "storage.homeLocationShort", "Home")}: ${formatPlacementLabel(row.spool.home_location_id, locale)}`
                      : "",
                  ]
                    .filter(Boolean)
                  return renderSwatchListRow({
                    action: "assign-selected-spool",
                    attributes: {
                      "data-spool-id": row.spool.id,
                      "data-printer-id": pendingSlotTarget.printerId,
                      "data-printer-name": pendingSlotTarget.printerName,
                      "data-slot-id": pendingSlotTarget.slotId,
                      "data-slot-index": pendingSlotTarget.slotIndex,
                      "data-slot-label":
                        pendingSlotTarget.slotLabel ||
                        `${t(locale, "printers.slot", "Slot")} ${pendingSlotTarget.slotIndex || "?"}`,
                    },
                    className: "printer-picker-row",
                    escapeHtml,
                    meta: rowMeta,
                    metaClassName: "printer-picker-row-meta",
                    swatch,
                    title: formatInventoryDisplayTitle(
                      row.master.material,
                      row.master.filament_name,
                      row.master.color_name,
                      locale,
                    ),
                    weight: formatGrams(row.spool.remaining_g),
                  });
                })
                .join("")
            : renderCompanionStateCard({
                escapeHtml,
                message: t(locale, "printers.noReadyMatch", "No ready-to-load spools matched this search."),
              })
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
    return renderCompanionStateCard({
      escapeHtml,
      message: t(locale, "printers.chooseSlotFirst", "Choose a slot first."),
      tone: "info",
    });
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
          ? renderSwatchSelectionCard({
              badges: [t(locale, "format.inUse", "In use")],
              className: "detail-section-card printer-weight-summary",
              escapeHtml,
              meta: [printerLabel, currentSpoolMeta, currentPlacementLabel],
              swatch: task.currentSwatchColor,
              title: task.currentSpoolTitle || t(locale, "detail.spoolDetailsFallback", "Spool details"),
            })
          : ""
      }
      ${
        requiresIncoming
          ? renderSwatchSelectionCard({
              badges: [t(locale, "printers.loadTarget", "Load target")],
              className: "detail-section-card printer-weight-summary",
              escapeHtml,
              meta: [printerLabel, targetSpoolMeta, targetPlacementLabel],
              swatch: task.targetSwatchColor,
              title: task.targetSpoolTitle || t(locale, "detail.spoolDetailsFallback", "Spool details"),
            })
          : ""
      }

      <form class="stack detail-form" data-action="printer-slot-operation-form">
        ${
          mode === "update"
            ? renderDetailField({
                escapeHtml,
                label: t(locale, "detail.measuredWeightGrams", "Measured total weight (g)"),
                body: `<input
                  class="weight-input"
                  name="current-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultCurrentMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />`,
              })
            : ""
        }
        ${
          requiresOutgoing
            ? renderDetailField({
                escapeHtml,
                label: t(locale, "printers.outgoingWeight", "Outgoing weight (g)"),
                body: `<input
                  class="weight-input"
                  name="outgoing-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultCurrentMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />`,
              })
            : ""
        }
        ${
          requiresIncoming
            ? renderDetailField({
                escapeHtml,
                label: t(locale, "detail.measuredWeightGrams", "Measured total weight (g)"),
                body: `<input
                  class="weight-input"
                  name="incoming-grams"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeHtml(defaultIncomingMeasuredWeight)}"
                  ${state.busy ? "disabled" : ""}
                />`,
              })
            : ""
        }
        ${renderFormActionBlock({
          escapeHtml,
          actions: renderCompanionActionButton({
            type: "submit",
            disabled: state.busy,
            escapeHtml,
            label: submitLabel,
          }),
        })}
      </form>
    </div>
  `;
}

export function renderPrinterRoster(printers, activePrinterId, escapeHtml, locale = "en") {
  if (printers.length <= 0) {
    return renderCompanionStateCard({
      escapeHtml,
      message: t(locale, "printers.noPrinters", "No printers configured yet."),
    });
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

function hasLivePrinterSignal(activePrinter) {
  const slots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  return slots.some(
    (slot) => Boolean(slot?.live_mqtt_connected) || Boolean(slot?.live_printer_last_seen_at) || Boolean(slot?.live_loaded),
  );
}

function formatLiveSlotStatus(slot, locale) {
  if (slot.live_match_status === "unknown_rfid") {
    return t(locale, "printers.liveMatchUnknownRfid", "RFID not registered");
  }
  if (slot.live_matched_inventory_mode === "exact_rfid") {
    return t(locale, "printers.liveMatchClear", "Live inventory match");
  }
  if (slot.live_match_status || slot.live_match_note) {
    return t(locale, "printers.liveMatchNoClear", "No clear inventory match");
  }
  return t(locale, "printers.liveObserved", "Live observed");
}

function renderLiveInventoryCandidateRows(slot, spoolRows, activePrinter, locale, escapeHtml, formatGrams) {
  const candidates = buildLiveInventoryCandidateRows(slot, spoolRows);
  if (candidates.length === 0) {
    return "";
  }
  const observedRfid = liveSlotObservedRfid(slot);
  const observedAt = String(slot?.live_last_identity_seen_at || slot?.live_printer_last_seen_at || "").trim();
  const intro =
    candidates.length === 1
      ? t(
          locale,
          "printers.liveCandidateSingle",
          "One inventory roll looks like this live Bambu roll. Save RFID to bind it permanently.",
        )
      : t(
          locale,
          "printers.liveCandidateMultiple",
          "{count} inventory rolls look like this live Bambu roll. Choose the correct row to save RFID.",
          { count: candidates.length },
        );
  return `
    <div class="slot-live-candidates">
      <div class="slot-live-candidates-label">${escapeHtml(intro)}</div>
      ${candidates
        .map((row) => {
          const swatch =
            row.master.hex_color ||
            suggestSwatchHex(
              row.master.color_name,
              row.master.filament_name,
              row.master.vendor,
              row.master.material,
            );
          const title = formatInventoryDisplayTitle(
            row.master.material,
            row.master.filament_name,
            row.master.color_name,
            locale,
          );
          const isBorrowedIn = isBorrowedInOwnership(row?.spool?.ownership_type);
          const ownerName = String(row?.spool?.owner_name || "").trim();
          const ownershipLabel =
            isBorrowedIn
              ? ownerName
                ? `${t(locale, "storage.borrowedInAction", "Borrowed-in")} · ${ownerName}`
                : t(locale, "storage.borrowedInAction", "Borrowed-in")
              : null;
          const meta = [
            formatRollReference(row.spool, locale),
            formatGrams(row.spool.remaining_g),
            ownershipLabel,
          ]
            .filter(Boolean)
            .join(" · ");
          return `
            <button
              class="slot-live-candidate-row"
              type="button"
              data-action="save-live-rfid-candidate"
              data-printer-id="${escapeHtml(activePrinter?.printer?.id || "")}"
              data-slot-id="${escapeHtml(slot?.slot_id || "")}"
              data-spool-id="${escapeHtml(row.spool.id)}"
              data-rfid-tag="${escapeHtml(observedRfid)}"
              data-rfid-observed-at="${escapeHtml(observedAt)}"
            >
              <span class="swatch-dot" style="background:${escapeHtml(toSwatchColor(swatch))};"></span>
              <span class="slot-live-candidate-main">
                <span class="slot-live-candidate-title">${escapeHtml(title)}</span>
                <span class="slot-live-candidate-meta">${escapeHtml(meta)}</span>
              </span>
              <span class="slot-live-candidate-action">${escapeHtml(t(locale, "printers.saveCandidateRfid", "Save RFID"))}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSlotCards(options) {
  const { activePrinter, state, printerSpoolOptions = [], escapeHtml, formatGrams } = options;
  const locale = state.locale || "en";

  const slots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  if (slots.length <= 0) {
    return renderCompanionStateCard({
      escapeHtml,
      message: t(locale, "printers.noSlots", "No slots configured for this printer."),
    });
  }

  return slots
    .map((slot) => {
      const slotLabel = formatPrinterSlotLabel(slot, locale, activePrinter?.printer?.model || "");
      const materialBits = formatInventoryDisplayTitle(
        slot.spool_material,
        slot.spool_filament_name,
        slot.spool_color_name,
        locale,
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
        : slot.live_color_hex ||
          suggestSwatchHex(slot.live_filament_name, slot.live_filament_type, "", slot.live_filament_type) ||
          "#ced8e3";
      const slotHasLiveLoaded = !slot.spool_id && Boolean(slot.live_loaded || slot.live_tray_uuid || slot.live_match_status);
      const slotUsesSwatchSurface = slot.spool_id || slotHasLiveLoaded;
      const liveMaterialBits = formatInventoryDisplayTitle(
        slot.live_filament_type,
        slot.live_filament_name,
        slot.live_tray_id_name,
        locale,
      );
      const slotContentTitle = slot.spool_id
        ? materialBits
        : slotHasLiveLoaded
          ? liveMaterialBits || t(locale, "printers.liveDetected", "Live filament detected")
          : t(locale, "printers.empty", "Empty");
      const slotContentColor = slotUsesSwatchSurface ? toSwatchColor(slotSwatch) : "";
      const slotSummary = slot.spool_id
        ? [formatStatusLabel(slot.spool_status || "ASSIGNED", locale), formatRollReference({ id: slot.spool_id }, locale)]
            .filter(Boolean)
            .join(" · ")
        : slotHasLiveLoaded
          ? formatLiveSlotStatus(slot, locale)
        : slotIsPendingTarget
          ? t(locale, "printers.loadTarget", "Load target")
          : t(locale, "printers.openSlot", "Open slot");
      const slotMeta = slot.spool_id
        ? formatGrams(slot.spool_remaining_g)
        : slotHasLiveLoaded
          ? [
              formatLiveRemainingPercent(slot.live_remaining_percent),
              slot.live_is_active ? t(locale, "printers.activeSlot", "Active slot") : "",
              slot.live_last_identity_seen_at ? t(locale, "printers.liveMatchLastKnown", "Showing last known identity") : "",
            ]
              .filter(Boolean)
              .join(" · ")
        : slotIsPendingTarget
          ? t(locale, "printers.chooseBelow", "Choose filament below.")
          : t(locale, "printers.loadHere", "Load a spool here.");
      const candidateRows = renderLiveInventoryCandidateRows(
        slot,
        printerSpoolOptions,
        activePrinter,
        locale,
        escapeHtml,
        formatGrams,
      );
      const slotStateLabel = slot.spool_id
        ? t(locale, "printers.loaded", "Loaded")
        : slotHasLiveLoaded
          ? t(locale, "printers.liveBadge", "Live")
          : t(locale, "printers.empty", "Empty");
      const slotStateTone = slot.spool_id || slotHasLiveLoaded ? "info" : "neutral";

      return renderSwatchSurface({
        tag: "article",
        surfaceClass: "",
        className: `slot-card ${slotUsesSwatchSurface ? "slot-card-loaded" : "slot-card-empty"}`,
        attributes: {
          "data-slot-selected": "false",
          "data-slot-targeted": slotIsPendingTarget ? "true" : "false",
          "data-slot-loaded": slotUsesSwatchSurface ? "true" : "false",
        },
        escapeHtml,
        swatch: slotUsesSwatchSurface ? slotSwatch : "",
        body: `
          <div class="slot-card-head">
            <div>
              <div class="list-title">${escapeHtml(slotLabel)}</div>
              <div class="muted">${escapeHtml(slot.spool_id ? t(locale, "printers.loaded", "Loaded") : slotHasLiveLoaded ? t(locale, "printers.liveSummary", "Live from host") : t(locale, "printers.openSlot", "Open slot"))}</div>
            </div>
            <span class="inline-signal slot-card-state" data-tone="${escapeHtml(slotStateTone)}">${escapeHtml(slotStateLabel)}</span>
          </div>
          <div class="slot-content-line${slotUsesSwatchSurface ? " swatch-line" : ""}">
            ${slotUsesSwatchSurface ? `<span class="swatch-dot" style="background:${escapeHtml(slotContentColor)}"></span>` : ""}
            <span>${escapeHtml(slotContentTitle)}</span>
          </div>
          <div class="muted slot-card-subtitle">${escapeHtml(slotSummary)}</div>
          <div class="meta-line slot-card-meta">${escapeHtml(slotMeta)}</div>
          ${candidateRows}
          <div class="slot-actions">
            ${
              slot.spool_id
                ? `
                  ${renderCompanionActionButton({
                    className: "slot-button slot-button-primary",
                    attributes: {
                      "data-action": "start-printer-weight-update",
                      "data-printer-task-mode": "update",
                      "data-printer-id": activePrinter.printer.id,
                      "data-printer-name": activePrinter.printer.name,
                      "data-slot-id": slot.slot_id,
                      "data-slot-index": slot.slot_index,
                      "data-slot-label": slotLabel,
                      "data-spool-id": slot.spool_id,
                    },
                    escapeHtml,
                    label: t(locale, "printers.updateWeight", "Update weight"),
                  })}
                  ${renderCompanionActionButton({
                    variant: "ghost",
                    className: "slot-button",
                    attributes: {
                      "data-action": "start-printer-weight-update",
                      "data-printer-task-mode": "clear",
                      "data-printer-id": activePrinter.printer.id,
                      "data-printer-name": activePrinter.printer.name,
                      "data-slot-id": slot.slot_id,
                      "data-slot-index": slot.slot_index,
                      "data-slot-label": slotLabel,
                      "data-spool-id": slot.spool_id,
                    },
                    escapeHtml,
                    label: t(locale, "printers.clearSlot", "Clear slot"),
                  })}
                `
                : ""
            }
            ${
              !slot.spool_id
                ? `
                  ${renderCompanionActionButton({
                    className: "slot-button slot-button-primary slot-button-emphasis",
                    attributes: {
                      "data-action": "start-printer-slot-assignment",
                      "data-printer-id": activePrinter.printer.id,
                      "data-printer-name": activePrinter.printer.name,
                      "data-slot-id": slot.slot_id,
                      "data-slot-index": slot.slot_index,
                      "data-slot-label": slotLabel,
                    },
                    escapeHtml,
                    label: t(locale, "printers.loadFilament", "Load filament"),
                  })}
                `
              : ""
            }
          </div>
        `,
      });
    })
    .join("");
}

export function renderPrinterBoard(options) {
  const {
    state,
    activePrinter,
    printerSpoolOptions = [],
    escapeHtml,
    formatGrams,
  } = options;
  const locale = state.locale || "en";

  if (!activePrinter) {
    return renderCompanionStateCard({
      escapeHtml,
      message: t(locale, "printers.choosePrinter", "Choose a printer."),
    });
  }

  const activePrinterSlots = Array.isArray(activePrinter?.slots) ? activePrinter.slots : [];
  const loadedSlots = activePrinterSlots.filter((slot) => Boolean(slot?.spool_id)).length;
  const emptySlots = Math.max(activePrinterSlots.length - loadedSlots, 0);
  const printerHasLiveSignal = hasLivePrinterSignal(activePrinter);
  const liveTelemetry = buildPrinterLiveTelemetry(activePrinter, locale);

  return `
    <div class="printer-board-header">
      <div class="printer-board-heading">
        <h3>${escapeHtml(activePrinter.printer.name)}</h3>
        <p class="section-copy">${escapeHtml(activePrinter.printer.model)}</p>
        <div class="meta-line printer-board-meta">
          ${printerHasLiveSignal ? `<span class="printer-live-dot" aria-hidden="true"></span>${escapeHtml(t(locale, "printers.liveBadge", "Live"))} · ` : ""}
          ${escapeHtml(t(locale, "printers.loadedSummary", "{loaded} loaded · {open} open", { loaded: loadedSlots, open: emptySlots }))}
        </div>
        ${renderPrinterLiveTelemetry(liveTelemetry, locale, escapeHtml)}
      </div>
    </div>
    <div class="slot-grid compact-slot-grid">
      ${renderSlotCards({
        activePrinter,
        state,
        printerSpoolOptions,
        escapeHtml,
        formatGrams,
      })}
    </div>
  `;
}
