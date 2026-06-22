import { invoke } from "./tauri_invoke";

export type PrinterRow = {
  id: string;
  model: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type PrinterUsageRow = {
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  total_used_g: number;
  last_job_at?: string | null;
};

export type PrinterAmsSlotRow = {
  slot_id: string;
  ams_id: string;
  slot_index: number;
  spool_id?: string | null;
  spool_status?: string | null;
  spool_ownership_type?: string | null;
  spool_owner_name?: string | null;
  spool_remaining_g?: number | null;
  spool_rfid_tag?: string | null;
  spool_material?: string | null;
  spool_filament_name?: string | null;
  spool_color_name?: string | null;
  spool_hex_color?: string | null;
  rfid_override_tray_uuid?: string | null;
  rfid_override_color_hex?: string | null;
  live_cache_cleared_at?: string | null;
  live_loaded?: boolean | null;
  live_observed_rfid_tag?: string | null;
  live_tray_uuid?: string | null;
  live_chip_id?: string | null;
  live_tray_info_idx?: string | null;
  live_tray_id_name?: string | null;
  live_nozzle_temp_min_c?: number | null;
  live_nozzle_temp_max_c?: number | null;
  live_filament_type?: string | null;
  live_filament_name?: string | null;
  live_color_hex?: string | null;
  live_tray_weight_g?: number | null;
  live_remaining_percent?: number | null;
  live_last_identity_seen_at?: string | null;
  live_match_status?: string | null;
  live_match_note?: string | null;
  live_matched_inventory_spool_id?: string | null;
  live_matched_inventory_mode?: string | null;
  live_is_active?: boolean | null;
  live_progress_percent?: number | null;
  live_remaining_minutes?: number | null;
  live_nozzle_temp_c?: number | null;
  live_bed_temp_c?: number | null;
  live_ams_humidity_index?: number | null;
  live_ams_temperature_c?: number | null;
  live_printer_last_seen_at?: string | null;
  live_mqtt_connected?: boolean | null;
  live_ams_exist_bits?: string | null;
  live_ams_read_done_bits?: string | null;
  live_ams_bambu_bits?: string | null;
};

export type PrinterOverviewRow = {
  printer: PrinterRow;
  usage: PrinterUsageRow;
  slots: PrinterAmsSlotRow[];
};

export type BambuLiveObservedTray = {
  ams_index?: number | null;
  tray_index: number;
  loaded: boolean;
  filament_type?: string | null;
  filament_name?: string | null;
  color_hex?: string | null;
  tray_weight_g?: number | null;
  remaining_percent?: number | null;
  remaining_grams?: number | null;
  observed_rfid_tag?: string | null;
  tray_uuid?: string | null;
  chip_id?: string | null;
  tray_info_idx?: string | null;
  tray_id_name?: string | null;
  nozzle_temp_min_c?: number | null;
  nozzle_temp_max_c?: number | null;
  last_identity_seen_at?: string | null;
  last_empty_seen_at?: string | null;
  empty_observation_count?: number | null;
  matched_inventory_spool_id?: string | null;
  matched_inventory_mode?: string | null;
  match_status?: string | null;
  match_note?: string | null;
};

export type BambuLiveObservedState = {
  online: boolean;
  last_seen_at?: string | null;
  mqtt_connected: boolean;
  progress_percent?: number | null;
  remaining_minutes?: number | null;
  prepare_percent?: number | null;
  print_stage?: number | null;
  print_error_code?: number | null;
  job_state_code?: number | null;
  gcode_state?: string | null;
  print_type?: string | null;
  subtask_id?: string | null;
  subtask_name?: string | null;
  active_ams_index?: number | null;
  active_tray_index?: number | null;
  nozzle_temp_c?: number | null;
  bed_temp_c?: number | null;
  ams_humidity_index?: number | null;
  ams_temperature_c?: number | null;
  ams_reading_bits?: string | null;
  ams_exist_bits?: string | null;
  ams_read_done_bits?: string | null;
  ams_bambu_bits?: string | null;
  ams_status_code?: number | null;
  ams_status_main?: number | null;
  ams_status_sub?: number | null;
  raw_status_note?: string | null;
  raw_payload_json?: unknown;
  trays: BambuLiveObservedTray[];
};

export type BambuLiveIntegrationSettings = {
  enabled: boolean;
  host?: string | null;
  access_code?: string | null;
  printer_serial?: string | null;
  last_error?: string | null;
  observed_state?: BambuLiveObservedState | null;
};

export type BambuLiveIntegrationEntry = {
  printer_id: string;
  config: BambuLiveIntegrationSettings;
};

export type PrinterSettingsSnapshot = {
  active_printer_id?: string | null;
  printers: PrinterRow[];
  printer_models: string[];
  bambu_live_integrations: BambuLiveIntegrationEntry[];
};

export type CreatePrinterInput = {
  id: string;
  model: string;
  name: string;
  ams_units?: number | null;
  slots_per_ams?: number | null;
};

export type SaveBambuLiveIntegrationInput = {
  printer_id: string;
  enabled: boolean;
  host?: string | null;
  access_code?: string | null;
  printer_serial?: string | null;
};

export type AssignPrinterSlotInput = {
  printer_id: string;
  slot_id: string;
  spool_id?: string | null;
  rfid_override_tray_uuid?: string | null;
  rfid_override_color_hex?: string | null;
  clear_live_cache_before_next_refresh?: boolean | null;
};

export type RecordPrintUsageInput = {
  printer_id: string;
  spool_id: string;
  grams: number;
  job_name?: string | null;
  success?: boolean | null;
};

export async function getPrinterSettings() {
  return invoke<PrinterSettingsSnapshot>("get_printer_settings");
}

export async function listPrinterOverview() {
  return invoke<PrinterOverviewRow[]>("list_printer_overview");
}

export async function createPrinter(input: CreatePrinterInput) {
  return invoke<void>("create_printer", { input });
}

export async function saveBambuLiveIntegration(input: SaveBambuLiveIntegrationInput) {
  return invoke<void>("save_bambu_live_integration", { input });
}

export async function saveLibrarySyncHostBambuLiveIntegration(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: SaveBambuLiveIntegrationInput,
) {
  return invoke<void>("save_library_sync_host_bambu_live_integration", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      printer_id: input.printer_id,
      enabled: input.enabled,
      host: input.host ?? null,
      access_code: input.access_code ?? null,
      printer_serial: input.printer_serial ?? null,
    },
  });
}

