import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useI18n } from "../lib/i18n";
import {
  inventoryDetailFormControlClassName,
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
      <div className="section-eyebrow">
        {label || t("inventory.weightLabel", "Current weight (g)")}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          value={displayValue}
          onChange={(event) => handleChange(Number(event.target.value))}
          className="flex-1 accent-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:accent-slate-100 dark:focus-visible:ring-sky-500/20"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={displayValue}
          onChange={(event) => handleChange(Number(event.target.value))}
          className={`w-24 ${inventoryDetailFormControlClassName}`}
        />
        <button
          type="button"
          onClick={() => onSubmit?.(displayValue)}
          className={inventoryDetailSaveButtonClassName}
        >
          {t("common.save", "Save")}
        </button>
      </div>
    </div>
  );
}
