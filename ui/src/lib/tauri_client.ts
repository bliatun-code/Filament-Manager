export type SpoolRow = {
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
  remaining_g?: number | null;
  spool_tare_weight_g?: number | null;
  location_id?: string | null;
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

export type WishlistItemRow = {
  id: string;
  master_id?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor: string;
  status: string;
  quantity: number;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

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
  spool_material?: string | null;
  spool_filament_name?: string | null;
  spool_color_name?: string | null;
  spool_hex_color?: string | null;
};

export type PrinterOverviewRow = {
  printer: PrinterRow;
  usage: PrinterUsageRow;
  slots: PrinterAmsSlotRow[];
};

export type PrinterSettingsSnapshot = {
  active_printer_id?: string | null;
  printers: PrinterRow[];
  printer_models: string[];
};

export type TrustedLanCompanionStatus = {
  enabled: boolean;
  selected_interface_name?: string | null;
  selected_interface_address?: string | null;
  bind_address?: string | null;
  base_url?: string | null;
  shell_url?: string | null;
  listen_port: number;
  shell_reachable: boolean;
  health_error?: string | null;
  running: boolean;
  last_error?: string | null;
  api_version: string;
  auth_mode: string;
};

export type TrustedLanInterfaceOption = {
  name: string;
  address: string;
  label: string;
};

export type UpdateTrustedLanCompanionConfigInput = {
  enabled: boolean;
  selected_interface_name?: string | null;
  selected_interface_address?: string | null;
  listen_port?: number | null;
};

export type LibrarySyncSettings = {
  mode: string;
  device_name: string;
  library_id: string;
  host_base_url?: string | null;
  host_device_name?: string | null;
  client_auth_paired: boolean;
  client_auth_paired_at?: string | null;
  client_auth_expires_at?: string | null;
  last_checked_at?: string | null;
  last_reachable_at?: string | null;
  last_validation_message?: string | null;
  cached_snapshot?: LibrarySyncRemoteSnapshot | null;
  cached_spools?: LibrarySyncCachedSpoolList | null;
  cached_printers?: LibrarySyncCachedPrinterOverview | null;
  cached_loans?: LibrarySyncCachedLoanList | null;
};

export type LibrarySyncHostValidationResult = {
  base_url: string;
  reachable: boolean;
  ok: boolean;
  matches_library_id: boolean;
  api_version?: string | null;
  auth_mode?: string | null;
  access_mode?: string | null;
  library_id?: string | null;
  device_name?: string | null;
  sync_mode?: string | null;
  message: string;
};

export type LibrarySyncRemoteSnapshot = {
  captured_at: string;
  library_id: string;
  device_name: string;
  sync_mode: string;
  inventory: InventoryOverview;
  total_spools: number;
  in_use: number;
  low_stock: number;
  active_loans: number;
  printers: number;
};

export type LibrarySyncCachedSpoolList = {
  captured_at: string;
  rows: SpoolWithMasterRow[];
};

export type LibrarySyncCachedPrinterOverview = {
  captured_at: string;
  rows: PrinterOverviewRow[];
};

export type LibrarySyncCachedLoanList = {
  captured_at: string;
  rows: SpoolLoanDetailsRow[];
};

export type TrustedLanPairingLink = {
  pairing_url: string;
  expires_in_seconds: number;
};

export type TrustedLanPairedBrowser = {
  id: string;
  display_name?: string | null;
  paired_at: string;
  last_seen_at?: string | null;
  last_origin?: string | null;
  revoked_at?: string | null;
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

export type MasterCatalogRow = {
  id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  default_weight: number;
  vendor: string;
  is_discontinued: boolean;
  discontinued_at?: string | null;
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
};

export type UpdateMasterCatalogEntryInput = {
  master_id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  vendor?: string | null;
  default_weight?: number | null;
};

export type DeleteSpoolInput = {
  spool_id: string;
  reason?: string | null;
};

export type PurgeSpoolInput = {
  spool_id: string;
  reason?: string | null;
};

export type CreateWishlistItemInput = {
  id: string;
  master_id?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor?: string | null;
  quantity?: number | null;
  note?: string | null;
};

export type CreatePrinterInput = {
  id: string;
  model: string;
  name: string;
  ams_units?: number | null;
  slots_per_ams?: number | null;
};

export type AssignPrinterSlotInput = {
  printer_id: string;
  slot_id: string;
  spool_id?: string | null;
};

export type RecordPrintUsageInput = {
  printer_id: string;
  spool_id: string;
  grams: number;
  job_name?: string | null;
  success?: boolean | null;
};

export type LendSpoolInput = {
  spool_id: string;
  borrower_name: string;
  grams_out?: number | null;
  note?: string | null;
};

export type ReturnSpoolLoanInput = {
  loan_id: string;
  returned_grams: number;
  note?: string | null;
};

export type UpdateWishlistStatusInput = {
  item_id: string;
  status: string;
};

export type EsunSearchResult = {
  handle: string;
  title: string;
  filament_name: string;
  material: string;
  product_url: string;
  image_url?: string | null;
  default_weight_g?: number | null;
  vendor: string;
};

export type EsunColorOption = {
  color_name: string;
  hex_color?: string | null;
};

export type EsunProductDetail = {
  handle: string;
  title: string;
  filament_name: string;
  material: string;
  product_url: string;
  image_url?: string | null;
  default_weight_g?: number | null;
  vendor: string;
  colors: EsunColorOption[];
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

export type MaterialUsageRow = {
  material: string;
  used_grams: number;
};

export type FilamentConsumptionRow = {
  printer_id?: string | null;
  printer_name?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  vendor: string;
  ownership_type: string;
  owner_name?: string | null;
  used_grams: number;
  jobs: number;
};

export type CatalogRefreshResult = {
  imported: number;
  detected_store?: string | null;
  detected_collection?: string | null;
  reactivated_count: number;
  discontinued_count: number;
  output: string;
};

export type CatalogResetStats = {
  removed_count: number;
  remaining_count: number;
  reactivated_count: number;
};

export type BackupValidationStats = {
  format: string;
  expected_tables: number;
  present_tables: number;
  total_rows: number;
  missing_tables: string[];
  extra_tables: string[];
};

export type ImportDataStats = {
  detected_format: string;
  imported_count: number;
  created_count: number;
  updated_count: number;
};

export type SpoolLoanRow = {
  id: string;
  spool_id: string;
  borrower_name: string;
  loan_direction?: string | null;
  loan_status?: string | null;
  counterparty_name?: string | null;
  counterparty_contact?: string | null;
  counterparty_note?: string | null;
  grams_out: number;
  lent_note?: string | null;
  lent_at: string;
  expected_return_at?: string | null;
  returned_at?: string | null;
  returned_grams?: number | null;
  consumed_grams?: number | null;
  return_note?: string | null;
};

export type ActiveSpoolLoanRow = {
  loan: SpoolLoanRow;
  spool_status: string;
  spool_remaining_g?: number | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor: string;
  hex_color?: string | null;
};

export type CompanionSpoolDetail = {
  spool: SpoolWithMasterRow;
  history: SpoolHistoryEventRow[];
  usage: SpoolUsagePointRow[];
  active_loan?: ActiveSpoolLoanRow | null;
};

export type LoanUsageByPersonRow = {
  loan_direction: string;
  borrower_name: string;
  total_consumed_g: number;
  completed_loans: number;
  active_loans: number;
};

export type SpoolLoanDetailsRow = {
  loan: SpoolLoanRow;
  spool_status?: string | null;
  spool_remaining_g?: number | null;
  spool_tare_weight_g?: number | null;
  material?: string | null;
  filament_name?: string | null;
  color_name?: string | null;
  vendor?: string | null;
  hex_color?: string | null;
};

export type CatalogRefreshProgressPayload = {
  vendor: string;
  phase: string;
  message: string;
};

declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;
    };
    __TAURI_INTERNALS__?: unknown;
  }
}

