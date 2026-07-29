export const DASHBOARD_ONBOARDING_STORAGE_KEY =
  "filament-manager:dashboard-onboarding:v1";

const DASHBOARD_ONBOARDING_STORAGE_VERSION = 1;

export type DashboardOnboardingTaskId =
  | "INVENTORY"
  | "PRINTER"
  | "COMPANION"
  | "BACKUP";

export type DashboardOnboardingTask = {
  complete: boolean;
  id: DashboardOnboardingTaskId;
  optional: boolean;
};

export type DashboardOnboardingState = {
  completedCount: number;
  tasks: DashboardOnboardingTask[];
  totalCount: number;
};

export type DashboardOnboardingTaskGroups = {
  completed: DashboardOnboardingTask[];
  pendingOptional: DashboardOnboardingTask[];
  pendingRequired: DashboardOnboardingTask[];
  requiredCompletedCount: number;
  requiredTotalCount: number;
};

type DashboardOnboardingStorageRecord = {
  dismissedAt: string;
  version: typeof DASHBOARD_ONBOARDING_STORAGE_VERSION;
};

export type DashboardOnboardingStorage = Pick<Storage, "getItem" | "setItem">;

function resolveLocalStorage(): DashboardOnboardingStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function normalizeDismissedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function readDashboardOnboardingDismissed(
  storage: DashboardOnboardingStorage | null = resolveLocalStorage(),
): boolean {
  if (!storage) {
    return false;
  }
  try {
    const raw = storage.getItem(DASHBOARD_ONBOARDING_STORAGE_KEY);
    if (!raw || raw.length > 2_048) {
      return false;
    }
    const parsed = JSON.parse(raw) as Partial<DashboardOnboardingStorageRecord> | null;
    return !!(
      parsed &&
      parsed.version === DASHBOARD_ONBOARDING_STORAGE_VERSION &&
      normalizeDismissedAt(parsed.dismissedAt)
    );
  } catch {
    return false;
  }
}

export function dismissDashboardOnboarding(
  dismissedAt = new Date().toISOString(),
  storage: DashboardOnboardingStorage | null = resolveLocalStorage(),
): boolean {
  const normalized = normalizeDismissedAt(dismissedAt);
  if (!normalized) {
    return false;
  }
  if (storage) {
    const record: DashboardOnboardingStorageRecord = {
      dismissedAt: normalized,
      version: DASHBOARD_ONBOARDING_STORAGE_VERSION,
    };
    try {
      storage.setItem(DASHBOARD_ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Dismissal remains valid for this session even if persistence is blocked.
    }
  }
  return true;
}

export function buildDashboardOnboardingState(input: {
  backupComplete: boolean;
  companionComplete: boolean;
  inventoryComplete: boolean;
  printerComplete: boolean;
}): DashboardOnboardingState {
  const tasks: DashboardOnboardingTask[] = [
    { complete: input.inventoryComplete, id: "INVENTORY", optional: false },
    { complete: input.printerComplete, id: "PRINTER", optional: true },
    { complete: input.companionComplete, id: "COMPANION", optional: true },
    { complete: input.backupComplete, id: "BACKUP", optional: false },
  ];
  return {
    completedCount: tasks.filter((task) => task.complete).length,
    tasks,
    totalCount: tasks.length,
  };
}

export function groupDashboardOnboardingTasks(
  state: DashboardOnboardingState,
): DashboardOnboardingTaskGroups {
  const required = state.tasks.filter((task) => !task.optional);
  return {
    completed: state.tasks.filter((task) => task.complete),
    pendingOptional: state.tasks.filter(
      (task) => task.optional && !task.complete,
    ),
    pendingRequired: required.filter((task) => !task.complete),
    requiredCompletedCount: required.filter((task) => task.complete).length,
    requiredTotalCount: required.length,
  };
}
