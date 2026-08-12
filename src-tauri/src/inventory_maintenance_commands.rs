use crate::app_error::{internal_command_error, inventory_error_to_command_string};
use crate::backend::database_result::InventoryResult;
use crate::backend::filament_database::{CatalogResetStats, FilamentDatabase};
use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
use crate::library_sync_host_client::library_sync_device_token_key;
use crate::library_sync_runtime_auth::{LibrarySyncRuntimeAuth, LibrarySyncRuntimeSession};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::with_inventory;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::OsString;
#[cfg(unix)]
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const PENDING_CREDENTIAL_CLEANUP_FORMAT: &str = "filament-manager-pending-credential-cleanup-v1";
const PENDING_CREDENTIAL_CLEANUP_SUFFIX: &str = ".pending-credential-cleanup-v1.json";
const MAX_PENDING_CREDENTIAL_CLEANUP_BYTES: u64 = 1_048_576;
const MAX_PENDING_BAMBU_PRINTER_SCOPES: usize = 10_000;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct StoredCredentialScopes {
    bambu_printer_ids: Vec<String>,
    #[serde(default)]
    bambu_credential_binding_ids: BTreeMap<String, Vec<String>>,
    library_host_base_url: Option<String>,
}

impl StoredCredentialScopes {
    pub(crate) fn from_database(db: &FilamentDatabase) -> InventoryResult<Self> {
        let integrations = db.list_bambu_live_integrations()?;
        let mut bambu_printer_ids = integrations
            .iter()
            .map(|entry| entry.printer_id.clone())
            .collect::<BTreeSet<_>>();
        let mut bambu_credential_binding_ids = BTreeMap::new();
        for entry in integrations {
            let mut binding_ids = entry.config.access_code_stale_binding_ids;
            if let Some(current) = entry.config.access_code_binding_id {
                binding_ids.push(current);
            }
            binding_ids.retain(|binding_id| !binding_id.trim().is_empty());
            binding_ids.sort_unstable();
            binding_ids.dedup();
            bambu_credential_binding_ids.insert(entry.printer_id, binding_ids);
        }
        // Keep printer IDs in the manifest even when no live integration is
        // present so its bounded shape remains useful for validation/auditing.
        // Random binding IDs cannot be reconstructed and are therefore recorded
        // explicitly above whenever an integration refers to them.
        bambu_printer_ids.extend(db.list_printers()?.into_iter().map(|printer| printer.id));
        let bambu_printer_ids = bambu_printer_ids.into_iter().collect();
        let library_host_base_url = db
            .get_library_sync_settings()?
            .host_base_url
            .map(|host| host.trim().trim_end_matches('/').to_string())
            .filter(|host| !host.is_empty());
        Ok(Self {
            bambu_printer_ids,
            bambu_credential_binding_ids,
            library_host_base_url,
        })
    }

    pub(crate) fn credential_keys(&self) -> Result<Vec<CredentialKey>, String> {
        let mut keys = Vec::with_capacity(
            self.bambu_printer_ids.len() + usize::from(self.library_host_base_url.is_some()),
        );
        for printer_id in &self.bambu_printer_ids {
            let binding_ids = self
                .bambu_credential_binding_ids
                .get(printer_id)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            for binding_id in binding_ids {
                keys.push(
                    CredentialKey::bambu_access_code(printer_id, binding_id)
                        .map_err(|error| error.to_string())?,
                );
            }
        }
        if let Some(host) = self.library_host_base_url.as_deref() {
            keys.push(library_sync_device_token_key(host)?);
        }
        Ok(keys)
    }

