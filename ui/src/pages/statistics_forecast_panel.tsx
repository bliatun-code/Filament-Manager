import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "../lib/number_display";
import {
  formatForecastDate,
  type ConsumptionForecast,
} from "../lib/statistics_forecast_model";
import type { TranslateFn } from "../lib/statistics_model";
import { formatGrams } from "../lib/weight_display";
import { StatisticsEmptyState, SummaryMetricTile } from "./statistics_primitives";

export function StatisticsForecastPanel({
  forecast,
  locale = "en",
  t,
}: {
  forecast: ConsumptionForecast;
  locale?: NumberDisplayLocale;
  t: TranslateFn;
}) {
  const coverageValue =
    forecast.daysOfSupply == null
      ? t("statistics.forecastUnavailable", "Not enough usage data")
      : t("statistics.forecastDays", "{count, plural, one {# day} other {# days}}", {
          count: forecast.daysOfSupply,
        });
  const depletionValue = forecast.estimatedDepletionDate
    ? formatForecastDate(forecast.estimatedDepletionDate, locale ?? "en")
    : "—";

  return (
    <section className="content-section surface-card" aria-labelledby="statistics-forecast-title">
      <div>
        <div id="statistics-forecast-title" className="section-eyebrow">
          {t("statistics.consumptionForecast", "Consumption forecast")}
        </div>
        <div className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          {t(
            "statistics.consumptionForecastHint",
            "A deterministic estimate based on owned stock and recorded owned usage during the last 30 days.",
          )}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("statistics.forecastDataThrough", "Data through {date}", {
            date: formatForecastDate(forecast.asOfDate, locale ?? "en"),
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricTile
          label={t("statistics.forecastOwnedStock", "Owned stock included")}
          value={formatGrams(forecast.ownedOnHandGrams, "zero", locale)}
          tone="slate"
        />
        <SummaryMetricTile
          label={t("statistics.forecastUsageBasis", "Recorded use · 30 days")}
          value={formatGrams(forecast.usageBasisGrams, "zero", locale)}
          tone="amber"
        />
        <SummaryMetricTile
          label={t("statistics.forecastCoverage", "Estimated coverage")}
          value={coverageValue}
          tone="sky"
        />
        <SummaryMetricTile
          label={t("statistics.forecastDepletion", "Potentially depleted")}
          value={depletionValue}
          tone="rose"
        />
        <SummaryMetricTile
          label={t("statistics.forecastNext30Days", "Estimated use · next 30 days")}
          value={formatGrams(forecast.projectedUsageGrams, "zero", locale)}
          tone="amber"
        />
        <SummaryMetricTile
          label={t("statistics.forecastRemaining30Days", "Estimated stock after 30 days")}
          value={formatGrams(forecast.projectedRemainingGrams, "zero", locale)}
          tone="emerald"
        />
        <SummaryMetricTile
          label={t("statistics.forecastDailyAverage", "Assumed daily use")}
          value={formatGrams(forecast.averageDailyUsageGrams, "zero", locale)}
          tone="slate"
        />
        <SummaryMetricTile
          label={t("statistics.forecastSpoolsIncluded", "Owned spools included")}
          value={formatDisplayInteger(forecast.ownedOnHandSpoolCount, locale)}
          tone="slate"
        />
      </div>

      {!forecast.hasUsageBasis ? (
        <StatisticsEmptyState>
          {t(
            "statistics.forecastNeedsUsage",
            "Record owned filament use before a depletion date can be estimated.",
          )}
        </StatisticsEmptyState>
      ) : null}

      <div className="surface-subtle mt-4 p-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
        {t(
          "statistics.forecastAssumptions",
          "Assumption: daily use stays equal to the last 30-day average. Borrowed-in, empty, lost and removed spools are excluded. This forecast is informational and never creates orders automatically.",
        )}
      </div>
    </section>
  );
}
