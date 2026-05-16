use crate::backend::filament_database::{FilamentDatabase, TrustedLanSettingsRow};
use crate::trusted_lan_runtime_commands::load_trusted_lan_runtime;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-main-{test_name}-{nanos}.db"))
}

#[test]
fn trusted_lan_runtime_keeps_enabled_state_from_settings() {
    let db_path = temp_db_path("trusted-lan-dark-startup");
    let result = (|| -> Result<(), String> {
        {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            db.save_trusted_lan_settings(&TrustedLanSettingsRow {
                enabled: true,
                selected_interface_name: Some("Wi-Fi".to_string()),
                selected_interface_address: Some("192.168.1.50".to_string()),
                listen_port: 4278,
            })
            .map_err(|error| error.to_string())?;
        }

        let runtime = load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
        let snapshot = runtime.snapshot();
        assert!(snapshot.enabled);
        assert_eq!(snapshot.selected_interface_name.as_deref(), Some("Wi-Fi"));
        assert_eq!(
            snapshot.selected_interface_address.as_deref(),
            Some("192.168.1.50")
        );
        assert_eq!(snapshot.listen_port, 4278);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("{error}");
    }
}

#[cfg(target_os = "windows")]
#[test]
fn windows_storage_prefers_existing_db_location() {
    use super::resolve_windows_storage_dir;
    use crate::document_commands::chrono_id;

    let base =
        std::env::temp_dir().join(format!("filament-manager-windows-storage-{}", chrono_id()));
    let roaming_dir = base.join("roaming");
    let local_dir = base.join("local");
    let result = (|| -> Result<(), String> {
        std::fs::create_dir_all(&roaming_dir).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

        let selected_without_db =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_without_db, local_dir);

        std::fs::write(roaming_dir.join("bambu.db"), b"roaming-db")
            .map_err(|error| error.to_string())?;
        let selected_with_roaming =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_with_roaming, roaming_dir);

        std::fs::write(local_dir.join("bambu.db"), b"local-db")
            .map_err(|error| error.to_string())?;
        let selected_with_local =
            resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
        assert_eq!(selected_with_local, local_dir);

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&base);
    if let Err(error) = result {
        panic!("{error}");
    }
}
