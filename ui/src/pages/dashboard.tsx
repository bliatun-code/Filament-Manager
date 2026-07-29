import { useMemo, useState } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  StatCard,
  UsageChart,
} from "../components/dashboard_widgets";
import { DashboardOnboardingChecklist } from "../components/dashboard_onboarding_checklist";
import { PageHeaderButton } from "../components/page_header_button";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
} from "../lib/dashboard_model";
import {
  buildDashboardOnboardingState,
  dismissDashboardOnboarding,
  readDashboardOnboardingDismissed,
} from "../lib/dashboard_onboarding";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import { useI18n } from "../lib/i18n";
import {
  InventoryHealthPanel,
  OwnershipSnapshotPanel,
} from "./dashboard_panels";
import { useDashboardPageData } from "./use_dashboard_page_data";
import { readLatestFullBackupExport } from "./settings_full_backup_activity";
import type { PageKey } from "../lib/app_navigation_model";

type DashboardPageProps = {
  onNavigate?: (page: PageKey) => void;
  onAddFirstSpool?: () => void;
  onOpenLowStock?: () => void;
  onOpenCompanionSettings?: () => void;
  onOpenMaintenanceSettings?: () => void;
  onOpenPrinters?: () => void;
};

export default function DashboardPage({
  onNavigate,
  onAddFirstSpool,
  onOpenLowStock,
  onOpenCompanionSettings,
  onOpenMaintenanceSettings,
  onOpenPrinters,
}: DashboardPageProps) {
  const { t, locale } = useI18n();
  const {
    activity,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    clientHostPaired,
    companionStatus,
    dashboardSyncMode,
    error,
    goalMetrics,
    health,
    lastSyncLabel,
    loading,
    ownershipLowStock,
    ownershipOnHand,
    refreshAvailable,
    refreshDashboard,
    refreshing,
    stats,
    usagePoints,
    setupDataAvailable,
  } = useDashboardPageData(t, locale);
  const forceOnboardingVisible = useMemo(
    () => resolveDesktopVisualQaScenario() === "dashboard-onboarding",
    [],
  );
  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    forceOnboardingVisible ? false : readDashboardOnboardingDismissed(),
  );
  const [backupComplete] = useState(() =>
    forceOnboardingVisible ? false : Boolean(readLatestFullBackupExport()),
  );
  const badges = useMemo(
    () => buildDashboardBadges({ goalMetrics, locale, t }),
    [goalMetrics, locale, t],
  );
  const companionPresentation = useMemo(
    () =>
      buildDashboardCompanionPresentation({
        clientHostCompanionTone,
        clientHostDisplayName,
        clientHostNeedsRepair,
        companionStatus,
        dashboardSyncMode,
        t,
      }),
    [
      clientHostCompanionTone,
      clientHostDisplayName,
      clientHostNeedsRepair,
      companionStatus,
      dashboardSyncMode,
      t,
    ],
  );
  const companionDotClass =
    companionPresentation.tone === "live"
      ? "bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.14)]"
      : companionPresentation.tone === "warn"
        ? "bg-amber-400 shadow-[0_0_0_5px_rgba(251,191,36,0.14)]"
        : "bg-slate-400 shadow-[0_0_0_5px_rgba(148,163,184,0.12)]";
  const monthlyUsageValue = stats.find((stat) => stat.id === "monthlyUsage")?.value ?? "0 g";
  const onboardingState = useMemo(
    () =>
      buildDashboardOnboardingState({
        backupComplete,
        companionComplete:
          dashboardSyncMode === "CLIENT"
            ? clientHostPaired
            : companionStatus?.enabled === true,
        inventoryComplete: goalMetrics.totalSpools > 0,
        printerComplete: goalMetrics.configuredPrinters > 0,
      }),
    [
      backupComplete,
      clientHostPaired,
      companionStatus?.enabled,
      dashboardSyncMode,
      goalMetrics.configuredPrinters,
      goalMetrics.totalSpools,
    ],
  );
  const showOnboarding =
    setupDataAvailable && (forceOnboardingVisible || !onboardingDismissed);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.dashboard", "Dashboard")}</h1>
          <div className="page-subtitle">
            {t(
              "dashboard.subtitle",
              "Follow inventory health, current usage and printer activity from one overview.",
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 xl:pt-1">
          <PageHeaderButton
            onClick={() => onOpenCompanionSettings?.()}
            className="gap-2"
            responsive={false}
            title={t("dashboard.openCompanionSettings", "Open companion settings")}
            variant="soft"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${companionDotClass}`} />
            {companionPresentation.label}
          </PageHeaderButton>
          <div className="rounded-lg border border-slate-300/70 bg-white/72 px-3 py-2 text-sm text-slate-600 shadow-sm shadow-slate-300/20 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:shadow-none">
            {lastSyncLabel}
          </div>
        </div>
      </div>

      {error ? (
        <PageLoadErrorBanner
          message={error}
          onRetry={() => void refreshDashboard()}
          retryDisabled={!refreshAvailable || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}

      {showOnboarding ? (
        <DashboardOnboardingChecklist
          state={onboardingState}
          onAddSpool={() => onAddFirstSpool?.()}
          onDismiss={() => {
            if (!forceOnboardingVisible) {
              dismissDashboardOnboarding();
            }
            setOnboardingDismissed(true);
          }}
          onOpenBackup={() => onOpenMaintenanceSettings?.()}
          onOpenCompanion={() => onOpenCompanionSettings?.()}
          onOpenImport={() => onOpenMaintenanceSettings?.()}
          onOpenPrinters={() => onOpenPrinters?.()}
        />
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.id}
            {...stat}
            onClick={
              stat.id === "total"
                ? () => onNavigate?.("inventory")
                : stat.id === "activePrinters"
                  ? () => onNavigate?.("printers")
                  : stat.id === "lowStock"
                    ? () => onOpenLowStock?.()
                    : stat.id === "monthlyUsage"
                      ? () => onNavigate?.("statistics")
                      : undefined
            }
          />
        ))}
      </div>

      <OwnershipSnapshotPanel
        locale={locale}
        lowStock={ownershipLowStock}
        onHand={ownershipOnHand}
        t={t}
      />

      <div className="mt-8">
        <UsageChart
          key={monthlyUsageValue}
          title={t("dashboard.consumption", "Filament Consumption")}
          value={monthlyUsageValue}
          caption={t(
            "dashboard.consumptionCaption",
            "Usage is aggregated from printer-linked print jobs.",
          )}
          points={usagePoints}
          onClick={() => onNavigate?.("statistics")}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ActivityTimeline items={activity} />
        <InventoryHealthPanel
          health={health}
          locale={locale}
          onAddFirstSpool={onAddFirstSpool}
          t={t}
        />
      </div>

      <div className="mt-8">
        <BadgePanel badges={badges} />
      </div>
    </div>
  );
}
