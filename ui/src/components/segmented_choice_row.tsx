import {
  appControlGroupClassName,
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
    appControlGroupClassName,
    "inline-flex flex-wrap gap-1 rounded-2xl border p-1",
    className,
  );
}

function segmentedChoiceButtonClass(
  active: boolean,
  sizeClasses = "px-3 py-2 text-xs",
): string {
  return joinClassNames(
    "inline-flex items-center gap-2 rounded-xl border font-semibold outline-none transition",
    sizeClasses,
    appControlFocusClassName,
    active
      ? "app-selected-control"
      : "app-soft-control",
  );
}

function segmentedChoiceCountClass(active: boolean): string {
  return `rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
    active
      ? "app-selected-count"
      : "app-idle-count"
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
