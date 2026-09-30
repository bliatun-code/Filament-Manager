import { useMemo } from "react";
import { formatDateTime, parseDateTime, parseDateTimeMs } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import {
  formatDisplayInteger,
  formatDisplayNumber,
} from "../lib/number_display";

type DiagnosticCaptureChartPoint = {
  observedAt: string;
  value: number;
  valueText: string;
};

type DiagnosticCaptureChartProps = {
  fieldPath: string;
  points: DiagnosticCaptureChartPoint[];
};

const CHART_WIDTH = 720;
const CHART_HEIGHT = 180;
const CHART_PADDING_X = 18;
const CHART_PADDING_Y = 16;

function formatObservedAt(raw: string, locale: Parameters<typeof formatDateTime>[1]): string {
  const parsed = parseDateTime(raw);
  if (!parsed) {
    return raw;
  }
  return formatDateTime(raw, locale);
}

export function DiagnosticCaptureChart({
  fieldPath,
  points,
}: DiagnosticCaptureChartProps) {
  const { locale, t } = useI18n();

  const chartPoints = useMemo(() => {
    const filtered = points.filter((point) => Number.isFinite(point.value));
    const source = filtered.length <= 120 ? filtered : filtered.slice(filtered.length - 120);
    return source.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  }, [points]);

  const stats = useMemo(() => {
    if (chartPoints.length === 0) {
      return null;
    }
    const values = chartPoints.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const span = max - min;
    return {
      min,
      max,
      span: span <= 0 ? 1 : span,
      first,
      last,
    };
  }, [chartPoints]);

  const polyline = useMemo(() => {
    if (!stats || chartPoints.length === 0) {
      return "";
    }
    const firstTime = parseDateTimeMs(stats.first.observedAt);
    const lastTime = parseDateTimeMs(stats.last.observedAt);
    const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
    return chartPoints
      .map((point, index) => {
        const time = parseDateTimeMs(point.observedAt);
        const fraction = firstTime !== null && lastTime !== null && time !== null && lastTime > firstTime
          ? (time - firstTime) / (lastTime - firstTime)
          : index / Math.max(chartPoints.length - 1, 1);
        const x =
          chartPoints.length === 1
            ? CHART_WIDTH / 2
            : CHART_PADDING_X + fraction * innerWidth;
        const normalized = (point.value - stats.min) / stats.span;
        const y = CHART_HEIGHT - CHART_PADDING_Y - normalized * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [chartPoints, stats]);

  if (!stats || chartPoints.length === 0) {
    return (
      <div className="surface-subtle border-dashed px-3 py-3 text-[11px] text-slate-600 dark:text-slate-300">
        {t(
          "settings.bambuLiveChartNoSamples",
          "No numeric samples for the selected field yet.",
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        {fieldPath}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
        <div className="flex h-40 flex-col justify-between py-[14px] text-right text-xs tabular-nums text-slate-600 dark:text-slate-300" aria-hidden="true">
          {[stats.min + stats.span, stats.min + stats.span / 2, stats.min].map((value) => <span key={value}>{formatDisplayNumber(value, locale, { maximumFractionDigits: 2 })}</span>)}
        </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="app-modal-inset-soft h-40 w-full rounded-lg border text-[var(--app-theme-accent)]"
        role="img"
        aria-label={fieldPath}
      >
        <title>{`${formatObservedAt(stats.first.observedAt, locale)} – ${formatObservedAt(stats.last.observedAt, locale)}; ${stats.min} – ${stats.min + stats.span}`}</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = CHART_PADDING_Y + ratio * (CHART_HEIGHT - CHART_PADDING_Y * 2);
          return (
            <line
              key={ratio}
              x1={CHART_PADDING_X}
              y1={y}
              x2={CHART_WIDTH - CHART_PADDING_X}
              y2={y}
              stroke="currentColor"
              opacity="0.12"
              strokeWidth="1"
            />
          );
        })}
        <line
          x1={CHART_PADDING_X}
          y1={CHART_HEIGHT - CHART_PADDING_Y}
          x2={CHART_WIDTH - CHART_PADDING_X}
          y2={CHART_HEIGHT - CHART_PADDING_Y}
          stroke="currentColor"
          opacity="0.3"
          strokeWidth="1"
        />
        <line
          x1={CHART_PADDING_X}
          y1={CHART_PADDING_Y}
          x2={CHART_PADDING_X}
          y2={CHART_HEIGHT - CHART_PADDING_Y}
          stroke="currentColor"
          opacity="0.3"
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
            cy={CHART_HEIGHT - CHART_PADDING_Y - ((stats.last.value - stats.min) / stats.span) * (CHART_HEIGHT - CHART_PADDING_Y * 2)}
            r="3.5"
            fill="currentColor"
          />
        ) : null}
      </svg>
        <div />
        <div className="flex justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <time dateTime={stats.first.observedAt}>{formatObservedAt(stats.first.observedAt, locale)}</time>
          <time className="text-right" dateTime={stats.last.observedAt}>{formatObservedAt(stats.last.observedAt, locale)}</time>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 dark:text-slate-300 xl:grid-cols-3">
        <div>
          {t("settings.bambuLiveChartLatest", "Latest")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {stats.last.valueText}
          </span>{" "}
          · {formatObservedAt(stats.last.observedAt, locale)}
        </div>
        <div>
          {t("settings.bambuLiveChartRange", "Range")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {formatDisplayNumber(stats.min, locale, {
              maximumFractionDigits: stats.span < 10 ? 2 : 1,
              minimumFractionDigits: stats.span < 10 ? 2 : 1,
            })}
          </span>{" "}
          →{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {formatDisplayNumber(stats.max, locale, {
              maximumFractionDigits: stats.span < 10 ? 2 : 1,
              minimumFractionDigits: stats.span < 10 ? 2 : 1,
            })}
          </span>
        </div>
        <div>
          {t("settings.bambuLiveChartWindow", "Samples in capture window")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {formatDisplayInteger(chartPoints.length, locale)}
          </span>
        </div>
      </div>
    </div>
  );
}
