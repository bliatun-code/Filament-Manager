use rusqlite::Connection;

use super::database_library_sync_models::LibrarySyncClientAuthState;
use super::database_settings::{delete_setting, get_setting, set_setting};
use super::database_time::sqlite_now;
use super::filament_database::InventoryResult;

pub(crate) fn save_library_sync_client_auth_state(
    conn: &Connection,
    session_id: &str,
    device_token: &str,
    csrf_token: &str,
    expires_at: Option<&str>,
) -> InventoryResult<()> {
    let paired_at = sqlite_now(conn)?;
    set_setting(conn, "library_sync_client_session_id", session_id.trim())?;
    set_setting(
        conn,
        "library_sync_client_device_token",
        device_token.trim(),
    )?;
    set_setting(conn, "library_sync_client_csrf_token", csrf_token.trim())?;
    set_setting(conn, "library_sync_client_auth_paired_at", &paired_at)?;
    match expires_at.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => set_setting(conn, "library_sync_client_auth_expires_at", value)?,
        None => delete_setting(conn, "library_sync_client_auth_expires_at")?,
    }
    Ok(())
}

pub(crate) fn clear_library_sync_client_auth_state(conn: &Connection) -> InventoryResult<()> {
    delete_setting(conn, "library_sync_client_session_id")?;
    delete_setting(conn, "library_sync_client_device_token")?;
    delete_setting(conn, "library_sync_client_csrf_token")?;
    delete_setting(conn, "library_sync_client_auth_paired_at")?;
    delete_setting(conn, "library_sync_client_auth_expires_at")?;
    Ok(())
}

pub(crate) fn get_library_sync_client_auth_state(
    conn: &Connection,
) -> InventoryResult<Option<LibrarySyncClientAuthState>> {
    let session_id = get_setting(conn, "library_sync_client_session_id")?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let device_token = get_setting(conn, "library_sync_client_device_token")?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let csrf_token = get_setting(conn, "library_sync_client_csrf_token")?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let expires_at = get_setting(conn, "library_sync_client_auth_expires_at")?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match (session_id, device_token, csrf_token) {
        (Some(session_id), Some(device_token), Some(csrf_token)) => {
            Ok(Some((session_id, device_token, csrf_token, expires_at)))
        }
        _ => Ok(None),
    }
}
