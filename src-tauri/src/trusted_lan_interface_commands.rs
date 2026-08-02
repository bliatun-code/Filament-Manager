use crate::trusted_lan_interfaces::{
    list_private_trusted_lan_interfaces, visual_qa_trusted_lan_interface, TrustedLanInterfaceOption,
};

fn visual_qa_enabled() -> bool {
    matches!(
        std::env::var("FILAMENT_MANAGER_VISUAL_QA")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn trusted_lan_interfaces_for_command(visual_qa: bool) -> Vec<TrustedLanInterfaceOption> {
    if visual_qa {
        vec![visual_qa_trusted_lan_interface()]
    } else {
        list_private_trusted_lan_interfaces()
    }
}

#[tauri::command]
pub(crate) fn list_trusted_lan_interfaces() -> Result<Vec<TrustedLanInterfaceOption>, String> {
    Ok(trusted_lan_interfaces_for_command(visual_qa_enabled()))
}

#[cfg(test)]
mod tests {
    use super::trusted_lan_interfaces_for_command;
    use crate::trusted_lan_interfaces::visual_qa_trusted_lan_interface;

    #[test]
    fn visual_qa_uses_only_the_synthetic_loopback_interface() {
        assert_eq!(
            trusted_lan_interfaces_for_command(true),
            vec![visual_qa_trusted_lan_interface()]
        );
    }
}
