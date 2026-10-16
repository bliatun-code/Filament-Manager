import type { ActivityItem } from "../components/dashboard_widgets";
import type {
  DashboardGoalMetrics,
  DashboardHealth,
  DashboardStat,
  DashboardUsageMonth,
} from "./dashboard_model";
import type { LibraryRevisionSource } from "./library_domain_revisions";
import type { BambuLiveIntegrationEntry, PrinterOverviewRow, TrustedLanCompanionStatus } from "./tauri_client";
import type { DashboardSyncSource } from "./dashboard_data_source";
import { sanitizeDashboardBambuLiveIntegrations, type DashboardStockPreviewRow } from "./dashboard_overview_data";
import type { DashboardBambuLiveAttention } from "./dashboard_bambu_live_attention";
import type { DashboardActionItem } from "./dashboard_action_model";

export type DashboardPageSnapshot = {
  printerOverview?: PrinterOverviewRow[];
  printerOverviewAvailable?: boolean;
  bambuLiveIntegrations?: BambuLiveIntegrationEntry[];
  lowStockPreview?: DashboardStockPreviewRow[];
  lowStockPreviewAvailable?: boolean;
  syncSource?: DashboardSyncSource;
  activity: ActivityItem[];
  actionItems?: DashboardActionItem[];
  bambuLiveAttention?: DashboardBambuLiveAttention[];
  clientHostCompanionTone: "off" | "live" | "warn";
  clientHostDisplayName: string | null;
  clientHostNeedsRepair: boolean;
  clientHostPaired: boolean;
  companionStatus: TrustedLanCompanionStatus | null;
  dashboardSyncMode: string;
  goalMetrics: DashboardGoalMetrics;
  health: DashboardHealth;
  lastSyncLabel: string;
  libraryId?: string | null;
  locale: string;
  ownershipLowStock: {
    owned: number;
    borrowedIn: number;
  };
  ownershipOnHand: {
    total: number;
    owned: number;
    borrowedIn: number;
    inUse: number;
  };
  revisionSource: LibraryRevisionSource | null;
  setupDataAvailable: boolean;
  stats: DashboardStat[];
  usageAvailable: boolean;
  usageMonths: DashboardUsageMonth[];
  usageTotal12m: number;
};

export type DashboardPageSnapshotRequest = {
  generation: number;
  sequence: number;
};

let cachedDashboardPageSnapshot: DashboardPageSnapshot | null = null;
let dashboardPageSnapshotGeneration = 0;
let dashboardPageSnapshotRequestSequence = 0;
let latestAcceptedDashboardPageSnapshotRequestSequence = 0;

function cloneDashboardActionItem(item: DashboardActionItem): DashboardActionItem {
  if (item.kind === "LOW_STOCK") {
    return {
      ...item,
      age: { ...item.age },
      candidate: { ...item.candidate },
      duplicate: item.duplicate ? { ...item.duplicate } : null,
      spoolIds: [...item.spoolIds],
    };
  }
  if (item.kind === "OVERDUE_LOAN") {
    return { ...item, age: { ...item.age } };
  }
  if (item.kind === "ON_ORDER") {
    return { ...item, age: { ...item.age } };
  }
  return { ...item, age: { ...item.age } };
}

function cloneDashboardPageSnapshot(
  snapshot: DashboardPageSnapshot,
): DashboardPageSnapshot {
  const libraryId =
    typeof snapshot.libraryId === "string" && snapshot.libraryId.trim()
      ? snapshot.libraryId.trim()
      : null;
  return {
    ...snapshot,
    printerOverview: snapshot.printerOverview?.map((row) => ({
      printer: { ...row.printer },
      usage: { ...row.usage },
      slots: row.slots.map((slot) => ({ ...slot })),
    })) ?? [],
    printerOverviewAvailable: snapshot.printerOverviewAvailable ?? Array.isArray(snapshot.printerOverview),
    bambuLiveIntegrations: sanitizeDashboardBambuLiveIntegrations(snapshot.bambuLiveIntegrations ?? []),
    lowStockPreview: snapshot.lowStockPreview?.map((row) => ({ ...row })) ?? [],
    lowStockPreviewAvailable: snapshot.lowStockPreviewAvailable ?? Array.isArray(snapshot.lowStockPreview),
    syncSource: snapshot.syncSource ?? (snapshot.dashboardSyncMode === "CLIENT" ? "client-cached" : "local"),
    activity: snapshot.activity.map((item) => ({ ...item })),
    actionItems: snapshot.actionItems?.map(cloneDashboardActionItem) ?? [],
    bambuLiveAttention: snapshot.bambuLiveAttention?.map((item) => ({ ...item })) ?? [],
    companionStatus: snapshot.companionStatus
      ? { ...snapshot.companionStatus }
      : null,
    goalMetrics: { ...snapshot.goalMetrics },
    health: {
      ...snapshot.health,
      metrics: snapshot.health.metrics.map((metric) => ({ ...metric })),
    },
    libraryId,
    ownershipLowStock: { ...snapshot.ownershipLowStock },
    ownershipOnHand: { ...snapshot.ownershipOnHand },
    revisionSource: snapshot.revisionSource
      ? { ...snapshot.revisionSource }
      : null,
    stats: snapshot.stats.map((stat) => ({ ...stat })),
    usageAvailable: snapshot.usageAvailable === true,
    usageMonths: Array.isArray(snapshot.usageMonths)
      ? snapshot.usageMonths.map((item) => ({ ...item }))
      : [],
    usageTotal12m:
      typeof snapshot.usageTotal12m === "number" &&
      Number.isFinite(snapshot.usageTotal12m)
        ? Math.max(0, snapshot.usageTotal12m)
        : 0,
  };
}

export function readDashboardPageSnapshot(
  locale: string,
): DashboardPageSnapshot | null {
  if (cachedDashboardPageSnapshot?.locale !== locale) {
    return null;
  }
  return cloneDashboardPageSnapshot(cachedDashboardPageSnapshot);
}

export function beginDashboardPageSnapshotRequest(
  expectedGeneration = dashboardPageSnapshotGeneration,
): DashboardPageSnapshotRequest {
  dashboardPageSnapshotRequestSequence += 1;
  return {
    generation: expectedGeneration,
    sequence: dashboardPageSnapshotRequestSequence,
  };
}

export function writeDashboardPageSnapshot(
  snapshot: DashboardPageSnapshot,
  request = beginDashboardPageSnapshotRequest(),
): boolean {
  if (
    request.generation !== dashboardPageSnapshotGeneration ||
    request.sequence < latestAcceptedDashboardPageSnapshotRequestSequence
  ) {
    return false;
  }
  cachedDashboardPageSnapshot = cloneDashboardPageSnapshot(snapshot);
  latestAcceptedDashboardPageSnapshotRequestSequence = request.sequence;
  return true;
}

export function updateDashboardPageSnapshot(
  locale: string,
  updates: Partial<Omit<DashboardPageSnapshot, "locale">>,
  expectedGeneration = dashboardPageSnapshotGeneration,
): boolean {
  if (
    expectedGeneration !== dashboardPageSnapshotGeneration ||
    cachedDashboardPageSnapshot?.locale !== locale
  ) {
    return false;
  }
  cachedDashboardPageSnapshot = cloneDashboardPageSnapshot({
    ...cachedDashboardPageSnapshot,
    ...updates,
  });
  return true;
}

export function readDashboardPageSnapshotGeneration(): number {
  return dashboardPageSnapshotGeneration;
}

export function clearDashboardPageSnapshot(): void {
  cachedDashboardPageSnapshot = null;
  dashboardPageSnapshotGeneration += 1;
}
