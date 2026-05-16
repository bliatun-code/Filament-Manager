use crate::trusted_lan_interfaces::{
    list_private_trusted_lan_interfaces, TrustedLanInterfaceOption,
};

#[tauri::command]
pub(crate) fn list_trusted_lan_interfaces() -> Result<Vec<TrustedLanInterfaceOption>, String> {
    Ok(list_private_trusted_lan_interfaces())
}
