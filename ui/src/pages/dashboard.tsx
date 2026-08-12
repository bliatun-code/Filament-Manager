import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildDesktopVisualQaUsageMonths,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import {
  DESKTOP_VISUAL_QA_DASHBOARD_ATTENTION_READINESS_TOKEN,
  DESKTOP_VISUAL_QA_DASHBOARD_CONSUMPTION_READINESS_TOKEN,
} from "../lib/desktop_visual_qa_readiness";
import { useI18n } from "../lib/i18n";
import { isTauri, signalDesktopVisualQaReadiness } from "../lib/tauri_client";
import { formatGrams } from "../lib/weight_display";
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
  onOpenBambuLiveSettings?: (printerId: string) => void;
};

export default function DashboardPage({
  onNavigate,
  onAddFirstSpool,
  onOpenLowStock,
  onOpenCompanionSettings,
  onOpenMaintenanceSettings,
  onOpenPrinters,
  onOpenBambuLiveSettings,
}: DashboardPageProps) {
  const { t, locale } = useI18n();
  const {
    activity,
    bambuLiveAttention,
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
    usageAvailable,
    usageMonths,
    usageTotal12m,
    setupDataAvailable,
  } = useDashboardPageData(t, locale);
  const tauri = isTauri();
  const desktopVisualQaScenario = useMemo(
    () => resolveDesktopVisualQaScenario(),
    [],
  );
  const desktopVisualQaUsageMonths = useMemo(
    () =>
      desktopVisualQaScenario === "dashboard-consumption"
        ? buildDesktopVisualQaUsageMonths()
        : null,
    [desktopVisualQaScenario],
  );
  const displayedUsageMonths = desktopVisualQaUsageMonths ?? usageMonths;
  const displayedUsageAvailable =
    desktopVisualQaUsageMonths != null || usageAvailable;
  const displayedUsageTotal12m = desktopVisualQaUsageMonths
    ? desktopVisualQaUsageMonths.reduce(
        (total, month) => total + month.usedGrams,
        0,
      )
    : usageTotal12m;
  const forceOnboardingVisible =
    desktopVisualQaScenario === "dashboard-onboarding";
  const consumptionPanelRef = useRef<HTMLDivElement>(null);
  const consumptionPanelPositionedRef = useRef(false);
  const dashboardAttentionReadinessSignaledRef = useRef(false);
  const dashboardConsumptionReadinessSignaledRef = useRef(false);
  useEffect(() => {
    if (
      desktopVisualQaScenario !== "dashboard-overview" ||
      loading ||
      !tauri ||
      bambuLiveAttention.length === 0 ||
      dashboardAttentionReadinessSignaledRef.current
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      dashboardAttentionReadinessSignaledRef.current = true;
      void signalDesktopVisualQaReadiness(
        DESKTOP_VISUAL_QA_DASHBOARD_ATTENTION_READINESS_TOKEN,
      ).catch((signalError) => {
        dashboardAttentionReadinessSignaledRef.current = false;
        console.error(
          "Failed to signal desktop dashboard attention readiness.",
          signalError,
        );
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bambuLiveAttention.length, desktopVisualQaScenario, loading, tauri]);
  useEffect(() => {
    if (
      desktopVisualQaScenario !== "dashboard-consumption" ||
      loading ||
      !tauri ||
      displayedUsageTotal12m <= 0 ||
      consumptionPanelPositionedRef.current ||
      dashboardConsumptionReadinessSignaledRef.current
    ) {
      return;
    }
    let paintFrame: number | null = null;
    const positionFrame = window.requestAnimationFrame(() => {
      consumptionPanelRef.current?.scrollIntoView({ block: "center" });
      consumptionPanelPositionedRef.current = true;
      paintFrame = window.requestAnimationFrame(() => {
        dashboardConsumptionReadinessSignaledRef.current = true;
        void signalDesktopVisualQaReadiness(
          DESKTOP_VISUAL_QA_DASHBOARD_CONSUMPTION_READINESS_TOKEN,
        ).catch((signalError) => {
          dashboardConsumptionReadinessSignaledRef.current = false;
          console.error(
            "Failed to signal desktop dashboard consumption readiness.",
            signalError,
          );
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(positionFrame);
      if (paintFrame != null) {
        window.cancelAnimationFrame(paintFrame);
      }
    };
  }, [desktopVisualQaScenario, displayedUsageTotal12m, loading, tauri]);
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
  const annualUsageValue = useMemo(
    () =>
      displayedUsageAvailable
        ? formatGrams(displayedUsageTotal12m, "zero", locale)
        : "—",
    [displayedUsageAvailable, displayedUsageTotal12m, locale],
  );
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
            title={t(
              "dashboard.openCompanionSettings",
              "Open companion settings",
            )}
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

      {bambuLiveAttention.length > 0 ? (
        <div
          className="mt-5 space-y-2"
          data-testid="dashboard-bambu-live-attention"
          role="status"
        >
          {bambuLiveAttention.map((attention) => (
            <button
              key={attention.printerId}
              type="button"
              onClick={() => onOpenBambuLiveSettings?.(attention.printerId)}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-left shadow-sm transition hover:border-amber-400 hover:bg-amber-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-700/70 dark:bg-amber-950/35 dark:hover:border-amber-600 dark:hover:bg-amber-950/55 dark:focus-visible:ring-offset-slate-950"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-amber-950 dark:text-amber-100">
                  {t(
                    "dashboard.bambuLiveAttentionTitle",
                    "Bambu Live needs attention",
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-amber-800 dark:text-amber-200/90">
                  {t(
                    "dashboard.bambuLiveAttentionBody",
                    "{name} is no longer Live until you review and trust the printer identity.",
                    { name: attention.printerName },
                  )}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-amber-900 dark:text-amber-100">
                {t("dashboard.openBambuLiveSettings", "Open Live settings")} →
              </span>
            </button>
          ))}
        </div>
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

      <div
        ref={consumptionPanelRef}
        className="mt-8"
        data-testid="dashboard-consumption-panel"
      >
        <UsageChart
          title={t("dashboard.consumption", "Filament Consumption")}
          value={annualUsageValue}
          period={t("dashboard.last12Months", "Last 12 months")}
          caption={t(
            "dashboard.consumptionCaption",
            "Recorded printer jobs and Bambu Live sessions.",
          )}
          months={displayedUsageMonths}
          unavailableMessage={
            displayedUsageAvailable
              ? null
              : t(
                  "dashboard.annualUsageUnavailable",
                  "Update the host to show 12-month history.",
                )
          }
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
