import { useMemo } from "react";
import { parseDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";

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

function formatObservedAt(raw: string): string {
  const parsed = parseDateTime(raw);
  if (!parsed) {
    return raw;
  }
  return parsed.toLocaleString();
}

export function DiagnosticCaptureChart({
  fieldPath,
  points,
}: DiagnosticCaptureChartProps) {
  const { t } = useI18n();

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
    const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
    return chartPoints
      .map((point, index) => {
        const x =
          chartPoints.length === 1
            ? CHART_WIDTH / 2
            : CHART_PADDING_X + (index / (chartPoints.length - 1)) * innerWidth;
        const normalized = (point.value - stats.min) / stats.span;
        const y = CHART_HEIGHT - CHART_PADDING_Y - normalized * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [chartPoints, stats]);

  if (!stats || chartPoints.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
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
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 text-sky-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-sky-300"
        role="img"
        aria-label={fieldPath}
      >
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
            cy={CHART_HEIGHT / 2}
            r="3.5"
            fill="currentColor"
          />
        ) : null}
      </svg>
      <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 dark:text-slate-300 xl:grid-cols-3">
        <div>
          {t("settings.bambuLiveChartLatest", "Latest")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {stats.last.valueText}
          </span>{" "}
          · {formatObservedAt(stats.last.observedAt)}
        </div>
        <div>
          {t("settings.bambuLiveChartRange", "Range")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {stats.min.toFixed(stats.span < 10 ? 2 : 1)}
          </span>{" "}
          →{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {stats.max.toFixed(stats.span < 10 ? 2 : 1)}
          </span>
        </div>
        <div>
          {t("settings.bambuLiveChartWindow", "Samples in capture window")}:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {chartPoints.length}
          </span>
        </div>
      </div>
    </div>
  );
}
