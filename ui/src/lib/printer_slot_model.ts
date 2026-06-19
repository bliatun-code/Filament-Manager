import type {
  AssignPrinterSlotInput,
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
  UpdateSpoolRfidTagInput,
} from "./tauri_client";
import {
  buildInventoryCreateSpoolRequest,
  type InventoryCreateSpoolError,
  type InventoryCreateSpoolRequest,
} from "./inventory_create_model";
import type { OwnershipType } from "./inventory_list_model";
import { isUnknownLiveRfid, liveTrayIdentity } from "./printer_live_display";
import { resolveSpoolTareWeight } from "./spool_weight";

export type SlotSwapDraft = {
  targetSpoolId: string;
  search: string;
  outgoingWeight: string;
  incomingWeight: string;
};

export type IncomingWeightPrompt = {
  printerId: string;
  slotId: string;
  targetSpoolId: string | null;
  targetMaterial: string;
  targetFilamentName: string;
  targetColorName: string;
  targetHexColor?: string | null;
  requiresOutgoingWeight: boolean;
  requiresIncomingWeight: boolean;
  currentMaterial?: string | null;
  currentFilamentName?: string | null;
  currentColorName?: string | null;
};

export type SlotRfidOverridePrompt = {
  printerId: string;
  printerName: string;
  printerModel: string;
  slot: PrinterAmsSlotRow;
  spool: SpoolWithMasterRow;
  liveTray: BambuLiveObservedTray;
  observedAt: string | null;
};

export type SlotCatalogOnboardingPrompt = {
  printerId: string;
  printerName: string;
  printerModel: string;
  slot: PrinterAmsSlotRow;
  liveTray: BambuLiveObservedTray;
  master: MasterCatalogRow;
  observedAt: string | null;
  initialWeight: string;
  location: string;
  ownershipType: OwnershipType;
  borrowedFromName: string;
  borrowedFromContact: string;
  borrowedInNote: string;
};

export type SlotCatalogOnboardingOpenBlockReason =
  | "busy"
  | "missing_rfid"
  | "live_slot_unloaded"
  | "occupied_slot"
  | "live_identity_changed";

export type SlotCatalogOnboardingSaveBlockReason =
  | SlotCatalogOnboardingOpenBlockReason
  | "borrowed_owner_required";

export type SlotCatalogOnboardingOpenState = {
  disabled: boolean;
  reason: SlotCatalogOnboardingOpenBlockReason | null;
  observedRfid: string;
  slot: PrinterAmsSlotRow;
};

export type SlotCatalogOnboardingSaveState = {
  disabled: boolean;
  reason: SlotCatalogOnboardingSaveBlockReason | null;
  observedRfid: string;
};

type SlotCatalogOnboardingCatalogCreateRequest = Extract<
  InventoryCreateSpoolRequest,
  { ok: true; kind: "catalog" }
>;

export type SlotCatalogOnboardingCreateRequest =
  | {
      ok: true;
      request: SlotCatalogOnboardingCatalogCreateRequest;
      observedRfid: string;
      rfidObservedAt: string | null;
    }
  | {
      ok: false;
      error: SlotCatalogOnboardingSaveBlockReason | InventoryCreateSpoolError;
    };

export type LiveRfidCandidateRegistrationBlockReason =
  | "busy"
  | "missing_rfid"
  | "live_slot_unloaded"
  | "live_identity_changed"
  | "candidate_has_rfid"
  | "candidate_unavailable"
  | "select_candidate_first";

export type LiveRfidCandidateRegistrationState = {
  disabled: boolean;
  reason: LiveRfidCandidateRegistrationBlockReason | null;
  observedRfid: string;
  slot: PrinterAmsSlotRow;
};

export type PreparedPrinterSlotAssignment = {
  currentSpoolId: string | null;
  targetSpoolId: string | null;
  hasChange: boolean;
  overrideChanged: boolean;
  shouldAssignSlot: boolean;
  assignInput: AssignPrinterSlotInput;
};

export type SlotCatalogOnboardingPostCreateWrites = {
  rfidInput: UpdateSpoolRfidTagInput;
  assignInput: AssignPrinterSlotInput;
};

