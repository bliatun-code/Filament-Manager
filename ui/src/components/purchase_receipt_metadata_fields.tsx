import { useId } from "react";

import {
  updatePurchasePriceDraft,
  type PurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataField,
  type PurchaseReceiptMetadataValidationErrors,
} from "../lib/purchase_receipt_metadata";
import type { PurchaseReceiptMetadataFieldsCopy } from "../lib/purchase_receipt_metadata_copy";
import { formInputChromeClassName } from "./form_control_class";

export type PurchaseReceiptMetadataFieldsProps = {
  copy: PurchaseReceiptMetadataFieldsCopy;
  defaultCurrency?: string | null;
  disabled?: boolean;
  draft: PurchaseReceiptMetadataDraft;
  errors?: PurchaseReceiptMetadataValidationErrors;
  legacyCurrencylessPriceUnchanged?: boolean;
  onChange: (draft: PurchaseReceiptMetadataDraft) => void;
  selectedQuantity: number;
};

function describedBy(...ids: Array<string | null>): string | undefined {
  const presentIds = ids.filter((id): id is string => Boolean(id));
  return presentIds.length > 0 ? presentIds.join(" ") : undefined;
}

export function PurchaseReceiptMetadataFields({
  copy,
  defaultCurrency = null,
  disabled = false,
  draft,
  errors = {},
  legacyCurrencylessPriceUnchanged = false,
  onChange,
  selectedQuantity,
}: PurchaseReceiptMetadataFieldsProps) {
  const fieldsetId = useId();
  const summaryId = `${fieldsetId}-summary`;
  const priceHintId = `${fieldsetId}-price-hint`;
  const currencyHintId = `${fieldsetId}-currency-hint`;
  const priceProvided = draft.pricePerRoll.trim().length > 0;
  const currencyRequired = priceProvided && !legacyCurrencylessPriceUnchanged;

  function updateField<Field extends PurchaseReceiptMetadataField>(
    field: Field,
    value: PurchaseReceiptMetadataDraft[Field],
  ) {
    onChange({ ...draft, [field]: value });
  }

  function errorId(field: PurchaseReceiptMetadataField): string | null {
    return errors[field] ? `${fieldsetId}-${field}-error` : null;
  }

  function errorMessage(field: PurchaseReceiptMetadataField) {
    const error = errors[field];
    if (!error) {
      return null;
    }
    return (
      <p
        id={`${fieldsetId}-${field}-error`}
        className="mt-1 text-[11px] font-medium text-rose-700 dark:text-rose-300"
        role="alert"
      >
        {copy.validationMessages[error]}
      </p>
    );
  }

  return (
    <fieldset
      className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-950/35"
      aria-describedby={summaryId}
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
        {copy.title}
      </legend>
      <p id={summaryId} className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {copy.appliesToQuantity(selectedQuantity)}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {copy.pricePerRollLabel}
            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
              {copy.optional}
            </span>
          </span>
          <input
            type="number"
            name="purchase_price"
            min={0}
            step="any"
            inputMode="decimal"
            value={draft.pricePerRoll}
            onChange={(event) =>
              onChange(
                updatePurchasePriceDraft(
                  draft,
                  event.target.value,
                  defaultCurrency,
                ),
              )
            }
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            aria-invalid={Boolean(errors.pricePerRoll)}
            aria-describedby={describedBy(priceHintId, errorId("pricePerRoll"))}
          />
          <span id={priceHintId} className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            {copy.pricePerRollHint}
          </span>
          {errorMessage("pricePerRoll")}
        </label>

        <label className="block min-w-0">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {copy.currencyLabel}
            {!currencyRequired ? (
              <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                {copy.optional}
              </span>
            ) : null}
          </span>
          <input
            type="text"
            name="purchase_currency"
            value={draft.currency}
            maxLength={3}
            autoCapitalize="characters"
            autoComplete="off"
            required={currencyRequired}
            onChange={(event) => updateField("currency", event.target.value.toUpperCase())}
            className={`mt-1.5 w-full uppercase ${formInputChromeClassName}`}
            aria-invalid={Boolean(errors.currency)}
            aria-describedby={describedBy(currencyHintId, errorId("currency"))}
          />
          <span
            id={currencyHintId}
            className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400"
          >
            {copy.currencyHint}
          </span>
          {errorMessage("currency")}
        </label>

        <label className="block min-w-0">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {copy.purchaseDateLabel}
            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
              {copy.optional}
            </span>
          </span>
          <input
            type="date"
            name="purchase_date"
            value={draft.purchaseDate}
            onChange={(event) => updateField("purchaseDate", event.target.value)}
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            aria-invalid={Boolean(errors.purchaseDate)}
            aria-describedby={describedBy(errorId("purchaseDate"))}
          />
          {errorMessage("purchaseDate")}
        </label>

        <label className="block min-w-0">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {copy.batchCodeLabel}
            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
              {copy.optional}
            </span>
          </span>
          <input
            type="text"
            name="batch_code"
            value={draft.batchCode}
            onChange={(event) => updateField("batchCode", event.target.value)}
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            aria-invalid={Boolean(errors.batchCode)}
            aria-describedby={describedBy(errorId("batchCode"))}
          />
          {errorMessage("batchCode")}
        </label>

        <label className="block min-w-0 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {copy.supplierReferenceLabel}
            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
              {copy.optional}
            </span>
          </span>
          <input
            type="text"
            name="supplier_reference"
            value={draft.supplierReference}
            onChange={(event) => updateField("supplierReference", event.target.value)}
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            aria-invalid={Boolean(errors.supplierReference)}
            aria-describedby={describedBy(errorId("supplierReference"))}
          />
          {errorMessage("supplierReference")}
        </label>
      </div>
    </fieldset>
  );
}
