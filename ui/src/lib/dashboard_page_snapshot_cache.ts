import type { ActivityItem } from "../components/dashboard_widgets";
import type {
  DashboardGoalMetrics,
  DashboardHealth,
  DashboardStat,
  DashboardUsageMonth,
} from "./dashboard_model";
import type { LibraryRevisionSource } from "./library_domain_revisions";
import type { TrustedLanCompanionStatus } from "./tauri_client";
import type { DashboardBambuLiveAttention } from "./dashboard_bambu_live_attention";

export type DashboardPageSnapshot = {
  activity: ActivityItem[];
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

function cloneDashboardPageSnapshot(
  snapshot: DashboardPageSnapshot,
): DashboardPageSnapshot {
  return {
    ...snapshot,
    activity: snapshot.activity.map((item) => ({ ...item })),
    bambuLiveAttention: snapshot.bambuLiveAttention?.map((item) => ({ ...item })) ?? [],
    companionStatus: snapshot.companionStatus
      ? { ...snapshot.companionStatus }
      : null,
    goalMetrics: { ...snapshot.goalMetrics },
    health: {
      ...snapshot.health,
      metrics: snapshot.health.metrics.map((metric) => ({ ...metric })),
    },
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
