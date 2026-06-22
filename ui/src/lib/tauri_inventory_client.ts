import { invoke } from "./tauri_invoke";
import type { ActiveSpoolLoanRow } from "./tauri_loan_client";
import type { ImportDataStats } from "./tauri_maintenance_client";

export type SpoolRow = {
  id: string;
  master_id: string;
  qr_code?: string | null;
  rfid_tag?: string | null;
  rfid_observed_at?: string | null;
  status: string;
  ownership_type?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  ownership_note?: string | null;
  initial_weight_g?: number | null;
  current_weight_g?: number | null;
  remaining_g?: number | null;
  spool_tare_weight_g?: number | null;
  location_id?: string | null;
  home_location_id?: string | null;
};

export type SpoolHistoryEventRow = {
  id: string;
  spool_id: string;
  event_type: string;
  payload_json: unknown;
  created_at: string;
};

export type SpoolUsagePointRow = {
  captured_at: string;
  grams: number;
  source: string;
};

export type MasterRow = {
  id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  default_weight: number;
  vendor: string;
};

export type SpoolWithMasterRow = {
  spool: SpoolRow;
  master: MasterRow;
};

export type CreateSpoolInput = {
  id: string;
  master_id: string;
  qr_code?: string | null;
  status: string;
  ownership_type?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  ownership_note?: string | null;
  initial_weight_g?: number | null;
  current_weight_g?: number | null;
  location_id?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  batch_code?: string | null;
};

export type CreateManualSpoolInput = {
  id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  vendor?: string | null;
  default_weight_g?: number | null;
  qr_code?: string | null;
  status?: string | null;
  ownership_type?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  ownership_note?: string | null;
  initial_weight_g?: number | null;
  location?: string | null;
};

export type UpdateSpoolDetailsInput = {
  spool_id: string;
  qr_code?: string | null;
  status: string;
  location?: string | null;
  home_location?: string | null;
};

export type UpdateSpoolRfidTagInput = {
  spool_id: string;
  rfid_tag?: string | null;
  rfid_observed_at?: string | null;
};

export type UpdateSpoolOwnershipInput = {
  spool_id: string;
  ownership_type: "OWNED" | "BORROWED_IN" | string;
  owner_name?: string | null;
  owner_contact?: string | null;
  ownership_note?: string | null;
};

export type DeleteSpoolInput = {
  spool_id: string;
  reason?: string | null;
};

export type PurgeSpoolInput = {
  spool_id: string;
  reason?: string | null;
};

export type InventoryOverview = {
  total_spools: number;
  total_owned_spools: number;
  total_borrowed_in_spools: number;
  in_use: number;
  owned_in_use: number;
  borrowed_in_in_use: number;
  low_stock: number;
  owned_low_stock: number;
  borrowed_in_low_stock: number;
  total_consumption_30d: number;
  owned_consumption_30d: number;
  borrowed_in_consumption_30d: number;
};

export type CompanionSpoolDetail = {
  spool: SpoolWithMasterRow;
  history: SpoolHistoryEventRow[];
  usage: SpoolUsagePointRow[];
  active_loan?: ActiveSpoolLoanRow | null;
};

export async function listSpools(limit = 100, offset = 0) {
  return invoke<SpoolWithMasterRow[]>("list_spools", { limit, offset });
}

export async function createSpool(input: CreateSpoolInput) {
  return invoke<void>("create_spool", { input });
}

export function buildLibrarySyncHostSpoolCreatePayload(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreateSpoolInput | CreateManualSpoolInput,
) {
  const normalizedLocation =
    ("location" in input ? input.location : undefined) ??
    ("location_id" in input ? input.location_id : undefined) ??
    null;
  return {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      master_id: "master_id" in input ? input.master_id ?? null : null,
      material: "material" in input ? input.material : null,
      filament_name: "filament_name" in input ? input.filament_name : null,
      color_name: "color_name" in input ? input.color_name : null,
      vendor: "vendor" in input ? input.vendor ?? null : null,
      initial_weight_g: input.initial_weight_g ?? null,
      location: normalizedLocation,
      hex_color: "hex_color" in input ? input.hex_color ?? null : null,
      ownership_type: input.ownership_type ?? null,
      owner_name: input.owner_name ?? null,
      owner_contact: input.owner_contact ?? null,
      ownership_note: input.ownership_note ?? null,
    },
  };
}

export async function createLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreateSpoolInput | CreateManualSpoolInput,
) {
  return invoke<string>(
    "create_library_sync_host_spool",
    buildLibrarySyncHostSpoolCreatePayload(baseUrl, expectedLibraryId, input),
  );
}

export async function createManualSpool(input: CreateManualSpoolInput) {
  return invoke<void>("create_manual_spool", { input });
}

