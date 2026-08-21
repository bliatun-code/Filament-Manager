export const PURCHASE_BATCH_CODE_MAX_LENGTH = 120;
export const PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH = 200;

export type PurchaseReceiptMetadataDraft = {
  pricePerRoll: string;
  currency: string;
  purchaseDate: string;
  batchCode: string;
  supplierReference: string;
};

/**
 * Serializable spool metadata shared by receipt, later detail editing, and export.
 * A receipt carries this object once; the backend applies it to every created spool
 * inside the same transaction.
 */
export type PurchaseReceiptMetadata = {
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  batch_code: string | null;
  supplier_reference: string | null;
};

export type PurchaseReceiptMetadataField = keyof PurchaseReceiptMetadataDraft;

export type PurchaseReceiptMetadataValidationError =
  | "price-invalid"
  | "price-negative"
  | "currency-required"
  | "currency-invalid"
  | "currency-without-price"
  | "purchase-date-invalid"
  | "batch-code-too-long"
  | "supplier-reference-too-long";

export type PurchaseReceiptMetadataValidationErrors = Partial<
  Record<PurchaseReceiptMetadataField, PurchaseReceiptMetadataValidationError>
>;

export type PurchaseReceiptMetadataParseResult =
  | { ok: true; value: PurchaseReceiptMetadata }
  | { ok: false; errors: PurchaseReceiptMetadataValidationErrors };

export type PurchaseReceiptMetadataParseOptions = {
  /**
   * Existing rows may contain a price from before currency was stored. That exact
   * numeric price can remain currency-less; a changed or newly entered price cannot.
   */
  baseline?: Partial<PurchaseReceiptMetadata> | null;
};

export type PurchaseReceiptMetadataUpdatePreparation =
  | { ok: true; changed: false }
  | { ok: true; changed: true; value: PurchaseReceiptMetadata }
  | { ok: false; errors: PurchaseReceiptMetadataValidationErrors };

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function unicodeLength(value: string): number {
  return [...value].length;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isValidIsoCalendarDate(value: string): boolean {
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

export function emptyPurchaseReceiptMetadataDraft(): PurchaseReceiptMetadataDraft {
  return {
    pricePerRoll: "",
    currency: "",
    purchaseDate: "",
    batchCode: "",
    supplierReference: "",
  };
}

export function buildPurchaseReceiptMetadataDraft(
  metadata: Partial<PurchaseReceiptMetadata> | null | undefined,
): PurchaseReceiptMetadataDraft {
  return {
    pricePerRoll:
      typeof metadata?.purchase_price === "number"
        ? String(metadata.purchase_price)
        : "",
    currency: metadata?.purchase_currency ?? "",
    purchaseDate: metadata?.purchase_date ?? "",
    batchCode: metadata?.batch_code ?? "",
    supplierReference: metadata?.supplier_reference ?? "",
  };
}

export function parsePurchaseReceiptMetadataDraft(
  draft: PurchaseReceiptMetadataDraft,
  options: PurchaseReceiptMetadataParseOptions = {},
): PurchaseReceiptMetadataParseResult {
  const priceRaw = trimmed(draft.pricePerRoll);
  const currency = trimmed(draft.currency).toUpperCase();
  const purchaseDate = trimmed(draft.purchaseDate);
  const batchCode = trimmed(draft.batchCode);
  const supplierReference = trimmed(draft.supplierReference);
  const errors: PurchaseReceiptMetadataValidationErrors = {};

  let purchasePrice: number | null = null;
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

  const unchangedLegacyCurrencylessPrice =
    purchaseReceiptMetadataKeepsLegacyCurrencylessPrice(
      options.baseline,
      draft,
    );

  if (priceRaw && !currency && !unchangedLegacyCurrencylessPrice) {
    errors.currency = "currency-required";
  } else if (!priceRaw && currency) {
    errors.currency = "currency-without-price";
  } else if (currency && !CURRENCY_PATTERN.test(currency)) {
    errors.currency = "currency-invalid";
  }

  if (purchaseDate && !isValidIsoCalendarDate(purchaseDate)) {
    errors.purchaseDate = "purchase-date-invalid";
  }
  if (unicodeLength(batchCode) > PURCHASE_BATCH_CODE_MAX_LENGTH) {
    errors.batchCode = "batch-code-too-long";
  }
  if (
    unicodeLength(supplierReference) > PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH
  ) {
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

export function purchaseReceiptMetadataKeepsLegacyCurrencylessPrice(
  baseline: Partial<PurchaseReceiptMetadata> | null | undefined,
  draft: PurchaseReceiptMetadataDraft,
): boolean {
  const priceRaw = trimmed(draft.pricePerRoll);
  if (!DECIMAL_NUMBER_PATTERN.test(priceRaw)) {
    return false;
  }
  const price = Number(priceRaw);
  const baselinePrice = baseline?.purchase_price;
  return (
    typeof baselinePrice === "number" &&
    Number.isFinite(baselinePrice) &&
    baselinePrice >= 0 &&
    Number.isFinite(price) &&
    price === baselinePrice &&
    !trimmed(baseline?.purchase_currency) &&
    !trimmed(draft.currency)
  );
}

export function purchaseReceiptMetadataDraftChanged(
  baseline: PurchaseReceiptMetadataDraft,
  draft: PurchaseReceiptMetadataDraft,
): boolean {
  const baselinePriceRaw = trimmed(baseline.pricePerRoll);
  const baselinePrice = DECIMAL_NUMBER_PATTERN.test(baselinePriceRaw)
    ? Number(baselinePriceRaw)
    : null;
  const baselineMetadata: Partial<PurchaseReceiptMetadata> = {
    purchase_price:
      typeof baselinePrice === "number" &&
      Number.isFinite(baselinePrice) &&
      baselinePrice >= 0
        ? baselinePrice
        : null,
    purchase_currency: trimmed(baseline.currency).toUpperCase() || null,
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
    trimmed(baseline.pricePerRoll) !== trimmed(draft.pricePerRoll) ||
    trimmed(baseline.currency).toUpperCase() !==
      trimmed(draft.currency).toUpperCase() ||
    trimmed(baseline.purchaseDate) !== trimmed(draft.purchaseDate) ||
    trimmed(baseline.batchCode) !== trimmed(draft.batchCode) ||
    trimmed(baseline.supplierReference) !== trimmed(draft.supplierReference)
  );
}

export function purchaseReceiptMetadataHasValues(
  metadata: PurchaseReceiptMetadata,
): boolean {
  return Object.values(metadata).some((value) => value !== null);
}

/**
 * Preserve the outer Option contract for spool-detail updates: unchanged means
 * omit the object, while changed-to-empty stays an explicit all-null object.
 */
export function preparePurchaseReceiptMetadataUpdate(
  baseline: Partial<PurchaseReceiptMetadata> | null | undefined,
  draft: PurchaseReceiptMetadataDraft,
): PurchaseReceiptMetadataUpdatePreparation {
  if (
    !purchaseReceiptMetadataDraftChanged(
      buildPurchaseReceiptMetadataDraft(baseline),
      draft,
    )
  ) {
    return { ok: true, changed: false };
  }

  const parsed = parsePurchaseReceiptMetadataDraft(draft, { baseline });
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, changed: true, value: parsed.value };
}
