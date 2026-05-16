import { useI18n } from "../lib/i18n";

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  accent?: "emerald" | "sky" | "amber" | "rose";
  onClick?: () => void;
};

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "border-l-emerald-500 dark:border-l-emerald-300",
  sky: "border-l-sky-500 dark:border-l-sky-300",
  amber: "border-l-amber-500 dark:border-l-amber-300",
  rose: "border-l-rose-500 dark:border-l-rose-300",
};

const accentSurfaceMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "from-emerald-500/7 to-emerald-500/0 dark:from-emerald-300/10",
  sky: "from-sky-500/7 to-sky-500/0 dark:from-sky-300/10",
  amber: "from-amber-500/8 to-amber-500/0 dark:from-amber-300/10",
  rose: "from-rose-500/7 to-rose-500/0 dark:from-rose-300/10",
};

const accentDotMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "bg-emerald-500 shadow-emerald-500/25 dark:bg-emerald-300",
  sky: "bg-sky-500 shadow-sky-500/25 dark:bg-sky-300",
  amber: "bg-amber-500 shadow-amber-500/25 dark:bg-amber-300",
  rose: "bg-rose-500 shadow-rose-500/25 dark:bg-rose-300",
};

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  accent = "sky",
  onClick,
}: StatCardProps) {
  return (
    <div
      className={`surface-card relative overflow-hidden border-l-4 ${accentMap[accent]} ${
        onClick
          ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-slate-400/45 dark:hover:border-slate-500"
          : ""
      }`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accentSurfaceMap[accent]}`} />
      <div className="relative flex items-center justify-between gap-3">
        <div className="section-eyebrow">{title}</div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_5px] ${accentDotMap[accent]}`} />
      </div>
      <div className="relative mt-3 text-[1.7rem] font-semibold leading-none text-slate-950 dark:text-slate-50">{value}</div>
      <div className="mt-2 flex items-end justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
        <span className="min-w-0 leading-5">{subtitle}</span>
        {trend ? (
          <span className="shrink-0 text-right font-medium leading-5 text-slate-800 dark:text-slate-200">{trend}</span>
        ) : null}
      </div>
    </div>
  );
}

type LowStockItem = {
  id: string;
  name: string;
  color: string;
  remaining: string;
};

type LowStockListProps = {
  items: LowStockItem[];
  onClick?: () => void;
};

