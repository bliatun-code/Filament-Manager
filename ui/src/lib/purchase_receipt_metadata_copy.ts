import type { useI18n } from "./i18n";
import type { PurchaseReceiptMetadataValidationError } from "./purchase_receipt_metadata";

export type PurchaseReceiptMetadataFieldsCopy = {
  title: string;
  appliesToQuantity: (quantity: number) => string;
  optional: string;
  pricePerRollLabel: string;
  pricePerRollHint: string;
  currencyLabel: string;
  currencyHint: string;
  purchaseDateLabel: string;
  batchCodeLabel: string;
  supplierReferenceLabel: string;
  validationMessages: Record<PurchaseReceiptMetadataValidationError, string>;
};

export function purchaseReceiptMetadataFieldsCopy(
  t: ReturnType<typeof useI18n>["t"],
): PurchaseReceiptMetadataFieldsCopy {
  return {
    title: t("inventory.purchaseMetadataTitle", "Purchase details"),
    appliesToQuantity: (quantity) =>
      t(
        "inventory.purchaseMetadataApplies",
        "{count, plural, one {These details are saved to this roll.} other {These details are saved to each of the # received rolls.}}",
        { count: quantity },
      ),
    optional: t("common.optional", "Optional"),
    pricePerRollLabel: t("inventory.purchasePricePerRoll", "Price per roll"),
    pricePerRollHint: t(
      "inventory.purchasePricePerRollHint",
      "Enter the unit price for one roll, not the order total.",
    ),
    currencyLabel: t("inventory.purchaseCurrency", "Currency"),
    currencyHint: t(
      "inventory.purchaseCurrencyHint",
      "Use a three-letter code such as NOK or EUR.",
    ),
    purchaseDateLabel: t("inventory.purchaseDate", "Purchase date"),
    batchCodeLabel: t("inventory.purchaseBatchCode", "Batch code"),
    supplierReferenceLabel: t(
      "inventory.purchaseSupplierReference",
      "Supplier reference",
    ),
    validationMessages: {
      "price-invalid": t(
        "inventory.purchasePriceInvalid",
        "Enter a finite numeric price.",
      ),
      "price-negative": t(
        "inventory.purchasePriceNegative",
        "Price cannot be negative.",
      ),
      "currency-required": t(
        "inventory.purchaseCurrencyRequired",
        "Currency is required when the price changes.",
      ),
      "currency-invalid": t(
        "inventory.purchaseCurrencyInvalid",
        "Use a three-letter currency code.",
      ),
      "currency-without-price": t(
        "inventory.purchaseCurrencyWithoutPrice",
        "Enter a price or clear the currency.",
      ),
      "purchase-date-invalid": t(
        "inventory.purchaseDateInvalid",
        "Enter a real calendar date.",
      ),
      "batch-code-too-long": t(
        "inventory.purchaseBatchCodeTooLong",
        "The batch code is too long.",
      ),
      "supplier-reference-too-long": t(
        "inventory.purchaseSupplierReferenceTooLong",
        "The supplier reference is too long.",
      ),
    },
  };
}