type InvokeFn = <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;

let cachedInvoke: InvokeFn | null = null;

function hasTauriRuntime(): boolean {
  return Boolean(window.__TAURI__?.invoke || window.__TAURI_INTERNALS__);
}

async function resolveInvoke(): Promise<InvokeFn> {
  if (cachedInvoke) {
    return cachedInvoke;
  }
  if (window.__TAURI__?.invoke) {
    cachedInvoke = window.__TAURI__.invoke.bind(window.__TAURI__);
    return cachedInvoke;
  }
  if (!hasTauriRuntime()) {
    throw new Error("Tauri API not available");
  }
  const mod = await import("@tauri-apps/api/core");
  cachedInvoke = mod.invoke;
  return cachedInvoke;
}

async function invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const invoker = await resolveInvoke();
  return invoker<T>(command, payload);
}

export function isTauri(): boolean {
  return hasTauriRuntime();
}

export async function listSpools(limit = 100, offset = 0) {
  return invoke<SpoolWithMasterRow[]>("list_spools", { limit, offset });
}

export async function listWishlistItems(limit = 500) {
  return invoke<WishlistItemRow[]>("list_wishlist_items", { limit });
}

export async function getPrinterSettings() {
  return invoke<PrinterSettingsSnapshot>("get_printer_settings");
}

