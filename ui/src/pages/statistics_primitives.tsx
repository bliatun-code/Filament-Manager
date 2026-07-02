import type { ReactNode } from "react";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { InventorySwatchChip } from "../components/inventory_swatch_chip";

type MetricTone = "slate" | "sky" | "emerald" | "amber" | "rose";

function metricTileClass(tone: MetricTone): string {
  switch (tone) {
    case "sky":
      return "border-sky-200/80 bg-white/75 dark:border-sky-400/25 dark:bg-sky-500/10";
    case "emerald":
      return "border-emerald-200/80 bg-white/75 dark:border-emerald-400/25 dark:bg-emerald-500/10";
    case "amber":
      return "border-amber-200/80 bg-white/75 dark:border-amber-400/25 dark:bg-amber-500/10";
    case "rose":
      return "border-rose-200/80 bg-white/75 dark:border-rose-400/25 dark:bg-rose-500/10";
    case "slate":
    default:
      return "border-slate-200/85 bg-white/80 dark:border-slate-700 dark:bg-slate-950/45";
  }
}

export function SummaryMetricTile({
  label,
  value,
  tone = "slate",
  className = "",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${metricTileClass(tone)} ${className}`.trim()}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div key={value} className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
        {value}
      </div>
    </div>
  );
}

export function StatisticsEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-600 dark:text-slate-300">
      {children}
    </div>
  );
}

export function StatisticsFilamentUsageRowCard({
  children,
  colorName,
  filamentName,
  material,
  meta,
  metricsClassName,
  swatchColor,
  vendor,
}: {
  children: ReactNode;
  colorName: string;
  filamentName: string;
  material: string;
  meta?: ReactNode;
  metricsClassName: string;
  swatchColor?: string | null;
  vendor: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <InventorySwatchChip
            className="mt-0.5 h-5 w-5 rounded-md"
            swatchColor={swatchColor}
            tone="tiny"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatFilamentDisplayTitle(material, filamentName, colorName)}
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {vendor}
            </div>
            {meta ? <div className="mt-2">{meta}</div> : null}
          </div>
        </div>
        <div className={metricsClassName}>{children}</div>
      </div>
    </div>
  );
}
