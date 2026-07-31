#[path = "../src/local_service_advertisement.rs"]
mod local_service_advertisement;

use local_service_advertisement::{
    AdvertisementError, LocalServiceAdvertisement, LocalServiceAdvertisementConfig,
    COMPANION_SERVICE_TYPE,
};
use std::net::{IpAddr, Ipv4Addr, ToSocketAddrs};
use std::time::{Duration, Instant};

#[test]
fn public_contract_uses_one_fixed_companion_service_type() {
    assert_eq!(COMPANION_SERVICE_TYPE, "_filament-manager._tcp.local.");
}

#[test]
fn public_contract_rejects_all_interface_advertising() {
    let config = LocalServiceAdvertisementConfig {
        hostname: "filament-manager-a7c4".to_string(),
        instance_name: "Filament Manager A7C4".to_string(),
        address: Ipv4Addr::new(192, 168, 1, 42),
        port: 4278,
        interface_index: 0,
    };
    assert_eq!(config.validate(), Err(AdvertisementError::InvalidInterface));
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[test]
#[ignore = "requires an active private interface and explicit smoke-test environment values"]
fn native_registration_smoke_test() {
    let config = native_smoke_config(
        "filament-manager-native-smoke",
        "Filament Manager Native Smoke",
    );
    let address = config.address;
    let registration = LocalServiceAdvertisement::register(config).expect("native registration");
    assert_eq!(
        registration.hostname(),
        "filament-manager-native-smoke.local"
    );
    registration.health().expect("healthy registration");

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let resolves_to_selected_address = (registration.hostname(), 4278)
            .to_socket_addrs()
            .map(|addresses| {
                addresses
                    .map(|socket| socket.ip())
                    .any(|resolved| resolved == IpAddr::V4(address))
            })
            .unwrap_or(false);
        if resolves_to_selected_address {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "stable local name did not resolve"
        );
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[test]
#[ignore = "requires an active private interface and explicit smoke-test environment values"]
fn native_name_collision_fails_closed() {
    let first = LocalServiceAdvertisement::register(native_smoke_config(
        "filament-manager-native-collision-smoke",
        "Filament Manager Native Collision Smoke",
    ))
    .expect("first native registration");

    let second = LocalServiceAdvertisement::register(native_smoke_config(
        "filament-manager-native-collision-smoke",
        "Filament Manager Native Collision Smoke",
    ));
    assert!(
        second.is_err(),
        "a duplicate stable identity must fail closed"
    );
    first.health().expect("first registration remains healthy");
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_smoke_config(hostname: &str, instance_name: &str) -> LocalServiceAdvertisementConfig {
    let address = std::env::var("FILAMENT_MANAGER_MDNS_SMOKE_ADDRESS")
        .expect("set FILAMENT_MANAGER_MDNS_SMOKE_ADDRESS")
        .parse()
        .expect("valid private IPv4 address");
    let interface_index = std::env::var("FILAMENT_MANAGER_MDNS_SMOKE_INTERFACE_INDEX")
        .expect("set FILAMENT_MANAGER_MDNS_SMOKE_INTERFACE_INDEX")
        .parse()
        .expect("valid non-zero interface index");
    LocalServiceAdvertisementConfig {
        hostname: hostname.to_string(),
        instance_name: instance_name.to_string(),
        address,
        port: 4278,
        interface_index,
    }
}
