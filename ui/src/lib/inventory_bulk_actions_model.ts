import {
  isCanonicalSpoolStatus,
  type SpoolStatus,
} from "./shared_contracts.generated";

export const INVENTORY_BULK_MANUAL_STATUSES = [
  "IN_STOCK",
  "EMPTY",
  "LOST",
] as const satisfies ReadonlyArray<SpoolStatus>;

export type InventoryBulkManualStatus =
  (typeof INVENTORY_BULK_MANUAL_STATUSES)[number];
export type InventoryBulkMutationAction = "MOVE" | "STATUS";
export type InventoryBulkDataAction = "LABELS" | "EXPORT";
export type InventoryBulkSelectAllState = "NONE" | "SOME" | "ALL";

export type InventoryBulkSelection = Readonly<{
  spoolIds: readonly string[];
}>;

export type InventoryBulkLocationTarget = Readonly<{
  archived: boolean;
  id: string;
  name: string;
}>;

/**
 * The review snapshot is intentionally stricter than today's list row shape.
 * The eventual backend command must reload and verify every field inside the
 * same transaction before it writes anything.
 */
export type InventoryBulkSpoolSnapshot = Readonly<{
  activeLoan: boolean;
  assignedToPrinter: boolean;
  homeLocationId: string | null;
  locationId: string | null;
  spoolId: string;
  status: SpoolStatus;
}>;

export type InventoryBulkSpoolPrecondition = Readonly<{
  expected_active_loan: boolean;
  expected_assigned_to_printer: boolean;
  expected_home_location_id: string | null;
  expected_location_id: string | null;
  expected_status: SpoolStatus;
  spool_id: string;
}>;

export type InventoryBulkMoveCommand = Readonly<{
  action: "MOVE";
  expected_affected_count: number;
  spools: readonly InventoryBulkSpoolPrecondition[];
  target_location_id: string;
}>;

export type InventoryBulkStatusCommand = Readonly<{
  action: "STATUS";
  expected_affected_count: number;
  spools: readonly InventoryBulkSpoolPrecondition[];
  target_status: InventoryBulkManualStatus;
}>;

export type InventoryBulkMutationCommand =
  | InventoryBulkMoveCommand
  | InventoryBulkStatusCommand;

export const INVENTORY_BULK_MUTATION_EXECUTION_CONTRACT = {
  backendTransactionCount: 1,
  historyRequirement: "ACTION_EVENT_PER_AFFECTED_SPOOL",
  partialMutationAllowed: false,
  stalePreconditionPolicy: "ABORT_BEFORE_WRITE",
} as const;

type InventoryBulkMutationPlanBase = Readonly<{
  affectedCount: number;
  affectedSpoolIds: readonly string[];
  confirmationKey: string;
  requiredHistoryEventType: "LOCATION_UPDATED" | "STATUS_UPDATED";
  selectedCount: number;
  selectedSpoolIds: readonly string[];
  targetLabel: string;
  unchangedCount: number;
  unchangedSpoolIds: readonly string[];
}>;

export type InventoryBulkMovePlan = InventoryBulkMutationPlanBase &
  Readonly<{
    action: "MOVE";
    command: InventoryBulkMoveCommand;
  }>;

export type InventoryBulkStatusPlan = InventoryBulkMutationPlanBase &
  Readonly<{
    action: "STATUS";
    command: InventoryBulkStatusCommand;
  }>;

export type InventoryBulkMutationPlan =
  | InventoryBulkMovePlan
  | InventoryBulkStatusPlan;

export type InventoryBulkDataPlan = Readonly<{
  action: InventoryBulkDataAction;
  selectedCount: number;
  spoolIds: readonly string[];
}>;

export type InventoryBulkDataResolutionError =
  | "DUPLICATE_ROW"
  | "INVALID_PLAN"
  | "STALE_SELECTION";

export type InventoryBulkDataResolutionResult<Row> =
  | Readonly<{ ok: true; rows: readonly Row[] }>
  | Readonly<{
      error: InventoryBulkDataResolutionError;
      ok: false;
      spoolIds: readonly string[];
    }>;

