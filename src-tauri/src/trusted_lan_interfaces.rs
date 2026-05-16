use serde::Serialize;
use std::net::IpAddr;

#[derive(Serialize)]
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
