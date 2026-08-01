use serde::Serialize;
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::time::{Duration, Instant};

const BAMBU_DISCOVERY_PORT: u16 = 2021;
const DISCOVERY_WINDOW: Duration = Duration::from_secs(9);
const READ_TIMEOUT: Duration = Duration::from_millis(500);
const MAX_PACKET_BYTES: usize = 8 * 1024;
const BAMBU_PRINTER_DEVICE_TYPE: &str = "urn:bambulab-com:device:3dprinter:1";

/// A Bambu printer that announced itself on the selected private network.
///
/// This is deliberately only a discovery hint. UDP announcements are not
/// authenticated, so callers must validate the printer's TLS identity before
/// storing or using the address for an existing live integration.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct BambuPrinterDiscoveryCandidate {
    pub(crate) host: String,
    pub(crate) printer_serial: String,
    pub(crate) model: Option<String>,
    pub(crate) name: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PrivateIpv4Network {
    address: Ipv4Addr,
    netmask: Ipv4Addr,
}

impl PrivateIpv4Network {
    fn contains(self, candidate: Ipv4Addr) -> bool {
        ipv4_to_u32(self.address) & ipv4_to_u32(self.netmask)
            == ipv4_to_u32(candidate) & ipv4_to_u32(self.netmask)
    }
}

pub(crate) fn discover_bambu_printers(
    interface_address: &str,
) -> Result<Vec<BambuPrinterDiscoveryCandidate>, String> {
    let network = selected_private_network(interface_address)?;
    let socket = bind_bambu_discovery_socket()?;
    socket
        .set_read_timeout(Some(READ_TIMEOUT))
        .map_err(|error| format!("Could not prepare Bambu discovery: {error}"))?;

    discover_bambu_printers_from_socket(&socket, network, DISCOVERY_WINDOW)
}

fn selected_private_network(interface_address: &str) -> Result<PrivateIpv4Network, String> {
    let selected_address = interface_address.trim().parse::<Ipv4Addr>().map_err(|_| {
        "Choose one currently available private IPv4 interface before scanning.".to_string()
    })?;
    if !selected_address.is_private() {
        return Err(
            "Choose one currently available private IPv4 interface before scanning.".to_string(),
        );
    }

    if_addrs::get_if_addrs()
        .map_err(|error| format!("Could not read local network interfaces: {error}"))?
        .into_iter()
        .find_map(|interface| match interface.addr {
            if_addrs::IfAddr::V4(address)
                if !interface.is_loopback()
                    && address.ip == selected_address
                    && address.ip.is_private() =>
            {
                Some(PrivateIpv4Network {
                    address: address.ip,
                    netmask: address.netmask,
                })
            }
            _ => None,
        })
        .ok_or_else(|| {
            "The selected private network interface is no longer available. Refresh it and try again."
                .to_string()
        })
}

fn bind_bambu_discovery_socket() -> Result<UdpSocket, String> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))
        .map_err(|error| format!("Could not open the Bambu discovery listener: {error}"))?;
    socket
        .set_reuse_address(true)
        .map_err(|error| format!("Could not share the Bambu discovery listener: {error}"))?;
    // Bambu Studio may already be listening for the same broadcast. macOS and
    // Linux need SO_REUSEPORT as well in order to observe that traffic beside
    // another local listener. Windows uses SO_REUSEADDR for this socket mode.
    #[cfg(unix)]
    socket
        .set_reuse_port(true)
        .map_err(|error| format!("Could not share the Bambu discovery listener: {error}"))?;
    socket
        .set_broadcast(true)
        .map_err(|error| format!("Could not prepare the Bambu discovery listener: {error}"))?;
    socket
        .bind(&SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, BAMBU_DISCOVERY_PORT).into())
        .map_err(|error| {
            format!(
                "Could not listen for Bambu printer announcements on UDP port {BAMBU_DISCOVERY_PORT}: {error}. Close another printer-discovery app and try again."
            )
        })?;
    Ok(socket.into())
}