type LiveIdentitySafetyOptions = {
  currentLiveTray?: BambuLiveObservedTray | null;
};

function liveIdentityChanged(
  liveTray: BambuLiveObservedTray,
  options: LiveIdentitySafetyOptions,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(options, "currentLiveTray")) {
    return false;
  }
  return liveTrayIdentity(options.currentLiveTray) !== liveTrayIdentity(liveTray);
}

function liveTrayLoadedForSafety(
  liveTray: BambuLiveObservedTray,
  options: LiveIdentitySafetyOptions,
): boolean {
  const tray = Object.prototype.hasOwnProperty.call(options, "currentLiveTray")
    ? options.currentLiveTray
    : liveTray;
  return tray?.loaded === true;
}

export function resolveLiveRfidObservedAt(input: {
  liveTray: BambuLiveObservedTray;
  currentLiveTray?: BambuLiveObservedTray | null;
  observedAtFallback?: string | null;
}): string | null {
  return (
    input.currentLiveTray?.last_identity_seen_at ??
    input.liveTray.last_identity_seen_at ??
    input.observedAtFallback ??
    null
  );
}

function rowCanReceiveLiveBambuRfid(row: SpoolWithMasterRow): boolean {
  const vendor = (row.master.vendor ?? "").trim().toLowerCase();
  const status = (row.spool.status ?? "").trim().toUpperCase();
  return (
    vendor.includes("bambu") &&
    !["EMPTY", "LOST", "MISSING", "DELETED", "BORROWED"].includes(status)
  );
}

export type PreparedMeasuredWeightUpdate = {
  safeMeasuredTotal: number;
  safeTareWeight: number;
  measuredFilament: number;
  baseline: number | null;
  usedGrams: number;
  clientAction: "record_usage" | "update_weight";
  localAction: "record_usage" | "update_weight" | "none";
};

export function resolveSpoolTareWeightForRow(row?: SpoolWithMasterRow | null): number {
  if (!row) {
    return 0;
  }
  return resolveSpoolTareWeight(row.spool.spool_tare_weight_g, row.master.vendor);
}

export function findPrinterSlotById(
  printers: PrinterOverviewRow[],
  printerId: string,
  slotId: string,
): PrinterAmsSlotRow | null {
  return (
    printers
      .find((printer) => printer.printer.id === printerId)
      ?.slots.find((slot) => slot.slot_id === slotId) ?? null
  );
}

export function parseWeightInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

export function buildMeasuredTotalWeightDraft(
  remainingGrams: number | null | undefined,
  tareWeight: number,
): string {
  return remainingGrams != null
    ? String(Math.max(0, remainingGrams + Math.max(0, Math.round(tareWeight))))
    : "";
}

export function filterAllowedSpoolsForSlot(
  sortedSpools: SpoolWithMasterRow[],
  slotSpoolId?: string | null,
): SpoolWithMasterRow[] {
  return sortedSpools.filter((row) => {
    const status = (row.spool.status ?? "").trim().toUpperCase();
    if (
      status === "EMPTY" ||
      status === "LOST" ||
      status === "MISSING" ||
      status === "DELETED" ||
      status === "BORROWED"
    ) {
      return false;
    }
    if (slotSpoolId && row.spool.id === slotSpoolId) {
      return true;
    }
    if (status === "IN_USE" || status === "ASSIGNED") {
      return false;
    }
    return true;
  });
}

export function filterSlotOptionsBySearch(
  slotOptions: SpoolWithMasterRow[],
  search: string,
): SpoolWithMasterRow[] {
  const searchTerm = search.trim().toLowerCase();
  if (!searchTerm) {
    return slotOptions;
  }
  return slotOptions.filter((row) =>
    `${row.master.vendor} ${row.master.material} ${row.master.filament_name} ${row.master.color_name} ${row.spool.id} ${row.spool.location_id ?? ""}`
      .toLowerCase()
      .includes(searchTerm),
  );
}

