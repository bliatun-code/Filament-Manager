import type { I18nContextValue } from "./i18n";
import { formatDisplayNumber, type NumberDisplayLocale } from "./number_display";
import type {
  StatisticsCurrencyOwnershipAmount,
  StatisticsMonetarySummary,
  StatisticsValueCostOwnershipType,
} from "./tauri_client";

type TranslateFn = I18nContextValue["t"];

export type StatisticsCurrencyDisplayGroup = {
  currency: string;
  owned: StatisticsCurrencyOwnershipAmount | null;
  borrowedIn: StatisticsCurrencyOwnershipAmount | null;
};

export function groupStatisticsCurrencyAmounts(
  summary: StatisticsMonetarySummary,
): StatisticsCurrencyDisplayGroup[] {
  const groups = new Map<string, StatisticsCurrencyDisplayGroup>();

  for (const total of summary.totals) {
    const currency = total.currency.trim().toUpperCase();
    if (!currency) {
      continue;
    }
    const group = groups.get(currency) ?? {
      currency,
      owned: null,
      borrowedIn: null,
    };
    if (total.ownership_type === "BORROWED_IN") {
      group.borrowedIn = total;
    } else {
      group.owned = total;
    }
    groups.set(currency, group);
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}

export function formatStatisticsMoney(
  amount: number,
  currency: string,
  locale: NumberDisplayLocale,
): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  try {
    return formatDisplayNumber(amount, locale, {
      currency: normalizedCurrency,
      currencyDisplay: "code",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
  } catch {
    return `${formatDisplayNumber(amount, locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })} ${normalizedCurrency || "—"}`;
  }
}

export function statisticsOwnershipLabel(
  t: TranslateFn,
  ownershipType: StatisticsValueCostOwnershipType,
): string {
  return ownershipType === "BORROWED_IN"
    ? t("statistics.valueCostBorrowedIn", "Borrowed in")
    : t("statistics.valueCostOwned", "Owned");
}

function humanizeReasonToken(reason: string): string {
  const words = reason
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  return words.length > 0 ? `${words[0]!.toUpperCase()}${words.slice(1)}` : "—";
}

export function statisticsMissingReasonLabel(t: TranslateFn, reason: string): string {
  switch (reason.trim().toLowerCase()) {
    case "spool_missing":
      return t("statistics.valueCostReasonSpoolMissing", "The referenced spool is missing");
    case "remaining_weight_missing":
      return t(
        "statistics.valueCostReasonRemainingWeightMissing",
        "Remaining weight is missing",
      );
    case "remaining_weight_invalid":
      return t(
        "statistics.valueCostReasonRemainingWeightInvalid",
        "Remaining weight is invalid",
      );
    case "used_weight_missing":
      return t("statistics.valueCostReasonUsedWeightMissing", "Used weight is missing");
    case "used_weight_invalid":
      return t("statistics.valueCostReasonUsedWeightInvalid", "Used weight is invalid");
    case "missing_purchase_price":
    case "purchase_price_missing":
      return t("statistics.valueCostReasonMissingPrice", "Purchase price is missing");
    case "missing_purchase_currency":
    case "purchase_currency_missing":
      return t("statistics.valueCostReasonMissingCurrency", "Purchase currency is missing");
    case "missing_initial_weight":
    case "initial_weight_missing":
      return t("statistics.valueCostReasonMissingInitialWeight", "Initial weight is missing");
    case "invalid_initial_weight":
    case "initial_weight_invalid":
    case "non_positive_initial_weight":
      return t(
        "statistics.valueCostReasonInvalidInitialWeight",
        "Initial weight must be greater than zero",
      );
    case "invalid_purchase_price":
    case "negative_purchase_price":
    case "purchase_price_invalid":
      return t("statistics.valueCostReasonInvalidPrice", "Purchase price is invalid");
    case "purchase_currency_invalid":
      return t("statistics.valueCostReasonInvalidCurrency", "Purchase currency is invalid");
    case "calculation_invalid":
      return t("statistics.valueCostReasonCalculationInvalid", "The value could not be calculated");
    default:
      return humanizeReasonToken(reason);
  }
}

export function statisticsMissingReasonOpensFilamentDefaults(reason: string): boolean {
  return statisticsMissingReasonFilamentDefaultsTarget(reason) != null;
}

export type StatisticsFilamentDefaultsTarget =
  | "DEFAULT_CURRENCY"
  | "GROUP_PRICING";

export function statisticsMissingReasonFilamentDefaultsTarget(
  reason: string,
): StatisticsFilamentDefaultsTarget | null {
  const token = reason.trim().toLowerCase();
  if (
    token === "missing_purchase_currency" ||
    token === "purchase_currency_missing" ||
    token === "purchase_currency_invalid"
  ) {
    return "DEFAULT_CURRENCY";
  }
  return (
    token === "missing_purchase_price" ||
    token === "purchase_price_missing" ||
    token === "invalid_purchase_price" ||
    token === "negative_purchase_price" ||
    token === "purchase_price_invalid"
  )
    ? "GROUP_PRICING"
    : null;
}

export function statisticsCoveragePercent(summary: StatisticsMonetarySummary): number | null {
  if (summary.coverage.total_rows <= 0) {
    return null;
  }
  return Math.max(
    0,
    Math.min(100, (summary.coverage.valued_rows / summary.coverage.total_rows) * 100),
  );
}