    fn validate_manifest(&self) -> Result<(), String> {
        if self.bambu_printer_ids.len() > MAX_PENDING_BAMBU_PRINTER_SCOPES {
            return Err("Pending credential cleanup contains too many printer scopes.".to_string());
        }
        self.credential_keys().map(|_| ())
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct PendingCredentialCleanupManifest {
    format: String,
    #[serde(default)]
    profile_scope_digest: Option<String>,
    scopes: StoredCredentialScopes,
}

pub(crate) struct CredentialDeletionRollback {
    credentials: Vec<(CredentialKey, SecretValue)>,
    runtime_auth: Option<LibrarySyncRuntimeSession>,
    includes_runtime_auth: bool,
}

impl CredentialDeletionRollback {
    pub(crate) fn capture(
        state: &AppState,
        keys: impl IntoIterator<Item = CredentialKey>,
        include_runtime_auth: bool,
    ) -> Result<Self, String> {
        let mut credentials = Vec::new();
        for key in keys {
            if let Some(secret) = state
                .credentials
                .get(&key)
                .map_err(|error| error.to_string())?
            {
                credentials.push((key, secret));
            }
        }
        let runtime_auth = if include_runtime_auth {
            state.library_sync_auth.current()?
        } else {
            None
        };
        Ok(Self {
            credentials,
            runtime_auth,
            includes_runtime_auth: include_runtime_auth,
        })
    }

    pub(crate) fn restore(self, state: &AppState) -> Result<(), String> {
        restore_deleted_credentials(
            &state.credentials,
            &state.library_sync_auth,
            self.credentials,
            self.runtime_auth,
            self.includes_runtime_auth,
        )
    }
}

/// Removes all reusable secrets associated with a database snapshot.
///
/// Every deletion is attempted even if an earlier one fails, and volatile
/// library authentication is always cleared. Callers decide whether a database
/// mutation may proceed after this function reports a failure.
pub(crate) fn purge_stored_credentials(
    state: &AppState,
    scopes: &StoredCredentialScopes,
) -> Result<(), String> {
    purge_stored_credentials_from_parts(&state.credentials, &state.library_sync_auth, scopes)
}

fn purge_stored_credentials_from_parts(
    credentials: &CredentialStore,
    library_sync_auth: &LibrarySyncRuntimeAuth,
    scopes: &StoredCredentialScopes,
) -> Result<(), String> {
    let mut first_error = None;
    for printer_id in &scopes.bambu_printer_ids {
        let binding_ids = scopes
            .bambu_credential_binding_ids
            .get(printer_id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        for binding_id in binding_ids {
            let result = CredentialKey::bambu_access_code(printer_id, binding_id)
                .map_err(|error| error.to_string())
                .and_then(|key| {
                    credentials
                        .delete(&key)
                        .map(|_| ())
                        .map_err(|error| error.to_string())
                });
            if first_error.is_none() {
                first_error = result.err().map(|error| {
                    format!("Could not remove a stored Bambu printer credential: {error}")
                });
            }
        }
    }

    if let Some(host) = scopes.library_host_base_url.as_deref() {
        let result = library_sync_device_token_key(host).and_then(|key| {
            credentials
                .delete(&key)
                .map(|_| ())
                .map_err(|error| error.to_string())
        });
        if first_error.is_none() {
            first_error = result.err().map(|error| {
                format!("Could not remove the stored library client credential: {error}")
            });
        }
    }

    if let Err(error) = library_sync_auth.clear()
        && first_error.is_none()
    {
        first_error = Some(error);
    }

    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn restore_deleted_credentials(
    credentials: &CredentialStore,
    library_sync_auth: &LibrarySyncRuntimeAuth,
    stored_credentials: Vec<(CredentialKey, SecretValue)>,
    runtime_auth: Option<LibrarySyncRuntimeSession>,
    includes_runtime_auth: bool,
) -> Result<(), String> {
    let mut first_error = None;
    for (key, secret) in stored_credentials {
        if let Err(error) = credentials.set(&key, &secret)
            && first_error.is_none()
        {
            first_error = Some(format!("Could not restore a stored credential: {error}"));
        }
    }

    // Restoring a runtime device token after any durable credential failed to restore would turn
    // a partial Keychain rollback into a process-lifetime authentication bypass. Fail closed.
    let runtime_result = if !includes_runtime_auth {
        Ok(())
    } else if first_error.is_none() {
        match runtime_auth {
            Some(session) => library_sync_auth.restore(session),
            None => library_sync_auth.clear(),
        }
    } else {
        library_sync_auth.clear()
    };
    if let Err(runtime_error) = runtime_result {
        first_error = Some(match first_error {
            Some(credential_error) => format!(
                "{credential_error} Runtime authentication also could not be cleared: {runtime_error}"
            ),
            None => runtime_error,
        });
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

/// Durably records the credential identities that belonged to the database
/// before a destructive full restore starts.
///
/// The manifest contains only scope identifiers, never credential values. It is
/// deliberately written before the database mutation so an interrupted restore
/// can fail safe by deleting the old machine-local credentials on next startup.
pub(crate) fn persist_pending_credential_cleanup(
    db_path: &Path,
    credentials: &CredentialStore,
    scopes: &StoredCredentialScopes,
) -> Result<(), String> {
    scopes.validate_manifest()?;
    let manifest_path = pending_credential_cleanup_path(db_path);
    match std::fs::symlink_metadata(&manifest_path) {
        Ok(_) => {
            return Err(
                "A previous secure credential cleanup is still pending and must be retried first."
                    .to_string(),
            );
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    let manifest = PendingCredentialCleanupManifest {
        format: PENDING_CREDENTIAL_CLEANUP_FORMAT.to_string(),
        profile_scope_digest: Some(
            credentials
                .profile_scope_digest()
                .map_err(|error| error.to_string())?,
        ),
        scopes: scopes.clone(),
    };
    let contents = serde_json::to_vec(&manifest).map_err(|error| error.to_string())?;
    if contents.len() as u64 > MAX_PENDING_CREDENTIAL_CLEANUP_BYTES {
        return Err("Pending credential cleanup manifest is too large.".to_string());
    }

    let parent = manifest_path
        .parent()
        .ok_or_else(|| "Pending credential cleanup path has no parent directory.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp_path = pending_credential_cleanup_temp_path(&manifest_path);
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|error| error.to_string())?;
        }
        file.write_all(&contents)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        std::fs::rename(&temp_path, &manifest_path).map_err(|error| error.to_string())?;
        sync_parent_directory(parent)?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    write_result
}

pub(crate) fn clear_pending_credential_cleanup(db_path: &Path) -> Result<bool, String> {
    let manifest_path = pending_credential_cleanup_path(db_path);
    match std::fs::remove_file(&manifest_path) {
        Ok(()) => {
            if let Some(parent) = manifest_path.parent() {
                sync_parent_directory(parent)?;
            }
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

/// Retries an interrupted or partially failed cleanup and removes its manifest
/// only after every credential deletion succeeds.
pub(crate) fn retry_pending_credential_cleanup(
    db_path: &Path,
    credentials: &CredentialStore,
    library_sync_auth: &LibrarySyncRuntimeAuth,
) -> Result<bool, String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    retry_pending_credential_cleanup_under_gate(db_path, credentials, library_sync_auth)
}

pub(crate) fn retry_pending_credential_cleanup_under_gate(
    db_path: &Path,
    credentials: &CredentialStore,
    library_sync_auth: &LibrarySyncRuntimeAuth,
) -> Result<bool, String> {
    let Some(manifest) = read_pending_credential_cleanup(db_path)? else {
        return Ok(false);
    };
    let restored_db =
        FilamentDatabase::open_exclusive_maintenance(db_path).map_err(|error| error.to_string())?;
    let old_profile_credentials = match manifest.profile_scope_digest.as_deref() {
        Some(scope) => credentials
            .scoped_to_profile_digest(scope)
            .map_err(|error| error.to_string())?,
        None => credentials.clone(),
    };
    purge_stored_credentials_from_parts(
        &old_profile_credentials,
        library_sync_auth,
        &manifest.scopes,
    )?;

    // A restore can replace the stable library identity. Purge the restored
    // profile as well so a portable backup can never reconnect to unrelated
    // machine-local credentials that happen to exist on this computer.
    let restored_legacy_profile_id = restored_db
        .get_library_sync_library_id()
        .map_err(|error| error.to_string())?;
    let restored_profile_id = restored_db
        .get_or_create_credential_store_profile_id()
        .map_err(|error| error.to_string())?;
    let restored_scopes =
        StoredCredentialScopes::from_database(&restored_db).map_err(|error| error.to_string())?;
    let restored_profile_credentials = credentials
        .scoped_to_profile_id(&restored_profile_id)
        .map_err(|error| error.to_string())?;
    purge_stored_credentials_from_parts(
        &restored_profile_credentials,
        library_sync_auth,
        &restored_scopes,
    )?;
    // Backups created before the independent machine-local profile existed may
    // still have credentials scoped directly to their portable library ID on
    // this computer. Purge that legacy namespace too; never adopt it.
    let restored_legacy_profile_credentials = credentials
        .scoped_to_profile_id(&restored_legacy_profile_id)
        .map_err(|error| error.to_string())?;
    purge_stored_credentials_from_parts(
        &restored_legacy_profile_credentials,
        library_sync_auth,
        &restored_scopes,
    )?;
    restored_db
        .mark_credential_store_profile_migration_completed()
        .map_err(|error| error.to_string())?;
    credentials
        .switch_profile(&restored_profile_id)
        .map_err(|error| error.to_string())?;
    drop(restored_db);
    clear_pending_credential_cleanup(db_path)?;
    Ok(true)
}

fn read_pending_credential_cleanup(
    db_path: &Path,
) -> Result<Option<PendingCredentialCleanupManifest>, String> {
    let manifest_path = pending_credential_cleanup_path(db_path);
    let metadata = match std::fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_file() || metadata.len() > MAX_PENDING_CREDENTIAL_CLEANUP_BYTES {
        return Err("Pending credential cleanup manifest is invalid or too large.".to_string());
    }
    let contents = std::fs::read(&manifest_path).map_err(|error| error.to_string())?;
    let manifest: PendingCredentialCleanupManifest =
        serde_json::from_slice(&contents).map_err(|error| error.to_string())?;
    if manifest.format != PENDING_CREDENTIAL_CLEANUP_FORMAT {
        return Err("Pending credential cleanup manifest has an unknown format.".to_string());
    }
    manifest.scopes.validate_manifest()?;
    if let Some(scope) = manifest.profile_scope_digest.as_deref()
        && (scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err("Pending credential cleanup profile scope is invalid.".to_string());
    }
    Ok(Some(manifest))
}

fn pending_credential_cleanup_path(db_path: &Path) -> PathBuf {
    let mut file_name = db_path
        .file_name()
        .map_or_else(|| OsString::from("filament-manager.db"), OsString::from);
    file_name.push(PENDING_CREDENTIAL_CLEANUP_SUFFIX);
    db_path.with_file_name(file_name)
}

fn pending_credential_cleanup_temp_path(manifest_path: &Path) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut file_name = manifest_path
        .file_name()
        .map_or_else(|| OsString::from("credential-cleanup"), OsString::from);
    file_name.push(format!(".{}.{}.tmp", std::process::id(), suffix));
    manifest_path.with_file_name(file_name)
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) fn reset_app_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    reset_app_data_inner(&state)
}

pub(crate) fn reset_app_data_inner(state: &AppState) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    let db = FilamentDatabase::open_exclusive_maintenance(&state.db_path)
        .map_err(|error| internal_command_error("Open database for app-data reset", error))?;
    let scopes =
        StoredCredentialScopes::from_database(&db).map_err(inventory_error_to_command_string)?;
    let next_profile_id = reset_app_data_with_under_gate(state, scopes, || {
        db.reset_app_state_data()
            .map_err(inventory_error_to_command_string)?;
        db.initialize_fresh_credential_store_profile()
            .map_err(inventory_error_to_command_string)
    })?;
    drop(db);
    finish_app_data_reset(state, || {
        state
            .credentials
            .switch_profile(&next_profile_id)
            .map_err(|error| internal_command_error("Switch credential profile after reset", error))
    })
}

fn finish_app_data_reset(
    state: &AppState,
    switch_profile: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let reload_result =
        crate::trusted_lan_runtime_commands::reload_trusted_lan_runtime_after_library_change(state)
            .map_err(|error| {
                internal_command_error("Reload local network state after reset", error)
            });
    let profile_result = switch_profile();

    match (profile_result, reload_result) {
        (Err(error), _) => Err(error),
        (Ok(()), Err(error)) => Err(error),
        (Ok(()), Ok(())) => Ok(()),
    }
}

#[cfg(test)]
fn reset_app_data_with(
    state: &AppState,
    scopes: StoredCredentialScopes,
    reset_database: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    reset_app_data_with_under_gate(state, scopes, reset_database)
}

fn reset_app_data_with_under_gate<Output>(
    state: &AppState,
    scopes: StoredCredentialScopes,
    reset_database: impl FnOnce() -> Result<Output, String>,
) -> Result<Output, String> {
    let credential_keys = scopes.credential_keys().map_err(|error| {
        internal_command_error("Build secure credential identities before reset", error)
    })?;
    let rollback =
        CredentialDeletionRollback::capture(state, credential_keys, true).map_err(|error| {
            internal_command_error("Snapshot secure credentials before reset", error)
        })?;
    if let Err(error) = purge_stored_credentials(state, &scopes) {
        return match rollback.restore(state) {
            Ok(()) => Err(internal_command_error("Reset secure credentials", error)),
            Err(rollback_error) => Err(internal_command_error(
                "Rollback secure credentials after failed reset cleanup",
                format!("{error}; rollback failed: {rollback_error}"),
            )),
        };
    }

    let reset_result = reset_database();
    match reset_result {
        Ok(value) => {
            drop(rollback);
            Ok(value)
        }
        Err(error) => match rollback.restore(state) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(internal_command_error(
                "Rollback secure credentials after failed app-data reset",
                format!("{error}; rollback failed: {rollback_error}"),
            )),
        },
    }
}

#[tauri::command]
pub(crate) fn reset_catalog_data(
    state: tauri::State<'_, AppState>,
) -> Result<CatalogResetStats, String> {
    with_inventory(&state, |engine| engine.reset_catalogs())
}

#[cfg(test)]
mod tests {
    use super::{
        finish_app_data_reset, persist_pending_credential_cleanup, reset_app_data_inner,
        reset_app_data_with, restore_deleted_credentials, retry_pending_credential_cleanup,
        StoredCredentialScopes,
    };
    use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
    use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::secure_credential_mutation::lock_secure_credential_mutation;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{mpsc, Arc, Barrier};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    static TEST_DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn test_state() -> AppState {
        test_state_with_credentials(CredentialStore::in_memory())
    }

    fn test_state_with_credentials(credentials: CredentialStore) -> AppState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let sequence = TEST_DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-reset-credentials-{}-{suffix}-{sequence}.sqlite",
            std::process::id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply schema");
        let credential_profile_id = db
            .initialize_fresh_credential_store_profile()
            .expect("initialize credential profile");
        let credentials = credentials
            .scoped_to_profile_id(&credential_profile_id)
            .expect("scope test credential store");
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials,
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    fn seed_reset_credentials(
        state: &AppState,
    ) -> ([CredentialKey; 2], CredentialKey, StoredCredentialScopes) {
        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        let printer_ids = ["printer_1", "printer_2"];
        for printer_id in printer_ids {
            db.upsert_printer_with_ams(printer_id, "Bambu Lab P1S", printer_id, 1, 4)
                .expect("create printer");
            db.save_bambu_live_integration(
                printer_id,
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.168.1.42".to_string()),
                    access_code: None,
                    access_code_configured: true,
                    access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                    access_code_stale_binding_ids: Vec::new(),
                    printer_serial: Some(format!("SERIAL-{printer_id}")),
                    last_error: None,
                    tls_identity: None,
                    observed_state: None,
                },
            )
            .expect("save Bambu integration");
        }
        let library_host = "http://library-host.local:4278";
        let mut settings = db
            .get_library_sync_settings()
            .expect("read library settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(" HTTP://LIBRARY-HOST.local:4278/ ".to_string());
        db.save_library_sync_settings(&settings)
            .expect("save library settings");
        let scopes = StoredCredentialScopes::from_database(&db).expect("credential scopes");
        drop(db);

        let bambu_keys = printer_ids.map(|printer_id| {
            let key =
                CredentialKey::bambu_access_code(printer_id, "11111111111111111111111111111111")
                    .expect("credential key");
            state
                .credentials
                .set(&key, &SecretValue::from_utf8(format!("code-{printer_id}")))
                .expect("store Bambu credential");
            key
        });
        let library_key = CredentialKey::library_sync_client_device_token(library_host)
            .expect("library credential key");
        state
            .credentials
            .set(
                &library_key,
                &SecretValue::from_utf8("device-token".to_string()),
            )
            .expect("store library credential");
        state
            .library_sync_auth
            .replace(library_host, "session", "csrf")
            .expect("store runtime auth");
        (bambu_keys, library_key, scopes)
    }

    #[test]
    fn reset_removes_all_machine_credentials_and_runtime_auth() {
        let state = test_state();
        let (bambu_keys, library_key, _) = seed_reset_credentials(&state);
        let previous_profile = state
            .credentials
            .profile_scope_digest()
            .expect("previous credential profile");

        reset_app_data_inner(&state).expect("reset app data");

        for key in bambu_keys {
            assert!(state
                .credentials
                .get(&key)
                .expect("read Bambu credential")
                .is_none());
        }
        assert!(state
            .credentials
            .get(&library_key)
            .expect("read library credential")
            .is_none());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_none());
        let db = FilamentDatabase::open(&state.db_path).expect("reopen test database");
        assert!(db.list_printers().expect("query printers").is_empty());
        assert!(db
            .list_bambu_live_integrations()
            .expect("query integrations")
            .is_empty());
        assert!(db
            .get_library_sync_settings()
            .expect("read reset library settings")
            .host_base_url
            .is_none());
        let runtime = state.companion.trusted_lan.snapshot();
        assert!(!runtime.enabled);
        assert!(runtime
            .advertised_hostname
            .as_deref()
            .is_some_and(|value| value.starts_with("fm-") && value.ends_with(".local")));
        let reset_profile_id = db
            .get_or_create_credential_store_profile_id()
            .expect("reset credential profile");
        assert_eq!(
            state
                .credentials
                .profile_scope_digest()
                .expect("active reset profile"),
            state
                .credentials
                .scoped_to_profile_id(&reset_profile_id)
                .expect("expected reset profile")
                .profile_scope_digest()
                .expect("expected reset digest")
        );
        assert_ne!(
            state
                .credentials
                .profile_scope_digest()
                .expect("new credential profile"),
            previous_profile
        );
        assert!(db
            .credential_store_profile_migration_completed()
            .expect("reset profile marker"));
        drop(db);
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn partial_credential_rollback_cannot_restore_runtime_device_token() {
        let credentials = CredentialStore::in_memory();
        let runtime_auth = LibrarySyncRuntimeAuth::new();
        runtime_auth
            .replace_authenticated(
                "http://host.local:4278",
                "new-session",
                "new-csrf",
                "new-device",
            )
            .expect("seed replacement runtime auth");
        let previous_auth = LibrarySyncRuntimeAuth::new();
        previous_auth
            .replace_authenticated(
                "http://host.local:4278",
                "previous-session",
                "previous-csrf",
                "previous-device",
            )
            .expect("build previous runtime auth");
        let key = CredentialKey::library_sync_client_device_token("http://host.local:4278")
            .expect("credential key");

        let error = restore_deleted_credentials(
            &credentials,
            &runtime_auth,
            vec![(key, SecretValue::from_bytes(Vec::new()))],
            previous_auth.current().expect("snapshot previous auth"),
            true,
        )
        .expect_err("empty credential must fail restoration");

        assert!(error.contains("credential"));
        assert!(runtime_auth
            .current()
            .expect("read fail-closed runtime auth")
            .is_none());
    }

    #[test]
    fn printer_only_rollback_does_not_clear_unrelated_library_runtime_auth() {
        let credentials = CredentialStore::in_memory();
        let runtime_auth = LibrarySyncRuntimeAuth::new();
        runtime_auth
            .replace_authenticated(
                "http://host.local:4278",
                "library-session",
                "library-csrf",
                "library-device",
            )
            .expect("seed unrelated library runtime auth");
        let printer_key =
            CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
                .expect("printer credential key");

        restore_deleted_credentials(
            &credentials,
            &runtime_auth,
            vec![(
                printer_key,
                SecretValue::from_utf8("printer-access-code".to_string()),
            )],
            None,
            false,
        )
        .expect("restore printer-only credential");

        let runtime = runtime_auth
            .current()
            .expect("read library runtime auth")
            .expect("unrelated library runtime auth remains");
        assert_eq!(runtime.session_id, "library-session");
        assert_eq!(runtime.device_token.as_deref(), Some("library-device"));
    }

    #[test]
    fn post_commit_profile_failure_still_reloads_disabled_network_runtime() {
        let state = test_state();
        let old_hostname = "filament-manager-old-reset.local";
        state.companion.trusted_lan.apply_loaded_config(
            true,
            Some(("Old interface".to_string(), "192.168.1.42".to_string())),
            TRUSTED_LAN_DEFAULT_PORT,
            old_hostname,
        );
        let db = FilamentDatabase::open(&state.db_path).expect("open reset database");
        db.reset_app_state_data().expect("commit reset database");
        db.initialize_fresh_credential_store_profile()
            .expect("initialize reset profile");
        drop(db);

        finish_app_data_reset(
            &state,
            || Err("injected profile switch failure".to_string()),
        )
        .expect_err("profile switch must fail after committed reset");

        let runtime = state.companion.trusted_lan.snapshot();
        assert!(!runtime.enabled);
        assert_ne!(runtime.advertised_hostname.as_deref(), Some(old_hostname));
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn reset_waits_for_in_flight_pairing_before_switching_credential_profile() {
        let state = test_state();
        let (_, library_key, _) = seed_reset_credentials(&state);
        let previous_profile_digest = state
            .credentials
            .profile_scope_digest()
            .expect("previous credential profile");
        let previous_profile = state
            .credentials
            .scoped_to_profile_digest(&previous_profile_digest)
            .expect("fixed previous profile");

        let pairing_mutation = lock_secure_credential_mutation().expect("start pairing mutation");
        let start = Arc::new(Barrier::new(2));
        let reset_start = Arc::clone(&start);
        let reset_state = state.clone();
        let (completed_tx, completed_rx) = mpsc::channel();
        let reset = std::thread::spawn(move || {
            reset_start.wait();
            let result = reset_app_data_inner(&reset_state);
            completed_tx.send(result).expect("report reset result");
        });

        start.wait();
        assert!(
            completed_rx
                .recv_timeout(Duration::from_millis(200))
                .is_err(),
            "reset switched credential profiles while pairing still owned the mutation gate"
        );

        state
            .credentials
            .set(
                &library_key,
                &SecretValue::from_utf8("replacement-device-token".to_string()),
            )
            .expect("complete pairing credential mutation");
        state
            .library_sync_auth
            .replace(
                "http://library-host.local:4278",
                "replacement-session",
                "replacement-csrf",
            )
            .expect("complete pairing runtime mutation");
        drop(pairing_mutation);

        completed_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("reset completed after pairing")
            .expect("reset result");
        reset.join().expect("join reset");

        assert_ne!(
            state
                .credentials
                .profile_scope_digest()
                .expect("current credential profile"),
            previous_profile_digest
        );
        assert!(previous_profile
            .get(&library_key)
            .expect("read previous profile credential")
            .is_none());
        assert!(state
            .credentials
            .get(&library_key)
            .expect("read current profile credential")
            .is_none());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_none());

        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_database_reset_restores_credentials_and_runtime_auth() {
        let state = test_state();
        let (bambu_keys, library_key, scopes) = seed_reset_credentials(&state);

        let error = reset_app_data_with(&state, scopes, || {
            Err("injected database reset failure".to_string())
        })
        .expect_err("database reset must fail");
        assert_eq!(error, "injected database reset failure");

        for key in bambu_keys {
            assert!(state
                .credentials
                .get(&key)
                .expect("read Bambu credential")
                .is_some());
        }
        assert!(state
            .credentials
            .get(&library_key)
            .expect("read library credential")
            .is_some());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_some());
        let db = FilamentDatabase::open(&state.db_path).expect("reopen test database");
        assert_eq!(db.list_printers().expect("query printers").len(), 2);
        drop(db);
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn failed_credential_purge_rolls_back_partial_reset_cleanup() {
        let state = test_state_with_credentials(CredentialStore::in_memory_with_delete_failures(1));
        let (bambu_keys, library_key, scopes) = seed_reset_credentials(&state);
        let database_reset_called = AtomicBool::new(false);

        reset_app_data_with(&state, scopes, || {
            database_reset_called.store(true, Ordering::SeqCst);
            Ok(())
        })
        .expect_err("credential purge must fail");
        assert!(!database_reset_called.load(Ordering::SeqCst));

        for key in bambu_keys {
            assert!(state
                .credentials
                .get(&key)
                .expect("read Bambu credential")
                .is_some());
        }
        assert!(state
            .credentials
            .get(&library_key)
            .expect("read library credential")
            .is_some());
        assert!(state
            .library_sync_auth
            .current()
            .expect("read runtime auth")
            .is_some());
        let _ = std::fs::remove_file(&state.db_path);
    }

    #[test]
    fn pending_restore_cleanup_purges_only_old_and_restored_profiles() {
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-profile-restore-{}-{}.sqlite",
            std::process::id(),
            TEST_DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let result = (|| -> Result<(), String> {
            let shared_store = CredentialStore::in_memory();
            let old_profile = shared_store
                .scoped_to_profile_id("old-library")
                .map_err(|error| error.to_string())?;
            let restored_profile = shared_store
                .scoped_to_profile_id("restored-library")
                .map_err(|error| error.to_string())?;
            let unrelated_profile = shared_store
                .scoped_to_profile_id("unrelated-library")
                .map_err(|error| error.to_string())?;
            let runtime_auth = LibrarySyncRuntimeAuth::new();
            let old_printer_key =
                CredentialKey::bambu_access_code("old-printer", "11111111111111111111111111111111")
                    .map_err(|error| error.to_string())?;
            let restored_printer_key = CredentialKey::bambu_access_code(
                "restored-printer",
                "22222222222222222222222222222222",
            )
            .map_err(|error| error.to_string())?;
            let shared_host_key =
                CredentialKey::library_sync_client_device_token("http://library.local:4278")
                    .map_err(|error| error.to_string())?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;
            db.set_setting("library_sync_library_id", "old-library")
                .map_err(|error| error.to_string())?;
            db.upsert_printer_with_ams("old-printer", "Bambu Lab P1S", "Old printer", 1, 4)
                .map_err(|error| error.to_string())?;
            db.save_bambu_live_integration(
                "old-printer",
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.0.2.10".to_string()),
                    access_code: None,
                    access_code_configured: true,
                    access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                    access_code_stale_binding_ids: Vec::new(),
                    printer_serial: Some("OLD-SERIAL".to_string()),
                    last_error: None,
                    tls_identity: None,
                    observed_state: None,
                },
            )
            .map_err(|error| error.to_string())?;
            let mut settings = db
                .get_library_sync_settings()
                .map_err(|error| error.to_string())?;
            settings.mode = "CLIENT".to_string();
            settings.host_base_url = Some("http://library.local:4278".to_string());
            db.save_library_sync_settings(&settings)
                .map_err(|error| error.to_string())?;
            let old_scopes =
                StoredCredentialScopes::from_database(&db).map_err(|error| error.to_string())?;
            drop(db);

            for (store, key, value) in [
                (&old_profile, &old_printer_key, "old-printer-secret"),
                (&old_profile, &shared_host_key, "old-library-secret"),
                (
                    &restored_profile,
                    &restored_printer_key,
                    "restored-printer-secret",
                ),
                (
                    &restored_profile,
                    &shared_host_key,
                    "restored-library-secret",
                ),
                (
                    &unrelated_profile,
                    &shared_host_key,
                    "unrelated-library-secret",
                ),
            ] {
                store
                    .set(key, &SecretValue::from_utf8(value.to_string()))
                    .map_err(|error| error.to_string())?;
            }
            persist_pending_credential_cleanup(&db_path, &old_profile, &old_scopes)?;

            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.set_setting("library_sync_library_id", "restored-library")
                .map_err(|error| error.to_string())?;
            db.delete_bambu_live_integration("old-printer")
                .map_err(|error| error.to_string())?;
            db.upsert_printer_with_ams(
                "restored-printer",
                "Bambu Lab P1S",
                "Restored printer",
                1,
                4,
            )
            .map_err(|error| error.to_string())?;
            db.save_bambu_live_integration(
                "restored-printer",
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.0.2.20".to_string()),
                    access_code: None,
                    access_code_configured: true,
                    access_code_binding_id: Some("22222222222222222222222222222222".to_string()),
                    access_code_stale_binding_ids: Vec::new(),
                    printer_serial: Some("RESTORED-SERIAL".to_string()),
                    last_error: None,
                    tls_identity: None,
                    observed_state: None,
                },
            )
            .map_err(|error| error.to_string())?;
            drop(db);

            assert!(retry_pending_credential_cleanup(
                &db_path,
                &old_profile,
                &runtime_auth,
            )?);
            let old_profile_after = old_profile
                .scoped_to_profile_id("old-library")
                .map_err(|error| error.to_string())?;
            assert!(old_profile_after
                .get(&old_printer_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(old_profile_after
                .get(&shared_host_key)
                .map_err(|error| error.to_string())?
                .is_none());
            let restored_profile_after = old_profile
                .scoped_to_profile_id("restored-library")
                .map_err(|error| error.to_string())?;
            assert!(restored_profile_after
                .get(&restored_printer_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(restored_profile_after
                .get(&shared_host_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert_eq!(
                unrelated_profile
                    .get(&shared_host_key)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "unrelated profile credential was deleted".to_string())?
                    .expose_utf8()
                    .map_err(|error| error.to_string())?,
                "unrelated-library-secret"
            );
            let restored_db =
                FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            let machine_profile_id = restored_db
                .get_or_create_credential_store_profile_id()
                .map_err(|error| error.to_string())?;
            assert!(restored_db
                .credential_store_profile_migration_completed()
                .map_err(|error| error.to_string())?);
            assert_eq!(
                old_profile
                    .profile_scope_digest()
                    .map_err(|error| error.to_string())?,
                old_profile
                    .scoped_to_profile_id(&machine_profile_id)
                    .map_err(|error| error.to_string())?
                    .profile_scope_digest()
                    .map_err(|error| error.to_string())?
            );
            assert_ne!(machine_profile_id, "restored-library");
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(super::pending_credential_cleanup_path(&db_path));
        if let Err(error) = result {
            panic!("Profile-scoped restore cleanup failed: {error}");
        }
    }
}