export function buildSlotSwapDraft(
  slot: PrinterAmsSlotRow,
  resolveSpoolTareWeightById: (spoolId: string | null | undefined) => number,
): SlotSwapDraft {
  return {
    targetSpoolId: slot.spool_id ?? "",
    search: "",
    outgoingWeight: buildMeasuredTotalWeightDraft(
      slot.spool_remaining_g,
      resolveSpoolTareWeightById(slot.spool_id),
    ),
    incomingWeight: "",
  };
}

export function buildIncomingWeightPrompt(
  printerId: string,
  slot: PrinterAmsSlotRow,
  row: SpoolWithMasterRow,
): IncomingWeightPrompt {
  return {
    printerId,
    slotId: slot.slot_id,
    targetSpoolId: row.spool.id,
    targetMaterial: row.master.material,
    targetFilamentName: row.master.filament_name,
    targetColorName: row.master.color_name,
    targetHexColor: row.master.hex_color,
    requiresOutgoingWeight: Boolean(slot.spool_id && slot.spool_id !== row.spool.id),
    requiresIncomingWeight: true,
    currentMaterial: slot.spool_material,
    currentFilamentName: slot.spool_filament_name,
    currentColorName: slot.spool_color_name,
  };
}

export function buildEmptySlotWeightPrompt(
  printerId: string,
  slot: PrinterAmsSlotRow,
): IncomingWeightPrompt {
  return {
    printerId,
    slotId: slot.slot_id,
    targetSpoolId: null,
    targetMaterial: slot.spool_material ?? "—",
    targetFilamentName: slot.spool_filament_name ?? "—",
    targetColorName: slot.spool_color_name ?? "—",
    targetHexColor: slot.spool_hex_color,
    requiresOutgoingWeight: true,
    requiresIncomingWeight: false,
    currentMaterial: slot.spool_material,
    currentFilamentName: slot.spool_filament_name,
    currentColorName: slot.spool_color_name,
  };
}

export function buildRfidOverridePrompt(
  printer: PrinterOverviewRow,
  slot: PrinterAmsSlotRow,
  spool: SpoolWithMasterRow,
  liveTray: BambuLiveObservedTray,
  liveConfig: BambuLiveIntegrationEntry["config"] | null,
): SlotRfidOverridePrompt {
  return {
    printerId: printer.printer.id,
    printerName: printer.printer.name,
    printerModel: printer.printer.model,
    slot,
    spool,
    liveTray,
    observedAt: liveTray.last_identity_seen_at ?? liveConfig?.observed_state?.last_seen_at ?? null,
  };
}

export function buildSlotCatalogOnboardingPrompt(
  printer: PrinterOverviewRow,
  slot: PrinterAmsSlotRow,
  master: MasterCatalogRow,
  liveTray: BambuLiveObservedTray,
  liveConfig: BambuLiveIntegrationEntry["config"] | null,
): SlotCatalogOnboardingPrompt {
  return {
    printerId: printer.printer.id,
    printerName: printer.printer.name,
    printerModel: printer.printer.model,
    slot,
    liveTray,
    master,
    observedAt: liveTray.last_identity_seen_at ?? liveConfig?.observed_state?.last_seen_at ?? null,
    initialWeight: String(master.default_weight || 1000),
    location: "",
    ownershipType: "OWNED",
    borrowedFromName: "",
    borrowedFromContact: "",
    borrowedInNote: "",
  };
}

export function buildSlotCatalogOnboardingOpenState(
  slot: PrinterAmsSlotRow,
  liveTray: BambuLiveObservedTray,
  options: {
    busy?: boolean;
    currentSlot?: PrinterAmsSlotRow | null;
    currentLiveTray?: BambuLiveObservedTray | null;
  } = {},
): SlotCatalogOnboardingOpenState {
  const observedRfid = liveTrayIdentity(liveTray);
  const slotForSafety = options.currentSlot ?? slot;
  let reason: SlotCatalogOnboardingOpenBlockReason | null = null;
  if (options.busy) {
    reason = "busy";
  } else if (!observedRfid) {
    reason = "missing_rfid";
  } else if (!liveTrayLoadedForSafety(liveTray, options)) {
    reason = "live_slot_unloaded";
  } else if (slotForSafety.spool_id) {
    reason = "occupied_slot";
  } else if (liveIdentityChanged(liveTray, options)) {
    reason = "live_identity_changed";
  }

  return {
    disabled: Boolean(reason),
    reason,
    observedRfid,
    slot: slotForSafety,
  };
}

