import type {
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "./tauri_client";

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

function defaultSpoolTareWeightForVendor(vendor?: string | null): number {
  const normalized = (vendor ?? "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

export function resolveSpoolTareWeightForRow(row?: SpoolWithMasterRow | null): number {
  if (!row) {
    return 0;
  }
  const explicit = row.spool.spool_tare_weight_g;
  if (explicit != null && Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(row.master.vendor);
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
    outgoingWeight:
      slot.spool_remaining_g != null
        ? String(Math.max(0, slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id)))
        : "",
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
