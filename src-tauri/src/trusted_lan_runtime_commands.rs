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
    hasher.update(b"filament-manager-companion-host-v1\0");
    hasher.update(library_id.trim().as_bytes());
    let digest = hasher.finalize();
    let suffix = digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("filament-manager-{suffix}.local")
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
        assert!(first.starts_with("filament-manager-"));
        assert!(first.ends_with(".local"));
        assert!(!first.contains("library-one"));
        assert!(first.chars().all(|character| character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '-' | '.')));
    }
}