export async function updateSpoolWeight(spoolId: string, grams: number) {
  return invoke<void>("update_spool_weight", {
    spoolId,
    grams,
    source: "MANUAL",
  });
}

export async function updateSpoolTareWeight(spoolId: string, grams: number) {
  return invoke<void>("update_spool_tare_weight", {
    spoolId,
    grams,
  });
}

export async function updateLibrarySyncHostSpoolWeight(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  spoolId: string,
  grams: number,
) {
  return invoke<void>("update_library_sync_host_spool_weight", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: spoolId,
      grams,
    },
  });
}

export async function updateLibrarySyncHostSpoolTareWeight(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  spoolId: string,
  grams: number,
) {
  return invoke<void>("update_library_sync_host_spool_tare_weight", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: spoolId,
      grams,
    },
  });
}

export async function updateLibrarySyncHostSpoolDetails(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateSpoolDetailsInput,
) {
  const payload: Record<string, unknown> = {
    base_url: baseUrl,
    expected_library_id: expectedLibraryId ?? null,
    spool_id: input.spool_id,
    qr_code: input.qr_code ?? null,
    status: input.status,
  };
  if (input.location !== undefined) {
    payload.location = input.location;
  }
  if (input.home_location !== undefined) {
    payload.home_location = input.home_location;
  }

  return invoke<void>("update_library_sync_host_spool_details", {
    input: payload,
  });
}

export async function updateLibrarySyncHostSpoolOwnership(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateSpoolOwnershipInput,
) {
  return invoke<void>("update_library_sync_host_spool_ownership", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input.spool_id,
      ownership_type: input.ownership_type,
      owner_name: input.owner_name ?? null,
      owner_contact: input.owner_contact ?? null,
      ownership_note: input.ownership_note ?? null,
    },
  });
}

export async function updateLibrarySyncHostSpoolRfidTag(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateSpoolRfidTagInput,
) {
  return invoke<void>("update_library_sync_host_spool_rfid_tag", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input.spool_id,
      rfid_tag: input.rfid_tag ?? null,
      rfid_observed_at: input.rfid_observed_at ?? null,
    },
  });
}

export async function updateSpoolStatus(spoolId: string, status: string) {
  return invoke<void>("update_spool_status", {
    spoolId,
    status,
  });
}

export async function updateSpoolDetails(input: UpdateSpoolDetailsInput) {
  return invoke<void>("update_spool_details", { input });
}

export async function updateSpoolOwnership(input: UpdateSpoolOwnershipInput) {
  return invoke<void>("update_spool_ownership", { input });
}

export async function updateSpoolRfidTag(input: UpdateSpoolRfidTagInput) {
  return invoke<void>("update_spool_rfid_tag", { input });
}

export async function deleteSpool(input: DeleteSpoolInput) {
  return invoke<void>("delete_spool", { input });
}

export async function deleteLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId?: string | null,
  input?: DeleteSpoolInput,
) {
  return invoke<void>("delete_library_sync_host_spool", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input?.spool_id,
      reason: input?.reason ?? null,
    },
  });
}

export async function purgeSpool(input: PurgeSpoolInput) {
  return invoke<void>("purge_spool", { input });
}

export async function purgeLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId?: string | null,
  input?: PurgeSpoolInput,
) {
  return invoke<void>("purge_library_sync_host_spool", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input?.spool_id,
      reason: input?.reason ?? null,
    },
  });
}

export async function listSpoolHistory(spoolId: string, limit = 50) {
  return invoke<SpoolHistoryEventRow[]>("list_spool_history", {
    spoolId,
    limit,
  });
}

export async function listSpoolUsage(spoolId: string, limit = 300) {
  return invoke<SpoolUsagePointRow[]>("list_spool_usage", {
    spoolId,
    limit,
  });
}

export async function assignSpoolLocation(spoolId: string, locationName: string | null) {
  return invoke<void>("assign_location", {
    spoolId,
    locationId: locationName,
  });
}

export async function printLabelHtml(
  html: string,
  printerName?: string | null,
  copies?: number | null,
) {
  return invoke<void>("print_label_html", {
    html,
    printerName,
    copies,
  });
}

export async function printLabelPdf(
  pdfBase64: string,
  printerName?: string | null,
  copies?: number | null,
) {
  return invoke<void>("print_label_pdf", {
    pdfBase64,
    pdf_base64: pdfBase64,
    printerName,
    copies,
  });
}

export async function inventoryOverview() {
  return invoke<InventoryOverview>("inventory_overview");
}

export async function exportInventoryCsv() {
  return invoke<{ content: string }>("export_inventory_csv");
}

export async function exportInventoryJson() {
  return invoke<{ content: string }>("export_inventory_json");
}

export async function importDataFile(content: string) {
  return invoke<ImportDataStats>("import_data_file", { content });
}