export function buildSlotCatalogOnboardingSaveState(
  prompt: SlotCatalogOnboardingPrompt,
  options: {
    busy?: boolean;
    currentSlot?: PrinterAmsSlotRow | null;
    currentLiveTray?: BambuLiveObservedTray | null;
  } = {},
): SlotCatalogOnboardingSaveState {
  const openState = buildSlotCatalogOnboardingOpenState(prompt.slot, prompt.liveTray, options);
  let reason: SlotCatalogOnboardingSaveBlockReason | null = openState.reason;
  if (
    !reason &&
    prompt.ownershipType === "BORROWED_IN" &&
    !prompt.borrowedFromName.trim()
  ) {
    reason = "borrowed_owner_required";
  }

  return {
    disabled: Boolean(reason),
    reason,
    observedRfid: openState.observedRfid,
  };
}

export function buildSlotCatalogOnboardingCreateRequest(
  prompt: SlotCatalogOnboardingPrompt,
  input: {
    id: string;
    busy?: boolean;
    currentSlot?: PrinterAmsSlotRow | null;
    currentLiveTray?: BambuLiveObservedTray | null;
    observedAtFallback?: string | null;
  },
): SlotCatalogOnboardingCreateRequest {
  const saveState = buildSlotCatalogOnboardingSaveState(prompt, input);
  if (saveState.reason) {
    return { ok: false, error: saveState.reason };
  }

  const request = buildInventoryCreateSpoolRequest({
    id: input.id,
    mode: "bambu",
    selectedBambuMaster: prompt.master,
    selectedEsunMaster: null,
    initialWeightRaw: prompt.initialWeight,
    ownershipType: prompt.ownershipType,
    borrowedFromName: prompt.borrowedFromName,
    borrowedFromContact: prompt.borrowedFromContact,
    borrowedInNote: prompt.borrowedInNote,
    location: prompt.location,
  });
  if (!request.ok) {
    return { ok: false, error: request.error };
  }
  if (request.kind !== "catalog") {
    return { ok: false, error: "BAMBU_MASTER_REQUIRED" };
  }

  return {
    ok: true,
    request,
    observedRfid: saveState.observedRfid,
    rfidObservedAt: resolveLiveRfidObservedAt({
      liveTray: prompt.liveTray,
      currentLiveTray: input.currentLiveTray,
      observedAtFallback: input.observedAtFallback ?? prompt.observedAt,
    }),
  };
}

export function buildSavedRfidPrinterSlotAssignment(
  printerId: string,
  slot: PrinterAmsSlotRow,
  spoolId: string,
): AssignPrinterSlotInput {
  return {
    printer_id: printerId,
    slot_id: slot.slot_id,
    spool_id: spoolId,
    rfid_override_tray_uuid: null,
    rfid_override_color_hex: null,
    clear_live_cache_before_next_refresh: false,
  };
}

export function buildSlotCatalogOnboardingPostCreateWrites(input: {
  printerId: string;
  slot: PrinterAmsSlotRow;
  createdSpoolId: string;
  observedRfid: string;
  rfidObservedAt: string;
}): SlotCatalogOnboardingPostCreateWrites {
  return {
    rfidInput: {
      spool_id: input.createdSpoolId,
      rfid_tag: input.observedRfid,
      rfid_observed_at: input.rfidObservedAt,
    },
    assignInput: buildSavedRfidPrinterSlotAssignment(
      input.printerId,
      input.slot,
      input.createdSpoolId,
    ),
  };
}

