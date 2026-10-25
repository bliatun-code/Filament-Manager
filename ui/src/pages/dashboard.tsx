import { dashboardOverviewStyles } from "../lib/dashboard_overview_styles";
import { OwnershipSnapshotPanel } from "./dashboard_panels";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardOnboardingChecklist } from "../components/dashboard_onboarding_checklist";
import { DashboardActionPanel } from "../components/dashboard_action_panel";
import { DashboardLowStockPanel } from "../components/dashboard_low_stock_panel";
import { DashboardPrinterOverview } from "../components/dashboard_printer_overview";
import { DashboardStockOverview } from "../components/dashboard_stock_overview";
import { PageHeaderButton } from "../components/page_header_button";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import {
  buildDashboardCompanionPresentation,
} from "../lib/dashboard_model";
import { commandErrorText } from "../lib/error_text";
import {
  createDashboardLowStockPurchaseCoordinator,
  DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED,
  DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED,
} from "../lib/dashboard_low_stock_purchase";
import type {
  DashboardActionItem,
  DashboardLowStockAction,
} from "../lib/dashboard_action_model";
import {
  addHiddenDashboardLowStockProductKey,
  readDashboardLowStockPreferences,
  removeHiddenDashboardLowStockProductKey,
  writeDashboardLowStockPreferences,
  type DashboardLowStockPreferences,
} from "../lib/dashboard_low_stock_preferences";
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
import { useDashboardPageData } from "./use_dashboard_page_data";
import { readLatestFullBackupExport } from "./settings_full_backup_activity";
import type { PageKey } from "../lib/app_navigation_model";
import { useResolvedTheme } from "../lib/theme_mode";

