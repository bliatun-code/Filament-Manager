use crate::app_error::internal_command_error;
use crate::credential_store::CredentialKey;
use crate::inventory_maintenance_commands::CredentialDeletionRollback;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::{with_db, with_inventory};

#[tauri::command]
pub(crate) fn delete_printer(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    delete_printer_inner(&state, &printer_id)
}

pub(crate) fn delete_printer_inner(state: &AppState, printer_id: &str) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let integration = with_db(state, |db| {
        Ok(db
            .list_bambu_live_integrations()?
            .into_iter()
            .find(|entry| entry.printer_id == printer_id)
            .map(|entry| entry.config))
    })?;
    let mut binding_ids = integration
        .as_ref()
        .map(|config| config.access_code_stale_binding_ids.clone())
        .unwrap_or_default();
    if let Some(current) = integration.and_then(|config| config.access_code_binding_id) {
        binding_ids.push(current);
    }
    binding_ids.retain(|binding_id| !binding_id.trim().is_empty());
    binding_ids.sort_unstable();
    binding_ids.dedup();
    let credential_keys = binding_ids
        .into_iter()
        .map(|binding_id| CredentialKey::bambu_access_code(printer_id, &binding_id))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| internal_command_error("Build Bambu credential identity", error))?;
    let rollback = CredentialDeletionRollback::capture(state, credential_keys.clone(), false)
        .map_err(|error| {
            internal_command_error("Snapshot Bambu credential before printer deletion", error)
        })?;
    for credential_key in &credential_keys {
        if let Err(error) = state.credentials.delete(credential_key) {
            return match rollback.restore(state) {
                Ok(()) => Err(internal_command_error(
                    "Delete Bambu printer credential",
                    error,
                )),
                Err(rollback_error) => Err(internal_command_error(
                    "Rollback Bambu credential after failed printer cleanup",
                    format!("{error}; rollback failed: {rollback_error}"),
                )),
            };
        }
    }

    match with_inventory(state, |engine| engine.delete_printer(printer_id)) {
        Ok(()) => Ok(()),
        Err(error) => match rollback.restore(state) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(internal_command_error(
                "Rollback Bambu credential after failed printer deletion",
                format!("{error}; rollback failed: {rollback_error}"),
            )),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::delete_printer_inner;
    use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
    use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_state() -> AppState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-delete-printer-{}-{suffix}.sqlite",
            std::process::id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply schema");
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    #[test]
    fn deleting_printer_removes_its_secure_access_code_first() {
        let state = test_state();
        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Printer", 1, 4)
            .expect("create printer");
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.42".to_string()),
                access_code: None,
                access_code_configured: true,
                access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: None,
            },
        )
        .expect("save Bambu integration");
        drop(db);

        let key = CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
            .expect("credential key");
        state
            .credentials
            .set(&key, &SecretValue::from_utf8("access-code".to_string()))
            .expect("store credential");

        delete_printer_inner(&state, "printer_1").expect("delete printer");

        assert!(state
            .credentials
            .get(&key)
            .expect("read credential")
            .is_none());
        let db = FilamentDatabase::open(&state.db_path).expect("reopen test database");
        assert!(!db.printer_exists("printer_1").expect("query printer"));
        assert!(db
            .list_bambu_live_integrations()
            .expect("query integrations")
            .is_empty());
        drop(db);
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_printer_deletion_restores_its_secure_access_code() {
        let state = test_state();
        let key =
            CredentialKey::bambu_access_code("missing_printer", "11111111111111111111111111111111")
                .expect("credential key");
        state
            .credentials
            .set(&key, &SecretValue::from_utf8("access-code".to_string()))
            .expect("store credential");

        delete_printer_inner(&state, "missing_printer")
            .expect_err("missing printer must fail deletion");

        assert_eq!(
            state
                .credentials
                .get(&key)
                .expect("read credential")
                .expect("credential restored")
                .expose_utf8()
                .expect("UTF-8"),
            "access-code"
        );
        let _ = std::fs::remove_file(&state.db_path);
    }
}
