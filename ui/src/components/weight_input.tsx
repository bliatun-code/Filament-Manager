import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
};

export function WeightInput({
  label = "Current weight (g)",
  min = 0,
  max = 1500,
  value = 0,
  onChange,
  onSubmit,
  style,
}: WeightInputProps) {
  const { t } = useI18n();
  const [internalValue, setInternalValue] = useState(value);
  const generatedId = useId().replace(/:/g, "");
  const rangeId = `inventory-weight-range-${generatedId}`;
  const numberId = `inventory-weight-value-${generatedId}`;

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const displayValue = useMemo(
    () => (Number.isFinite(internalValue) ? internalValue : value),
    [internalValue, value],
  );

  const handleChange = (nextValue: number) => {
    setInternalValue(nextValue);
    onChange?.(nextValue);
  };

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
              className="mt-3 w-full accent-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:accent-slate-100 dark:focus-visible:ring-sky-500/20"
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
