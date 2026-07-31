use serde::Serialize;
use std::net::IpAddr;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) struct TrustedLanInterfaceOption {
    name: String,
    address: String,
    label: String,
}

pub(crate) fn list_private_trusted_lan_interfaces() -> Vec<TrustedLanInterfaceOption> {
    let mut interfaces = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ipv4) if !interface.is_loopback() && ipv4.is_private() => {
                Some(TrustedLanInterfaceOption {
                    label: format!("{} ({})", interface.name, ipv4),
                    name: interface.name,
                    address: ipv4.to_string(),
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    interfaces.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.address.cmp(&right.address))
    });
    interfaces.dedup_by(|left, right| left.name == right.name && left.address == right.address);
    interfaces
}

pub(crate) fn normalize_trusted_lan_interface_selection(
    interface_name: Option<&str>,
    interface_address: Option<&str>,
) -> Option<(String, String)> {
    let name = interface_name?.trim();
    let address = interface_address?.trim();
    if name.is_empty() || address.is_empty() {
        return None;
    }
    Some((name.to_string(), address.to_string()))
}

pub(crate) fn refresh_trusted_lan_interface_selection(
    interface_name: &str,
    previous_address: &str,
    available: &[TrustedLanInterfaceOption],
) -> Option<(String, String)> {
    let name = interface_name.trim();
    if name.is_empty() {
        return None;
    }

    let previous_address = previous_address.trim();
    let mut matching = available
        .iter()
        .filter(|candidate| candidate.name == name)
        .collect::<Vec<_>>();
    matching.sort_by(|left, right| left.address.cmp(&right.address));

    let selected = matching
        .iter()
        .copied()
        .find(|candidate| candidate.address == previous_address)
        .or_else(|| (matching.len() == 1).then(|| matching[0]));
    selected.map(|candidate| (candidate.name.clone(), candidate.address.clone()))
}

pub(crate) fn current_trusted_lan_interface_selection(
    interface_name: &str,
    previous_address: &str,
) -> Option<(String, String)> {
    refresh_trusted_lan_interface_selection(
        interface_name,
        previous_address,
        &list_private_trusted_lan_interfaces(),
    )
}

pub(crate) fn current_trusted_lan_interface_index(
    interface_name: &str,
    interface_address: &str,
) -> Option<u32> {
    let interface_name = interface_name.trim();
    let interface_address = interface_address.trim();
    if interface_name.is_empty() || interface_address.is_empty() {
        return None;
    }

    if_addrs::get_if_addrs()
        .ok()?
        .into_iter()
        .find(|interface| {
            interface.name == interface_name
                && interface.ip().to_string() == interface_address
                && matches!(interface.ip(), IpAddr::V4(address) if address.is_private())
        })
        .and_then(|interface| interface.index)
}

pub(crate) fn ensure_private_trusted_lan_interface(address: &str) -> Result<(), String> {
    let available = list_private_trusted_lan_interfaces();
    if available
        .iter()
        .any(|value| value.address == address.trim())
    {
        return Ok(());
    }
    Err(format!(
        "Trusted-LAN address {} is not currently available on a private interface.",
        address.trim()
    ))
}

#[cfg(test)]
mod tests {
    use super::{refresh_trusted_lan_interface_selection, TrustedLanInterfaceOption};

    fn interface(name: &str, address: &str) -> TrustedLanInterfaceOption {
        TrustedLanInterfaceOption {
            name: name.to_string(),
            address: address.to_string(),
            label: format!("{name} ({address})"),
        }
    }

    #[test]
    fn refresh_keeps_the_existing_address_when_it_is_still_present() {
        let available = [
            interface("Ethernet", "192.168.1.40"),
            interface("Ethernet", "192.168.1.41"),
        ];

        assert_eq!(
            refresh_trusted_lan_interface_selection("Ethernet", "192.168.1.41", &available),
            Some(("Ethernet".to_string(), "192.168.1.41".to_string()))
        );
    }

    #[test]
    fn refresh_follows_the_same_interface_after_a_dhcp_address_change() {
        let available = [
            interface("Wi-Fi", "192.168.1.88"),
            interface("VPN", "10.0.0.5"),
        ];

        assert_eq!(
            refresh_trusted_lan_interface_selection("Wi-Fi", "192.168.1.25", &available),
            Some(("Wi-Fi".to_string(), "192.168.1.88".to_string()))
        );
    }

    #[test]
    fn refresh_does_not_silently_switch_to_another_interface() {
        let available = [interface("Ethernet", "192.168.1.88")];

        assert_eq!(
            refresh_trusted_lan_interface_selection("Wi-Fi", "192.168.1.25", &available),
            None
        );
    }

    #[test]
    fn refresh_waits_when_one_interface_has_multiple_new_private_addresses() {
        let available = [
            interface("Ethernet", "192.168.1.88"),
            interface("Ethernet", "192.168.1.89"),
        ];

        assert_eq!(
            refresh_trusted_lan_interface_selection("Ethernet", "192.168.1.25", &available),
            None
        );
    }
}
