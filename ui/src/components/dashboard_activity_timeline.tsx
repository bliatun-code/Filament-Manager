import { dashboardOverviewStyles } from "../lib/dashboard_overview_styles";
import { useI18n } from "../lib/i18n";

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone?: "sky" | "amber" | "emerald" | "slate";
};

const activityDotClasses: Record<NonNullable<ActivityItem["tone"]>, string> = {
  sky: "bg-sky-500 dark:bg-sky-300",
  amber: "bg-amber-500 dark:bg-amber-300",
  emerald: "bg-emerald-500 dark:bg-emerald-300",
  slate: "bg-slate-400 dark:bg-slate-500",
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const { t } = useI18n();
  const renderItem = (item: ActivityItem) => (
    <li key={item.id} className="flex min-w-0 gap-3 py-3">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityDotClasses[item.tone ?? "slate"]}`} />
      <div className="min-w-0">
        <p className={`break-words text-sm font-medium ${dashboardOverviewStyles.primary}`}>{item.title}</p>
        <p className={`mt-1 break-words text-xs leading-5 ${dashboardOverviewStyles.muted}`}>{item.detail}</p>
      </div>
    </li>
  );
  return (
    <section className={dashboardOverviewStyles.card} aria-labelledby="dashboard-recent-activity-title">
      <h2 id="dashboard-recent-activity-title" className={dashboardOverviewStyles.heading}>{t("dashboard.recentActivity", "Recent Activity")}</h2>
      <ul className={`mt-2 ${dashboardOverviewStyles.rows}`}>{items.slice(0, 3).map(renderItem)}</ul>
      {items.length > 3 ? (
        <details className="mt-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <summary className="cursor-pointer rounded text-xs font-semibold text-sky-700 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-sky-300">{t("dashboard.showOlderActivity", "Show older activity")}</summary>
          <ul className={`mt-2 ${dashboardOverviewStyles.rows}`}>{items.slice(3).map(renderItem)}</ul>
        </details>
      ) : null}
    </section>
  );
}