export async function listPrinterOverview() {
  return invoke<PrinterOverviewRow[]>("list_printer_overview");
}

export async function getTrustedLanCompanionStatus() {
  return invoke<TrustedLanCompanionStatus>("get_trusted_lan_companion_status");
}

export async function getLibrarySyncSettings() {
  return invoke<LibrarySyncSettings>("get_library_sync_settings");
}

export async function saveLibrarySyncSettings(input: LibrarySyncSettings) {
  return invoke<LibrarySyncSettings>("save_library_sync_settings", { input });
}

export async function validateLibrarySyncHost(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<LibrarySyncHostValidationResult>("validate_library_sync_host", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
}

export async function fetchLibrarySyncSnapshot(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<LibrarySyncRemoteSnapshot>("fetch_library_sync_snapshot", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
}

export async function fetchLibrarySyncSpools(
  baseUrl: string,
  expectedLibraryId?: string | null,
  limit = 1200,
  offset = 0,
) {
  return invoke<SpoolWithMasterRow[]>("fetch_library_sync_spools", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      offset,
    },
  });
}

export async function fetchLibrarySyncSpoolDetail(
  baseUrl: string,
  expectedLibraryId?: string | null,
  spoolId?: string,
  historyLimit = 80,
  usageLimit = 500,
) {
  return invoke<CompanionSpoolDetail>("fetch_library_sync_spool_detail", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: spoolId,
      history_limit: historyLimit,
      usage_limit: usageLimit,
    },
  });
}

export async function fetchLibrarySyncPrinterOverview(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<PrinterOverviewRow[]>("fetch_library_sync_printer_overview", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
}

export async function fetchCachedLibrarySyncSpools() {
  return invoke<LibrarySyncCachedSpoolList | null>("fetch_cached_library_sync_spools");
}

export async function fetchCachedLibrarySyncPrinterOverview() {
  return invoke<LibrarySyncCachedPrinterOverview | null>(
    "fetch_cached_library_sync_printer_overview",
  );
}

export async function fetchLibrarySyncLoans(
  baseUrl: string,
  expectedLibraryId?: string | null,
  limit = 2000,
) {
  return invoke<SpoolLoanDetailsRow[]>("fetch_library_sync_loans", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      offset: 0,
    },
  });
}

export async function fetchLibrarySyncFilamentConsumption(
  baseUrl: string,
  expectedLibraryId?: string | null,
  limit = 500,
  printerId?: string | null,
) {
  return invoke<FilamentConsumptionRow[]>("fetch_library_sync_filament_consumption", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      printer_id: printerId ?? null,
    },
  });
}

export async function fetchCachedLibrarySyncLoans() {
  return invoke<LibrarySyncCachedLoanList | null>("fetch_cached_library_sync_loans");
}

export async function pairLibrarySyncHost(baseUrl: string, pairingTokenOrUrl: string) {
  return invoke<LibrarySyncSettings>("pair_library_sync_host", {
    input: {
      base_url: baseUrl,
      pairing_token_or_url: pairingTokenOrUrl,
    },
  });
}

export async function clearLibrarySyncClientAuth() {
  return invoke<LibrarySyncSettings>("clear_library_sync_client_auth");
}

export async function listTrustedLanInterfaces() {
  return invoke<TrustedLanInterfaceOption[]>("list_trusted_lan_interfaces");
}

export async function updateTrustedLanCompanionConfig(input: UpdateTrustedLanCompanionConfigInput) {
  return invoke<TrustedLanCompanionStatus>("update_trusted_lan_companion_config", { input });
}

