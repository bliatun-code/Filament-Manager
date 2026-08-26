import { isBorrowedInOwnership, normalizeOwnershipType } from "./inventory_domain";
import type { Locale } from "./i18n";
import {
  formatDisplayGrams,
  formatDisplayNumber,
  formatDisplayPercent,
} from "./number_display";
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

function payloadBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function nestedPayloadRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  return payloadRecord(record[key]);
}

function purchasePriceText(
  metadata: Record<string, unknown>,
  locale: Locale,
): string | null {
  const price = payloadNumber(metadata, "purchase_price");
  const currency = payloadString(metadata, "purchase_currency")?.toUpperCase() ?? null;
  if (price == null) {
    return currency;
  }
  const priceText = formatDisplayNumber(price, locale, {
    maximumFractionDigits: 2,
  });
  return currency ? `${priceText} ${currency}` : priceText;
}

function purchaseMetadataSummary(
  metadata: Record<string, unknown> | null,
  deps: Pick<InventoryHistoryFormatterDeps, "locale" | "t">,
): string[] {
  if (!metadata) {
    return [];
  }
  const { locale, t } = deps;
  const price = purchasePriceText(metadata, locale);
  const purchaseDate = payloadString(metadata, "purchase_date");
  const batchCode = payloadString(metadata, "batch_code");
  const supplierReference = payloadString(metadata, "supplier_reference");
  const details: string[] = [];
  if (price) {
    details.push(`${t("inventory.purchasePricePerRoll", "Price per roll")}: ${price}`);
  }
  if (purchaseDate) {
    details.push(`${t("inventory.purchaseDate", "Purchase date")}: ${purchaseDate}`);
  }
  if (batchCode) {
    details.push(`${t("inventory.purchaseBatchCode", "Batch code")}: ${batchCode}`);
  }
  if (supplierReference) {
    details.push(
      `${t("inventory.purchaseSupplierReference", "Supplier reference")}: ${supplierReference}`,
    );
  }
  return details;
}

function purchaseMetadataChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  deps: Pick<InventoryHistoryFormatterDeps, "locale" | "t">,
): string[] {
  if (!before || !after) {
    return [];
  }
  const { locale, t } = deps;
  const missing = "—";
  const fields = [
    {
      label: t("inventory.purchasePricePerRoll", "Price per roll"),
      before: purchasePriceText(before, locale),
      after: purchasePriceText(after, locale),
    },
    {
      label: t("inventory.purchaseDate", "Purchase date"),
      before: payloadString(before, "purchase_date"),
      after: payloadString(after, "purchase_date"),
    },
    {
      label: t("inventory.purchaseBatchCode", "Batch code"),
      before: payloadString(before, "batch_code"),
      after: payloadString(after, "batch_code"),
    },
    {
      label: t("inventory.purchaseSupplierReference", "Supplier reference"),
      before: payloadString(before, "supplier_reference"),
      after: payloadString(after, "supplier_reference"),
    },
  ];
  return fields
    .filter((field) => field.before !== field.after)
    .map(
      (field) =>
        `${field.label}: ${field.before ?? missing} → ${field.after ?? missing}`,
    );
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
  if (eventType === "PURCHASE_RECEIPT_RECORDED") {
    return t(
      "inventory.historyEvent.purchaseReceiptRecorded",
      "Purchase receipt recorded",
    );
  }
  if (eventType === "PURCHASE_METADATA_UPDATED") {
    return t(
      "inventory.historyEvent.purchaseMetadataUpdated",
      "Purchase details updated",
    );
  }
  if (eventType === "PURCHASE_PRICE_STANDARD_APPLIED") {
    return t("inventory.historyEvent.purchasePriceStandardApplied", "Group price applied");
  }
  if (eventType === "PURCHASE_PRICE_BATCH_LOCK_UPDATED") {
    return t(
      "inventory.historyEvent.purchasePriceBatchLockUpdated",
      "Group price protection changed",
    );
  }
  if (eventType === "LOCATION_MERGED") {
    return t("inventory.historyEvent.locationMerged", "Locations merged");
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
    if (event.event_type === "PURCHASE_PRICE_STANDARD_APPLIED") {
      return t(
        "inventory.historyEvent.purchasePriceStandardAppliedDetail",
        "The saved group price was applied to this roll.",
      );
    }
    if (event.event_type === "PURCHASE_PRICE_BATCH_LOCK_UPDATED") {
      return t(
        "inventory.historyEvent.purchasePriceBatchLockUpdatedDetail",
        "Group price protection was changed for this roll.",
      );
    }
    if (event.event_type === "LOCATION_MERGED") {
      return t(
        "inventory.historyEvent.locationMergedDetail",
        "This roll was moved because two storage locations were merged.",
      );
    }
    const raw = historyPayloadText(event.payload_json);
    return raw || "—";
  }
  if (event.event_type === "PURCHASE_RECEIPT_RECORDED") {
    const details = purchaseMetadataSummary(
      nestedPayloadRecord(payload, "purchase_metadata"),
      deps,
    );
    const initialWeight = payloadNumber(payload, "initial_weight_g");
    if (initialWeight != null) {
      details.push(
        `${t("inventory.initialWeight", "Initial weight (g)")}: ${formatDisplayGrams(initialWeight, locale)}`,
      );
    }
    return (
      details.join(" · ") ||
      t(
        "inventory.historyEvent.purchaseReceiptRecordedDetail",
        "Purchase receipt was recorded.",
      )
    );
  }
  if (event.event_type === "PURCHASE_METADATA_UPDATED") {
    const changes = purchaseMetadataChanges(
      nestedPayloadRecord(payload, "before"),
      nestedPayloadRecord(payload, "after"),
      deps,
    );
    return (
      changes.join(" · ") ||
      t(
        "inventory.historyEvent.purchaseMetadataUpdatedDetail",
        "Purchase details were updated.",
      )
    );
  }
  if (event.event_type === "PURCHASE_PRICE_STANDARD_APPLIED") {
    const details = purchaseMetadataChanges(
      nestedPayloadRecord(payload, "before"),
      nestedPayloadRecord(payload, "after"),
      deps,
    );
    const mode = payloadString(payload, "mode");
    if (mode) {
      const modeLabel =
        mode === "MISSING_ONLY"
          ? t("settings.filamentDefaultsMissingOnly", "Only missing prices")
          : mode === "OVERWRITE"
            ? t("settings.filamentDefaultsOverwrite", "Update selected prices")
            : null;
      if (modeLabel) {
        details.push(
          `${t("settings.filamentDefaultsBatchMode", "Pricing mode")}: ${modeLabel}`,
        );
      }
    }
    return (
      details.join(" · ") ||
      t(
        "inventory.historyEvent.purchasePriceStandardAppliedDetail",
        "The saved group price was applied to this roll.",
      )
    );
  }
  if (event.event_type === "PURCHASE_PRICE_BATCH_LOCK_UPDATED") {
    const before = payloadBoolean(payload, "before");
    const after = payloadBoolean(payload, "after");
    const details: string[] = [];
    const booleanLabel = (value: boolean) =>
      value ? t("common.on", "On") : t("common.off", "Off");
    const protectionLabel = t(
      "inventory.historyEvent.purchasePriceBatchProtection",
      "Group price protection",
    );
    if (before != null && after != null && before !== after) {
      details.push(
        `${protectionLabel}: ${booleanLabel(before)} → ${booleanLabel(after)}`,
      );
    } else if (after != null) {
      details.push(`${protectionLabel}: ${booleanLabel(after)}`);
    }
    const status = payloadString(payload, "status");
    if (status) {
      details.push(`${t("inventory.status", "Status")}: ${formatStatusLabel(status)}`);
    }
    return (
      details.join(" · ") ||
      t(
        "inventory.historyEvent.purchasePriceBatchLockUpdatedDetail",
        "Group price protection was changed for this roll.",
      )
    );
  }
  if (event.event_type === "LOCATION_MERGED") {
    const sourceName = payloadString(payload, "source_location_name");
    const targetName = payloadString(payload, "target_location_name");
    if (sourceName && targetName) {
      return `${t("inventory.location", "Location")}: ${sourceName} → ${targetName}`;
    }
    if (targetName) {
      return `${t("inventory.location", "Location")}: ${targetName}`;
    }
    return t(
      "inventory.historyEvent.locationMergedDetail",
      "This roll was moved because two storage locations were merged.",
    );
  }
  if (event.event_type === "WEIGHT_UPDATED" || event.event_type === "WEIGHT_CORRECTED") {
    const grams = payloadNumber(payload, "grams");
    const previousGrams = payloadNumber(payload, "previous_grams");
    const remainingPercent = payloadNumber(payload, "remaining_percent");
    const correctionGrams = payloadNumber(payload, "correction_grams");
    const source = payloadString(payload, "source");
    const gramsText = grams == null ? "—" : formatDisplayGrams(grams, locale);
    const details = [`${gramsText}`];
    if (previousGrams != null && grams != null && previousGrams !== grams) {
      const delta = grams - previousGrams;
      details.push(
        formatDisplayGrams(delta, locale, {
          signDisplay: "exceptZero",
        }),
      );
    }
    if (source) {
      details.push(
        source === "BAMBU_AMS_ACCEPTED"
          ? t("settings.bambuLiveAmsWeightEstimate", "AMS estimate")
          : source.replace(/_/g, " "),
      );
    }
    if (event.event_type === "WEIGHT_CORRECTED" && correctionGrams != null) {
      details.push(
        `${t("inventory.historyEvent.correction", "Correction")}: ${formatDisplayGrams(correctionGrams, locale)}`,
      );
    }
    if (remainingPercent != null) {
      details.push(formatDisplayPercent(remainingPercent, locale, 1));
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
      parts.push(`${t("printers.used", "Used")}: ${formatDisplayGrams(used, locale)}`);
    }
    if (remaining != null) {
      parts.push(
        `${t("inventory.remaining", "Remaining")}: ${formatDisplayGrams(remaining, locale)}`,
      );
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
      parts.push(`${t("inventory.out", "Out")}: ${formatDisplayGrams(gramsOut, locale)}`);
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
      parts.push(
        `${t("loans.returned", "Returned")}: ${formatDisplayGrams(returned, locale)}`,
      );
    }
    if (consumed != null) {
      parts.push(
        `${t("loans.consumed", "Consumed")}: ${formatDisplayGrams(consumed, locale)}`,
      );
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
      parts.push(
        `${t("inventory.initialWeight", "Initial weight (g)")}: ${formatDisplayGrams(gramsOut, locale)}`,
      );
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
      parts.push(
        `${t("loans.returned", "Returned")}: ${formatDisplayGrams(returned, locale)}`,
      );
    }
    if (consumed != null) {
      parts.push(
        `${t("loans.consumed", "Consumed")}: ${formatDisplayGrams(consumed, locale)}`,
      );
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
    if (ownershipType && normalizeOwnershipType(ownershipType) === "OWNED") {
      details.push(t("inventory.ownedByUs", "Owned"));
    } else if (isBorrowedInOwnership(ownershipType)) {
      details.push(t("inventory.borrowedInRegistered", "Borrowed-in spool registered"));
    }
    if (vendor) {
      details.push(vendor);
    }
    return details.join(" · ");
  }
  return historyPayloadText(payload) || "—";
}