export type InventoryBulkValidationIssueCode =
  | "ACTIVE_LOAN"
  | "ARCHIVED_LOCATION"
  | "BLANK_LOCATION_ID"
  | "BLANK_SPOOL_ID"
  | "DUPLICATE_SNAPSHOT"
  | "DUPLICATE_SPOOL_ID"
  | "EMPTY_SELECTION"
  | "INVALID_SNAPSHOT_STATUS"
  | "NO_CHANGES"
  | "PRINTER_SLOT_CONTROLLED"
  | "REMOVED_SPOOL"
  | "STALE_SELECTION"
  | "UNSUPPORTED_STATUS_TARGET";

export type InventoryBulkValidationIssue = Readonly<{
  code: InventoryBulkValidationIssueCode;
  spoolIds: readonly string[];
}>;

export type InventoryBulkPlanResult<T> =
  | Readonly<{ ok: true; plan: T }>
  | Readonly<{ issues: readonly InventoryBulkValidationIssue[]; ok: false }>;

export type BuildInventoryBulkMovePlanInput = Readonly<{
  action: "MOVE";
  selectedSpoolIds: readonly string[];
  snapshots: readonly InventoryBulkSpoolSnapshot[];
  targetLocation: InventoryBulkLocationTarget;
}>;

export type BuildInventoryBulkStatusPlanInput = Readonly<{
  action: "STATUS";
  selectedSpoolIds: readonly string[];
  snapshots: readonly InventoryBulkSpoolSnapshot[];
  targetStatus: string;
}>;

export type BuildInventoryBulkMutationPlanInput =
  | BuildInventoryBulkMovePlanInput
  | BuildInventoryBulkStatusPlanInput;

export type InventoryBulkMutationReceipt = Readonly<{
  affected_count: number;
  committed: boolean;
  history_spool_count: number;
}>;

export type InventoryBulkConfirmationResult =
  | Readonly<{ command: InventoryBulkMutationCommand; ok: true }>
  | Readonly<{ error: "STALE_REVIEW"; ok: false }>;

