import { normalizeSwatchValue } from "./color_utils";
import type { OwnershipType } from "./inventory_list_model";
import type { CreateManualSpoolInput, CreateSpoolInput, MasterCatalogRow } from "./tauri_client";
import { parsePositiveWeight } from "./weight_display";

export type InventoryCreateMode = "bambu" | "esun" | "manual";

export function isInventoryCatalogCreateMode(mode: InventoryCreateMode): boolean {
  return mode === "bambu" || mode === "esun";
}

export function activeCatalogMastersForMode(
  mode: InventoryCreateMode,
  bambuMasters: MasterCatalogRow[],
  esunMasters: MasterCatalogRow[],
): MasterCatalogRow[] {
  if (mode === "bambu") {
    return bambuMasters;
  }
  if (mode === "esun") {
    return esunMasters;
  }
  return [];
}

export function selectedCatalogMasterForMode(
  mode: InventoryCreateMode,
  selectedBambuMaster: MasterCatalogRow | null,
  selectedEsunMaster: MasterCatalogRow | null,
): MasterCatalogRow | null {
  if (mode === "bambu") {
    return selectedBambuMaster;
  }
  if (mode === "esun") {
    return selectedEsunMaster;
  }
  return null;
}

export function currentCreateSwatchHexForMode(input: {
  mode: InventoryCreateMode;
  manualHexColor?: string | null;
  selectedCatalogMaster?: MasterCatalogRow | null;
}): string | null {
  if (input.mode === "manual") {
    return normalizeSwatchValue(input.manualHexColor, { uppercase: true });
  }
  return input.selectedCatalogMaster?.hex_color ?? null;
}

export function isInventoryCreateDisabled(input: {
  tauriAvailable: boolean;
  busy: boolean;
  mode: InventoryCreateMode;
  selectedBambuMaster?: MasterCatalogRow | null;
  selectedEsunMaster?: MasterCatalogRow | null;
  manualFilamentName?: string | null;
  manualColorName?: string | null;
  ownershipType: OwnershipType;
  borrowedFromName?: string | null;
}): boolean {
  if (!input.tauriAvailable || input.busy) {
    return true;
  }
  if (input.mode === "bambu") {
    return !input.selectedBambuMaster;
  }
  if (input.mode === "esun") {
    return !input.selectedEsunMaster;
  }
  if (!(input.manualFilamentName ?? "").trim() || !(input.manualColorName ?? "").trim()) {
    return true;
  }
  return input.ownershipType === "BORROWED_IN" && !(input.borrowedFromName ?? "").trim();
}

export function formatInventoryCreateAddedLabel(input: {
  mode: InventoryCreateMode;
  selectedBambuMaster?: MasterCatalogRow | null;
  selectedEsunMaster?: MasterCatalogRow | null;
  manualFilamentName?: string | null;
  manualColorName?: string | null;
}): string {
  const master = selectedCatalogMasterForMode(
    input.mode,
    input.selectedBambuMaster ?? null,
    input.selectedEsunMaster ?? null,
  );
  if (master) {
    return `${master.filament_name} · ${master.color_name}`;
  }
  return `${(input.manualFilamentName ?? "").trim()} · ${(input.manualColorName ?? "").trim()}`;
}

export type InventoryCreateSpoolError =
  | "BORROWED_OWNER_REQUIRED"
  | "BAMBU_MASTER_REQUIRED"
  | "ESUN_MASTER_REQUIRED"
  | "MANUAL_FIELDS_REQUIRED";

export type InventoryCreateBatchError = InventoryCreateSpoolError | "BATCH_EMPTY";

export type InventoryCreateSpoolRequest =
  | {
      ok: true;
      kind: "catalog";
      input: CreateSpoolInput;
      addedLabel: string;
    }
  | {
      ok: true;
      kind: "manual";
      input: CreateManualSpoolInput;
      addedLabel: string;
    }
  | {
      ok: false;
      error: InventoryCreateSpoolError;
    };

export type InventoryCreateCatalogBatchRequest =
  | {
      ok: true;
      requests: Array<{
        input: CreateSpoolInput;
        addedLabel: string;
      }>;
    }
  | {
      ok: false;
      error: InventoryCreateBatchError;
    };

