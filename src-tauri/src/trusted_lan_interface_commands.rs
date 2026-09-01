use crate::trusted_lan_interfaces::{
    list_private_trusted_lan_interfaces, packaged_host_client_e2e_trusted_lan_interface,
    visual_qa_trusted_lan_interface, TrustedLanInterfaceOption,
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

fn trusted_lan_interfaces_for_command(
    visual_qa: bool,
    packaged_host_client_e2e: bool,
) -> Vec<TrustedLanInterfaceOption> {
    if packaged_host_client_e2e {
        vec![packaged_host_client_e2e_trusted_lan_interface()]
    } else if visual_qa {
        vec![visual_qa_trusted_lan_interface()]
    } else {
        list_private_trusted_lan_interfaces()
    }
}

#[tauri::command]
pub(crate) fn list_trusted_lan_interfaces() -> Result<Vec<TrustedLanInterfaceOption>, String> {
    Ok(trusted_lan_interfaces_for_command(
        visual_qa_enabled(),
        crate::packaged_host_client_e2e::allows_packaged_host_client_host_loopback(),
    ))
}

#[cfg(test)]
mod tests {
    use super::trusted_lan_interfaces_for_command;
    use crate::trusted_lan_interfaces::{
        packaged_host_client_e2e_trusted_lan_interface, visual_qa_trusted_lan_interface,
    };

    #[test]
    fn visual_qa_uses_only_the_synthetic_loopback_interface() {
        assert_eq!(
            trusted_lan_interfaces_for_command(true, false),
            vec![visual_qa_trusted_lan_interface()]
        );
    }

    #[test]
    fn packaged_gate_takes_precedence_and_uses_only_its_synthetic_loopback() {
        assert_eq!(
            trusted_lan_interfaces_for_command(true, true),
            vec![packaged_host_client_e2e_trusted_lan_interface()]
        );
    }
}
