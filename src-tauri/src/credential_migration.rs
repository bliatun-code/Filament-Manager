use crate::backend::filament_database::FilamentDatabase;
use crate::credential_store::{
    new_credential_binding_id, normalize_credential_binding_id, CredentialKey, CredentialStore,
    SecretValue,
};
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_host_client::library_sync_device_token_key;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;

const SECURE_CREDENTIAL_MIGRATION_MARKER: &str = "secure_credential_storage_migration_v1";
const LEGACY_LIBRARY_SECRET_KEYS: [&str; 3] = [
    "library_sync_client_session_id",
    "library_sync_client_device_token",
    "library_sync_client_csrf_token",
];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct CredentialMigrationStats {
    pub(crate) bambu_access_codes_migrated: usize,
    pub(crate) bambu_credential_refs_repaired: usize,
    pub(crate) library_device_token_migrated: bool,
}

pub(crate) fn migrate_legacy_credentials(
    db_path: &str,
    credentials: &CredentialStore,
    runtime_auth: &LibrarySyncRuntimeAuth,
) -> Result<CredentialMigrationStats, String> {
    let db = FilamentDatabase::open_exclusive_maintenance(db_path)
        .map_err(|error| format!("Failed to open database for credential migration: {error}"))?;
    db.enable_secure_delete().map_err(|error| {
        format!("Failed to enable secure credential removal in SQLite: {error}")
    })?;
    let secure_compaction_completed = db
        .get_setting(SECURE_CREDENTIAL_MIGRATION_MARKER)
        .map_err(|error| format!("Failed to inspect credential migration state: {error}"))?
        .as_deref()
        == Some("complete");
    let mut stats = CredentialMigrationStats::default();
    let mut removed_plaintext = false;
    let scrubbed_obsolete_printer_tokens = db
        .scrub_legacy_printer_access_tokens()
        .map_err(|error| format!("Failed to scrub obsolete printer credentials: {error}"))?;
    removed_plaintext |= scrubbed_obsolete_printer_tokens > 0;

    for mut entry in db
        .list_bambu_live_integrations()
        .map_err(|error| format!("Failed to inspect Bambu credentials for migration: {error}"))?
    {
        let had_legacy_access_code = entry.config.access_code.is_some();
        let legacy_access_code = entry
            .config
            .access_code
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let current_binding_id = entry
            .config
            .access_code_binding_id
            .as_deref()
            .map(normalize_credential_binding_id)
            .transpose()
            .map_err(|error| format!("Failed to identify a Bambu credential: {error}"))?;
        let target_binding_id = current_binding_id
            .clone()
            .unwrap_or_else(new_credential_binding_id);
        let key = CredentialKey::bambu_access_code(&entry.printer_id, &target_binding_id)
            .map_err(|error| format!("Failed to identify a Bambu credential: {error}"))?;
        let legacy_key = CredentialKey::legacy_bambu_access_code(&entry.printer_id)
            .map_err(|error| format!("Failed to identify a legacy Bambu credential: {error}"))?;
        let existing_access_code = match read_stored_secret(credentials, &key, "Bambu access code")
        {
            Ok(value) => value,
            Err(error) if secure_compaction_completed && !had_legacy_access_code => {
                eprintln!(
                    "Secure Bambu credential could not be inspected during completed migration; startup will continue: {error}"
                );
                continue;
            }
            Err(error) => return Err(error),
        };
        let legacy_vault_access_code = if existing_access_code.is_none() {
            let read_result =
                read_stored_secret(credentials, &legacy_key, "legacy Bambu access code");
            match read_result {
                Ok(value) => value,
                Err(error) if secure_compaction_completed && !had_legacy_access_code => {
                    eprintln!(
                        "Legacy Bambu credential could not be inspected during completed migration; startup will continue: {error}"
                    );
                    continue;
                }
                Err(error) => return Err(error),
            }
        } else {
            None
        };
        let mut wrote_new_credential = false;
        if existing_access_code.is_none() {
            if let Some(access_code) = legacy_vault_access_code.as_ref() {
                write_and_verify_new_secret_bytes(
                    credentials,
                    &key,
                    access_code.expose_bytes(),
                    "Bambu access code",
                )?;
                wrote_new_credential = true;
                stats.bambu_access_codes_migrated += 1;
            } else if let Some(access_code) = legacy_access_code.as_deref() {
                write_and_verify_new_secret(credentials, &key, access_code, "Bambu access code")?;
                wrote_new_credential = true;
                stats.bambu_access_codes_migrated += 1;
            }
        }

        let credential_is_configured = existing_access_code.is_some() || wrote_new_credential;
        drop(legacy_vault_access_code);
        drop(existing_access_code);
        let previous_config = entry.config.clone();
        entry.config.access_code = None;
        entry.config.access_code_configured = credential_is_configured;
        entry.config.access_code_binding_id =
            credential_is_configured.then_some(target_binding_id.clone());
        let mut normalized_stale_binding_ids = entry
            .config
            .access_code_stale_binding_ids
            .drain(..)
            .filter_map(|binding_id| normalize_credential_binding_id(&binding_id).ok())
            .filter(|binding_id| binding_id != &target_binding_id)
            .collect::<Vec<_>>();
        normalized_stale_binding_ids.sort_unstable();
        normalized_stale_binding_ids.dedup();
        entry.config.access_code_stale_binding_ids = normalized_stale_binding_ids;
        if had_legacy_access_code || entry.config != previous_config {
            if let Err(error) =
                db.save_bambu_live_integration_atomically(&entry.printer_id, &entry.config)
            {
                let error =
                    format!("Failed to scrub a migrated Bambu access code from SQLite: {error}");
                return Err(rollback_new_credential_after_failure(
                    credentials,
                    &key,
                    wrote_new_credential,
                    "Bambu access code",
                    error,
                ));
            }
            removed_plaintext |= had_legacy_access_code;
            if !had_legacy_access_code {
                stats.bambu_credential_refs_repaired += 1;
            }
        }

        if credential_is_configured {
            if let Err(error) = credentials.delete(&legacy_key) {
                return Err(format!(
                    "Failed to remove the migrated legacy Bambu credential: {error}"
                ));
            }
            let mut cleanup_binding_ids = entry.config.access_code_stale_binding_ids.clone();
            cleanup_binding_ids.sort_unstable();
            cleanup_binding_ids.dedup();
            let mut remaining = Vec::new();
            for binding_id in cleanup_binding_ids {
                let stale_key = CredentialKey::bambu_access_code(&entry.printer_id, &binding_id)
                    .map_err(|error| error.to_string())?;
                match credentials.delete(&stale_key) {
                    Ok(_) => {}
                    Err(_) => remaining.push(binding_id),
                }
            }
            if remaining != entry.config.access_code_stale_binding_ids {
                entry.config.access_code_stale_binding_ids = remaining;
                db.save_bambu_live_integration_atomically(&entry.printer_id, &entry.config)
                    .map_err(|error| {
                        format!("Failed to record Bambu credential cleanup state: {error}")
                    })?;
            }
        } else {
            let _ = credentials.delete(&legacy_key);
            let _ = credentials.delete(&key);
        }
    }

    let had_legacy_library_secrets = LEGACY_LIBRARY_SECRET_KEYS
        .iter()
        .map(|key| {
            db.get_setting(key)
                .map(|value| value.is_some())
                .map_err(|error| {
                    format!("Failed to inspect legacy desktop client credentials: {error}")
                })
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .any(|present| present);
    let legacy_session_id = read_legacy_setting(&db, "library_sync_client_session_id")?;
    let legacy_device_token = read_legacy_setting(&db, "library_sync_client_device_token")?;
    let legacy_csrf_token = read_legacy_setting(&db, "library_sync_client_csrf_token")?;
    let legacy_expires_at = read_legacy_setting(&db, "library_sync_client_auth_expires_at")?;
    if let Some(device_token) = legacy_device_token.as_deref() {
        let settings = db
            .get_library_sync_settings()
            .map_err(|error| format!("Failed to inspect desktop client settings: {error}"))?;
        let stored_host_base_url = settings
            .host_base_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                "Desktop client credentials cannot be migrated without their host URL.".to_string()
            })?;
        let host_base_url = normalize_library_sync_base_url(stored_host_base_url)
            .map_err(|error| format!("Failed to normalize desktop client host: {error}"))?;
        let key = library_sync_device_token_key(&host_base_url)?;
        let legacy_key = CredentialKey::legacy_library_sync_client_device_token(&host_base_url)
            .map_err(|error| {
                format!("Desktop client legacy credential identity is invalid: {error}")
            })?;
        let existing_device_token =
            read_stored_secret(credentials, &key, "desktop client device token")?;
        let legacy_vault_device_token = if existing_device_token.is_none() {
            read_stored_secret(
                credentials,
                &legacy_key,
                "legacy desktop client device token",
            )?
        } else {
            None
        };
        let mut wrote_new_credential = false;
        let credential_matches_legacy = if let Some(existing) = existing_device_token.as_ref() {
            existing.expose_utf8().map_err(|error| {
                format!("Failed to decode desktop client device token from secure storage: {error}")
            })? == device_token
        } else if let Some(existing) = legacy_vault_device_token.as_ref() {
            write_and_verify_new_secret_bytes(
                credentials,
                &key,
                existing.expose_bytes(),
                "desktop client device token",
            )?;
            wrote_new_credential = true;
            stats.library_device_token_migrated = true;
            existing.expose_utf8().map_err(|error| {
                format!(
                    "Failed to decode legacy desktop client device token from secure storage: {error}"
                )
            })? == device_token
        } else {
            write_and_verify_new_secret(
                credentials,
                &key,
                device_token,
                "desktop client device token",
            )?;
            wrote_new_credential = true;
            stats.library_device_token_migrated = true;
            true
        };

        let previous_runtime_auth = runtime_auth.current()?;
        let installed_legacy_runtime =
            credential_matches_legacy && legacy_session_id.is_some() && legacy_csrf_token.is_some();
        if installed_legacy_runtime
            && let Err(error) = runtime_auth.replace_authenticated(
                &host_base_url,
                legacy_session_id.as_deref().unwrap_or_default(),
                legacy_csrf_token.as_deref().unwrap_or_default(),
                device_token,
            )
        {
            return Err(rollback_library_migration_after_failure(
                credentials,
                &key,
                wrote_new_credential,
                runtime_auth,
                previous_runtime_auth,
                false,
                format!("Failed to preserve desktop client session in memory: {error}"),
            ));
        }

        let trusted_expires_at = if credential_matches_legacy {
            legacy_expires_at.as_deref()
        } else {
            None
        };
        if let Err(error) =
            db.finalize_library_sync_client_auth_migration(&host_base_url, trusted_expires_at)
        {
            return Err(rollback_library_migration_after_failure(
                credentials,
                &key,
                wrote_new_credential,
                runtime_auth,
                previous_runtime_auth,
                installed_legacy_runtime,
                format!("Failed to scrub migrated desktop client credentials: {error}"),
            ));
        }
        credentials.delete(&legacy_key).map_err(|error| {
            format!("Failed to remove the migrated legacy desktop client credential: {error}")
        })?;
    } else {
        if had_legacy_library_secrets {
            db.scrub_library_sync_client_auth_secrets()
                .map_err(|error| {
                    format!("Failed to scrub incomplete desktop client credentials: {error}")
                })?;
        }
        let settings = db
            .get_library_sync_settings()
            .map_err(|error| format!("Failed to inspect desktop client settings: {error}"))?;
        if let Some(stored_host) = settings
            .host_base_url
            .as_deref()
            .map(str::trim)
            .filter(|host| !host.is_empty())
        {
            let host_base_url = normalize_library_sync_base_url(stored_host)
                .map_err(|error| format!("Failed to normalize desktop client host: {error}"))?;
            let key = library_sync_device_token_key(&host_base_url)?;
            let legacy_key = CredentialKey::legacy_library_sync_client_device_token(&host_base_url)
                .map_err(|error| {
                    format!("Desktop client legacy credential identity is invalid: {error}")
                })?;
            let current = match read_stored_secret(credentials, &key, "desktop client device token")
            {
                Ok(value) => value,
                Err(error) if secure_compaction_completed => {
                    eprintln!(
                        "Secure desktop client credential could not be inspected during completed migration; startup will continue: {error}"
                    );
                    None
                }
                Err(error) => return Err(error),
            };
            if current.is_none() {
                let legacy = match read_stored_secret(
                    credentials,
                    &legacy_key,
                    "legacy desktop client device token",
                ) {
                    Ok(value) => value,
                    Err(error) if secure_compaction_completed => {
                        eprintln!(
                            "Legacy desktop client credential could not be inspected during completed migration; startup will continue: {error}"
                        );
                        None
                    }
                    Err(error) => return Err(error),
                };
                if let Some(legacy) = legacy {
                    write_and_verify_new_secret_bytes(
                        credentials,
                        &key,
                        legacy.expose_bytes(),
                        "desktop client device token",
                    )?;
                    stats.library_device_token_migrated = true;
                    credentials.delete(&legacy_key).map_err(|error| {
                        format!(
                            "Failed to remove the migrated legacy desktop client credential: {error}"
                        )
                    })?;
                }
            } else {
                credentials.delete(&legacy_key).map_err(|error| {
                    format!(
                        "Failed to remove an obsolete legacy desktop client credential: {error}"
                    )
                })?;
            }
        }
    }
    if had_legacy_library_secrets {
        removed_plaintext = true;
    }

    if removed_plaintext || !secure_compaction_completed {
        db.compact_after_secret_removal().map_err(|error| {
            format!("Failed to compact SQLite after credential migration: {error}")
        })?;
        db.set_setting(SECURE_CREDENTIAL_MIGRATION_MARKER, "complete")
            .map_err(|error| {
                format!("Failed to record secure credential migration completion: {error}")
            })?;
    }

    Ok(stats)
}

