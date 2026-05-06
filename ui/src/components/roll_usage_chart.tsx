import { useMemo } from "react";
import { parseDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";

type UsagePoint = {
  captured_at: string;
  grams: number;
  source: string;
};

type RollUsageChartProps = {
  points: UsagePoint[];
  loading?: boolean;
  initialWeight?: number | null;
};

const CHART_WIDTH = 360;
const CHART_HEIGHT = 120;
const CHART_PADDING = 14;

function toDisplayTime(raw: string): string {
  const parsed = parseDateTime(raw);
  if (!parsed) {
    return raw;
  }
  return parsed.toLocaleString();
}

export function RollUsageChart({
  points,
  loading = false,
  initialWeight = null,
}: RollUsageChartProps) {
  const { t } = useI18n();
  const baselineWeight = Math.max(Math.round(initialWeight ?? 0), 0);
  const sortedPoints = useMemo(
    () =>
      [...points]
        .filter((point) => Number.isFinite(point.grams))
        .sort((left, right) => left.captured_at.localeCompare(right.captured_at)),
    [points],
  );

  const chartPoints = useMemo(() => {
    const sourcePoints =
      sortedPoints.length <= 50 ? sortedPoints : sortedPoints.slice(sortedPoints.length - 50);
    return sourcePoints.map((point) => {
      const remaining = Math.max(0, Math.round(point.grams));
      return {
        ...point,
        remaining,
      };
    });
  }, [sortedPoints]);

  const stats = useMemo(() => {
    if (chartPoints.length === 0) {
      return null;
    }
    const remainingValues = chartPoints.map((point) => point.remaining);
    const min = Math.min(...remainingValues);
    const max = Math.max(...remainingValues);
    const scaleMax = Math.max(baselineWeight, max, 1);
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const consumedInWindow = Math.max(first.remaining - last.remaining, 0);
    const totalConsumed = Math.max(scaleMax - last.remaining, 0);
    return {
      min,
      max,
      first,
      last,
      consumedInWindow,
      totalConsumed,
      scaleMax,
    };
  }, [baselineWeight, chartPoints]);

  const polyline = useMemo(() => {
    if (!stats || chartPoints.length === 0) {
      return "";
    }
    const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
    const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;
    return chartPoints
      .map((point, index) => {
        const x =
          chartPoints.length === 1
            ? CHART_WIDTH / 2
            : CHART_PADDING + (index / (chartPoints.length - 1)) * innerWidth;
        const normalized = point.remaining / stats.scaleMax;
        const y = CHART_PADDING + (1 - normalized) * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [chartPoints, stats]);

  if (loading) {
    return (
      <div className="mt-3 text-xs text-slate-500">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  if (!stats || chartPoints.length === 0) {
    return (
      <div className="mt-3 text-xs text-slate-500">
        {t("chart.noSamples", "No weight samples yet.")}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-sky-300"
        role="img"
        aria-label="Roll usage chart"
      >
        <line
          x1={CHART_PADDING}
          y1={CHART_HEIGHT - CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
          stroke="currentColor"
          opacity="0.35"
          strokeWidth="1"
        />
        <line
          x1={CHART_PADDING}
          y1={CHART_PADDING}
          x2={CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
          stroke="currentColor"
          opacity="0.35"
          strokeWidth="1"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {chartPoints.length === 1 ? (
          <circle
            cx={CHART_WIDTH / 2}
            cy={CHART_HEIGHT / 2}
            r="3.5"
            fill="currentColor"
          />
        ) : null}
      </svg>
      <div className="grid grid-cols-1 gap-1 text-xs text-slate-600">
        <div>
          {t("chart.latest", "Latest")}:{" "}
          <span className="font-semibold text-slate-800">{stats.last.remaining} g</span>{" "}
          {t("inventory.remaining", "remaining")} ·{" "}
          <span className="font-semibold text-slate-800">{stats.totalConsumed} g</span>{" "}
          {t("chart.totalConsumed", "consumed")}
          at {toDisplayTime(stats.last.captured_at)}
        </div>
        <div>
          {t("chart.consumed", "Consumed over chart")}:{" "}
          <span className="font-semibold text-slate-800">
            {stats.consumedInWindow} g
          </span>
        </div>
        <div>
          {t("chart.range", "Range")}: {stats.scaleMax} g - 0 g
        </div>
      </div>
    </div>
  );
}
