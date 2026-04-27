import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useI18n } from "../lib/i18n";

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
          className="flex-1 accent-slate-900"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={displayValue}
          onChange={(event) => handleChange(Number(event.target.value))}
          className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => onSubmit?.(displayValue)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300/25 transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white"
        >
          {t("common.save", "Save")}
        </button>
      </div>
    </div>
  );
}