export function buildLiveRfidCandidateRegistrationState(
  slot: PrinterAmsSlotRow,
  liveTray: BambuLiveObservedTray,
  row: SpoolWithMasterRow,
  options: {
    busy?: boolean;
    currentSlot?: PrinterAmsSlotRow | null;
    currentLiveTray?: BambuLiveObservedTray | null;
  } = {},
): LiveRfidCandidateRegistrationState {
  const observedRfid = liveTrayIdentity(liveTray);
  const slotForSafety = options.currentSlot ?? slot;
  let reason: LiveRfidCandidateRegistrationBlockReason | null = null;
  if (options.busy) {
    reason = "busy";
  } else if (!observedRfid) {
    reason = "missing_rfid";
  } else if (!liveTrayLoadedForSafety(liveTray, options)) {
    reason = "live_slot_unloaded";
  } else if (liveIdentityChanged(liveTray, options)) {
    reason = "live_identity_changed";
  } else if (row.spool.rfid_tag?.trim()) {
    reason = "candidate_has_rfid";
  } else if (!rowCanReceiveLiveBambuRfid(row)) {
    reason = "candidate_unavailable";
  } else if (slotForSafety.spool_id && slotForSafety.spool_id !== row.spool.id) {
    reason = "select_candidate_first";
  }

  return {
    disabled: Boolean(reason),
    reason,
    observedRfid,
    slot: slotForSafety,
  };
}

export function preparePrinterSlotAssignment(
  printerId: string,
  slot: PrinterAmsSlotRow,
  targetSpoolId: string | null | undefined,
  liveTray: BambuLiveObservedTray | null,
): PreparedPrinterSlotAssignment {
  const currentSpoolId = slot.spool_id ?? null;
  const normalizedTargetSpoolId = targetSpoolId?.trim() || null;
  const isExtSlot = (slot.ams_id ?? "").endsWith("_ext");
  const hasChange = currentSpoolId !== normalizedTargetSpoolId;
  const nextUnknownOverride =
    normalizedTargetSpoolId && !isExtSlot && isUnknownLiveRfid(liveTray)
      ? {
          trayUuid: liveTrayIdentity(liveTray),
          colorHex: liveTray?.color_hex?.trim() ?? "",
        }
      : null;
  const clearLiveCacheBeforeNextRefresh = !normalizedTargetSpoolId && !isExtSlot && !!currentSpoolId;
  const currentOverrideTrayUuid = (slot.rfid_override_tray_uuid ?? "").trim();
  const currentOverrideColorHex = (slot.rfid_override_color_hex ?? "").trim();
  const overrideChanged =
    currentOverrideTrayUuid !== (nextUnknownOverride?.trayUuid ?? "") ||
    currentOverrideColorHex !== (nextUnknownOverride?.colorHex ?? "");

  return {
    currentSpoolId,
    targetSpoolId: normalizedTargetSpoolId,
    hasChange,
    overrideChanged,
    shouldAssignSlot: hasChange || overrideChanged,
    assignInput: {
      printer_id: printerId,
      slot_id: slot.slot_id,
      spool_id: normalizedTargetSpoolId,
      rfid_override_tray_uuid: nextUnknownOverride?.trayUuid || null,
      rfid_override_color_hex: nextUnknownOverride?.colorHex || null,
      clear_live_cache_before_next_refresh: clearLiveCacheBeforeNextRefresh,
    },
  };
}

export function prepareMeasuredWeightUpdate(
  previousRemaining: number | null | undefined,
  measuredTotalWeight: number,
  tareWeight: number,
): PreparedMeasuredWeightUpdate {
  const safeMeasuredTotal = Math.max(0, Math.round(measuredTotalWeight));
  const safeTareWeight = Math.max(0, Math.round(tareWeight));
  const measuredFilament = Math.max(0, safeMeasuredTotal - safeTareWeight);
  const baseline =
    previousRemaining != null && Number.isFinite(previousRemaining)
      ? Math.max(0, Math.round(previousRemaining))
      : null;
  const usedGrams = baseline != null ? Math.max(0, baseline - measuredFilament) : 0;

  return {
    safeMeasuredTotal,
    safeTareWeight,
    measuredFilament,
    baseline,
    usedGrams,
    clientAction: baseline != null && usedGrams > 0 ? "record_usage" : "update_weight",
    localAction:
      baseline != null
        ? usedGrams > 0
          ? "record_usage"
          : measuredFilament !== baseline
            ? "update_weight"
            : "none"
        : "update_weight",
  };
}