fn discover_bambu_printers_from_socket(
    socket: &UdpSocket,
    network: PrivateIpv4Network,
    window: Duration,
) -> Result<Vec<BambuPrinterDiscoveryCandidate>, String> {
    let deadline = Instant::now() + window;
    let mut buffer = [0_u8; MAX_PACKET_BYTES];
    let mut candidates = BTreeMap::<(String, String), BambuPrinterDiscoveryCandidate>::new();

    while Instant::now() < deadline {
        match socket.recv_from(&mut buffer) {
            Ok((received, remote)) => {
                let SocketAddr::V4(remote) = remote else {
                    continue;
                };
                if let Some(candidate) =
                    parse_bambu_discovery_packet(&buffer[..received], *remote.ip(), network)
                {
                    candidates.insert(
                        (candidate.printer_serial.clone(), candidate.host.clone()),
                        candidate,
                    );
                }
            }
            Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
            Err(error) => return Err(format!("Bambu printer discovery stopped: {error}")),
        }
    }

    Ok(candidates.into_values().collect())
}

fn parse_bambu_discovery_packet(
    packet: &[u8],
    remote_address: Ipv4Addr,
    network: PrivateIpv4Network,
) -> Option<BambuPrinterDiscoveryCandidate> {
    if !remote_address.is_private() || !network.contains(remote_address) {
        return None;
    }
    let text = std::str::from_utf8(packet).ok()?;
    let mut lines = text.lines();
    let start_line = lines.next()?.trim_end_matches('\r').trim();
    if !is_supported_ssdp_start_line(start_line) {
        return None;
    }

    let headers = lines.filter_map(parse_header_line).fold(
        BTreeMap::<String, String>::new(),
        |mut headers, (key, value)| {
            headers.entry(key).or_insert(value);
            headers
        },
    );
    let device_type = headers.get("nt").or_else(|| headers.get("st"))?;
    if !device_type.eq_ignore_ascii_case(BAMBU_PRINTER_DEVICE_TYPE) {
        return None;
    }
    if start_line.to_ascii_uppercase().starts_with("NOTIFY")
        && !headers
            .get("nts")
            .is_some_and(|value| value.eq_ignore_ascii_case("ssdp:alive"))
    {
        return None;
    }

    let printer_serial = normalize_serial(headers.get("usn")?)?;
    let model = sanitize_optional_metadata(headers.get("devmodel.bambu.com"));
    let name = sanitize_optional_metadata(headers.get("devname.bambu.com"));

    // `Location` is deliberately not used as an endpoint. The announcement is
    // unauthenticated, and the UDP packet's source is the only local address
    // we consider. The later TLS serial/SPKI check is what makes recovery safe.
    Some(BambuPrinterDiscoveryCandidate {
        host: remote_address.to_string(),
        printer_serial,
        model,
        name,
    })
}

fn is_supported_ssdp_start_line(value: &str) -> bool {
    value.eq_ignore_ascii_case("NOTIFY * HTTP/1.1") || value.eq_ignore_ascii_case("HTTP/1.1 200 OK")
}

fn parse_header_line(line: &str) -> Option<(String, String)> {
    let line = line.trim_end_matches('\r');
    let (key, value) = line.split_once(':')?;
    let key = key.trim().to_ascii_lowercase();
    let value = value.trim();
    (!key.is_empty() && !value.is_empty()).then(|| (key, value.to_string()))
}

