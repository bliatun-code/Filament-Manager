import React from "react";

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  accent?: "emerald" | "sky" | "amber" | "rose";
};

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/30",
  sky: "from-sky-500/20 to-sky-500/5 border-sky-400/30",
  amber: "from-amber-500/20 to-amber-500/5 border-amber-400/30",
  rose: "from-rose-500/20 to-rose-500/5 border-rose-400/30",
};

export function StatCard({ title, value, subtitle, trend, accent = "sky" }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${accentMap[accent]} p-5 shadow-sm`}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
        <span>{subtitle}</span>
        {trend ? <span className="font-medium text-slate-700">{trend}</span> : null}
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
};

export function LowStockList({ items }: LowStockListProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        Low Stock
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{item.name}</div>
              <div className="text-xs text-slate-500">{item.color}</div>
            </div>
            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
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
};

export function UsageChart({ title, value, caption }: UsageChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</div>
        <div className="text-lg font-semibold text-slate-900">{value}</div>
      </div>
      <div className="mt-4 h-32 w-full rounded-xl bg-gradient-to-r from-slate-100 via-slate-50 to-white">
        <svg viewBox="0 0 240 80" className="h-full w-full">
          <polyline
            fill="none"
            stroke="#0f172a"
            strokeWidth="3"
            points="0,60 30,45 60,52 90,30 120,40 150,25 180,35 210,20 240,28"
          />
        </svg>
      </div>
      <div className="mt-3 text-xs text-slate-500">{caption}</div>
    </div>
  );
}

export function ActivityTimeline({ items }: { items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        Recent Activity
      </div>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2">
            <span className="mt-1 h-2 w-2 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Badge = {
  id: string;
  title: string;
  description: string;
  progress: number;
};

export function BadgePanel({ badges }: { badges: Badge[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        Achievements
      </div>
      <div className="mt-4 space-y-4">
        {badges.map((badge) => (
          <div key={badge.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                {badge.title}
              </div>
              <div className="text-xs text-slate-500">
                {Math.round(badge.progress * 100)}%
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-slate-900"
                style={{ width: `${badge.progress * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-500">{badge.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
