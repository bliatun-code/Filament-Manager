import { invoke } from "./tauri_invoke";
import type { CompanionSpoolDetail, InventoryOverview, SpoolWithMasterRow } from "./tauri_inventory_client";
import type { SpoolLoanDetailsRow } from "./tauri_loan_client";
import type { PrinterOverviewRow, PrinterSettingsSnapshot } from "./tauri_printer_client";
import type { WishlistItemRow } from "./tauri_wishlist_client";
import type { FilamentConsumptionRow } from "./tauri_statistics_client";

export type TrustedLanCompanionStatus = {
  enabled: boolean;
  selected_interface_name?: string | null;
  selected_interface_address?: string | null;
  bind_address?: string | null;
  advertised_hostname?: string | null;
  direct_base_url?: string | null;
  base_url?: string | null;
  shell_url?: string | null;
  listen_port: number;
  shell_reachable: boolean;
  health_error?: string | null;
  running: boolean;
  last_error?: string | null;
  local_name_running: boolean;
  local_name_error?: string | null;
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
  cached_consumption?: LibrarySyncCachedFilamentConsumptionList | null;
  cached_wishlist?: LibrarySyncCachedWishlistList | null;
};

export type LibraryDomainRevisions = {
  inventory: number;
  catalog: number;
  loans: number;
  printers: number;
  jobs: number;
  wishlist: number;
};

export type LibrarySyncHostValidationResult = {
  base_url: string;
  reachable: boolean;
  ok: boolean;
  matches_library_id: boolean;
  pairing_checked: boolean;
  pairing_valid: boolean;
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

export type LibrarySyncCachedFilamentConsumptionList = {
  captured_at: string;
  rows: FilamentConsumptionRow[];
};

export type LibrarySyncCachedWishlistList = {
  captured_at: string;
  rows: WishlistItemRow[];
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

export async function getTrustedLanCompanionStatus() {
  return invoke<TrustedLanCompanionStatus>("get_trusted_lan_companion_status");
}

export async function getLibrarySyncSettings() {
  return invoke<LibrarySyncSettings>("get_library_sync_settings");
}

export async function getLibraryDomainRevisions() {
  return invoke<LibraryDomainRevisions>("get_library_domain_revisions");
}

export async function fetchLibrarySyncDomainRevisions(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<LibraryDomainRevisions>("fetch_library_sync_domain_revisions", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
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
  limit = 1000,
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

export async function fetchLibrarySyncPrinterSettings(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<PrinterSettingsSnapshot>("fetch_library_sync_printer_settings", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
    },
  });
}

export async function fetchCachedLibrarySyncSpools() {
  return invoke<LibrarySyncCachedSpoolList | null>("fetch_cached_library_sync_spools");
}

export async function saveLibrarySyncSpoolCache(rows: SpoolWithMasterRow[]) {
  return invoke<void>("save_library_sync_spool_cache", { input: { rows } });
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

export async function fetchCachedLibrarySyncLoans() {
  return invoke<LibrarySyncCachedLoanList | null>("fetch_cached_library_sync_loans");
}

export async function fetchCachedLibrarySyncWishlist() {
  return invoke<LibrarySyncCachedWishlistList | null>("fetch_cached_library_sync_wishlist");
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