function normalizeId(value: string): string {
  return value.trim();
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function uniqueNormalizedIds(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = normalizeId(value);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function createInventoryBulkSelection(
  spoolIds: readonly string[] = [],
): InventoryBulkSelection {
  return { spoolIds: uniqueNormalizedIds(spoolIds) };
}

export function toggleInventoryBulkSelection(
  selection: InventoryBulkSelection,
  spoolId: string,
  selected?: boolean,
): InventoryBulkSelection {
  const id = normalizeId(spoolId);
  if (!id) {
    return selection;
  }
  const currentlySelected = selection.spoolIds.includes(id);
  const shouldSelect = selected ?? !currentlySelected;
  if (currentlySelected === shouldSelect) {
    return selection;
  }
  if (shouldSelect) {
    return createInventoryBulkSelection([...selection.spoolIds, id]);
  }
  return createInventoryBulkSelection(
    selection.spoolIds.filter((candidate) => candidate !== id),
  );
}

export function selectVisibleInventoryBulkSpools(
  selection: InventoryBulkSelection,
  visibleSpoolIds: readonly string[],
): InventoryBulkSelection {
  return createInventoryBulkSelection([...selection.spoolIds, ...visibleSpoolIds]);
}

export function deselectVisibleInventoryBulkSpools(
  selection: InventoryBulkSelection,
  visibleSpoolIds: readonly string[],
): InventoryBulkSelection {
  const visible = new Set(uniqueNormalizedIds(visibleSpoolIds));
  return createInventoryBulkSelection(
    selection.spoolIds.filter((spoolId) => !visible.has(spoolId)),
  );
}

export function clearInventoryBulkSelection(): InventoryBulkSelection {
  return createInventoryBulkSelection();
}

export function reconcileInventoryBulkSelection(
  selection: InventoryBulkSelection,
  availableSpoolIds: readonly string[],
): Readonly<{
  removedSpoolIds: readonly string[];
  selection: InventoryBulkSelection;
}> {
  const available = new Set(uniqueNormalizedIds(availableSpoolIds));
  const retained = selection.spoolIds.filter((spoolId) => available.has(spoolId));
  const removed = selection.spoolIds.filter((spoolId) => !available.has(spoolId));
  return {
    removedSpoolIds: removed,
    selection: createInventoryBulkSelection(retained),
  };
}

export function inventoryBulkSelectAllState(
  selection: InventoryBulkSelection,
  visibleSpoolIds: readonly string[],
): InventoryBulkSelectAllState {
  const visible = uniqueNormalizedIds(visibleSpoolIds);
  if (visible.length === 0) {
    return "NONE";
  }
  const selected = new Set(selection.spoolIds);
  const selectedVisibleCount = visible.filter((spoolId) => selected.has(spoolId)).length;
  if (selectedVisibleCount === 0) {
    return "NONE";
  }
  return selectedVisibleCount === visible.length ? "ALL" : "SOME";
}

function validationIssue(
  code: InventoryBulkValidationIssueCode,
  spoolIds: readonly string[] = [],
): InventoryBulkValidationIssue {
  return { code, spoolIds: [...spoolIds].sort(compareText) };
}

type CollectedSnapshots = Readonly<{
  issues: readonly InventoryBulkValidationIssue[];
  selectedSpoolIds: readonly string[];
  snapshots: readonly InventoryBulkSpoolSnapshot[];
}>;

function collectSelectedSnapshots(
  selectedSpoolIdsRaw: readonly string[],
  snapshotsRaw: readonly InventoryBulkSpoolSnapshot[],
): CollectedSnapshots {
  const issues: InventoryBulkValidationIssue[] = [];
  const normalizedSelected = selectedSpoolIdsRaw.map(normalizeId);
  const blankSelected = selectedSpoolIdsRaw.filter((_, index) => !normalizedSelected[index]);
  if (blankSelected.length > 0) {
    issues.push(validationIssue("BLANK_SPOOL_ID"));
  }

  const selectedCounts = new Map<string, number>();
  for (const spoolId of normalizedSelected) {
    if (spoolId) {
      selectedCounts.set(spoolId, (selectedCounts.get(spoolId) ?? 0) + 1);
    }
  }
  const duplicateSelected = [...selectedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([spoolId]) => spoolId);
  if (duplicateSelected.length > 0) {
    issues.push(validationIssue("DUPLICATE_SPOOL_ID", duplicateSelected));
  }

  const selectedSpoolIds = [...selectedCounts.keys()].sort(compareText);
  if (selectedSpoolIds.length === 0) {
    issues.push(validationIssue("EMPTY_SELECTION"));
  }

  const snapshotIndex = new Map<string, InventoryBulkSpoolSnapshot>();
  const duplicateSnapshots = new Set<string>();
  for (const snapshot of snapshotsRaw) {
    const spoolId = normalizeId(snapshot.spoolId);
    if (!spoolId) {
      issues.push(validationIssue("BLANK_SPOOL_ID"));
      continue;
    }
    if (snapshotIndex.has(spoolId)) {
      duplicateSnapshots.add(spoolId);
      continue;
    }
    snapshotIndex.set(spoolId, {
      ...snapshot,
      homeLocationId: snapshot.homeLocationId
        ? normalizeId(snapshot.homeLocationId) || null
        : null,
      locationId: snapshot.locationId ? normalizeId(snapshot.locationId) || null : null,
      spoolId,
    });
  }
  if (duplicateSnapshots.size > 0) {
    issues.push(validationIssue("DUPLICATE_SNAPSHOT", [...duplicateSnapshots]));
  }

  const missing = selectedSpoolIds.filter((spoolId) => !snapshotIndex.has(spoolId));
  if (missing.length > 0) {
    issues.push(validationIssue("STALE_SELECTION", missing));
  }

  const selectedSnapshots = selectedSpoolIds.flatMap((spoolId) => {
    const snapshot = snapshotIndex.get(spoolId);
    return snapshot ? [snapshot] : [];
  });
  const invalidStatus = selectedSnapshots
    .filter((snapshot) => !isCanonicalSpoolStatus(snapshot.status))
    .map((snapshot) => snapshot.spoolId);
  if (invalidStatus.length > 0) {
    issues.push(validationIssue("INVALID_SNAPSHOT_STATUS", invalidStatus));
  }

  return { issues, selectedSpoolIds, snapshots: selectedSnapshots };
}

function manualMutationIssue(
  snapshot: InventoryBulkSpoolSnapshot,
): InventoryBulkValidationIssueCode | null {
  if (snapshot.assignedToPrinter || snapshot.status === "ASSIGNED") {
    return "PRINTER_SLOT_CONTROLLED";
  }
  if (snapshot.activeLoan || snapshot.status === "BORROWED") {
    return "ACTIVE_LOAN";
  }
  if (snapshot.status === "MISSING" || snapshot.status === "DELETED") {
    return "REMOVED_SPOOL";
  }
  return null;
}

function collectManualMutationIssues(
  affectedSnapshots: readonly InventoryBulkSpoolSnapshot[],
): InventoryBulkValidationIssue[] {
  const grouped = new Map<InventoryBulkValidationIssueCode, string[]>();
  for (const snapshot of affectedSnapshots) {
    const code = manualMutationIssue(snapshot);
    if (!code) {
      continue;
    }
    const spoolIds = grouped.get(code) ?? [];
    spoolIds.push(snapshot.spoolId);
    grouped.set(code, spoolIds);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([code, spoolIds]) => validationIssue(code, spoolIds));
}

function toPrecondition(
  snapshot: InventoryBulkSpoolSnapshot,
): InventoryBulkSpoolPrecondition {
  return {
    expected_active_loan: snapshot.activeLoan,
    expected_assigned_to_printer: snapshot.assignedToPrinter,
    expected_home_location_id: snapshot.homeLocationId,
    expected_location_id: snapshot.locationId,
    expected_status: snapshot.status,
    spool_id: snapshot.spoolId,
  };
}

function buildPlanBase(
  action: InventoryBulkMutationAction,
  command: InventoryBulkMutationCommand,
  selectedSpoolIds: readonly string[],
  affectedSpoolIds: readonly string[],
  targetLabel: string,
): InventoryBulkMutationPlanBase {
  const affected = new Set(affectedSpoolIds);
  const unchangedSpoolIds = selectedSpoolIds.filter((spoolId) => !affected.has(spoolId));
  return {
    affectedCount: affectedSpoolIds.length,
    affectedSpoolIds,
    confirmationKey: JSON.stringify(command),
    requiredHistoryEventType: action === "MOVE" ? "LOCATION_UPDATED" : "STATUS_UPDATED",
    selectedCount: selectedSpoolIds.length,
    selectedSpoolIds,
    targetLabel,
    unchangedCount: unchangedSpoolIds.length,
    unchangedSpoolIds,
  };
}

export function buildInventoryBulkMutationPlan(
  input: BuildInventoryBulkMutationPlanInput,
): InventoryBulkPlanResult<InventoryBulkMutationPlan> {
  const collected = collectSelectedSnapshots(input.selectedSpoolIds, input.snapshots);
  const issues = [...collected.issues];

  let affectedSnapshots: readonly InventoryBulkSpoolSnapshot[] = [];
  let command: InventoryBulkMutationCommand | null = null;
  let targetLabel = "";

  if (input.action === "MOVE") {
    const locationId = normalizeId(input.targetLocation.id);
    if (!locationId) {
      issues.push(validationIssue("BLANK_LOCATION_ID"));
    }
    if (input.targetLocation.archived) {
      issues.push(validationIssue("ARCHIVED_LOCATION"));
    }
    affectedSnapshots = collected.snapshots.filter(
      (snapshot) =>
        snapshot.locationId !== locationId ||
        snapshot.homeLocationId !== locationId,
    );
    command = {
      action: "MOVE",
      expected_affected_count: affectedSnapshots.length,
      spools: collected.snapshots.map(toPrecondition),
      target_location_id: locationId,
    };
    targetLabel = input.targetLocation.name.trim() || locationId;
  } else {
    const targetStatus = input.targetStatus.trim().toUpperCase();
    if (
      !INVENTORY_BULK_MANUAL_STATUSES.includes(
        targetStatus as InventoryBulkManualStatus,
      )
    ) {
      issues.push(validationIssue("UNSUPPORTED_STATUS_TARGET"));
    } else {
      const typedTarget = targetStatus as InventoryBulkManualStatus;
      affectedSnapshots = collected.snapshots.filter(
        (snapshot) => snapshot.status !== typedTarget,
      );
      command = {
        action: "STATUS",
        expected_affected_count: affectedSnapshots.length,
        spools: collected.snapshots.map(toPrecondition),
        target_status: typedTarget,
      };
      targetLabel = typedTarget;
    }
  }

  if (
    command &&
    affectedSnapshots.length === 0 &&
    collected.selectedSpoolIds.length > 0
  ) {
    issues.push(validationIssue("NO_CHANGES", collected.selectedSpoolIds));
  }
  issues.push(...collectManualMutationIssues(affectedSnapshots));

  if (issues.length > 0 || !command) {
    return { issues, ok: false };
  }

  const affectedSpoolIds = affectedSnapshots.map((snapshot) => snapshot.spoolId);
  const base = buildPlanBase(
    input.action,
    command,
    collected.selectedSpoolIds,
    affectedSpoolIds,
    targetLabel,
  );
  if (command.action === "MOVE") {
    return { ok: true, plan: { ...base, action: "MOVE", command } };
  }
  return { ok: true, plan: { ...base, action: "STATUS", command } };
}

export function buildInventoryBulkDataPlan(input: Readonly<{
  action: InventoryBulkDataAction;
  selectedSpoolIds: readonly string[];
  snapshots: readonly InventoryBulkSpoolSnapshot[];
}>): InventoryBulkPlanResult<InventoryBulkDataPlan> {
  const collected = collectSelectedSnapshots(input.selectedSpoolIds, input.snapshots);
  if (collected.issues.length > 0) {
    return { issues: collected.issues, ok: false };
  }
  return {
    ok: true,
    plan: {
      action: input.action,
      selectedCount: collected.selectedSpoolIds.length,
      spoolIds: collected.selectedSpoolIds,
    },
  };
}

export function resolveInventoryBulkDataPlanRows<Row extends Readonly<{ id: string }>>(
  plan: InventoryBulkDataPlan,
  rows: readonly Row[],
): InventoryBulkDataResolutionResult<Row> {
  const normalizedPlanIds = plan.spoolIds.map(normalizeId);
  if (
    normalizedPlanIds.some((spoolId) => !spoolId) ||
    new Set(normalizedPlanIds).size !== normalizedPlanIds.length ||
    plan.selectedCount !== normalizedPlanIds.length
  ) {
    return { error: "INVALID_PLAN", ok: false, spoolIds: normalizedPlanIds };
  }

  const rowsById = new Map<string, Row>();
  const duplicateRows = new Set<string>();
  for (const row of rows) {
    const spoolId = normalizeId(row.id);
    if (!spoolId) {
      continue;
    }
    if (rowsById.has(spoolId)) {
      duplicateRows.add(spoolId);
      continue;
    }
    rowsById.set(spoolId, row);
  }
  if (duplicateRows.size > 0) {
    return {
      error: "DUPLICATE_ROW",
      ok: false,
      spoolIds: [...duplicateRows].sort(compareText),
    };
  }

  const missing = normalizedPlanIds.filter((spoolId) => !rowsById.has(spoolId));
  if (missing.length > 0) {
    return { error: "STALE_SELECTION", ok: false, spoolIds: missing };
  }
  return {
    ok: true,
    rows: normalizedPlanIds.flatMap((spoolId) => {
      const row = rowsById.get(spoolId);
      return row ? [row] : [];
    }),
  };
}

/**
 * Call this at the second confirmation step with a plan rebuilt from the
 * latest rows. A changed selection, target, status, location, slot state, or
 * loan state invalidates the review instead of silently mutating a subset.
 */
export function confirmInventoryBulkMutation(
  reviewedPlan: InventoryBulkMutationPlan,
  latestPlan: InventoryBulkPlanResult<InventoryBulkMutationPlan>,
): InventoryBulkConfirmationResult {
  if (
    !latestPlan.ok ||
    latestPlan.plan.confirmationKey !== reviewedPlan.confirmationKey
  ) {
    return { error: "STALE_REVIEW", ok: false };
  }
  return { command: latestPlan.plan.command, ok: true };
}

export function inventoryBulkMutationReceiptMatchesPlan(
  plan: InventoryBulkMutationPlan,
  receipt: InventoryBulkMutationReceipt,
): boolean {
  return (
    receipt.committed === true &&
    Number.isSafeInteger(receipt.affected_count) &&
    Number.isSafeInteger(receipt.history_spool_count) &&
    receipt.affected_count === plan.affectedCount &&
    receipt.history_spool_count === plan.affectedCount
  );
}