export function buildInventoryCreateSpoolRequest(input: {
  id: string;
  mode: InventoryCreateMode;
  selectedBambuMaster?: MasterCatalogRow | null;
  selectedEsunMaster?: MasterCatalogRow | null;
  manualVendor?: string | null;
  manualMaterial?: string | null;
  manualFilamentName?: string | null;
  manualColorName?: string | null;
  manualHexColor?: string | null;
  initialWeightRaw: string;
  ownershipType: OwnershipType;
  borrowedFromName?: string | null;
  borrowedFromContact?: string | null;
  borrowedInNote?: string | null;
  location?: string | null;
}): InventoryCreateSpoolRequest {
  const ownerName = (input.borrowedFromName ?? "").trim();
  if (input.ownershipType === "BORROWED_IN" && !ownerName) {
    return { ok: false, error: "BORROWED_OWNER_REQUIRED" };
  }

  const ownerContact = (input.borrowedFromContact ?? "").trim();
  const ownershipNote = (input.borrowedInNote ?? "").trim();
  const ownershipFields = {
    ownership_type: input.ownershipType,
    owner_name: ownerName || null,
    owner_contact: ownerContact || null,
    ownership_note: ownershipNote || null,
  };

  const location = (input.location ?? "").trim() || null;

  if (input.mode === "bambu" || input.mode === "esun") {
    const master =
      input.mode === "bambu" ? input.selectedBambuMaster : input.selectedEsunMaster;
    if (!master) {
      return {
        ok: false,
        error: input.mode === "bambu" ? "BAMBU_MASTER_REQUIRED" : "ESUN_MASTER_REQUIRED",
      };
    }
    const initialWeight = parsePositiveWeight(input.initialWeightRaw, master.default_weight);
    return {
      ok: true,
      kind: "catalog",
      addedLabel: `${master.filament_name} · ${master.color_name}`,
      input: {
        id: input.id,
        master_id: master.id,
        qr_code: null,
        status: "IN_STOCK",
        ...ownershipFields,
        initial_weight_g: initialWeight,
        current_weight_g: initialWeight,
        location_id: location,
        purchase_date: null,
        purchase_price: null,
        batch_code: null,
      },
    };
  }

  const filamentName = (input.manualFilamentName ?? "").trim();
  const colorName = (input.manualColorName ?? "").trim();
  if (!filamentName || !colorName) {
    return { ok: false, error: "MANUAL_FIELDS_REQUIRED" };
  }
  const initialWeight = parsePositiveWeight(input.initialWeightRaw, 1000);
  return {
    ok: true,
    kind: "manual",
    addedLabel: `${filamentName} · ${colorName}`,
    input: {
      id: input.id,
      vendor: (input.manualVendor ?? "").trim() || "Generic",
      material: (input.manualMaterial ?? "").trim() || "PLA",
      filament_name: filamentName,
      color_name: colorName,
      hex_color: normalizeSwatchValue(input.manualHexColor, { uppercase: true }),
      product_url: null,
      default_weight_g: initialWeight,
      qr_code: null,
      status: "IN_STOCK",
      ...ownershipFields,
      initial_weight_g: initialWeight,
      location,
    },
  };
}

export function buildBambuCatalogBatchCreateRequests(input: {
  idPrefix: string;
  selectedMasters: MasterCatalogRow[];
  initialWeightRaw: string;
  ownershipType: OwnershipType;
  borrowedFromName?: string | null;
  borrowedFromContact?: string | null;
  borrowedInNote?: string | null;
  location?: string | null;
}): InventoryCreateCatalogBatchRequest {
  if (input.selectedMasters.length === 0) {
    return { ok: false, error: "BATCH_EMPTY" };
  }

  const requests: Array<{
    input: CreateSpoolInput;
    addedLabel: string;
  }> = [];
  for (const [index, master] of input.selectedMasters.entries()) {
    const request = buildInventoryCreateSpoolRequest({
      id: `${input.idPrefix}_${index + 1}`,
      mode: "bambu",
      selectedBambuMaster: master,
      initialWeightRaw: input.initialWeightRaw,
      ownershipType: input.ownershipType,
      borrowedFromName: input.borrowedFromName,
      borrowedFromContact: input.borrowedFromContact,
      borrowedInNote: input.borrowedInNote,
      location: input.location,
    });
    if (!request.ok) {
      return request;
    }
    if (request.kind !== "catalog") {
      return { ok: false, error: "BAMBU_MASTER_REQUIRED" };
    }
    requests.push({
      input: request.input,
      addedLabel: request.addedLabel,
    });
  }

  return { ok: true, requests };
}
