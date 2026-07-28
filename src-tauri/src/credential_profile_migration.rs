use crate::backend::filament_database::FilamentDatabase;
use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
use crate::inventory_maintenance_commands::StoredCredentialScopes;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct CredentialProfileMigrationStats {
    pub(crate) credentials_moved: usize,
}

/// Moves credentials created by releases that scoped platform storage directly
/// to `library_sync_library_id` into the independent, machine-local profile.
///
/// The completion marker is machine-local database state. It is deliberately
/// excluded from portable backups and Windows legacy merges, so a restored or
/// borrowed library identity can never become a credential lookup key.
pub(crate) fn migrate_legacy_credential_profile(
    db_path: &str,
    credentials: &CredentialStore,
) -> Result<CredentialProfileMigrationStats, String> {
    let db = FilamentDatabase::open_exclusive_maintenance(db_path).map_err(|error| {
        format!("Failed to open database for credential-profile migration: {error}")
    })?;
    if db
        .credential_store_profile_migration_completed()
        .map_err(|error| format!("Failed to inspect credential-profile migration state: {error}"))?
    {
        return Ok(CredentialProfileMigrationStats::default());
    }

    let legacy_profile_id = db
        .get_library_sync_library_id()
        .map_err(|error| format!("Failed to load the legacy credential profile: {error}"))?;
    let target_profile_id = db
        .get_or_create_credential_store_profile_id()
        .map_err(|error| format!("Failed to load the local credential profile: {error}"))?;
    let source = credentials
        .scoped_to_profile_id(&legacy_profile_id)
        .map_err(|error| format!("Legacy credential profile is invalid: {error}"))?;
    let target = credentials
        .scoped_to_profile_id(&target_profile_id)
        .map_err(|error| format!("Local credential profile is invalid: {error}"))?;

    let mut stats = CredentialProfileMigrationStats::default();
    if source
        .profile_scope_digest()
        .map_err(|error| error.to_string())?
        != target
            .profile_scope_digest()
            .map_err(|error| error.to_string())?
    {
        let scopes = StoredCredentialScopes::from_database(&db)
            .map_err(|error| format!("Failed to inspect credential scopes: {error}"))?;
        for key in scopes.credential_keys()? {
            if migrate_credential(&source, &target, &key)? {
                stats.credentials_moved += 1;
            }
        }
    }

    db.mark_credential_store_profile_migration_completed()
        .map_err(|error| format!("Failed to finalize credential-profile migration: {error}"))?;
    Ok(stats)
}

