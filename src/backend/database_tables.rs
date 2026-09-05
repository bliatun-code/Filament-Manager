use serde_json::{Map, Value};

pub const FULL_BACKUP_TABLES: [&str; 24] = [
    "filament_master_list",
    "filament_spools",
    "spool_history_events",
    "spool_loans",
    "inventory_locations",
    "printers",
    "ams_units",
    "ams_slots",
    "print_jobs",
    "printer_live_events",
    "printer_live_usage_sessions",
    "printer_live_usage_session_spools",
    "scales",
    "weight_readings",
    "scan_events",
    "label_templates",
    "label_print_jobs",
    "purchase_recommendations",
    "wishlist_items",
    "alerts",
    "settings",
    "trusted_lan_pairings",
    "trusted_lan_paired_browsers",
    "sync_queue",
];

/// Tables added after `filament-manager-backup-v1` was first released.
///
/// The v1 format did not include an explicit schema version, so an otherwise
/// complete v1 backup created by an older release cannot be distinguished by
/// metadata alone. Keep these additions optional when checking the minimum
/// safe table set, while still reporting them as missing in validation stats.
pub(crate) const LEGACY_OPTIONAL_FULL_BACKUP_TABLES: [&str; 3] = [
    "printer_live_events",
    "printer_live_usage_sessions",
    "printer_live_usage_session_spools",
];

pub(crate) fn is_required_full_backup_table(table: &str) -> bool {
    !LEGACY_OPTIONAL_FULL_BACKUP_TABLES.contains(&table)
}

pub const RESET_APP_STATE_TABLES: [&str; 23] = [
    "catalog_refresh_jobs",
    "trusted_lan_pairings",
    "trusted_lan_paired_browsers",
    "label_print_jobs",
    "weight_readings",
    "scan_events",
    "spool_history_events",
    "spool_loans",
    "print_jobs",
    "printer_live_events",
    "printer_live_usage_session_spools",
    "printer_live_usage_sessions",
    "ams_slots",
    "ams_units",
    "filament_spools",
    "inventory_locations",
    "wishlist_items",
    "alerts",
    "sync_queue",
    "scales",
    "purchase_recommendations",
    "settings",
    "printers",
];

pub(crate) fn portable_backup_row(
    table: &str,
    mut row: Map<String, Value>,
) -> Option<Map<String, Value>> {
    match table {
        "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue" => return None,
        "settings" if !is_portable_backup_setting_row(&row) => return None,
        "printers" => {
            // These legacy columns contain device-local connection material and
            // must never travel with a portable library backup.
            row.remove("ip_address");
            row.remove("access_token");
        }
        _ => {}
    }
    Some(row)
}

fn is_portable_backup_setting_row(row: &Map<String, Value>) -> bool {
    let Some(key) = row.get("key").and_then(Value::as_str).map(str::trim) else {
        return false;
    };
    matches!(
        key,
        "active_printer_id"
            | "default_purchase_currency"
            | "filament_price_standards_json"
            | "library_sync_library_id"
            | "low_stock_policy_json"
            | "theme_mode"
            | "trusted_lan_port"
    )
}