export function LowStockList({ items, onClick }: LowStockListProps) {
  const { t } = useI18n();
  return (
    <div
      className={`surface-card ${
        onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-slate-400/45 dark:hover:border-slate-500" : ""
      }`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="section-eyebrow">
        {t("dashboard.lowStock", "Low Stock")}
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">{item.name}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">{item.color}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-400/35 dark:bg-rose-500/12 dark:text-rose-200">
              {item.remaining}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type UsageChartProps = {
  title: string;
  value: string;
  caption: string;
  points: number[];
  onClick?: () => void;
};

export function UsageChart({ title, value, caption, points, onClick }: UsageChartProps) {
  const normalizedPoints = points.length >= 2 ? points : [0, 0];
  const minPoint = Math.min(...normalizedPoints);
  const maxPoint = Math.max(...normalizedPoints);
  const chartWidth = 240;
  const chartHeight = 80;
  const padX = 8;
  const padY = 8;
  const usableWidth = chartWidth - padX * 2;
  const usableHeight = chartHeight - padY * 2;
  const span = maxPoint - minPoint;
  const polyline = normalizedPoints
    .map((point, index) => {
      const x =
        normalizedPoints.length <= 1
          ? chartWidth / 2
          : padX + (usableWidth * index) / (normalizedPoints.length - 1);
      const y =
        span <= 0
          ? chartHeight / 2
          : padY + usableHeight - ((point - minPoint) / span) * usableHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      className={`surface-card isolate transform-gpu ${
        onClick ? "cursor-pointer transition hover:border-slate-400/45 dark:hover:border-slate-500" : ""
      }`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="relative z-10 flex min-h-7 items-center justify-between gap-4">
        <div className="section-eyebrow min-w-0">{title}</div>
        <div className="shrink-0 text-right text-lg font-semibold leading-none text-slate-950 dark:text-slate-50">
          {value}
        </div>
      </div>
      <div className="surface-subtle mt-4 h-32 w-full overflow-hidden p-2">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="h-full w-full text-slate-800 dark:text-sky-300"
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            points={polyline}
          />
        </svg>
      </div>
      <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">{caption}</div>
    </div>
  );
}

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone?: "sky" | "amber" | "emerald" | "slate";
};

const activityToneMap: Record<
  NonNullable<ActivityItem["tone"]>,
  { panel: string; dot: string; title: string }
> = {
  sky: {
    panel:
      "border-sky-200/80 bg-sky-50/62 dark:border-sky-400/22 dark:bg-sky-500/[0.08]",
    dot: "bg-sky-500 dark:bg-sky-300",
    title: "text-slate-950 dark:text-slate-50",
  },
  amber: {
    panel:
      "border-amber-200/80 bg-amber-50/62 dark:border-amber-400/22 dark:bg-amber-500/[0.08]",
    dot: "bg-amber-500 dark:bg-amber-300",
    title: "text-slate-950 dark:text-slate-50",
  },
  emerald: {
    panel:
      "border-emerald-200/80 bg-emerald-50/62 dark:border-emerald-400/22 dark:bg-emerald-500/[0.08]",
    dot: "bg-emerald-500 dark:bg-emerald-300",
    title: "text-slate-950 dark:text-slate-50",
  },
  slate: {
    panel:
      "border-slate-200/80 bg-white/58 dark:border-slate-700 dark:bg-slate-950/34",
    dot: "bg-slate-400 dark:bg-slate-500",
    title: "text-slate-900 dark:text-slate-100",
  },
};

const panelCountClass =
  "rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-900 shadow-sm dark:border-slate-500/70 dark:bg-slate-900 dark:text-slate-50 dark:shadow-none";

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const { t } = useI18n();
  const itemCount = items.length === 1 && items[0]?.id === "empty" ? 0 : items.length;
  return (
    <div className="surface-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("dashboard.recentActivity", "Recent Activity")}
          </div>
        </div>
        <div className={panelCountClass}>
          {itemCount}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const tone = activityToneMap[item.tone ?? "slate"];
          return (
            <div
              key={item.id}
              className={`rounded-lg border px-4 py-3 ${tone.panel}`}
            >
              <div className="flex gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${tone.title}`}>{item.title}</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {item.detail}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Badge = {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
};

export function BadgePanel({ badges }: { badges: Badge[] }) {
  const { t } = useI18n();
  const accentStyles = [
    {
      panel:
        "border-sky-200/80 bg-sky-50/58 dark:border-sky-400/20 dark:bg-sky-500/[0.07]",
      dot: "bg-sky-500 dark:bg-sky-300",
      pill:
        "border-sky-200/80 bg-white/78 text-sky-800 dark:border-sky-400/25 dark:bg-slate-950/52 dark:text-sky-200",
      track: "bg-sky-100/85 dark:bg-slate-950/55",
      bar: "bg-sky-700 dark:bg-sky-300",
    },
    {
      panel:
        "border-emerald-200/80 bg-emerald-50/58 dark:border-emerald-400/20 dark:bg-emerald-500/[0.07]",
      dot: "bg-emerald-500 dark:bg-emerald-300",
      pill:
        "border-emerald-200/80 bg-white/78 text-emerald-800 dark:border-emerald-400/25 dark:bg-slate-950/52 dark:text-emerald-200",
      track: "bg-emerald-100/85 dark:bg-slate-950/55",
      bar: "bg-emerald-700 dark:bg-emerald-300",
    },
    {
      panel:
        "border-amber-200/80 bg-amber-50/58 dark:border-amber-400/20 dark:bg-amber-500/[0.07]",
      dot: "bg-amber-500 dark:bg-amber-300",
      pill:
        "border-amber-200/80 bg-white/78 text-amber-800 dark:border-amber-400/25 dark:bg-slate-950/52 dark:text-amber-200",
      track: "bg-amber-100/85 dark:bg-slate-950/55",
      bar: "bg-amber-700 dark:bg-amber-300",
    },
  ];
  return (
    <div className="surface-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("dashboard.achievements", "Achievements")}
          </div>
        </div>
        <div className={panelCountClass}>
          {badges.length}
        </div>
      </div>
      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {badges.map((badge, index) => {
          const tone = accentStyles[index % accentStyles.length];
          return (
            <div
              key={badge.id}
              className={`rounded-lg border px-4 py-4 ${tone.panel}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                    <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                      {badge.title}
                    </div>
                  </div>
                </div>
                <div className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
                  {Math.round(badge.progress * 100)}%
                </div>
              </div>
              <div className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                {badge.status}
              </div>
              <div className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">
                {badge.description}
              </div>
              <div className={`mt-4 h-2 w-full rounded-full ${tone.track}`}>
                <div
                  className={`h-2 rounded-full ${tone.bar}`}
                  style={{ width: `${badge.progress * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
