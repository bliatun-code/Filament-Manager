use rusqlite::Connection;

use super::database_result::InventoryResult;
use super::database_settings::{delete_setting, get_setting, set_setting};
use super::database_trusted_lan_models::TrustedLanSettingsRow;

const TRUSTED_LAN_ENABLED_KEY: &str = "trusted_lan_enabled";
const TRUSTED_LAN_INTERFACE_NAME_KEY: &str = "trusted_lan_interface_name";
const TRUSTED_LAN_INTERFACE_ADDRESS_KEY: &str = "trusted_lan_interface_address";
const TRUSTED_LAN_PORT_KEY: &str = "trusted_lan_port";
const DEFAULT_TRUSTED_LAN_PORT: u16 = 4278;

pub(crate) fn get_trusted_lan_settings(
    conn: &Connection,
) -> InventoryResult<TrustedLanSettingsRow> {
    let enabled = get_setting(conn, TRUSTED_LAN_ENABLED_KEY)?
        .map(|value| matches!(value.trim(), "1" | "true" | "TRUE" | "True"))
        .unwrap_or(false);
    let selected_interface_name = get_setting(conn, TRUSTED_LAN_INTERFACE_NAME_KEY)?;
    let selected_interface_address = get_setting(conn, TRUSTED_LAN_INTERFACE_ADDRESS_KEY)?;
    let listen_port = get_setting(conn, TRUSTED_LAN_PORT_KEY)?
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_TRUSTED_LAN_PORT);
    Ok(TrustedLanSettingsRow {
        enabled,
        selected_interface_name,
        selected_interface_address,
        listen_port,
    })
}

pub(crate) fn save_trusted_lan_settings(
    conn: &Connection,
    settings: &TrustedLanSettingsRow,
) -> InventoryResult<()> {
    set_setting(
        conn,
        TRUSTED_LAN_ENABLED_KEY,
        if settings.enabled { "1" } else { "0" },
    )?;
    set_setting(
        conn,
        TRUSTED_LAN_PORT_KEY,
        &settings.listen_port.max(1).to_string(),
    )?;
    save_optional_setting(
        conn,
        TRUSTED_LAN_INTERFACE_NAME_KEY,
        settings.selected_interface_name.as_deref(),
    )?;
    save_optional_setting(
        conn,
        TRUSTED_LAN_INTERFACE_ADDRESS_KEY,
        settings.selected_interface_address.as_deref(),
    )?;
    Ok(())
}

fn save_optional_setting(conn: &Connection, key: &str, value: Option<&str>) -> InventoryResult<()> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => set_setting(conn, key, value),
        None => delete_setting(conn, key),
    }
}
