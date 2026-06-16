import type {
  AssignPrinterSlotInput,
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "./tauri_client";
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

export type PreparedPrinterSlotAssignment = {
  currentSpoolId: string | null;
  targetSpoolId: string | null;
  hasChange: boolean;
  overrideChanged: boolean;
  shouldAssignSlot: boolean;
  assignInput: AssignPrinterSlotInput;
};

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
    const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
    if (
      status === "EMPTY" ||
      status === "LOST" ||
      status === "MISSING" ||
      (status === "BORROWED" && ownershipType !== "BORROWED_IN")
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
