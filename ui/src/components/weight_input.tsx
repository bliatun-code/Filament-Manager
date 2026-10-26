import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { formatGrams } from "../lib/weight_display";
import { useI18n } from "../lib/i18n";
import {
  inventoryDetailFormControlClassName,
  inventoryDetailLabelClassName,
  inventoryDetailSaveButtonClassName,
} from "./inventory_detail_panel_class";

type WeightInputProps = {
  label?: string;
  min?: number;
  max?: number;
  value?: number;
  onChange?: (grams: number) => void;
  onSubmit?: (grams: number) => void;
  style?: CSSProperties;
  compact?: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  tareWeight?: number;
  secondaryControl?: ReactNode;
};

export function WeightInput({
  label = "Current weight (g)",
  min = 0,
  max = 1500,
  value = 0,
  onChange,
  onSubmit,
  style,
  compact = false,
  disabled = false,
  submitDisabled = false,
  tareWeight = 0,
  secondaryControl,
}: WeightInputProps) {
  const { t, locale } = useI18n();
  const [internalValue, setInternalValue] = useState(value);
  const [numberDraft, setNumberDraft] = useState(String(value));
  const generatedId = useId().replace(/:/g, "");
  const rangeId = `inventory-weight-range-${generatedId}`;
  const numberId = `inventory-weight-value-${generatedId}`;

  useEffect(() => {
    setInternalValue(value);
    setNumberDraft(String(value));
  }, [value]);

  const displayValue = useMemo(
    () => (Number.isFinite(internalValue) ? internalValue : value),
    [internalValue, value],
  );

  const handleChange = (nextValue: number) => {
    setInternalValue(nextValue);
    setNumberDraft(String(nextValue));
    onChange?.(nextValue);
  };

  if (compact) {
    const valid = numberDraft.trim() !== "" && Number.isFinite(Number(numberDraft)) && Number(numberDraft) >= min && Number(numberDraft) <= max;
    return (
      <fieldset className="inventory-balanced-weight-input" disabled={disabled}>
        <legend className="sr-only">{label}</legend>
        <div className="inventory-balanced-weight-fields">
          <label htmlFor={numberId}>
            <span>{label}</span>
            <input id={numberId} type="number" min={min} max={max} step={1} value={numberDraft}
              onChange={event => { setNumberDraft(event.target.value); setInternalValue(Number(event.target.value)); onChange?.(Number(event.target.value)); }}
              className={inventoryDetailFormControlClassName} />
          </label>
          {secondaryControl}
        </div>
        <div className="inventory-balanced-weight-result">
          <span>{valid && !submitDisabled ? <>{formatGrams(Number(numberDraft), "dash", locale)} − {formatGrams(tareWeight, "dash", locale)} = <strong>{formatGrams(Math.max(0, Math.round(Number(numberDraft)) - Math.round(tareWeight)), "dash", locale)}</strong></> : "—"}</span>
          <button type="button" disabled={!valid || submitDisabled} className={inventoryDetailSaveButtonClassName} onClick={() => { if (valid && !submitDisabled) onSubmit?.(Number(numberDraft)); }}>
            {t("inventory.detailUpdateWeight", "Update weight")}
          </button>
        </div>
        <details className="inventory-balanced-weight-slider">
          <summary className="app-control-focus">{t("inventory.adjustWeight", "Adjust weight")}</summary>
          <label htmlFor={rangeId} className="sr-only">{t("inventory.adjustWeight", "Adjust weight")}</label>
          <input id={rangeId} type="range" min={min} max={max} value={displayValue} onChange={event => handleChange(Number(event.target.value))} className="app-accent-control app-control-focus w-full" />
        </details>
      </fieldset>
    );
  }

  return (
    <div className="surface-card-compact" style={style}>
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="section-eyebrow">
          {label || t("inventory.weightLabel", "Current weight (g)")}
        </legend>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_auto] sm:items-end">
          <label htmlFor={rangeId} className="block min-w-0">
            <span className={inventoryDetailLabelClassName}>
              {t("inventory.adjustWeight", "Adjust weight")}
            </span>
            <input
              id={rangeId}
              type="range"
              min={min}
              max={max}
              value={displayValue}
              onChange={(event) => handleChange(Number(event.target.value))}
              className="app-accent-control app-control-focus mt-3 w-full outline-none"
            />
          </label>
          <label htmlFor={numberId} className="block">
            <span className={`${inventoryDetailLabelClassName} sm:whitespace-nowrap`}>
              {t("inventory.weightValue", "Weight value (g)")}
            </span>
            <input
              id={numberId}
              type="number"
              min={min}
              max={max}
              value={displayValue}
              onChange={(event) => handleChange(Number(event.target.value))}
              className={`mt-1.5 w-full ${inventoryDetailFormControlClassName}`}
            />
          </label>
          <button
            type="button"
            onClick={() => onSubmit?.(displayValue)}
            className={inventoryDetailSaveButtonClassName}
          >
            {t("common.save", "Save")}
          </button>
        </div>
      </fieldset>
    </div>
  );
}
