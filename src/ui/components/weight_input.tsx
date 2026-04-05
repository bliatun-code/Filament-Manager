import React, { useMemo, useState } from "react";

type WeightInputProps = {
  label?: string;
  min?: number;
  max?: number;
  value?: number;
  onChange?: (grams: number) => void;
  onSubmit?: (grams: number) => void;
};

export function WeightInput({
  label = "Current weight (g)",
  min = 0,
  max = 1500,
  value = 0,
  onChange,
  onSubmit,
}: WeightInputProps) {
  const [internalValue, setInternalValue] = useState(value);

  const displayValue = useMemo(
    () => (Number.isFinite(internalValue) ? internalValue : value),
    [internalValue, value],
  );

  const handleChange = (nextValue: number) => {
    setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
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
          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => onSubmit?.(displayValue)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
