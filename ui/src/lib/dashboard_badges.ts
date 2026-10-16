import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import type { DashboardBadge, DashboardGoalMetrics } from "./dashboard_model";
import { formatDisplayInteger, type NumberDisplayLocale } from "./number_display";

type TranslateFn = (key: string, fallback: string, params?: MessageParams) => string;

function progressRatio(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, current / target));
}

export function buildDashboardBadges(params: {
  goalMetrics: DashboardGoalMetrics;
  jobGoal?: number;
  locale?: NumberDisplayLocale;
  t: TranslateFn;
}): DashboardBadge[] {
  const { goalMetrics, locale = "en", t } = params;
  const jobGoal = params.jobGoal ?? 20;
  const locationProgress =
    goalMetrics.activeSpools > 0
      ? progressRatio(goalMetrics.placedActiveSpools, goalMetrics.activeSpools)
      : 0;
  const jobsProgress = progressRatio(Math.min(goalMetrics.totalJobs, jobGoal), jobGoal);
  const slotsProgress =
    goalMetrics.totalSlots > 0
      ? progressRatio(goalMetrics.loadedSlots, goalMetrics.totalSlots)
      : 0;

  return [
    {
      id: "badge-location-coverage",
      title: t("dashboard.badgeLocationCoverage", "Location coverage"),
      status:
        goalMetrics.activeSpools > 0
          ? `${formatDisplayInteger(goalMetrics.placedActiveSpools, locale)}/${formatDisplayInteger(goalMetrics.activeSpools, locale)} ${t(
              "dashboard.badgeActiveSpoolsPlaced",
              "active spools placed",
            )}`
          : t("dashboard.badgeNoActiveSpools", "No active spools yet."),
      description: t(
        "dashboard.badgeLocationCoverageDesc",
        "Keep every active spool assigned to a shelf, loan, or printer slot.",
      ),
      progress: locationProgress,
    },
    {
      id: "badge-job-logging",
      title: t("dashboard.badgeJobLogging", "Job logging"),
      status:
        goalMetrics.totalJobs > jobGoal
          ? `${formatDisplayInteger(goalMetrics.totalJobs, locale)} ${t("dashboard.badgeJobsLogged", "jobs logged")}`
          : `${formatDisplayInteger(goalMetrics.totalJobs, locale)}/${formatDisplayInteger(jobGoal, locale)} ${t("dashboard.badgeJobsLogged", "jobs logged")}`,
      description: t(
        "dashboard.badgeJobLoggingDesc",
        "Log printer-linked jobs so consumption stays grounded in real usage.",
      ),
      progress: jobsProgress,
    },
    {
      id: "badge-slotReadiness",
      title: t("dashboard.badgeSlotReadiness", "Slot readiness"),
      status:
        goalMetrics.totalSlots > 0
          ? `${formatDisplayInteger(goalMetrics.loadedSlots, locale)}/${formatDisplayInteger(goalMetrics.totalSlots, locale)} ${t(
              "dashboard.badgeSlotsLoaded",
              "slots loaded",
            )}`
          : t("dashboard.badgeNoPrinterSlots", "No printer slots configured yet."),
      description: t(
        "dashboard.badgeSlotReadinessDesc",
        "Keep configured printer slots stocked with active spools.",
      ),
      progress: slotsProgress,
    },
  ];
}
