use serde_json::{Map, Value};

pub const FULL_BACKUP_TABLES: [&str; 22] = [
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

pub const RESET_APP_STATE_TABLES: [&str; 20] = [
    "trusted_lan_pairings",
    "trusted_lan_paired_browsers",
    "label_print_jobs",
    "weight_readings",
    "scan_events",
    "spool_history_events",
    "spool_loans",
    "print_jobs",
    "printer_live_events",
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

pub(crate) fn should_import_backup_row(table: &str, row: &Map<String, Value>) -> bool {
    match table {
        "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue" => false,
        "settings" => should_import_settings_backup_row(row),
        _ => true,
    }
}

fn should_import_settings_backup_row(row: &Map<String, Value>) -> bool {
    let Some(key) = row.get("key").and_then(Value::as_str).map(str::trim) else {
        return false;
    };
    if key.starts_with("trusted_lan_") {
        return false;
    }
    if key == "library_sync_library_id" {
        return true;
    }
    !key.starts_with("library_sync_")
}