const ActivityTimeline = lazy(() => import("../components/dashboard_activity_timeline").then((module) => ({ default: module.ActivityTimeline })));
const DashboardConsumptionPanel = lazy(() => import("./dashboard_consumption_panel"));

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
  const resolvedTheme = useResolvedTheme();
  const overviewDetailsUnavailable = t("dashboard.overviewDetailsUnavailable", "Details are unavailable in this snapshot. Refresh to load them.");
  const {
    activity,
    actionItems,
    bambuLiveIntegrations,
    printerOverview,
    printerOverviewAvailable,
    lowStockPreview,
    lowStockPreviewAvailable,
    syncSource,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    clientHostPaired,
    companionStatus,
    dashboardSyncMode,
    error,
    goalMetrics,
    health,
    hasSuccessfulData,
    lastSyncLabel,
    libraryId,
    loading,
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
  const [consumptionReady, setConsumptionReady] = useState(false);
  const handleConsumptionReady = useCallback(() => setConsumptionReady(true), []);
  const forceOnboardingVisible =
    desktopVisualQaScenario === "dashboard-onboarding";
  const deterministicDashboardPreferences = desktopVisualQaScenario != null;
  const lowStockActionItems = useMemo(
    () =>
      actionItems.filter(
        (item): item is DashboardLowStockAction => item.kind === "LOW_STOCK",
      ),
    [actionItems],
  );
  const priorityActionItems = useMemo(
    () =>
      actionItems.filter(
        (
          item,
        ): item is Exclude<DashboardActionItem, DashboardLowStockAction> =>
          item.kind !== "LOW_STOCK",
      ),
    [actionItems],
  );
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
      !consumptionReady ||
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
  }, [desktopVisualQaScenario, displayedUsageTotal12m, consumptionReady, loading, tauri]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    forceOnboardingVisible ? false : readDashboardOnboardingDismissed(),
  );
  const [backupComplete] = useState(() =>
    forceOnboardingVisible ? false : Boolean(readLatestFullBackupExport()),
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
  const hasPendingRequiredSetup = onboardingState.tasks.some(
    (task) => !task.optional && !task.complete,
  );
  const showRequiredSetup = showOnboarding && (forceOnboardingVisible || hasPendingRequiredSetup);
  const liveConfigByPrinter = useMemo(
    () => Object.fromEntries(bambuLiveIntegrations.map((entry) => [entry.printer_id, entry.config])),
    [bambuLiveIntegrations],
  );
  const onboardingChecklist = showOnboarding ? (
    <DashboardOnboardingChecklist
      state={onboardingState}
      onAddSpool={() => onAddFirstSpool?.()}
      onDismiss={() => {
        if (!forceOnboardingVisible) dismissDashboardOnboarding();
        setOnboardingDismissed(true);
      }}
      onOpenBackup={() => onOpenMaintenanceSettings?.()}
      onOpenCompanion={() => onOpenCompanionSettings?.()}
      onOpenImport={() => onOpenMaintenanceSettings?.()}
      onOpenPrinters={() => onOpenPrinters?.()}
    />
  ) : null;
  const lowStockPurchaseCoordinator = useMemo(
    () => createDashboardLowStockPurchaseCoordinator(),
    [],
  );
  const [actionBusyIds, setActionBusyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lowStockPreferences, setLowStockPreferences] =
    useState<DashboardLowStockPreferences>(() => ({ hiddenProductKeys: [] }));
  const lowStockPreferencesRef = useRef(lowStockPreferences);
  useEffect(() => {
    const nextPreferences = readDashboardLowStockPreferences({
      deterministic: deterministicDashboardPreferences,
      libraryId,
    });
    lowStockPreferencesRef.current = nextPreferences;
    setLowStockPreferences(nextPreferences);
  }, [deterministicDashboardPreferences, libraryId]);
  const hiddenLowStockProductKeys = useMemo(
    () => new Set(lowStockPreferences.hiddenProductKeys),
    [lowStockPreferences.hiddenProductKeys],
  );
  const commitLowStockPreferences = useCallback(
    (nextPreferences: DashboardLowStockPreferences) => {
      lowStockPreferencesRef.current = nextPreferences;
      setLowStockPreferences(nextPreferences);
      writeDashboardLowStockPreferences(nextPreferences, {
        deterministic: deterministicDashboardPreferences,
        libraryId,
      });
    },
    [deterministicDashboardPreferences, libraryId],
  );
  const handleHideLowStock = useCallback(
    (item: DashboardLowStockAction) => {
      commitLowStockPreferences(
        addHiddenDashboardLowStockProductKey(
          lowStockPreferencesRef.current,
          item.candidate.productKey,
        ),
      );
      setActionError(null);
      setActionMessage(null);
    },
    [commitLowStockPreferences],
  );
  const handleRestoreLowStock = useCallback(
    (item: DashboardLowStockAction) => {
      commitLowStockPreferences(
        removeHiddenDashboardLowStockProductKey(
          lowStockPreferencesRef.current,
          item.candidate.productKey,
        ),
      );
      setActionError(null);
      setActionMessage(null);
    },
    [commitLowStockPreferences],
  );
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

  const loadErrorBanner = error ? (
    <PageLoadErrorBanner
          message={error}
          onRetry={() => void refreshDashboard()}
          retryDisabled={!refreshAvailable || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
  ) : null;

  // Before the first resolved snapshot, zero values and the default local role
  // are placeholders, not evidence about the selected library.
  if (tauri && !hasSuccessfulData) {
    return (
      <div className="page-shell" aria-busy={loading}>
        <div className="page-header">
          <h1 className="page-title">{t("nav.dashboard", "Dashboard")}</h1>
        </div>
        {error ? loadErrorBanner : (
          <div role="status" className="surface-subtle px-4 py-4">
            {t("common.loading", "Loading...")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.dashboard", "Dashboard")}</h1>

        </div>
        <div className="flex flex-wrap items-center gap-3 xl:pt-1">
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
          {!printerOverviewAvailable || !lowStockPreviewAvailable ? (
            <PageHeaderButton
              onClick={() => void refreshDashboard()}
              disabled={!refreshAvailable || loading || refreshing}
              responsive={false}
              variant="soft"
            >
              {refreshing ? t("common.loading", "Loading...") : t("common.refresh", "Refresh")}
            </PageHeaderButton>
          ) : null}
        </div>
      </div>

      {loadErrorBanner}

      <div className="mt-5 grid grid-cols-1 gap-x-6 divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-3 sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700" data-testid="dashboard-headline-summary">
        {stats.filter((stat) => stat.id !== "lowStock").map((stat) => (
          <button
            key={stat.id}
            type="button"
            className="min-w-0 rounded py-4 text-left outline-none hover:bg-slate-100/60 focus-visible:ring-2 focus-visible:ring-sky-400 dark:hover:bg-slate-800/50"
            onClick={() => onNavigate?.(stat.id === "total" ? "inventory" : stat.id === "outboundLoans" ? "loans" : "statistics")}
          >
            <span className={`block text-xs font-medium ${dashboardOverviewStyles.muted}`}>
              {stat.title}
            </span>
            <span className={`mt-1 block text-3xl font-semibold tabular-nums tracking-tight ${dashboardOverviewStyles.primary}`}>{setupDataAvailable ? stat.value : "—"}</span>
            <span className={`mt-1 block text-xs ${dashboardOverviewStyles.muted}`}>{stat.subtitle}</span>
          </button>
        ))}
      </div>

      <DashboardActionPanel
        items={priorityActionItems}
        onOpenBambuLiveSettings={onOpenBambuLiveSettings}
        onOpenLoans={() => onNavigate?.("loans")}
        onOpenPurchases={onOpenPurchases}
      />

      {showRequiredSetup ? onboardingChecklist : null}

      <div className="mt-5 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" data-testid="dashboard-balanced-primary">
        <section className="min-w-0" aria-labelledby="dashboard-printers-title">
          <div className={`mb-3 ${dashboardOverviewStyles.between}`}>
            <h2 id="dashboard-printers-title" className={dashboardOverviewStyles.heading}>{t("nav.printers", "Printers")}</h2>
            <button type="button" onClick={() => onOpenPrinters?.()} className={`rounded ${dashboardOverviewStyles.action}`}>
              {t("dashboard.printerOpen", "Open printers")} <span aria-hidden="true">→</span>
            </button>
          </div>
          {!printerOverviewAvailable ? (
            <p className={`surface-subtle px-4 py-4 text-sm ${dashboardOverviewStyles.muted}`}>{overviewDetailsUnavailable}</p>
          ) : printerOverview.length > 0 ? (
            <DashboardPrinterOverview
              printers={printerOverview}
              bambuLiveIntegrations={liveConfigByPrinter}
              resolvedTheme={resolvedTheme}
              syncSource={syncSource}
              onOpenBambuLiveSettings={onOpenBambuLiveSettings}
              stacked
            />
          ) : (
            <p className={`surface-subtle px-4 py-4 text-sm ${dashboardOverviewStyles.muted}`}>{t("dashboard.noPrintersConfigured", "No printers configured")}</p>
          )}
        </section>
        <DashboardStockOverview items={lowStockPreview} available={lowStockPreviewAvailable} onOpenLowStock={onOpenLowStock}>
          {lowStockActionItems.length > 0 || actionError || actionMessage ? (
            <DashboardLowStockPanel
              embedded
              busyIds={actionBusyIds}
              error={actionError}
              hiddenProductKeys={hiddenLowStockProductKeys}
              items={lowStockActionItems}
              message={actionMessage}
              onHideLowStock={handleHideLowStock}
              onOpenLowStock={() => onOpenLowStock?.()}
              onQueueLowStock={(item) => void handleQueueLowStock(item)}
              onRestoreLowStock={handleRestoreLowStock}
            />
          ) : null}
        </DashboardStockOverview>
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" data-testid="dashboard-balanced-secondary">
        <Suspense fallback={<p role="status" className={`surface-subtle p-4 text-sm ${dashboardOverviewStyles.muted}`}>{t("common.loading", "Loading...")}</p>}>
          <DashboardConsumptionPanel
            consumptionPanelRef={consumptionPanelRef}
            onOpenStatistics={() => onNavigate?.("statistics")}
            onReady={handleConsumptionReady}
            usageAvailable={displayedUsageAvailable}
            usageMonths={displayedUsageMonths}
            usageTotal12m={displayedUsageTotal12m}
          />
        </Suspense>
        <Suspense fallback={null}>
          <ActivityTimeline items={activity} onOpenLoans={() => onNavigate?.("loans")} />
        </Suspense>
      </div>

      <OwnershipSnapshotPanel onHand={ownershipOnHand} loadedSlots={goalMetrics.loadedSlots} onOrder={health.metrics.find((metric) => metric.id === "onOrder")?.value ?? "—"} locale={locale} t={t} />
      {showOnboarding && !showRequiredSetup ? onboardingChecklist : null}

    </div>
  );
}