export async function createTrustedLanPairing(browserLabel?: string | null) {
  return invoke<TrustedLanPairingLink>("create_trusted_lan_pairing", {
    browserLabel: browserLabel ?? null,
    browser_label: browserLabel ?? null,
  });
}

export async function listTrustedLanPairedBrowsers() {
  return invoke<TrustedLanPairedBrowser[]>("list_trusted_lan_paired_browsers");
}

export async function revokeTrustedLanPairedBrowser(browserId: string) {
  return invoke<void>("revoke_trusted_lan_paired_browser", {
    browserId,
    browser_id: browserId,
  });
}

export async function revokeAllTrustedLanPairedBrowsers() {
  return invoke<void>("revoke_all_trusted_lan_paired_browsers");
}

export async function listActiveSpoolLoans() {
  return invoke<ActiveSpoolLoanRow[]>("list_active_spool_loans");
}

export async function listLoanUsageByPerson(limit = 30, direction?: string | null) {
  return invoke<LoanUsageByPersonRow[]>("list_loan_usage_by_person", {
    limit,
    direction: direction ?? null,
  });
}

export async function listSpoolLoans(
  limit = 500,
  includeReturned = true,
  direction?: string | null,
) {
  return invoke<SpoolLoanDetailsRow[]>("list_spool_loans", {
    limit,
    includeReturned,
    direction: direction ?? null,
  });
}

export async function listMasterCatalog(limit = 250, search?: string) {
  return invoke<MasterCatalogRow[]>("list_master_catalog", { limit, search });
}

export async function refreshBambuCatalog(materialTypes?: string[]) {
  return invoke<CatalogRefreshResult>("refresh_bambu_catalog", {
    materialTypes: materialTypes && materialTypes.length > 0 ? materialTypes : null,
  });
}

export async function refreshEsunCatalog(materialTypes?: string[]) {
  return invoke<CatalogRefreshResult>("refresh_esun_catalog", {
    materialTypes: materialTypes && materialTypes.length > 0 ? materialTypes : null,
  });
}

export async function subscribeCatalogRefreshProgress(
  handler: (payload: CatalogRefreshProgressPayload) => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }
  const events = await import("@tauri-apps/api/event");
  const unlisten = await events.listen<CatalogRefreshProgressPayload>(
    "catalog_refresh_progress",
    (event) => {
      if (event.payload) {
        handler(event.payload);
      }
    },
  );
  return unlisten;
}

export async function searchEsunFilaments(query: string, limit = 12) {
  return invoke<EsunSearchResult[]>("esun_search_filaments", { query, limit });
}

export async function fetchEsunProductDetail(handle: string) {
  return invoke<EsunProductDetail>("esun_fetch_product_detail", { handle });
}

export async function createSpool(input: CreateSpoolInput) {
  return invoke<void>("create_spool", { input });
}

export async function createLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreateSpoolInput | CreateManualSpoolInput,
) {
  return invoke<string>("create_library_sync_host_spool", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      master_id: "master_id" in input ? input.master_id ?? null : null,
      material: "material" in input ? input.material : null,
      filament_name: "filament_name" in input ? input.filament_name : null,
      color_name: "color_name" in input ? input.color_name : null,
      vendor: "vendor" in input ? input.vendor ?? null : null,
      initial_weight_g: input.initial_weight_g ?? null,
      location: "location" in input ? input.location ?? null : null,
      hex_color: "hex_color" in input ? input.hex_color ?? null : null,
      owner_name: input.owner_name ?? null,
      owner_contact: input.owner_contact ?? null,
      ownership_note: input.ownership_note ?? null,
    },
  });
}

export async function createWishlistItem(input: CreateWishlistItemInput) {
  return invoke<void>("create_wishlist_item", { input });
}

export async function createLibrarySyncHostWishlistItem(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: CreateWishlistItemInput,
) {
  return invoke<void>("create_library_sync_host_wishlist_item", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      master_id: input.master_id ?? null,
      vendor: input.vendor,
      material: input.material,
      filament_name: input.filament_name,
      color_name: input.color_name,
      quantity: input.quantity ?? null,
      note: input.note ?? null,
    },
  });
}

