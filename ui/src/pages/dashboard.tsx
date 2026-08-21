import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  StatCard,
  UsageChart,
} from "../components/dashboard_widgets";
import { DashboardOnboardingChecklist } from "../components/dashboard_onboarding_checklist";
import { DashboardActionPanel } from "../components/dashboard_action_panel";
import { PageHeaderButton } from "../components/page_header_button";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
} from "../lib/dashboard_model";
import { commandErrorText } from "../lib/error_text";
import {
  createDashboardLowStockPurchaseCoordinator,
  DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED,
  DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED,
} from "../lib/dashboard_low_stock_purchase";
import type { DashboardLowStockAction } from "../lib/dashboard_action_model";
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
  onOpenPurchases?: (
    status: "WISHLIST" | "ON_ORDER",
    notice?: "CREATED" | "REUSED",
  ) => void;
};

export default function DashboardPage({
  onNavigate,
  onAddFirstSpool,
  onOpenLowStock,
  onOpenCompanionSettings,
  onOpenMaintenanceSettings,
  onOpenPrinters,
  onOpenBambuLiveSettings,
  onOpenPurchases,
}: DashboardPageProps) {
  const { t, locale } = useI18n();
  const {
    activity,
    actionItems,
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
  const hasBambuLiveAction = actionItems.some(
    (item) => item.kind === "BAMBU_TRUST",
  );
  const consumptionPanelRef = useRef<HTMLDivElement>(null);
  const consumptionPanelPositionedRef = useRef(false);
  const dashboardAttentionReadinessSignaledRef = useRef(false);
  const dashboardConsumptionReadinessSignaledRef = useRef(false);
  useEffect(() => {
    if (
      desktopVisualQaScenario !== "dashboard-overview" ||
      loading ||
      !tauri ||
      !hasBambuLiveAction ||
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
  }, [desktopVisualQaScenario, hasBambuLiveAction, loading, tauri]);
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
  const lowStockPurchaseCoordinator = useMemo(
    () => createDashboardLowStockPurchaseCoordinator(),
    [],
  );
  const [actionBusyIds, setActionBusyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const handleQueueLowStock = useCallback(
    async (item: DashboardLowStockAction) => {
      setActionBusyIds((current) => new Set(current).add(item.id));
      setActionError(null);
      setActionMessage(null);
      try {
        const result = await lowStockPurchaseCoordinator.enqueue(item.candidate);
        if (result.kind === "CREATED") {
          await refreshDashboard();
          setActionMessage(
            t(
              "dashboard.actionPurchaseAdded",
              "Added to the wishlist. Opening Purchases.",
            ),
          );
        } else {
          setActionMessage(
            t(
              "dashboard.actionPurchaseReused",
              "An open purchase already exists. Reusing it and opening Purchases.",
            ),
          );
        }
        onOpenPurchases?.(result.status, result.kind);
      } catch (purchaseError) {
        console.error(purchaseError);
        const configurationMessage =
          purchaseError instanceof Error &&
          purchaseError.message === DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED
            ? t(
                "inventory.clientWriteRequiresPairing",
                "Pair this desktop client with the host before running protected sync actions.",
              )
            : purchaseError instanceof Error &&
                purchaseError.message === DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED
              ? t(
                  "inventory.clientHostUnavailable",
                  "Host connection details are missing for this client device.",
                )
              : null;
        setActionError(
          configurationMessage ??
            commandErrorText(
              purchaseError,
              t("wishlist.error.add", "Failed to add wishlist item."),
              t,
            ),
        );
      } finally {
        setActionBusyIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [lowStockPurchaseCoordinator, onOpenPurchases, refreshDashboard, t],
  );

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

      <DashboardActionPanel
        busyIds={actionBusyIds}
        error={actionError}
        items={actionItems}
        message={actionMessage}
        onOpenBambuLiveSettings={onOpenBambuLiveSettings}
        onOpenLoans={() => onNavigate?.("loans")}
        onOpenLowStock={onOpenLowStock}
        onOpenPurchases={onOpenPurchases}
        onQueueLowStock={(item) => void handleQueueLowStock(item)}
      />

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
