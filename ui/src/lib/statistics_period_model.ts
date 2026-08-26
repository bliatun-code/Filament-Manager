import type { StatisticsPeriod } from "./tauri_client";

export type StatisticsPeriodPreset = "30_DAYS" | "90_DAYS" | "12_MONTHS" | "CUSTOM";
export type StatisticsCustomPeriodValidationError =
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "END_BEFORE_START";

export type ResolvedStatisticsPeriod = {
  period: StatisticsPeriod;
  startDate: string;
  endDate: string;
};

export type StatisticsPeriodPickerState = ResolvedStatisticsPeriod & {
  appliedPreset: StatisticsPeriodPreset;
  customEditorOpen: boolean;
  customStartDate: string;
  customEndDate: string;
  validationError: StatisticsCustomPeriodValidationError | null;
};

type CustomPeriodResolution =
  | { valid: true; value: ResolvedStatisticsPeriod }
  | { valid: false; error: StatisticsCustomPeriodValidationError };

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toWholeSecondUtc(date: Date): string {
  return date.toISOString().replace(".000Z", "Z");
}

function resolveLocalDateRange(startDate: string, endDate: string): CustomPeriodResolution {
  if (!startDate || !endDate) {
    return { valid: false, error: "MISSING_DATE" };
  }
  const start = parseLocalDate(startDate);
  const inclusiveEnd = parseLocalDate(endDate);
  if (!start || !inclusiveEnd) {
    return { valid: false, error: "INVALID_DATE" };
  }
  if (inclusiveEnd.getTime() < start.getTime()) {
    return { valid: false, error: "END_BEFORE_START" };
  }
  const exclusiveEnd = new Date(
    inclusiveEnd.getFullYear(),
    inclusiveEnd.getMonth(),
    inclusiveEnd.getDate() + 1,
  );
  return {
    valid: true,
    value: {
      period: {
        start_at_utc: toWholeSecondUtc(start),
        end_at_utc: toWholeSecondUtc(exclusiveEnd),
      },
      startDate,
      endDate,
    },
  };
}

export function resolveStatisticsPeriodPreset(
  preset: Exclude<StatisticsPeriodPreset, "CUSTOM">,
  now = new Date(),
): ResolvedStatisticsPeriod {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exclusiveEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );
  const start =
    preset === "30_DAYS"
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
      : preset === "90_DAYS"
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)
        : new Date(
            exclusiveEnd.getFullYear() - 1,
            exclusiveEnd.getMonth(),
            exclusiveEnd.getDate(),
          );
  return {
    period: {
      start_at_utc: toWholeSecondUtc(start),
      end_at_utc: toWholeSecondUtc(exclusiveEnd),
    },
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(today),
  };
}

export function createStatisticsPeriodPickerState(
  now = new Date(),
): StatisticsPeriodPickerState {
  const initial = resolveStatisticsPeriodPreset("30_DAYS", now);
  return {
    ...initial,
    appliedPreset: "30_DAYS",
    customEditorOpen: false,
    customStartDate: initial.startDate,
    customEndDate: initial.endDate,
    validationError: null,
  };
}

export function selectStatisticsPeriodPreset(
  state: StatisticsPeriodPickerState,
  preset: Exclude<StatisticsPeriodPreset, "CUSTOM">,
  now = new Date(),
): StatisticsPeriodPickerState {
  const resolved = resolveStatisticsPeriodPreset(preset, now);
  return {
    ...state,
    ...resolved,
    appliedPreset: preset,
    customEditorOpen: false,
    validationError: null,
  };
}

export function openCustomStatisticsPeriod(
  state: StatisticsPeriodPickerState,
): StatisticsPeriodPickerState {
  return {
    ...state,
    customEditorOpen: true,
    validationError: null,
  };
}

export function updateCustomStatisticsPeriod(
  state: StatisticsPeriodPickerState,
  field: "start" | "end",
  value: string,
): StatisticsPeriodPickerState {
  return {
    ...state,
    customStartDate: field === "start" ? value : state.customStartDate,
    customEndDate: field === "end" ? value : state.customEndDate,
    validationError: null,
  };
}

export function applyCustomStatisticsPeriod(
  state: StatisticsPeriodPickerState,
): StatisticsPeriodPickerState {
  const resolved = resolveLocalDateRange(state.customStartDate, state.customEndDate);
  if (!resolved.valid) {
    return { ...state, validationError: resolved.error };
  }
  return {
    ...state,
    ...resolved.value,
    appliedPreset: "CUSTOM",
    customEditorOpen: true,
    validationError: null,
  };
}

export function formatStatisticsPeriodRange(
  state: Pick<StatisticsPeriodPickerState, "startDate" | "endDate">,
  locale: string | null | undefined,
): string {
  const start = parseLocalDate(state.startDate);
  const end = parseLocalDate(state.endDate);
  if (!start || !end) {
    return `${state.startDate} – ${state.endDate}`;
  }
  const formatter = new Intl.DateTimeFormat(locale?.trim() || "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