export async function createPrinter(input: CreatePrinterInput) {
  return invoke<void>("create_printer", { input });
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

export async function getAppVersion() {
  return invoke<string>("get_app_version");
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

export async function lendSpool(input: LendSpoolInput) {
  return invoke<SpoolLoanRow>("lend_spool", { input });
}

export async function lendLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: LendSpoolInput,
) {
  return invoke<void>("lend_library_sync_host_spool", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input.spool_id,
      borrower_name: input.borrower_name,
      grams_out: input.grams_out,
      note: input.note ?? null,
    },
  });
}

export async function returnSpoolLoan(input: ReturnSpoolLoanInput) {
  return invoke<SpoolLoanRow>("return_spool_loan", { input });
}

export async function returnInboundSpoolLoan(input: ReturnSpoolLoanInput) {
  return invoke<SpoolLoanRow>("return_inbound_spool_loan", { input });
}

export async function returnLibrarySyncHostLoan(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: ReturnSpoolLoanInput & { inbound?: boolean },
) {
  return invoke<void>("return_library_sync_host_loan", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      loan_id: input.loan_id,
      returned_grams: input.returned_grams,
      note: input.note ?? null,
      inbound: input.inbound ?? false,
    },
  });
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
  return invoke<void>("update_library_sync_host_spool_details", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input.spool_id,
      qr_code: input.qr_code ?? null,
      status: input.status,
      location: input.location ?? null,
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

export async function updateMasterCatalogEntry(input: UpdateMasterCatalogEntryInput) {
  return invoke<string>("update_master_catalog_entry", { input });
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

export async function updateWishlistItemStatus(input: UpdateWishlistStatusInput) {
  return invoke<void>("update_wishlist_item_status", { input });
}

export async function updateLibrarySyncHostWishlistItemStatus(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateWishlistStatusInput,
) {
  return invoke<void>("update_library_sync_host_wishlist_item_status", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      item_id: input.item_id,
      status: input.status,
    },
  });
}

export async function deleteWishlistItem(itemId: string) {
  return invoke<void>("delete_wishlist_item", { itemId });
}

export async function deleteLibrarySyncHostWishlistItem(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  itemId: string,
) {
  return invoke<void>("delete_library_sync_host_wishlist_item", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      item_id: itemId,
    },
  });
}

export async function fetchLibrarySyncCatalogMasters(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  limit = 1000,
  search?: string | null,
) {
  return invoke<MasterCatalogRow[]>("fetch_library_sync_catalog_masters", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      search: search ?? null,
    },
  });
}

export async function fetchLibrarySyncWishlistItems(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  limit = 500,
) {
  return invoke<WishlistItemRow[]>("fetch_library_sync_wishlist_items", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
    },
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

export async function topMaterials(limit = 12) {
  return invoke<MaterialUsageRow[]>("top_materials", { limit });
}

export async function listFilamentConsumption(limit = 500, printerId?: string | null) {
  return invoke<FilamentConsumptionRow[]>("list_filament_consumption", {
    limit,
    printerId: printerId ?? null,
    printer_id: printerId ?? null,
  });
}

export async function resetAppData() {
  return invoke<void>("reset_app_data");
}

export async function resetCatalogData() {
  return invoke<CatalogResetStats>("reset_catalog_data");
}

export async function exportInventoryCsv() {
  return invoke<{ content: string }>("export_inventory_csv");
}

export async function exportInventoryJson() {
  return invoke<{ content: string }>("export_inventory_json");
}

export async function exportFullBackupJson() {
  return invoke<{ content: string }>("export_full_backup_json");
}

export async function importFullBackupJson(content: string) {
  return invoke<void>("import_full_backup_json", { content });
}

export async function importDataFile(content: string) {
  return invoke<ImportDataStats>("import_data_file", { content });
}

export async function validateFullBackupJson(content: string) {
  return invoke<BackupValidationStats>("validate_full_backup_json", { content });
}

export async function exportLoansCsv(includeReturned = true, direction?: string | null) {
  return invoke<{ content: string }>("export_loans_csv", {
    includeReturned,
    direction: direction ?? null,
  });
}

export async function setDockIconTheme(theme: "light" | "dark") {
  return invoke<void>("set_dock_icon_theme", { theme });
}

export async function setWindowTitle(title: string) {
  if (typeof document !== "undefined") {
    document.title = title;
  }

  if (!isTauri()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}