fn normalize_serial(value: &str) -> Option<String> {
    let value = value
        .split_once("::")
        .map_or(value, |(serial, _)| serial)
        .trim();
    let normalized = value.to_ascii_uppercase();
    (normalized.len() >= 4
        && normalized.len() <= 128
        && normalized
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_')))
    .then_some(normalized)
}

fn sanitize_optional_metadata(value: Option<&String>) -> Option<String> {
    let value = value?.trim();
    let sanitized = value
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>();
    (!sanitized.is_empty()).then_some(sanitized)
}

fn ipv4_to_u32(address: Ipv4Addr) -> u32 {
    u32::from(address)
}

#[cfg(test)]
mod tests {
    use super::{parse_bambu_discovery_packet, BambuPrinterDiscoveryCandidate, PrivateIpv4Network};
    use std::net::Ipv4Addr;

    const NETWORK: PrivateIpv4Network = PrivateIpv4Network {
        address: Ipv4Addr::new(192, 168, 86, 25),
        netmask: Ipv4Addr::new(255, 255, 255, 0),
    };

    fn packet(start_line: &str, headers: &[(&str, &str)]) -> Vec<u8> {
        let mut packet = format!("{start_line}\r\n");
        for (key, value) in headers {
            packet.push_str(key);
            packet.push_str(": ");
            packet.push_str(value);
            packet.push_str("\r\n");
        }
        packet.push_str("\r\n");
        packet.into_bytes()
    }

    #[test]
    fn parses_bambu_notify_and_uses_the_packet_source_as_host() {
        let input = packet(
            "NOTIFY * HTTP/1.1",
            &[
                ("NT", "urn:bambulab-com:device:3dprinter:1"),
                ("NTS", "ssdp:alive"),
                ("USN", "01p00a412500321"),
                ("Location", "192.168.86.99"),
                ("DevModel.bambu.com", "P1S"),
                ("DevName.bambu.com", "Brutus"),
            ],
        );

        assert_eq!(
            parse_bambu_discovery_packet(&input, Ipv4Addr::new(192, 168, 86, 22), NETWORK),
            Some(BambuPrinterDiscoveryCandidate {
                host: "192.168.86.22".to_string(),
                printer_serial: "01P00A412500321".to_string(),
                model: Some("P1S".to_string()),
                name: Some("Brutus".to_string()),
            })
        );
    }

    #[test]
    fn parses_legacy_ssdp_response_shape() {
        let input = packet(
            "HTTP/1.1 200 OK",
            &[
                ("ST", "urn:bambulab-com:device:3dprinter:1"),
                ("USN", "01P00A412500321::printer"),
            ],
        );

        assert_eq!(
            parse_bambu_discovery_packet(&input, Ipv4Addr::new(192, 168, 86, 22), NETWORK)
                .map(|candidate| (candidate.host, candidate.printer_serial)),
            Some(("192.168.86.22".to_string(), "01P00A412500321".to_string()))
        );
    }

    #[test]
    fn rejects_packets_outside_the_selected_network_or_without_alive_signal() {
        let valid = packet(
            "NOTIFY * HTTP/1.1",
            &[
                ("NT", "urn:bambulab-com:device:3dprinter:1"),
                ("NTS", "ssdp:alive"),
                ("USN", "01P00A412500321"),
            ],
        );
        assert!(
            parse_bambu_discovery_packet(&valid, Ipv4Addr::new(192, 168, 87, 22), NETWORK,)
                .is_none()
        );

        let not_alive = packet(
            "NOTIFY * HTTP/1.1",
            &[
                ("NT", "urn:bambulab-com:device:3dprinter:1"),
                ("NTS", "ssdp:byebye"),
                ("USN", "01P00A412500321"),
            ],
        );
        assert!(
            parse_bambu_discovery_packet(&not_alive, Ipv4Addr::new(192, 168, 86, 22), NETWORK,)
                .is_none()
        );
    }

    #[test]
    fn rejects_non_bambu_packets_and_unsafe_serials() {
        let non_bambu = packet(
            "NOTIFY * HTTP/1.1",
            &[
                ("NT", "urn:example:device:printer:1"),
                ("NTS", "ssdp:alive"),
                ("USN", "01P00A412500321"),
            ],
        );
        assert!(
            parse_bambu_discovery_packet(&non_bambu, Ipv4Addr::new(192, 168, 86, 22), NETWORK,)
                .is_none()
        );

        let unsafe_serial = packet(
            "NOTIFY * HTTP/1.1",
            &[
                ("NT", "urn:bambulab-com:device:3dprinter:1"),
                ("NTS", "ssdp:alive"),
                ("USN", "01P00A4125/INJECTED"),
            ],
        );
        assert!(parse_bambu_discovery_packet(
            &unsafe_serial,
            Ipv4Addr::new(192, 168, 86, 22),
            NETWORK,
        )
        .is_none());
    }
}
