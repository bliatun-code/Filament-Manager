//! Stable, local-only DNS-SD advertisement for the Companion service.
//!
//! This module deliberately owns only the platform registration lifetime. Network-change
//! detection and Companion listener rebinding belong to the runtime that integrates it.

use std::fmt;
use std::net::Ipv4Addr;

#[cfg(target_os = "macos")]
#[path = "local_service_advertisement/macos.rs"]
mod platform;
#[cfg(target_os = "windows")]
#[path = "local_service_advertisement/windows.rs"]
mod platform;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[path = "local_service_advertisement/unsupported.rs"]
mod platform;

/// DNS-SD service type used by Companion hosts and desktop clients.
pub(crate) const COMPANION_SERVICE_TYPE: &str = "_filament-manager._tcp.local.";

const LOCAL_SUFFIX: &str = ".local";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LocalServiceAdvertisementConfig {
    /// Stable DNS label, with or without the `.local` suffix.
    pub hostname: String,
    /// Human-readable DNS-SD instance name. This is not placed in logs by this module.
    pub instance_name: String,
    pub address: Ipv4Addr,
    pub port: u16,
    /// OS interface index. Zero (all interfaces) is intentionally rejected.
    pub interface_index: u32,
}

impl LocalServiceAdvertisementConfig {
    pub(crate) fn validate(&self) -> Result<ValidatedAdvertisementConfig, AdvertisementError> {
        let host_label = normalize_host_label(&self.hostname)?;
        validate_instance_name(&self.instance_name)?;
        if !self.address.is_private() {
            return Err(AdvertisementError::NonPrivateAddress);
        }
        if self.port == 0 {
            return Err(AdvertisementError::InvalidPort);
        }
        if self.interface_index == 0 {
            return Err(AdvertisementError::InvalidInterface);
        }

        Ok(ValidatedAdvertisementConfig {
            hostname: format!("{host_label}{LOCAL_SUFFIX}"),
            instance_name: self.instance_name.clone(),
            address: self.address,
            port: self.port,
            interface_index: self.interface_index,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ValidatedAdvertisementConfig {
    hostname: String,
    instance_name: String,
    address: Ipv4Addr,
    port: u16,
    interface_index: u32,
}

impl ValidatedAdvertisementConfig {
    pub(crate) fn hostname(&self) -> &str {
        &self.hostname
    }

    pub(crate) fn fqdn(&self) -> String {
        format!("{}.", self.hostname)
    }

    #[cfg(any(target_os = "windows", test))]
    pub(crate) fn service_instance_fqdn(&self) -> String {
        format!("{}.{}", self.instance_name, COMPANION_SERVICE_TYPE)
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn instance_name(&self) -> &str {
        &self.instance_name
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn address(&self) -> Ipv4Addr {
        self.address
    }

    #[cfg(any(target_os = "windows", test))]
    pub(crate) fn windows_ip4_address_host_order(&self) -> u32 {
        // WinDNS defines IP4_ADDRESS as a host-order numeric value (for example,
        // 127.0.0.1 is 0x7f000001), independent of the CPU's byte order.
        u32::from_be_bytes(self.address.octets())
    }

    #[cfg(any(target_os = "windows", test))]
    pub(crate) fn windows_registration_identity_matches(
        &self,
        registered_instance_name: &str,
        registered_hostname: &str,
    ) -> bool {
        dns_name_matches(&self.service_instance_fqdn(), registered_instance_name)
            && dns_name_matches(&self.fqdn(), registered_hostname)
    }

    pub(crate) fn port(&self) -> u16 {
        self.port
    }

    pub(crate) fn interface_index(&self) -> u32 {
        self.interface_index
    }
}

/// RAII guard. Dropping the guard removes both the host address record and service record.
pub(crate) struct LocalServiceAdvertisement {
    config: ValidatedAdvertisementConfig,
    registration: platform::Registration,
}

impl LocalServiceAdvertisement {
    pub(crate) fn register(
        config: LocalServiceAdvertisementConfig,
    ) -> Result<Self, AdvertisementError> {
        let config = config.validate()?;
        let registration = platform::Registration::register(&config)?;
        Ok(Self {
            config,
            registration,
        })
    }

    pub(crate) fn hostname(&self) -> &str {
        self.config.hostname()
    }

    /// Reports asynchronous platform failures without emitting host or service metadata.
    pub(crate) fn health(&self) -> Result<(), AdvertisementError> {
        self.registration.health()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum AdvertisementError {
    InvalidHostname,
    InvalidInstanceName,
    NonPrivateAddress,
    InvalidPort,
    InvalidInterface,
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    UnsupportedPlatform,
    PlatformFailure(i64),
    #[cfg(target_os = "windows")]
    RegisteredIdentityChanged,
    RegistrationTimedOut,
    RegistrationWorkerStopped,
}

impl fmt::Display for AdvertisementError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidHostname => formatter.write_str("invalid stable local hostname"),
            Self::InvalidInstanceName => formatter.write_str("invalid DNS-SD instance name"),
            Self::NonPrivateAddress => {
                formatter.write_str("advertisement requires a private IPv4 address")
            }
            Self::InvalidPort => formatter.write_str("advertisement requires a non-zero port"),
            Self::InvalidInterface => {
                formatter.write_str("advertisement requires one explicit interface")
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            Self::UnsupportedPlatform => {
                formatter.write_str("local service advertisement is unsupported on this platform")
            }
            Self::PlatformFailure(code) => {
                write!(formatter, "local service registration failed ({code})")
            }
            #[cfg(target_os = "windows")]
            Self::RegisteredIdentityChanged => formatter
                .write_str("local service registration changed the requested stable identity"),
            Self::RegistrationTimedOut => {
                formatter.write_str("local service registration timed out")
            }
            Self::RegistrationWorkerStopped => {
                formatter.write_str("local service registration worker stopped")
            }
        }
    }
}

impl std::error::Error for AdvertisementError {}

fn normalize_host_label(value: &str) -> Result<String, AdvertisementError> {
    let trimmed = value.trim().trim_end_matches('.');
    let lowercase = trimmed.to_ascii_lowercase();
    let without_suffix = lowercase.strip_suffix(LOCAL_SUFFIX).unwrap_or(&lowercase);
    if without_suffix.is_empty()
        || without_suffix.len() > 63
        || without_suffix.starts_with('-')
        || without_suffix.ends_with('-')
        || !without_suffix
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-')
    {
        return Err(AdvertisementError::InvalidHostname);
    }
    Ok(without_suffix.to_string())
}

fn validate_instance_name(value: &str) -> Result<(), AdvertisementError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 63
        || trimmed != value
        || !trimmed
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b' ')
    {
        return Err(AdvertisementError::InvalidInstanceName);
    }
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn dns_name_matches(expected: &str, registered: &str) -> bool {
    let expected = expected.strip_suffix('.').unwrap_or(expected);
    let registered = registered.strip_suffix('.').unwrap_or(registered);
    expected.eq_ignore_ascii_case(registered)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> LocalServiceAdvertisementConfig {
        LocalServiceAdvertisementConfig {
            hostname: "filament-manager-a7c4.local.".to_string(),
            instance_name: "Filament Manager A7C4".to_string(),
            address: Ipv4Addr::new(192, 168, 1, 42),
            port: 4278,
            interface_index: 7,
        }
    }

    #[test]
    fn normalizes_stable_local_hostname() {
        let validated = valid_config().validate().expect("valid config");
        assert_eq!(validated.hostname(), "filament-manager-a7c4.local");
        assert_eq!(validated.fqdn(), "filament-manager-a7c4.local.");
        assert_eq!(validated.windows_ip4_address_host_order(), 0xc0a8_012a);
        assert_eq!(
            validated.service_instance_fqdn(),
            "Filament Manager A7C4._filament-manager._tcp.local."
        );
    }

    #[test]
    fn windows_registration_identity_rejects_automatic_renaming() {
        let validated = valid_config().validate().expect("valid config");

        assert!(validated.windows_registration_identity_matches(
            "filament manager a7c4._FILAMENT-MANAGER._TCP.LOCAL",
            "FILAMENT-MANAGER-A7C4.LOCAL",
        ));
        assert!(!validated.windows_registration_identity_matches(
            "Filament Manager A7C4 (2)._filament-manager._tcp.local.",
            "filament-manager-a7c4.local.",
        ));
        assert!(!validated.windows_registration_identity_matches(
            "Filament Manager A7C4._filament-manager._tcp.local.",
            "filament-manager-a7c4-2.local.",
        ));
        assert!(!validated.windows_registration_identity_matches(
            "Filament Manager A7C4._filament-manager._tcp.local..",
            "filament-manager-a7c4.local.",
        ));
    }

    #[test]
    fn accepts_a_bare_hostname_label() {
        let mut config = valid_config();
        config.hostname = "Filament-Manager-A7C4".to_string();
        assert_eq!(
            config.validate().expect("valid hostname").hostname(),
            "filament-manager-a7c4.local"
        );
    }

    #[test]
    fn treats_the_local_suffix_case_insensitively() {
        let mut config = valid_config();
        config.hostname = "Filament-Manager-A7C4.LoCaL.".to_string();
        assert_eq!(
            config.validate().expect("valid hostname").hostname(),
            "filament-manager-a7c4.local"
        );
    }

    #[test]
    fn rejects_names_that_could_escape_a_dns_label() {
        for hostname in [
            "",
            "-filament-manager",
            "filament-manager-",
            "filament.manager",
            "filament_manager",
            "filament manager",
        ] {
            let mut config = valid_config();
            config.hostname = hostname.to_string();
            assert_eq!(
                config.validate(),
                Err(AdvertisementError::InvalidHostname),
                "hostname: {hostname}"
            );
        }
    }

    #[test]
    fn rejects_unsafe_scope_and_unusable_listener_values() {
        let mut address = valid_config();
        address.address = Ipv4Addr::new(203, 0, 113, 5);
        assert_eq!(
            address.validate(),
            Err(AdvertisementError::NonPrivateAddress)
        );

        let mut port = valid_config();
        port.port = 0;
        assert_eq!(port.validate(), Err(AdvertisementError::InvalidPort));

        let mut interface = valid_config();
        interface.interface_index = 0;
        assert_eq!(
            interface.validate(),
            Err(AdvertisementError::InvalidInterface)
        );
    }

    #[test]
    fn errors_do_not_echo_network_or_instance_metadata() {
        let values = [
            AdvertisementError::InvalidHostname,
            AdvertisementError::InvalidInstanceName,
            AdvertisementError::NonPrivateAddress,
            AdvertisementError::PlatformFailure(-65548),
        ];
        for value in values {
            let message = value.to_string();
            assert!(!message.contains("192.168"));
            assert!(!message.contains("A7C4"));
        }
    }
}
