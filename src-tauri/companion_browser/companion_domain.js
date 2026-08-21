import {
  isCanonicalLoanDirection,
  isCanonicalLoanStatus,
  isCanonicalOwnershipType,
  isCanonicalSpoolStatus,
} from "./shared_contracts.generated.js";

const LEGACY_REMOVED_SPOOL_STATUS_TOKENS = new Set(["DELETED", "MISSING"]);

export function normalizeDomainToken(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
}

export function parseSpoolStatus(value) {
  const status = normalizeDomainToken(value);
  if (status === "IN_USE" || status === "ASSIGNED") {
    return "ASSIGNED";
  }
  if (status === "LOANED_OUT" || status === "LOANED") {
    return "BORROWED";
  }
  if (isCanonicalSpoolStatus(status) && !LEGACY_REMOVED_SPOOL_STATUS_TOKENS.has(status)) {
    return status;
  }
  return null;
}

export function normalizeSpoolStatus(value) {
  return parseSpoolStatus(value) || "IN_STOCK";
}

export function normalizeEditableSpoolStatus(value) {
  const status = parseSpoolStatus(value);
  return status === "EMPTY" || status === "LOST" ? status : "IN_STOCK";
}

export function normalizeOwnershipType(value) {
  const ownershipType = normalizeDomainToken(value);
  return isCanonicalOwnershipType(ownershipType) && ownershipType === "BORROWED_IN"
    ? ownershipType
    : "OWNED";
}

export function normalizeLoanDirection(value) {
  const direction = normalizeDomainToken(value);
  const normalized = direction === "IN_BOUND" ? "INBOUND" : direction;
  return isCanonicalLoanDirection(normalized) && normalized === "INBOUND"
    ? normalized
    : "OUTBOUND";
}

export function normalizeLoanStatus(value, returnedAt) {
  const status = normalizeDomainToken(value);
  if (status === "RETURNED" || String(returnedAt ?? "").trim()) {
    return "RETURNED";
  }
  if (isCanonicalLoanStatus(status) && (status === "LOST" || status === "CANCELLED")) {
    return status;
  }
  return "ACTIVE";
}

export function isBorrowedInOwnership(value) {
  return normalizeOwnershipType(value) === "BORROWED_IN";
}

export function isLegacyRemovedSpoolStatus(value) {
  return LEGACY_REMOVED_SPOOL_STATUS_TOKENS.has(normalizeDomainToken(value));
}

export function isSpoolStatusDeleted(value) {
  return normalizeDomainToken(value) === "DELETED";
}

export function isSpoolStatusAssigned(value) {
  return parseSpoolStatus(value) === "ASSIGNED";
}

export function isSpoolStatusEmpty(value) {
  return parseSpoolStatus(value) === "EMPTY";
}

export function isSpoolStatusEmptyOrLost(value) {
  const status = parseSpoolStatus(value);
  return status === "EMPTY" || status === "LOST";
}

export function isSpoolStatusLoanedOut(value) {
  return parseSpoolStatus(value) === "BORROWED";
}

export function isSpoolStatusUnavailableForPrinterSlot(value) {
  return (
    isSpoolStatusEmptyOrLost(value) ||
    isSpoolStatusLoanedOut(value) ||
    isLegacyRemovedSpoolStatus(value)
  );
}

export function isSpoolStatusLiveRfidCandidate(value) {
  return !isSpoolStatusUnavailableForPrinterSlot(value);
}

export function isEditableSpoolStatus(value) {
  const status = parseSpoolStatus(value);
  return status === "IN_STOCK" || status === "EMPTY" || status === "LOST";
}

export const PURCHASE_BATCH_CODE_MAX_LENGTH = 120;
export const PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH = 200;

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PURCHASE_RECEIPT_VALIDATION_FIELD_ORDER = [
  "pricePerRoll",
  "currency",
  "purchaseDate",
  "batchCode",
  "supplierReference",
];
const PURCHASE_RECEIPT_VALIDATION_MESSAGES = Object.freeze({
  "price-invalid": ["purchaseReceipt.errorPriceInvalid", "Enter a finite numeric price."],
  "price-negative": ["purchaseReceipt.errorPriceNegative", "Price cannot be negative."],
  "currency-required": [
    "purchaseReceipt.errorCurrencyRequired",
    "Currency is required when the price changes.",
  ],
  "currency-invalid": [
    "purchaseReceipt.errorCurrencyInvalid",
    "Use a three-letter currency code.",
  ],
  "currency-without-price": [
    "purchaseReceipt.errorCurrencyWithoutPrice",
    "Enter a price or clear the currency.",
  ],
  "purchase-date-invalid": [
    "purchaseReceipt.errorDateInvalid",
    "Enter a real calendar date.",
  ],
  "batch-code-too-long": [
    "purchaseReceipt.errorBatchCodeTooLong",
    "The batch code is too long.",
  ],
  "supplier-reference-too-long": [
    "purchaseReceipt.errorSupplierReferenceTooLong",
    "The supplier reference is too long.",
  ],
});

