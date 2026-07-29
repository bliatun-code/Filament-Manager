import { PageHeaderButton } from "../components/page_header_button";
import type { DashboardHealth } from "../lib/dashboard_model";
import {
  formatDisplayInteger,
  formatDisplayPercent,
  type NumberDisplayLocale,
} from "../lib/number_display";

type TranslateFn = (key: string, fallback: string) => string;

type OwnershipSnapshotPanelProps = {
  lowStock: {
    owned: number;
    borrowedIn: number;
  };
  onHand: {
    owned: number;
    borrowedIn: number;
  };
  locale?: NumberDisplayLocale;
  t: TranslateFn;
};

type InventoryHealthPanelProps = {
  health: DashboardHealth;
  locale?: NumberDisplayLocale;
  onAddFirstSpool?: () => void;
  t: TranslateFn;
};

function healthMetricClass(tone: DashboardHealth["metrics"][number]["tone"]): string {
  if (tone === "rose") {
    return "border-rose-200/80 bg-rose-50/58 dark:border-rose-400/22 dark:bg-rose-500/[0.08]";
  }
  if (tone === "amber") {
    return "border-amber-200/80 bg-amber-50/58 dark:border-amber-400/22 dark:bg-amber-500/[0.08]";
  }
  if (tone === "sky") {
    return "border-sky-200/80 bg-sky-50/58 dark:border-sky-400/22 dark:bg-sky-500/[0.08]";
  }
  return "border-emerald-200/80 bg-emerald-50/58 dark:border-emerald-400/22 dark:bg-emerald-500/[0.08]";
}

export function OwnershipSnapshotPanel({
  lowStock,
  locale = "en",
  onHand,
  t,
}: OwnershipSnapshotPanelProps) {
  const hasBorrowedInStock = onHand.borrowedIn > 0 || lowStock.borrowedIn > 0;

  return (
    <div className="mt-6 surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("dashboard.ownershipSnapshot", "Ownership snapshot")}
          </div>
        </div>
        {!hasBorrowedInStock ? (
          <div className="rounded-full border border-slate-300/70 bg-slate-100/70 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
            {t("dashboard.noBorrowedInStock", "No borrowed-in stock")}
          </div>
        ) : null}
      </div>
      <div
        className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${
          hasBorrowedInStock ? "xl:grid-cols-4" : "xl:grid-cols-2"
        }`}
      >
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/58 px-3 py-3 dark:border-sky-400/22 dark:bg-sky-500/[0.08]">
          <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {formatDisplayInteger(onHand.owned, locale)}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {t("dashboard.ownedOnHand", "Owned on hand")}
          </div>
        </div>
        {hasBorrowedInStock ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/58 px-3 py-3 dark:border-amber-400/22 dark:bg-amber-500/[0.08]">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {formatDisplayInteger(onHand.borrowedIn, locale)}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.borrowedInOnHand", "Borrowed in on hand")}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/58 px-3 py-3 dark:border-rose-400/22 dark:bg-rose-500/[0.08]">
          <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {formatDisplayInteger(lowStock.owned, locale)}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {t("dashboard.ownedLowStock", "Owned low stock")}
          </div>
        </div>
        {hasBorrowedInStock ? (
          <div className="rounded-lg border border-orange-200/80 bg-orange-50/58 px-3 py-3 dark:border-orange-400/22 dark:bg-orange-500/[0.08]">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {formatDisplayInteger(lowStock.borrowedIn, locale)}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.borrowedInLowStock", "Borrowed-in low stock")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InventoryHealthPanel({
  health,
  locale = "en",
  onAddFirstSpool,
  t,
}: InventoryHealthPanelProps) {
  const hasHealthScore = health.score !== null;
  const scoreClassName = hasHealthScore
    ? "border-emerald-200/85 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.96),rgba(220,252,231,0.98)_52%,rgba(167,243,208,0.94))] text-emerald-800 shadow-inner shadow-white/70 dark:border-emerald-400/28 dark:bg-[radial-gradient(circle_at_30%_28%,rgba(52,211,153,0.26),rgba(15,23,42,0.96)_62%,rgba(2,6,23,1))] dark:text-emerald-200 dark:shadow-none"
    : "border-slate-300/80 bg-slate-100/80 text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300";

  return (
    <div className="surface-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-eyebrow">
            {t("dashboard.inventoryHealth", "Inventory Health")}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">
            {health.headline}
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {health.detail}
          </div>
          {!hasHealthScore && onAddFirstSpool ? (
            <div className="mt-4">
              <PageHeaderButton
                onClick={onAddFirstSpool}
                responsive={false}
                variant="primary"
              >
                {t("inventory.addSpoolAction", "Add spool")}
              </PageHeaderButton>
            </div>
          ) : null}
        </div>
        <div
          aria-label={
            hasHealthScore
              ? formatDisplayPercent(health.score ?? 0, locale)
              : health.headline
          }
          className={`relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border text-2xl font-semibold ${scoreClassName}`}
        >
          <span className="absolute inset-[8px] rounded-full border border-current opacity-20" />
          <span className="relative">
            {hasHealthScore ? formatDisplayPercent(health.score ?? 0, locale) : "—"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {health.metrics.map((metric) => (
          <div
            key={metric.id}
            className={`rounded-lg border px-3 py-3 ${healthMetricClass(metric.tone)}`}
          >
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {metric.value}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {metric.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
