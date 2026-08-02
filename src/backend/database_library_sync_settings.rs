use rusqlite::Connection;

use super::database_ids::new_id;
use super::database_library_sync_auth::clear_library_sync_client_auth_state;
use super::database_library_sync_models::{
    LibrarySyncCachedFilamentConsumptionListRow, LibrarySyncCachedLoanListRow,
    LibrarySyncCachedPrinterOverviewRow, LibrarySyncCachedSnapshotRow,
    LibrarySyncCachedSpoolListRow, LibrarySyncCachedWishlistListRow, LibrarySyncSettingsRow,
};
use super::database_result::InventoryResult;
use super::database_settings::{delete_setting, get_setting, set_setting};
use super::library_sync_defaults::{default_library_sync_device_name, normalize_library_sync_mode};

pub(crate) fn get_library_sync_settings(
    conn: &Connection,
) -> InventoryResult<LibrarySyncSettingsRow> {
    let mode = normalize_library_sync_mode(get_setting(conn, "library_sync_mode")?.as_deref());
    let device_name = trimmed_setting(conn, "library_sync_device_name")?
        .unwrap_or_else(default_library_sync_device_name);

    let library_id = get_library_sync_library_id(conn)?;

    let host_base_url = get_setting(conn, "library_sync_host_base_url")?
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    let host_device_name = trimmed_setting(conn, "library_sync_host_device_name")?;
    let client_auth_paired = trimmed_setting(conn, "library_sync_client_auth_configured")?
        .is_some()
        || trimmed_setting(conn, "library_sync_client_session_id")?.is_some();
    let client_auth_paired_at = trimmed_setting(conn, "library_sync_client_auth_paired_at")?;
    let client_auth_expires_at = trimmed_setting(conn, "library_sync_client_auth_expires_at")?;
    let last_checked_at = trimmed_setting(conn, "library_sync_last_checked_at")?;
    let last_reachable_at = trimmed_setting(conn, "library_sync_last_reachable_at")?;
    let last_validation_message = trimmed_setting(conn, "library_sync_last_validation_message")?;
    let cached_snapshot =
        cached_setting::<LibrarySyncCachedSnapshotRow>(conn, "library_sync_cached_snapshot_json")?;
    let cached_spools =
        cached_setting::<LibrarySyncCachedSpoolListRow>(conn, "library_sync_cached_spools_json")?;
    let cached_printers = cached_setting::<LibrarySyncCachedPrinterOverviewRow>(
        conn,
        "library_sync_cached_printers_json",
    )?;
    let cached_loans =
        cached_setting::<LibrarySyncCachedLoanListRow>(conn, "library_sync_cached_loans_json")?;
    let cached_consumption = cached_setting::<LibrarySyncCachedFilamentConsumptionListRow>(
        conn,
        "library_sync_cached_consumption_json",
    )?;
    let cached_wishlist = cached_setting::<LibrarySyncCachedWishlistListRow>(
        conn,
        "library_sync_cached_wishlist_json",
    )?;

    Ok(LibrarySyncSettingsRow {
        mode,
        device_name,
        library_id,
        host_base_url,
        host_device_name,
        client_auth_paired,
        client_auth_paired_at,
        client_auth_expires_at,
        last_checked_at,
        last_reachable_at,
        last_validation_message,
        cached_snapshot,
        cached_spools,
        cached_printers,
        cached_loans,
        cached_consumption,
        cached_wishlist,
    })
}

pub(crate) fn get_library_sync_library_id(conn: &Connection) -> InventoryResult<String> {
    match trimmed_setting(conn, "library_sync_library_id")? {
        Some(value) => Ok(value),
        None => {
            let next = new_id();
            set_setting(conn, "library_sync_library_id", &next)?;
            Ok(next)
        }
    }
}

pub(crate) fn save_library_sync_settings(
    conn: &Connection,
    settings: &LibrarySyncSettingsRow,
) -> InventoryResult<LibrarySyncSettingsRow> {
    let mode = normalize_library_sync_mode(Some(settings.mode.as_str()));
    let device_name = settings
        .device_name
        .trim()
        .to_string()
        .chars()
        .take(120)
        .collect::<String>();
    let safe_device_name = if device_name.is_empty() {
        default_library_sync_device_name()
    } else {
        device_name
    };
    let library_id = settings
        .library_id
        .trim()
        .to_string()
        .chars()
        .take(160)
        .collect::<String>();
    let safe_library_id = if library_id.is_empty() {
        new_id()
    } else {
        library_id
    };
    let host_base_url = settings
        .host_base_url
        .as_deref()
        .map(str::trim)
        .map(|value| value.trim_end_matches('/'))
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    let host_device_name = settings
        .host_device_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(120).collect::<String>());
    let previous_host_base_url = get_setting(conn, "library_sync_host_base_url")?
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());

    set_setting(conn, "library_sync_mode", &mode)?;
    set_setting(conn, "library_sync_device_name", &safe_device_name)?;
    set_setting(conn, "library_sync_library_id", &safe_library_id)?;

    if mode == "CLIENT" {
        let host_changed = previous_host_base_url != host_base_url;
        save_optional_setting(conn, "library_sync_host_base_url", host_base_url.as_deref())?;
        save_optional_setting(
            conn,
            "library_sync_host_device_name",
            host_device_name.as_deref(),
        )?;
        if host_changed {
            clear_library_sync_client_auth_state(conn)?;
        }
    } else {
        delete_setting(conn, "library_sync_host_base_url")?;
        delete_setting(conn, "library_sync_host_device_name")?;
        delete_setting(conn, "library_sync_last_checked_at")?;
        delete_setting(conn, "library_sync_last_reachable_at")?;
        delete_setting(conn, "library_sync_last_validation_message")?;
        delete_setting(conn, "library_sync_cached_snapshot_json")?;
        delete_setting(conn, "library_sync_cached_spools_json")?;
        delete_setting(conn, "library_sync_cached_printers_json")?;
        delete_setting(conn, "library_sync_cached_loans_json")?;
        delete_setting(conn, "library_sync_cached_consumption_json")?;
        delete_setting(conn, "library_sync_cached_wishlist_json")?;
        clear_library_sync_client_auth_state(conn)?;
    }

    get_library_sync_settings(conn)
}

fn trimmed_setting(conn: &Connection, key: &str) -> InventoryResult<Option<String>> {
    Ok(get_setting(conn, key)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

fn cached_setting<T>(conn: &Connection, key: &str) -> InventoryResult<Option<T>>
where
    T: serde::de::DeserializeOwned,
{
    Ok(get_setting(conn, key)?.and_then(|value| serde_json::from_str::<T>(&value).ok()))
}

fn save_optional_setting(conn: &Connection, key: &str, value: Option<&str>) -> InventoryResult<()> {
    match value {
        Some(value) => set_setting(conn, key, value),
        None => delete_setting(conn, key),
    }
}
