import {
  appControlDisabledClassName,
  appControlFocusClassName,
  joinClassNames,
} from "./ui_class_names";
import { useI18n } from "../lib/i18n";
import { formatDisplayInteger } from "../lib/number_display";

export type SegmentedChoiceOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export type SegmentedChoiceRowProps<T extends string> = {
  label?: string;
  labelWidthClassName?: string;
  options: ReadonlyArray<SegmentedChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  groupAriaLabel?: string;
  groupClassName?: string;
  optionSizeClassName?: string;
  isOptionDisabled?: (option: SegmentedChoiceOption<T>) => boolean;
};

function segmentedChoiceGroupClass(className = ""): string {
  return joinClassNames(
    "inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200/85 bg-white/72 p-1 shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none",
    className,
  );
}

function segmentedChoiceButtonClass(
  active: boolean,
  sizeClasses = "px-3 py-2 text-xs",
): string {
  return joinClassNames(
    "inline-flex items-center gap-2 rounded-xl font-semibold outline-none transition",
    sizeClasses,
    appControlFocusClassName,
    active
      ? "app-selected-control dark:bg-slate-100 dark:text-slate-900 dark:shadow-none"
      : "text-slate-600 hover:bg-white/85 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/80 dark:hover:text-slate-100",
  );
}

function segmentedChoiceCountClass(active: boolean): string {
  return `rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
    active
      ? "bg-white/15 text-white dark:bg-slate-900/15 dark:text-slate-900"
      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  }`;
}

export function SegmentedChoiceRow<T extends string>({
  label,
  labelWidthClassName = "min-[920px]:w-24",
  options,
  value,
  onChange,
  className = "",
  groupAriaLabel,
  groupClassName = "",
  optionSizeClassName,
  isOptionDisabled,
}: SegmentedChoiceRowProps<T>) {
  const { locale } = useI18n();

  return (
    <div
      className={joinClassNames(
        "flex flex-col gap-2.5",
        label ? "min-[920px]:flex-row min-[920px]:items-center min-[920px]:gap-4" : "",
        className,
      )}
    >
      {label ? (
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 ${labelWidthClassName} min-[920px]:shrink-0`}
        >
          {label}
        </div>
      ) : null}
      <div
        className={segmentedChoiceGroupClass(groupClassName)}
        role="group"
        aria-label={groupAriaLabel ?? label}
      >
        {options.map((option) => {
          const active = option.value === value;
          const disabled = isOptionDisabled?.(option) ?? false;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={`${segmentedChoiceButtonClass(
                active,
                optionSizeClassName,
              )} ${appControlDisabledClassName}`}
            >
              <span>{option.label}</span>
              {typeof option.count === "number" ? (
                <span className={segmentedChoiceCountClass(active)}>
                  {formatDisplayInteger(option.count, locale)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
