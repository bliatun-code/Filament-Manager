import {
  isBorrowedInOwnership,
  isSpoolStatusOnHand,
} from "./inventory_domain";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";

export const CONSUMPTION_FORECAST_BASIS_DAYS = 30;
export const CONSUMPTION_FORECAST_HORIZON_DAYS = 30;

export type ConsumptionForecast = {
  asOfDate: string;
  averageDailyUsageGrams: number;
  basisDays: number;
  daysOfSupply: number | null;
  estimatedDepletionDate: string | null;
  hasUsageBasis: boolean;
  horizonDays: number;
  ownedOnHandGrams: number;
  ownedOnHandSpoolCount: number;
  projectedRemainingGrams: number;
  projectedUsageGrams: number;
  usageBasisGrams: number;
};

export type ConsumptionForecastInput = {
  asOfDate: string;
  ownedConsumption30d: number;
  spools: NormalizedSpoolWithMasterRow[];
};

function finiteNonNegative(value?: number | null): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function remainingStockGrams(row: NormalizedSpoolWithMasterRow): number {
  return finiteNonNegative(
    row.spool.remaining_g ??
      row.spool.current_weight_g ??
      row.spool.initial_weight_g ??
      0,
  );
}

function parseIsoCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return parsed;
}

function addUtcCalendarDays(value: string, days: number): string | null {
  const parsed = parseIsoCalendarDate(value);
  if (!parsed) {
    return null;
  }
  parsed.setUTCDate(parsed.getUTCDate() + Math.max(0, Math.ceil(days)));
  return parsed.toISOString().slice(0, 10);
}

export function formatForecastDate(value: string, locale = "en"): string {
  const parsed = parseIsoCalendarDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function buildConsumptionForecast({
  asOfDate,
  ownedConsumption30d,
  spools,
}: ConsumptionForecastInput): ConsumptionForecast {
  let ownedOnHandGrams = 0;
  let ownedOnHandSpoolCount = 0;

  for (const row of spools) {
    if (
      !isSpoolStatusOnHand(row.spool.normalized_status) ||
      isBorrowedInOwnership(row.spool.ownership_type)
    ) {
      continue;
    }
    ownedOnHandSpoolCount += 1;
    ownedOnHandGrams += remainingStockGrams(row);
  }

  const usageBasisGrams = finiteNonNegative(ownedConsumption30d);
  const hasUsageBasis = usageBasisGrams > 0;
  const averageDailyUsageGrams = hasUsageBasis
    ? usageBasisGrams / CONSUMPTION_FORECAST_BASIS_DAYS
    : 0;
  const projectedUsageGrams = Math.round(
    averageDailyUsageGrams * CONSUMPTION_FORECAST_HORIZON_DAYS,
  );
  const projectedRemainingGrams = Math.max(
    0,
    Math.round(ownedOnHandGrams - projectedUsageGrams),
  );
  const daysOfSupply = hasUsageBasis
    ? ownedOnHandGrams / averageDailyUsageGrams
    : null;

  return {
    asOfDate,
    averageDailyUsageGrams,
    basisDays: CONSUMPTION_FORECAST_BASIS_DAYS,
    daysOfSupply,
    estimatedDepletionDate:
      daysOfSupply == null ? null : addUtcCalendarDays(asOfDate, daysOfSupply),
    hasUsageBasis,
    horizonDays: CONSUMPTION_FORECAST_HORIZON_DAYS,
    ownedOnHandGrams,
    ownedOnHandSpoolCount,
    projectedRemainingGrams,
    projectedUsageGrams,
    usageBasisGrams,
  };
}
