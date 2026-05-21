import type { Locale } from "./i18n";
import type { SpoolHistoryEventRow } from "./tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

type InventoryHistoryFormatterDeps = {
  t: TranslateFn;
  formatDateTime: (raw: string, locale: Locale) => string;
  formatStatusLabel: (statusRaw: string) => string;
  locale: Locale;
  printerNameById: Map<string, string>;
  slotLabelById: Map<string, string>;
};

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function payloadString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function payloadNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function fallbackEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

export function historyPayloadText(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function formatInventoryHistoryEventType(eventType: string, t: TranslateFn): string {
  if (eventType === "WEIGHT_UPDATED") {
    return t("inventory.historyEvent.weightUpdated", "Weight updated");
  }
  if (eventType === "WEIGHT_CORRECTED") {
    return t("inventory.historyEvent.weightCorrected", "Weight corrected");
  }
  if (eventType === "STATUS_UPDATED") {
    return t("inventory.historyEvent.statusUpdated", "Status updated");
  }
  if (eventType === "USED_UP") {
    return t("inventory.historyEvent.usedUp", "Marked empty");
  }
  if (eventType === "LOCATION_UPDATED") {
    return t("inventory.historyEvent.locationUpdated", "Location updated");
  }
  if (eventType === "DETAILS_UPDATED") {
    return t("inventory.historyEvent.detailsUpdated", "Details updated");
  }
  if (eventType === "RFID_TAG_UPDATED") {
    return t("inventory.historyEvent.rfidSaved", "RFID saved");
  }
  if (eventType === "ASSIGNED_TO_AMS") {
    return t("inventory.historyEvent.assignedToAms", "Assigned to printer slot");
  }
  if (eventType === "PRINT_JOB_RECORDED") {
    return t("inventory.historyEvent.printJobRecorded", "Print usage logged");
  }
  if (eventType === "LOANED_OUT") {
    return t("inventory.historyEvent.loanedOut", "Loaned out");
  }
  if (eventType === "LOAN_RETURNED") {
    return t("inventory.historyEvent.loanReturned", "Loan returned");
  }
  if (eventType === "BORROWED_IN_REGISTERED") {
    return t("inventory.historyEvent.borrowedInRegistered", "Borrowed in registered");
  }
  if (eventType === "BORROWED_IN_RETURNED") {
    return t("inventory.historyEvent.borrowedInReturned", "Borrowed in handed back");
  }
  if (eventType === "DELETED") {
    return t("inventory.historyEvent.deleted", "Deleted");
  }
  if (eventType === "CREATED") {
    return t("inventory.historyEvent.addedToLibrary", "Added to library");
  }
  return fallbackEventLabel(eventType);
}

export function formatInventoryHistoryEventDetails(
  event: SpoolHistoryEventRow,
  deps: InventoryHistoryFormatterDeps,
): string {
  const { t, formatDateTime, formatStatusLabel, locale, printerNameById, slotLabelById } = deps;
  const payload = payloadRecord(event.payload_json);
  if (!payload) {
    const raw = historyPayloadText(event.payload_json);
    return raw || "—";
  }
  if (event.event_type === "WEIGHT_UPDATED" || event.event_type === "WEIGHT_CORRECTED") {
    const grams = payloadNumber(payload, "grams");
    const previousGrams = payloadNumber(payload, "previous_grams");
    const remainingPercent = payloadNumber(payload, "remaining_percent");
    const correctionGrams = payloadNumber(payload, "correction_grams");
    const source = payloadString(payload, "source");
    const gramsText = grams == null ? "—" : `${grams} g`;
    const details = [`${gramsText}`];
    if (previousGrams != null && grams != null && previousGrams !== grams) {
      const delta = grams - previousGrams;
      const deltaPrefix = delta > 0 ? "+" : "";
      details.push(`${deltaPrefix}${delta} g`);
    }
    if (source) {
      details.push(source.replace(/_/g, " "));
    }
    if (event.event_type === "WEIGHT_CORRECTED" && correctionGrams != null) {
      details.push(`${t("inventory.historyEvent.correction", "Correction")}: ${correctionGrams} g`);
    }
    if (remainingPercent != null) {
      details.push(`${remainingPercent}%`);
    }
    return details.join(" · ");
  }
  if (event.event_type === "STATUS_UPDATED" || event.event_type === "USED_UP") {
    const status = payloadString(payload, "status");
    return status ? `${t("inventory.status", "Status")}: ${formatStatusLabel(status)}` : historyPayloadText(payload);
  }
  if (event.event_type === "LOCATION_UPDATED" || event.event_type === "DETAILS_UPDATED") {
    const details: string[] = [];
    const status = payloadString(payload, "status");
    const location = payloadString(payload, "location");
    const qrCode = payloadString(payload, "qr_code");
    const ownerName = payloadString(payload, "owner_name");
    const ownerContact = payloadString(payload, "owner_contact");
    const ownershipNote = payloadString(payload, "ownership_note");
    if (status) {
      details.push(`${t("inventory.status", "Status")}: ${formatStatusLabel(status)}`);
    }
    if (location || Object.prototype.hasOwnProperty.call(payload, "location")) {
      details.push(
        `${t("inventory.location", "Location")}: ${location ?? t("inventory.unassigned", "Unassigned")}`,
      );
    }
    if (qrCode) {
      details.push(`${t("inventory.qrCode", "QR code")}: ${qrCode}`);
    }
    if (ownerName) {
      details.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${ownerName}`);
    }
    if (ownerContact) {
      details.push(ownerContact);
    }
    if (ownershipNote) {
      details.push(ownershipNote);
    }
    return details.join(" · ") || historyPayloadText(payload);
  }
  if (event.event_type === "RFID_TAG_UPDATED") {
    const observedAt = payloadString(payload, "rfid_observed_at");
    const rfidTag = payloadString(payload, "rfid_tag");
    const details: string[] = [
      t("inventory.historyEvent.rfidSavedDetail", "RFID identity was saved from AMS capture."),
    ];
    if (observedAt) {
      details.push(
        `${t("inventory.lastAmsIdentitySeen", "Last AMS identity seen")}: ${formatDateTime(observedAt, locale)}`,
      );
    }
    if (rfidTag) {
      details.push(`${t("inventory.rfidObservedTag", "Observed RFID")}: ${rfidTag}`);
    }
    return details.join(" · ");
  }
  if (event.event_type === "ASSIGNED_TO_AMS") {
    const printerId = payloadString(payload, "printer_id");
    const slotId = payloadString(payload, "slot_id");
    const printerName =
      (printerId ? printerNameById.get(printerId) : null) ?? printerId ?? t("common.unknown", "Unknown");
    const slotLabel = (slotId ? slotLabelById.get(slotId) : null) ?? slotId ?? t("common.unknown", "Unknown");
    return slotLabel.includes(printerName) ? slotLabel : `${printerName} · ${slotLabel}`;
  }
  if (event.event_type === "PRINT_JOB_RECORDED") {
    const printerId = payloadString(payload, "printer_id");
    const printerName =
      (printerId ? printerNameById.get(printerId) : null) ?? printerId ?? t("common.unknown", "Unknown");
    const used = payloadNumber(payload, "used_grams");
    const remaining = payloadNumber(payload, "remaining_g");
    const jobName = payloadString(payload, "job_name");
    const parts = [printerName];
    if (used != null) {
      parts.push(`${t("printers.used", "Used")}: ${used} g`);
    }
    if (remaining != null) {
      parts.push(`${t("inventory.remaining", "Remaining")}: ${remaining} g`);
    }
    if (jobName) {
      parts.push(`Job: ${jobName}`);
    }
    return parts.join(" · ");
  }
  if (event.event_type === "LOANED_OUT") {
    const borrower = payloadString(payload, "borrower_name");
    const gramsOut = payloadNumber(payload, "grams_out");
    const parts: string[] = [];
    if (borrower) {
      parts.push(`${t("loans.borrower", "Borrower")}: ${borrower}`);
    }
    if (gramsOut != null) {
      parts.push(`${t("inventory.out", "Out")}: ${gramsOut} g`);
    }
    return parts.join(" · ") || historyPayloadText(payload);
  }
  if (event.event_type === "LOAN_RETURNED") {
    const borrower = payloadString(payload, "borrower_name");
    const returned = payloadNumber(payload, "returned_grams");
    const consumed = payloadNumber(payload, "consumed_grams");
    const parts: string[] = [];
    if (borrower) {
      parts.push(`${t("loans.borrower", "Borrower")}: ${borrower}`);
    }
    if (returned != null) {
      parts.push(`${t("loans.returned", "Returned")}: ${returned} g`);
    }
    if (consumed != null) {
      parts.push(`${t("loans.consumed", "Consumed")}: ${consumed} g`);
    }
    return parts.join(" · ") || historyPayloadText(payload);
  }
  if (event.event_type === "BORROWED_IN_REGISTERED") {
    const ownerName = payloadString(payload, "owner_name");
    const ownerContact = payloadString(payload, "owner_contact");
    const gramsOut = payloadNumber(payload, "grams_out");
    const parts: string[] = [];
    if (ownerName) {
      parts.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${ownerName}`);
    }
    if (ownerContact) {
      parts.push(ownerContact);
    }
    if (gramsOut != null) {
      parts.push(`${t("inventory.initialWeight", "Initial weight (g)")}: ${gramsOut} g`);
    }
    return parts.join(" · ") || historyPayloadText(payload);
  }
  if (event.event_type === "BORROWED_IN_RETURNED") {
    const counterparty = payloadString(payload, "counterparty_name");
    const returned = payloadNumber(payload, "returned_grams");
    const consumed = payloadNumber(payload, "consumed_grams");
    const parts: string[] = [];
    if (counterparty) {
      parts.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${counterparty}`);
    }
    if (returned != null) {
      parts.push(`${t("loans.returned", "Returned")}: ${returned} g`);
    }
    if (consumed != null) {
      parts.push(`${t("loans.consumed", "Consumed")}: ${consumed} g`);
    }
    return parts.join(" · ") || historyPayloadText(payload);
  }
  if (event.event_type === "DELETED") {
    const reason = payloadString(payload, "reason");
    if (reason) {
      return reason;
    }
  }
  if (event.event_type === "CREATED") {
    const status = payloadString(payload, "status");
    const ownershipType = payloadString(payload, "ownership_type");
    const vendor = payloadString(payload, "vendor");
    const details: string[] = [
      t("inventory.historyEvent.addedToLibraryDetail", "Filament was added to the library."),
    ];
    if (status) {
      details.push(`${t("inventory.status", "Status")}: ${formatStatusLabel(status)}`);
    }
    if (ownershipType === "OWNED") {
      details.push(t("inventory.ownedByUs", "Owned"));
    } else if (ownershipType === "BORROWED_IN") {
      details.push(t("inventory.borrowedInRegistered", "Borrowed-in spool registered"));
    }
    if (vendor) {
      details.push(vendor);
    }
    return details.join(" · ");
  }
  return historyPayloadText(payload) || "—";
}