fn read_legacy_setting(db: &FilamentDatabase, key: &str) -> Result<Option<String>, String> {
    db.get_setting(key)
        .map(|value| {
            value
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .map_err(|error| format!("Failed to inspect legacy desktop client credentials: {error}"))
}

fn read_stored_secret(
    credentials: &CredentialStore,
    key: &CredentialKey,
    label: &str,
) -> Result<Option<SecretValue>, String> {
    let stored = credentials
        .get(key)
        .map_err(|error| format!("Failed to read {label} from secure storage: {error}"))?;
    if let Some(stored) = stored.as_ref() {
        stored
            .expose_utf8()
            .map_err(|error| format!("Failed to decode {label} from secure storage: {error}"))?;
    }
    Ok(stored)
}

fn write_and_verify_new_secret(
    credentials: &CredentialStore,
    key: &CredentialKey,
    expected: &str,
    label: &str,
) -> Result<(), String> {
    let secret = SecretValue::from_utf8(expected.to_string());
    credentials
        .set(key, &secret)
        .map_err(|error| format!("Failed to migrate {label}: {error}"))?;

    let verification = read_stored_secret(credentials, key, label).and_then(|stored| {
        let stored = stored
            .ok_or_else(|| format!("Credential store did not retain the migrated {label}."))?;
        if stored
            .expose_utf8()
            .map_err(|error| format!("Failed to decode {label} from secure storage: {error}"))?
            == expected
        {
            Ok(())
        } else {
            Err(format!(
                "Credential store verification failed for the migrated {label}."
            ))
        }
    });
    if let Err(error) = verification {
        return Err(rollback_new_credential_after_failure(
            credentials,
            key,
            true,
            label,
            error,
        ));
    }
    Ok(())
}

fn write_and_verify_new_secret_bytes(
    credentials: &CredentialStore,
    key: &CredentialKey,
    expected: &[u8],
    label: &str,
) -> Result<(), String> {
    let secret = SecretValue::from_bytes(expected.to_vec());
    credentials
        .set(key, &secret)
        .map_err(|error| format!("Failed to migrate {label}: {error}"))?;
    let verification = credentials
        .get(key)
        .map_err(|error| format!("Failed to verify migrated {label}: {error}"))
        .and_then(|stored| {
            let stored =
                stored.ok_or_else(|| format!("Credential store did not retain {label}."))?;
            if stored.expose_bytes() == expected {
                Ok(())
            } else {
                Err(format!(
                    "Credential store verification failed for the migrated {label}."
                ))
            }
        });
    if let Err(error) = verification {
        return Err(rollback_new_credential_after_failure(
            credentials,
            key,
            true,
            label,
            error,
        ));
    }
    Ok(())
}

fn rollback_new_credential_after_failure(
    credentials: &CredentialStore,
    key: &CredentialKey,
    wrote_new_credential: bool,
    label: &str,
    primary_error: String,
) -> String {
    match rollback_new_credential(credentials, key, wrote_new_credential, label) {
        Ok(()) => primary_error,
        Err(rollback_error) => {
            format!("{primary_error} Credential rollback also failed: {rollback_error}.")
        }
    }
}

fn rollback_new_credential(
    credentials: &CredentialStore,
    key: &CredentialKey,
    wrote_new_credential: bool,
    label: &str,
) -> Result<(), String> {
    if !wrote_new_credential {
        return Ok(());
    }

    credentials
        .delete(key)
        .map_err(|error| format!("could not remove the newly-created {label}: {error}"))
        .and_then(|deleted| {
            if !deleted {
                return Err(format!(
                    "the newly-created {label} was missing during rollback"
                ));
            }
            match credentials.get(key) {
                Ok(None) => Ok(()),
                Ok(Some(_)) => Err(format!("the newly-created {label} remained after rollback")),
                Err(error) => Err(format!("could not verify {label} rollback: {error}")),
            }
        })
}

fn rollback_library_migration_after_failure(
    credentials: &CredentialStore,
    key: &CredentialKey,
    wrote_new_credential: bool,
    runtime_auth: &LibrarySyncRuntimeAuth,
    previous_runtime_auth: Option<crate::library_sync_runtime_auth::LibrarySyncRuntimeSession>,
    runtime_changed: bool,
    primary_error: String,
) -> String {
    let mut error = primary_error;
    let credential_rollback = rollback_new_credential(
        credentials,
        key,
        wrote_new_credential,
        "desktop client device token",
    );
    if let Err(rollback_error) = credential_rollback.as_ref() {
        error.push_str(&format!(
            " Credential rollback also failed: {rollback_error}."
        ));
    }

    // If secure-storage rollback is incomplete, never reactivate a reusable device token in the
    // volatile session. Even a runtime that was not changed by this attempt must be cleared because
    // the durable credential state for this host is now unknown.
    let runtime_result = if credential_rollback.is_err() {
        runtime_auth.clear()
    } else if runtime_changed {
        match previous_runtime_auth {
            Some(previous) => runtime_auth.restore(previous),
            None => runtime_auth.clear(),
        }
    } else {
        Ok(())
    };
    if let Err(runtime_error) = runtime_result {
        error.push_str(&format!(
            " Runtime authentication rollback also failed: {runtime_error}."
        ));
    }
    error
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "filament-manager-credential-migration-{name}-{}-{nonce}.db",
            std::process::id()
        ))
    }

    fn assert_secret_absent_from_database_files(db_path: &std::path::Path, secret: &str) {
        for suffix in ["", "-wal", "-journal"] {
            let path = PathBuf::from(format!("{}{suffix}", db_path.to_string_lossy()));
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            assert!(
                !bytes
                    .windows(secret.len())
                    .any(|window| window == secret.as_bytes()),
                "{} still contains migrated plaintext",
                path.display()
            );
        }
    }

    fn seed_legacy_bambu_access_code(
        db_path: &std::path::Path,
        access_code: &str,
    ) -> Result<(), String> {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.set_setting(
            "bambu_live_integration:printer_1",
            &format!(
                r#"{{"enabled":true,"host":"192.0.2.10","access_code":"{access_code}","printer_serial":"01TESTSERIAL","last_error":null,"observed_state":null}}"#
            ),
        )
        .map_err(|error| error.to_string())
    }

    fn seed_legacy_library_auth(
        db_path: &std::path::Path,
        host_base_url: &str,
        device_token: &str,
    ) -> Result<(), String> {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let mut settings = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(host_base_url.to_string());
        db.save_library_sync_settings(&settings)
            .map_err(|error| error.to_string())?;
        db.save_library_sync_client_auth_state(
            "legacy-session",
            device_token,
            "legacy-csrf",
            Some("2026-07-29T00:00:00Z"),
        )
        .map_err(|error| error.to_string())
    }

    fn mark_secure_migration_complete(db_path: &std::path::Path) -> Result<(), String> {
        FilamentDatabase::open(db_path)
            .map_err(|error| error.to_string())?
            .set_setting(SECURE_CREDENTIAL_MIGRATION_MARKER, "complete")
            .map_err(|error| error.to_string())
    }

    #[test]
    fn bambu_access_code_moves_to_secure_store_before_sqlite_is_scrubbed() {
        let db_path = temp_db_path("bambu");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "legacy-access-code")?;

            let credentials = CredentialStore::in_memory();
            let runtime_auth = LibrarySyncRuntimeAuth::new();
            let stats = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &runtime_auth,
            )?;
            assert_eq!(stats.bambu_access_codes_migrated, 1);

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let entry = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?;
            assert!(entry.config.access_code.is_none());
            assert!(entry.config.access_code_configured);
            let binding_id = entry
                .config
                .access_code_binding_id
                .as_deref()
                .ok_or_else(|| "migrated credential binding missing".to_string())?;
            let key = CredentialKey::bambu_access_code("printer_1", binding_id)
                .map_err(|error| error.to_string())?;
            let stored = credentials
                .get(&key)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "migrated access code missing".to_string())?;
            assert_eq!(
                stored.expose_utf8().map_err(|error| error.to_string())?,
                "legacy-access-code"
            );
            drop(db);

            let second = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &runtime_auth,
            )?;
            assert_eq!(second.bambu_access_codes_migrated, 0);
            assert_eq!(second.bambu_credential_refs_repaired, 0);
            assert_secret_absent_from_database_files(&db_path, "legacy-access-code");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu credential migration failed: {error}");
        }
    }

    #[test]
    fn library_device_token_moves_to_secure_store_while_session_stays_in_memory() {
        let db_path = temp_db_path("library");
        let result = (|| -> Result<(), String> {
            seed_legacy_library_auth(&db_path, " HTTP://Host.Local:4278/ ", "legacy-device-token")?;

            let credentials = CredentialStore::in_memory();
            let runtime_auth = LibrarySyncRuntimeAuth::new();
            let stats = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &runtime_auth,
            )?;
            assert!(stats.library_device_token_migrated);

            let key = library_sync_device_token_key("http://host.local:4278/")?;
            let stored = credentials
                .get(&key)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "migrated device token missing".to_string())?;
            assert_eq!(
                stored.expose_utf8().map_err(|error| error.to_string())?,
                "legacy-device-token"
            );
            let session = runtime_auth
                .current()?
                .ok_or_else(|| "runtime session missing".to_string())?;
            assert_eq!(session.host_base_url, "http://host.local:4278");
            assert_eq!(session.session_id, "legacy-session");
            assert_eq!(session.csrf_token, "legacy-csrf");
            assert_eq!(session.device_token.as_deref(), Some("legacy-device-token"));

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            assert!(db
                .get_library_sync_client_auth_state()
                .map_err(|error| error.to_string())?
                .is_none());
            let settings = db
                .get_library_sync_settings()
                .map_err(|error| error.to_string())?;
            assert!(settings.client_auth_paired);
            assert_eq!(
                settings.host_base_url.as_deref(),
                Some("http://host.local:4278")
            );
            drop(db);
            assert_secret_absent_from_database_files(&db_path, "legacy-session");
            assert_secret_absent_from_database_files(&db_path, "legacy-device-token");
            assert_secret_absent_from_database_files(&db_path, "legacy-csrf");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Library credential migration failed: {error}");
        }
    }

    #[test]
    fn unscoped_v1_library_credential_moves_to_profile_without_sqlite_plaintext() {
        let db_path = temp_db_path("library-v1-profile");
        let result = (|| -> Result<(), String> {
            let host = "http://host.local:4278";
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            let mut settings = db
                .get_library_sync_settings()
                .map_err(|error| error.to_string())?;
            settings.mode = "CLIENT".to_string();
            settings.host_base_url = Some(host.to_string());
            db.save_library_sync_settings(&settings)
                .map_err(|error| error.to_string())?;
            db.save_library_sync_client_auth_metadata(None)
                .map_err(|error| error.to_string())?;
            db.set_setting(SECURE_CREDENTIAL_MIGRATION_MARKER, "complete")
                .map_err(|error| error.to_string())?;
            drop(db);

            let credentials = CredentialStore::in_memory();
            let legacy_key = CredentialKey::legacy_library_sync_client_device_token(host)
                .map_err(|error| error.to_string())?;
            credentials
                .set(
                    &legacy_key,
                    &SecretValue::from_utf8("unscoped-device-token".to_string()),
                )
                .map_err(|error| error.to_string())?;

            let stats = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &LibrarySyncRuntimeAuth::new(),
            )?;
            assert!(stats.library_device_token_migrated);

            let scoped_key = library_sync_device_token_key(host)?;
            assert_eq!(
                credentials
                    .get(&scoped_key)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "profile-scoped device token missing".to_string())?
                    .expose_utf8()
                    .map_err(|error| error.to_string())?,
                "unscoped-device-token"
            );
            assert!(credentials
                .get(&legacy_key)
                .map_err(|error| error.to_string())?
                .is_none());
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            assert!(db
                .get_library_sync_client_auth_state()
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(
                db.get_library_sync_settings()
                    .map_err(|error| error.to_string())?
                    .client_auth_paired
            );
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Library v1 profile migration failed: {error}");
        }
    }

    #[test]
    fn existing_bambu_vault_secret_wins_over_stale_legacy_plaintext() {
        let db_path = temp_db_path("bambu-conflict");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "stale-legacy-code")?;
            FilamentDatabase::open(&db_path)
                .map_err(|error| error.to_string())?
                .set_setting(
                    "bambu_live_integration:printer_1",
                    r#"{"enabled":true,"host":"192.0.2.10","access_code":"stale-legacy-code","access_code_configured":true,"access_code_binding_id":"11111111111111111111111111111111","printer_serial":"01TESTSERIAL","last_error":null,"observed_state":null}"#,
                )
                .map_err(|error| error.to_string())?;
            let credentials = CredentialStore::in_memory();
            let key =
                CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
                    .map_err(|error| error.to_string())?;
            credentials
                .set(
                    &key,
                    &SecretValue::from_utf8("current-vault-code".to_string()),
                )
                .map_err(|error| error.to_string())?;

            let stats = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &LibrarySyncRuntimeAuth::new(),
            )?;
            assert_eq!(stats.bambu_access_codes_migrated, 0);
            let stored = read_stored_secret(&credentials, &key, "Bambu access code")?
                .ok_or_else(|| "current vault code missing".to_string())?;
            assert_eq!(
                stored.expose_utf8().map_err(|error| error.to_string())?,
                "current-vault-code"
            );

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let entry = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?;
            assert!(entry.config.access_code.is_none());
            assert!(entry.config.access_code_configured);
            drop(db);
            assert_secret_absent_from_database_files(&db_path, "stale-legacy-code");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu credential conflict migration failed: {error}");
        }
    }

    #[test]
    fn unscoped_v1_bambu_credential_moves_to_fresh_profile_binding() {
        let db_path = temp_db_path("bambu-v1-profile");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "")?;
            let credentials = CredentialStore::in_memory();
            let legacy_key = CredentialKey::legacy_bambu_access_code("printer_1")
                .map_err(|error| error.to_string())?;
            credentials
                .set(
                    &legacy_key,
                    &SecretValue::from_utf8("unscoped-code".to_string()),
                )
                .map_err(|error| error.to_string())?;

            migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &LibrarySyncRuntimeAuth::new(),
            )?;

            let config = FilamentDatabase::open(&db_path)
                .map_err(|error| error.to_string())?
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?
                .config;
            let binding_id = config
                .access_code_binding_id
                .as_deref()
                .ok_or_else(|| "credential binding missing".to_string())?;
            let scoped_key = CredentialKey::bambu_access_code("printer_1", binding_id)
                .map_err(|error| error.to_string())?;
            assert_eq!(
                credentials
                    .get(&scoped_key)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "scoped credential missing".to_string())?
                    .expose_utf8()
                    .map_err(|error| error.to_string())?,
                "unscoped-code"
            );
            assert!(credentials
                .get(&legacy_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(config.access_code_configured);
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu v1 profile migration failed: {error}");
        }
    }

    #[test]
    fn startup_removes_superseded_bambu_credential_binding() {
        let db_path = temp_db_path("bambu-stale-binding");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "current-code")?;
            let credentials = CredentialStore::in_memory();
            let runtime = LibrarySyncRuntimeAuth::new();
            migrate_legacy_credentials(db_path.to_string_lossy().as_ref(), &credentials, &runtime)?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let mut config = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?
                .config;
            let current_binding_id = config
                .access_code_binding_id
                .clone()
                .ok_or_else(|| "current binding missing".to_string())?;
            let stale_binding_id = "22222222222222222222222222222222".to_string();
            config
                .access_code_stale_binding_ids
                .push(stale_binding_id.clone());
            db.save_bambu_live_integration("printer_1", &config)
                .map_err(|error| error.to_string())?;
            drop(db);
            let stale_key = CredentialKey::bambu_access_code("printer_1", &stale_binding_id)
                .map_err(|error| error.to_string())?;
            credentials
                .set(
                    &stale_key,
                    &SecretValue::from_utf8("superseded-code".to_string()),
                )
                .map_err(|error| error.to_string())?;

            migrate_legacy_credentials(db_path.to_string_lossy().as_ref(), &credentials, &runtime)?;
            assert!(credentials
                .get(&stale_key)
                .map_err(|error| error.to_string())?
                .is_none());
            let current_key = CredentialKey::bambu_access_code("printer_1", &current_binding_id)
                .map_err(|error| error.to_string())?;
            assert_eq!(
                credentials
                    .get(&current_key)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "current credential missing".to_string())?
                    .expose_utf8()
                    .map_err(|error| error.to_string())?,
                "current-code"
            );
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu orphan cleanup failed: {error}");
        }
    }

    #[test]
    fn startup_never_deletes_current_binding_through_a_stale_case_alias() {
        let db_path = temp_db_path("bambu-stale-current-case-alias");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "current-code")?;
            let credentials = CredentialStore::in_memory();
            let runtime = LibrarySyncRuntimeAuth::new();
            migrate_legacy_credentials(db_path.to_string_lossy().as_ref(), &credentials, &runtime)?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let mut config = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?
                .config;
            let original_binding_id = config
                .access_code_binding_id
                .clone()
                .ok_or_else(|| "original binding missing".to_string())?;
            let original_key = CredentialKey::bambu_access_code("printer_1", &original_binding_id)
                .map_err(|error| error.to_string())?;
            credentials
                .delete(&original_key)
                .map_err(|error| error.to_string())?;

            let lower_binding_id = "abcdefabcdefabcdefabcdefabcdefab";
            let upper_binding_id = lower_binding_id.to_ascii_uppercase();
            let active_key = CredentialKey::bambu_access_code("printer_1", lower_binding_id)
                .map_err(|error| error.to_string())?;
            credentials
                .set(
                    &active_key,
                    &SecretValue::from_utf8("current-code".to_string()),
                )
                .map_err(|error| error.to_string())?;
            config.access_code_binding_id = Some(upper_binding_id);
            config.access_code_stale_binding_ids = vec![lower_binding_id.to_string()];
            db.save_bambu_live_integration("printer_1", &config)
                .map_err(|error| error.to_string())?;
            drop(db);

            migrate_legacy_credentials(db_path.to_string_lossy().as_ref(), &credentials, &runtime)?;
            assert_eq!(
                credentials
                    .get(&active_key)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "active credential was deleted through stale alias".to_string())?
                    .expose_utf8()
                    .map_err(|error| error.to_string())?,
                "current-code"
            );
            let cleaned = FilamentDatabase::open(&db_path)
                .map_err(|error| error.to_string())?
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "cleaned integration missing".to_string())?
                .config;
            assert_eq!(
                cleaned.access_code_binding_id.as_deref(),
                Some(lower_binding_id)
            );
            assert!(cleaned.access_code_stale_binding_ids.is_empty());
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu stale/current case alias hardening failed: {error}");
        }
    }

    #[test]
    fn active_database_scrubs_and_compacts_obsolete_printer_access_tokens() {
        let db_path = temp_db_path("obsolete-printer-token");
        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "INSERT INTO printers (
                        id, model, name, ip_address, access_token
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![
                        "legacy-printer",
                        "Bambu Lab P1S",
                        "Legacy",
                        "192.0.2.50",
                        "obsolete-secret-token"
                    ],
                )
                .map_err(|error| error.to_string())?;
            drop(db);

            migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &CredentialStore::in_memory(),
                &LibrarySyncRuntimeAuth::new(),
            )?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let stored: Option<String> = db
                .connection()
                .query_row(
                    "SELECT access_token FROM printers WHERE id = 'legacy-printer'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert!(stored.is_none());
            drop(db);
            assert_secret_absent_from_database_files(&db_path, "obsolete-secret-token");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Obsolete printer credential scrub failed: {error}");
        }
    }

    #[test]
    fn completed_migration_does_not_block_startup_on_unreadable_bambu_vault() {
        let db_path = temp_db_path("completed-unreadable-bambu");
        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            db.set_setting(
                "bambu_live_integration:printer_1",
                r#"{"enabled":true,"host":"192.0.2.10","access_code_configured":true,"access_code_binding_id":"11111111111111111111111111111111","printer_serial":"01TESTSERIAL","last_error":null,"observed_state":null}"#,
            )
            .map_err(|error| error.to_string())?;
            drop(db);
            mark_secure_migration_complete(&db_path)?;

            migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &CredentialStore::in_memory_with_read_failures(1),
                &LibrarySyncRuntimeAuth::new(),
            )?;

            let config = FilamentDatabase::open(&db_path)
                .map_err(|error| error.to_string())?
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?
                .config;
            assert!(config.access_code_configured);
            assert_eq!(
                config.access_code_binding_id.as_deref(),
                Some("11111111111111111111111111111111")
            );
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Completed unreadable credential migration failed: {error}");
        }
    }

    #[test]
    fn unreadable_vault_with_actual_plaintext_fails_and_preserves_plaintext() {
        let db_path = temp_db_path("plaintext-unreadable-bambu");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "must-remain-until-safe")?;
            mark_secure_migration_complete(&db_path)?;

            let error = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &CredentialStore::in_memory_with_read_failures(1),
                &LibrarySyncRuntimeAuth::new(),
            )
            .expect_err("plaintext migration must fail closed");
            assert!(error.contains("Failed to read Bambu access code"));

            let raw = FilamentDatabase::open(&db_path)
                .map_err(|error| error.to_string())?
                .get_setting("bambu_live_integration:printer_1")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "integration payload missing".to_string())?;
            assert!(raw.contains("must-remain-until-safe"));
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Plaintext fail-closed migration failed: {error}");
        }
    }

    #[test]
    fn existing_library_vault_secret_wins_and_stale_session_is_not_activated() {
        let db_path = temp_db_path("library-conflict");
        let result = (|| -> Result<(), String> {
            seed_legacy_library_auth(&db_path, "HTTP://Host.Local:4278/", "stale-device-token")?;
            let credentials = CredentialStore::in_memory();
            let key = library_sync_device_token_key("http://host.local:4278")?;
            credentials
                .set(
                    &key,
                    &SecretValue::from_utf8("current-device-token".to_string()),
                )
                .map_err(|error| error.to_string())?;
            let runtime_auth = LibrarySyncRuntimeAuth::new();
            runtime_auth.replace(
                "http://current-session.local:4278",
                "current-session",
                "current-csrf",
            )?;

            let stats = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &runtime_auth,
            )?;
            assert!(!stats.library_device_token_migrated);
            let stored = read_stored_secret(&credentials, &key, "desktop client device token")?
                .ok_or_else(|| "current device token missing".to_string())?;
            assert_eq!(
                stored.expose_utf8().map_err(|error| error.to_string())?,
                "current-device-token"
            );
            let runtime = runtime_auth
                .current()?
                .ok_or_else(|| "current runtime session was removed".to_string())?;
            assert_eq!(runtime.host_base_url, "http://current-session.local:4278");
            assert_eq!(runtime.session_id, "current-session");

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            assert!(db
                .get_library_sync_client_auth_state()
                .map_err(|error| error.to_string())?
                .is_none());
            assert_eq!(
                db.get_library_sync_settings()
                    .map_err(|error| error.to_string())?
                    .host_base_url
                    .as_deref(),
                Some("http://host.local:4278")
            );
            assert!(db
                .get_library_sync_settings()
                .map_err(|error| error.to_string())?
                .client_auth_expires_at
                .is_none());
            drop(db);
            assert_secret_absent_from_database_files(&db_path, "stale-device-token");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Library credential conflict migration failed: {error}");
        }
    }

    #[test]
    fn bambu_database_failure_removes_new_vault_secret_and_keeps_plaintext() {
        let db_path = temp_db_path("bambu-db-failure");
        let result = (|| -> Result<(), String> {
            seed_legacy_bambu_access_code(&db_path, "legacy-access-code")?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.set_setting(
                "bambu_live_integration:printer_1",
                r#"{"enabled":true,"host":"192.0.2.10","access_code":"legacy-access-code","access_code_configured":false,"access_code_binding_id":"11111111111111111111111111111111","printer_serial":"01TESTSERIAL","last_error":null,"observed_state":null}"#,
            )
            .map_err(|error| error.to_string())?;
            db.connection()
                .execute_batch(
                    "CREATE TRIGGER fail_bambu_credential_scrub
                     BEFORE UPDATE ON settings
                     WHEN OLD.key = 'bambu_live_integration:printer_1'
                     BEGIN
                       SELECT RAISE(ABORT, 'forced Bambu scrub failure');
                     END;",
                )
                .map_err(|error| error.to_string())?;
            drop(db);

            let credentials = CredentialStore::in_memory();
            let error = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &LibrarySyncRuntimeAuth::new(),
            )
            .expect_err("forced database failure must abort migration");
            assert!(error.contains("Failed to scrub a migrated Bambu access code"));
            let key =
                CredentialKey::bambu_access_code("printer_1", "11111111111111111111111111111111")
                    .map_err(|error| error.to_string())?;
            assert!(credentials
                .get(&key)
                .map_err(|error| error.to_string())?
                .is_none());

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let entry = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .pop()
                .ok_or_else(|| "integration missing".to_string())?;
            assert_eq!(
                entry.config.access_code.as_deref(),
                Some("legacy-access-code")
            );
            assert!(!entry.config.access_code_configured);
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Bambu migration rollback failed: {error}");
        }
    }

    #[test]
    fn library_database_failure_restores_vault_and_runtime_state_atomically() {
        let db_path = temp_db_path("library-db-failure");
        let result = (|| -> Result<(), String> {
            seed_legacy_library_auth(&db_path, "HTTP://Host.Local:4278/", "legacy-device-token")?;
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.connection()
                .execute_batch(
                    "CREATE TRIGGER fail_library_credential_scrub
                     BEFORE DELETE ON settings
                     WHEN OLD.key = 'library_sync_client_device_token'
                     BEGIN
                       SELECT RAISE(ABORT, 'forced library scrub failure');
                     END;",
                )
                .map_err(|error| error.to_string())?;
            drop(db);

            let credentials = CredentialStore::in_memory();
            let runtime_auth = LibrarySyncRuntimeAuth::new();
            runtime_auth.replace(
                "http://previous.local:4278",
                "previous-session",
                "previous-csrf",
            )?;
            let error = migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &runtime_auth,
            )
            .expect_err("forced database failure must abort migration");
            assert!(error.contains("Failed to scrub migrated desktop client credentials"));
            let key = library_sync_device_token_key("http://host.local:4278")?;
            assert!(credentials
                .get(&key)
                .map_err(|error| error.to_string())?
                .is_none());
            let runtime = runtime_auth
                .current()?
                .ok_or_else(|| "previous runtime session was not restored".to_string())?;
            assert_eq!(runtime.host_base_url, "http://previous.local:4278");
            assert_eq!(runtime.session_id, "previous-session");
            assert_eq!(runtime.csrf_token, "previous-csrf");

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let legacy = db
                .get_library_sync_client_auth_state()
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "legacy auth was partially scrubbed".to_string())?;
            assert_eq!(legacy.1, "legacy-device-token");
            assert_eq!(
                db.get_library_sync_settings()
                    .map_err(|error| error.to_string())?
                    .host_base_url
                    .as_deref(),
                Some("HTTP://Host.Local:4278")
            );
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("Library migration rollback failed: {error}");
        }
    }

    #[test]
    fn failed_library_credential_rollback_clears_runtime_device_token() {
        let credentials = CredentialStore::in_memory_with_delete_failures(1);
        let key = library_sync_device_token_key("http://host.local:4278")
            .expect("library credential key");
        credentials
            .set(
                &key,
                &SecretValue::from_utf8("new-device-token".to_string()),
            )
            .expect("seed migrated credential");

        let runtime_auth = LibrarySyncRuntimeAuth::new();
        runtime_auth
            .replace("http://host.local:4278", "legacy-session", "legacy-csrf")
            .expect("seed migration runtime auth");
        let previous_auth = LibrarySyncRuntimeAuth::new();
        previous_auth
            .replace_authenticated(
                "http://host.local:4278",
                "previous-session",
                "previous-csrf",
                "previous-device-token",
            )
            .expect("build previous runtime auth");

        let error = rollback_library_migration_after_failure(
            &credentials,
            &key,
            true,
            &runtime_auth,
            previous_auth.current().expect("snapshot previous auth"),
            true,
            "forced migration failure".to_string(),
        );

        assert!(error.contains("Credential rollback also failed"));
        assert!(runtime_auth
            .current()
            .expect("read fail-closed runtime auth")
            .is_none());
    }
}
