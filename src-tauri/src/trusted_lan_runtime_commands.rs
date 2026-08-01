use crate::backend::filament_database::FilamentDatabase;
use crate::companion_api;
use crate::state::{AppState, TrustedLanCompanionRuntime};
use crate::trusted_lan_interfaces::current_trusted_lan_interface_selection;
use sha2::{Digest, Sha256};

pub(crate) fn load_trusted_lan_runtime(
    db_path: &str,
) -> Result<TrustedLanCompanionRuntime, String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let mut settings = db
        .get_trusted_lan_settings()
        .map_err(|error| error.to_string())?;
    let library_id = db
        .get_library_sync_library_id()
        .map_err(|error| error.to_string())?;
    if let (Some(name), Some(address)) = (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        if let Some((current_name, current_address)) =
            current_trusted_lan_interface_selection(name, address)
        {
            if current_name != name.trim() || current_address != address.trim() {
                settings.selected_interface_name = Some(current_name);
                settings.selected_interface_address = Some(current_address);
                db.save_trusted_lan_settings(&settings)
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    let runtime = TrustedLanCompanionRuntime::new(settings.listen_port)
        .with_enabled(settings.enabled)
        .with_advertised_hostname(companion_local_hostname(&library_id));
    let runtime = match (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        (Some(name), Some(address)) if !name.trim().is_empty() && !address.trim().is_empty() => {
            runtime.with_selected_interface(name.trim(), address.trim())
        }
        _ => runtime,
    };
    Ok(runtime)
}

pub(crate) fn companion_local_hostname(library_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"filament-manager-companion-host-v2\0");
    hasher.update(library_id.trim().as_bytes());
    let digest = hasher.finalize();
    format!("fm-{}.local", short_hostname_token(&digest))
}

fn short_hostname_token(digest: &[u8]) -> String {
    // Avoid characters that are easy to confuse when the address has to be typed on a device
    // without a camera or clipboard. Eight base-30 characters retain over 39 bits of the digest;
    // mDNS conflict detection still fails closed if two libraries ever choose the same label.
    const ALPHABET: &[u8; 30] = b"23456789abcdefghjkmnpqrstvwxyz";
    const TOKEN_LENGTH: usize = 8;
    const TOKEN_SPACE: u64 = 656_100_000_000; // 30^8

    let mut value = digest
        .iter()
        .take(6)
        .fold(0_u64, |value, byte| (value << 8) | u64::from(*byte))
        % TOKEN_SPACE;
    let mut token = [b'2'; TOKEN_LENGTH];
    for character in token.iter_mut().rev() {
        *character = ALPHABET[(value % ALPHABET.len() as u64) as usize];
        value /= ALPHABET.len() as u64;
    }
    String::from_utf8(token.to_vec()).expect("hostname alphabet is ASCII")
}

pub(crate) fn reload_trusted_lan_runtime_after_library_change(
    state: &AppState,
) -> Result<(), String> {
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_trusted_lan_settings()
        .map_err(|error| error.to_string())?;
    let library_id = db
        .get_library_sync_library_id()
        .map_err(|error| error.to_string())?;
    let selected_interface = match (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        (Some(name), Some(address)) if !name.trim().is_empty() && !address.trim().is_empty() => {
            Some((name.trim().to_string(), address.trim().to_string()))
        }
        _ => None,
    };
    state.companion.trusted_lan.apply_loaded_config(
        settings.enabled,
        selected_interface,
        settings.listen_port,
        &companion_local_hostname(&library_id),
    );

    let reconcile_state = state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = companion_api::reconcile_trusted_lan_server(reconcile_state).await {
            eprintln!("Trusted-LAN companion reload failed: {error}");
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::companion_local_hostname;

    #[test]
    fn companion_local_hostname_is_stable_private_and_dns_safe() {
        let first = companion_local_hostname("library-one");
        let same = companion_local_hostname("library-one");
        let other = companion_local_hostname("library-two");

        assert_eq!(first, same);
        assert_ne!(first, other);
        assert_eq!(first, "fm-zm7jz986.local");
        assert!(first.starts_with("fm-"));
        assert!(first.ends_with(".local"));
        assert_eq!(first.len(), "fm-23456789.local".len());
        assert!(!first.contains("library-one"));
        assert!(first
            .trim_start_matches("fm-")
            .trim_end_matches(".local")
            .bytes()
            .all(|character| b"23456789abcdefghjkmnpqrstvwxyz".contains(&character)));
    }
}