function trimmedReceiptValue(value) {
  return String(value ?? "").trim();
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isValidPurchaseReceiptDate(value) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

export function emptyPurchaseReceiptMetadataDraft() {
  return {
    pricePerRoll: "",
    currency: "",
    purchaseDate: "",
    batchCode: "",
    supplierReference: "",
  };
}

export function buildPurchaseReceiptMetadataDraft(metadata) {
  return {
    pricePerRoll:
      typeof metadata?.purchase_price === "number" ? String(metadata.purchase_price) : "",
    currency: metadata?.purchase_currency ?? "",
    purchaseDate: metadata?.purchase_date ?? "",
    batchCode: metadata?.batch_code ?? "",
    supplierReference: metadata?.supplier_reference ?? "",
  };
}

export function parsePurchaseReceiptMetadataDraft(draft, options = {}) {
  const priceRaw = trimmedReceiptValue(draft?.pricePerRoll);
  const currency = trimmedReceiptValue(draft?.currency).toUpperCase();
  const purchaseDate = trimmedReceiptValue(draft?.purchaseDate);
  const batchCode = trimmedReceiptValue(draft?.batchCode);
  const supplierReference = trimmedReceiptValue(draft?.supplierReference);
  const errors = {};

  let purchasePrice = null;
  if (priceRaw) {
    if (!DECIMAL_NUMBER_PATTERN.test(priceRaw)) {
      errors.pricePerRoll = "price-invalid";
    } else {
      const parsedPrice = Number(priceRaw);
      if (!Number.isFinite(parsedPrice)) {
        errors.pricePerRoll = "price-invalid";
      } else if (parsedPrice < 0) {
        errors.pricePerRoll = "price-negative";
      } else {
        purchasePrice = Object.is(parsedPrice, -0) ? 0 : parsedPrice;
      }
    }
  }

  const baselinePrice = options.baseline?.purchase_price;
  const baselineCurrency = trimmedReceiptValue(options.baseline?.purchase_currency);
  const unchangedLegacyCurrencylessPrice =
    purchasePrice !== null &&
    !currency &&
    typeof baselinePrice === "number" &&
    Number.isFinite(baselinePrice) &&
    baselinePrice >= 0 &&
    purchasePrice === baselinePrice &&
    !baselineCurrency;

  if (priceRaw && !currency && !unchangedLegacyCurrencylessPrice) {
    errors.currency = "currency-required";
  } else if (!priceRaw && currency) {
    errors.currency = "currency-without-price";
  } else if (currency && !CURRENCY_PATTERN.test(currency)) {
    errors.currency = "currency-invalid";
  }

  if (purchaseDate && !isValidPurchaseReceiptDate(purchaseDate)) {
    errors.purchaseDate = "purchase-date-invalid";
  }
  if ([...batchCode].length > PURCHASE_BATCH_CODE_MAX_LENGTH) {
    errors.batchCode = "batch-code-too-long";
  }
  if ([...supplierReference].length > PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH) {
    errors.supplierReference = "supplier-reference-too-long";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      purchase_price: purchasePrice,
      purchase_currency: currency || null,
      purchase_date: purchaseDate || null,
      batch_code: batchCode || null,
      supplier_reference: supplierReference || null,
    },
  };
}

export function purchaseReceiptMetadataDraftChanged(baseline, draft) {
  const baselinePriceRaw = trimmedReceiptValue(baseline?.pricePerRoll);
  const baselinePrice = DECIMAL_NUMBER_PATTERN.test(baselinePriceRaw)
    ? Number(baselinePriceRaw)
    : null;
  const baselineMetadata = {
    purchase_price:
      typeof baselinePrice === "number" &&
      Number.isFinite(baselinePrice) &&
      baselinePrice >= 0
        ? baselinePrice
        : null,
    purchase_currency: trimmedReceiptValue(baseline?.currency).toUpperCase() || null,
  };
  const baselineResult = parsePurchaseReceiptMetadataDraft(baseline, {
    baseline: baselineMetadata,
  });
  const draftResult = parsePurchaseReceiptMetadataDraft(draft, {
    baseline: baselineMetadata,
  });
  if (baselineResult.ok && draftResult.ok) {
    return JSON.stringify(baselineResult.value) !== JSON.stringify(draftResult.value);
  }
  return (
    trimmedReceiptValue(baseline?.pricePerRoll) !==
      trimmedReceiptValue(draft?.pricePerRoll) ||
    trimmedReceiptValue(baseline?.currency).toUpperCase() !==
      trimmedReceiptValue(draft?.currency).toUpperCase() ||
    trimmedReceiptValue(baseline?.purchaseDate) !==
      trimmedReceiptValue(draft?.purchaseDate) ||
    trimmedReceiptValue(baseline?.batchCode) !== trimmedReceiptValue(draft?.batchCode) ||
    trimmedReceiptValue(baseline?.supplierReference) !==
      trimmedReceiptValue(draft?.supplierReference)
  );
}

export function purchaseReceiptMetadataHasValues(metadata) {
  return Object.values(metadata).some((value) => value !== null);
}

export function preparePurchaseReceiptMetadataUpdate(baseline, draft) {
  if (!purchaseReceiptMetadataDraftChanged(buildPurchaseReceiptMetadataDraft(baseline), draft)) {
    return { ok: true, changed: false };
  }
  const parsed = parsePurchaseReceiptMetadataDraft(draft, { baseline });
  return parsed.ok ? { ok: true, changed: true, value: parsed.value } : parsed;
}

export function purchaseReceiptMetadataValidationMessage(errors, tr) {
  const errorCode = PURCHASE_RECEIPT_VALIDATION_FIELD_ORDER.map(
    (field) => errors?.[field],
  ).find(Boolean);
  const descriptor = PURCHASE_RECEIPT_VALIDATION_MESSAGES[errorCode];
  if (!descriptor) {
    return tr(
      "purchaseReceipt.errorInvalid",
      "Review the purchase details before saving.",
    );
  }
  return tr(descriptor[0], descriptor[1]);
}