fn migrate_credential(
    source: &CredentialStore,
    target: &CredentialStore,
    key: &CredentialKey,
) -> Result<bool, String> {
    let Some(source_value) = source
        .get(key)
        .map_err(|error| format!("Failed to read a legacy platform credential: {error}"))?
    else {
        return Ok(false);
    };

    match target
        .get(key)
        .map_err(|error| format!("Failed to inspect the local platform credential: {error}"))?
    {
        Some(target_value) if target_value.expose_bytes() == source_value.expose_bytes() => {}
        Some(_) => {
            return Err(
                "Credential-profile migration found conflicting platform credentials.".to_string(),
            )
        }
        None => {
            target
                .set(
                    key,
                    &SecretValue::from_bytes(source_value.expose_bytes().to_vec()),
                )
                .map_err(|error| {
                    format!("Failed to move a credential into the local profile: {error}")
                })?;
            let verification = target
                .get(key)
                .map_err(|error| {
                    format!("Failed to verify the migrated platform credential: {error}")
                })
                .and_then(|stored| {
                    let stored = stored.ok_or_else(|| {
                        "The migrated platform credential was missing during verification."
                            .to_string()
                    })?;
                    if stored.expose_bytes() == source_value.expose_bytes() {
                        Ok(())
                    } else {
                        Err(
                            "The migrated platform credential did not match during verification."
                                .to_string(),
                        )
                    }
                });
            if let Err(error) = verification {
                return match target.delete(key) {
                    Ok(_) => Err(error),
                    Err(cleanup_error) => Err(format!(
                        "{error} Cleanup of the unverified credential also failed: {cleanup_error}"
                    )),
                };
            }
        }
    }

    source
        .delete(key)
        .map_err(|error| format!("Failed to remove a migrated legacy credential: {error}"))?;
    if source
        .get(key)
        .map_err(|error| format!("Failed to verify legacy credential cleanup: {error}"))?
        .is_some()
    {
        return Err("A migrated legacy credential remained after cleanup.".to_string());
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::migrate_legacy_credential_profile;
    use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
    use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "filament-manager-profile-migration-{label}-{}-{nonce}.sqlite",
            std::process::id()
        ))
    }

    #[test]
    fn library_id_change_and_restart_keep_machine_local_credentials() {
        let db_path = temp_db_path("restart");
        let db = FilamentDatabase::open(&db_path).expect("create database");
        db.apply_schema().expect("apply schema");
        db.set_setting("library_sync_library_id", "legacy-local-library")
            .expect("set legacy library profile");
        db.upsert_printer_with_ams("printer-1", "Bambu Lab P1S", "Printer", 1, 4)
            .expect("create printer");
        db.save_bambu_live_integration(
            "printer-1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.0.2.10".to_string()),
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
        .expect("save integration");
        let host = "http://host.local:4278";
        let mut settings = db.get_library_sync_settings().expect("library settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(host.to_string());
        db.save_library_sync_settings(&settings)
            .expect("save client host");
        let local_profile_id = db
            .get_or_create_credential_store_profile_id()
            .expect("create local profile");
        drop(db);

        let stores = CredentialStore::in_memory();
        let legacy = stores
            .scoped_to_profile_id("legacy-local-library")
            .expect("legacy profile");
        let current = stores
            .scoped_to_profile_id(&local_profile_id)
            .expect("local profile");
        let bambu_key =
            CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
                .expect("Bambu key");
        let library_key =
            CredentialKey::library_sync_client_device_token(host).expect("library key");
        legacy
            .set(
                &bambu_key,
                &SecretValue::from_utf8("access-code".to_string()),
            )
            .expect("store legacy Bambu credential");
        legacy
            .set(
                &library_key,
                &SecretValue::from_utf8("device-token".to_string()),
            )
            .expect("store legacy library credential");

        let migrated =
            migrate_legacy_credential_profile(db_path.to_string_lossy().as_ref(), &current)
                .expect("migrate legacy profile");
        assert_eq!(migrated.credentials_moved, 2);
        assert!(legacy.get(&bambu_key).expect("legacy Bambu read").is_none());
        assert!(legacy
            .get(&library_key)
            .expect("legacy library read")
            .is_none());

        let db = FilamentDatabase::open(&db_path).expect("reopen database");
        let mut settings = db.get_library_sync_settings().expect("read settings");
        settings.library_id = "remote-library".to_string();
        db.save_library_sync_settings(&settings)
            .expect("switch client library identity");
        assert_eq!(
            db.get_or_create_credential_store_profile_id()
                .expect("stable local profile"),
            local_profile_id
        );
        drop(db);

        let restarted = stores
            .scoped_to_profile_id(&local_profile_id)
            .expect("restart profile");
        assert_eq!(
            restarted
                .get(&bambu_key)
                .expect("restart Bambu read")
                .expect("restart Bambu credential")
                .expose_utf8()
                .expect("UTF-8"),
            "access-code"
        );
        assert_eq!(
            restarted
                .get(&library_key)
                .expect("restart library read")
                .expect("restart library credential")
                .expose_utf8()
                .expect("UTF-8"),
            "device-token"
        );

        let remote_legacy = stores
            .scoped_to_profile_id("remote-library")
            .expect("remote legacy profile");
        remote_legacy
            .set(
                &library_key,
                &SecretValue::from_utf8("borrowed-token".to_string()),
            )
            .expect("store unrelated legacy token");
        assert_eq!(
            migrate_legacy_credential_profile(db_path.to_string_lossy().as_ref(), &restarted)
                .expect("completed migration is idempotent")
                .credentials_moved,
            0
        );
        assert_eq!(
            restarted
                .get(&library_key)
                .expect("local token read")
                .expect("local token")
                .expose_utf8()
                .expect("UTF-8"),
            "device-token"
        );

        let _ = std::fs::remove_file(db_path);
    }
}
