use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_settings::{delete_setting, set_setting};
use super::database_time::sqlite_now;

pub(crate) fn save_library_sync_validation_state(
    conn: &Connection,
    reachable: bool,
    message: Option<&str>,
    host_device_name: Option<&str>,
) -> InventoryResult<()> {
    let now = sqlite_now(conn)?;
    set_setting(conn, "library_sync_last_checked_at", &now)?;
    if reachable {
        set_setting(conn, "library_sync_last_reachable_at", &now)?;
    }
    match message.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => set_setting(conn, "library_sync_last_validation_message", value)?,
        None => delete_setting(conn, "library_sync_last_validation_message")?,
    }
    match host_device_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => set_setting(conn, "library_sync_host_device_name", value)?,
        None => delete_setting(conn, "library_sync_host_device_name")?,
    }
    Ok(())
}