export async function deleteBambuLiveIntegration(printerId: string) {
  return invoke<void>("delete_bambu_live_integration", {
    printerId,
    printer_id: printerId,
  });
}

export async function deleteLibrarySyncHostBambuLiveIntegration(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  printerId: string,
) {
  return invoke<void>("delete_library_sync_host_bambu_live_integration", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      printer_id: printerId,
    },
  });
}

export async function createLibrarySyncHostPrinter(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreatePrinterInput,
) {
  return invoke<void>("create_library_sync_host_printer", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      id: input.id,
      model: input.model,
      name: input.name,
      ams_units: input.ams_units ?? null,
      slots_per_ams: input.slots_per_ams ?? null,
    },
  });
}

export async function deletePrinter(printerId: string) {
  return invoke<void>("delete_printer", {
    printerId,
    printer_id: printerId,
  });
}

export async function deleteLibrarySyncHostPrinter(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  printerId: string,
) {
  return invoke<void>("delete_library_sync_host_printer", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      printer_id: printerId,
    },
  });
}

export async function setActivePrinter(printerId?: string | null) {
  return invoke<void>("set_active_printer", { printerId: printerId ?? null });
}

export async function assignPrinterSlot(input: AssignPrinterSlotInput) {
  return invoke<void>("assign_printer_slot", { input });
}

export async function assignLibrarySyncHostPrinterSlot(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: AssignPrinterSlotInput,
) {
  return invoke<void>("assign_library_sync_host_printer_slot", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      printer_id: input.printer_id,
      slot_id: input.slot_id,
      spool_id: input.spool_id ?? null,
      rfid_override_tray_uuid: input.rfid_override_tray_uuid ?? null,
      rfid_override_color_hex: input.rfid_override_color_hex ?? null,
      clear_live_cache_before_next_refresh: input.clear_live_cache_before_next_refresh ?? false,
    },
  });
}

export async function recordPrintUsage(input: RecordPrintUsageInput) {
  return invoke<void>("record_print_usage", { input });
}

export async function recordLibrarySyncHostPrintUsage(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: RecordPrintUsageInput,
) {
  return invoke<void>("record_library_sync_host_print_usage", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      printer_id: input.printer_id,
      spool_id: input.spool_id,
      grams: input.grams,
      job_name: input.job_name ?? null,
      success: input.success,
    },
  });
}
