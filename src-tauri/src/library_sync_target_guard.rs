use filament_manager_core::backend::database_result::InventoryResult;
use filament_manager_core::backend::inventory_engine::InventoryEngine;

use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::with_inventory;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LibrarySyncTargetGuard {
    base_url: String,
    library_id: String,
    generation: u64,
}

impl LibrarySyncTargetGuard {
    pub(crate) fn library_id(&self) -> &str {
        &self.library_id
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }
}

pub(crate) fn capture_library_sync_target(
    state: &AppState,
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<LibrarySyncTargetGuard, String> {
    capture_current_library_sync_target_if_matching(state, base_url, expected_library_id)?
        .ok_or_else(target_changed_error)
}

pub(crate) fn capture_current_library_sync_target_if_matching(
    state: &AppState,
    base_url: &str,
    expected_library_id: Option<&str>,
) -> Result<Option<LibrarySyncTargetGuard>, String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    let guard = LibrarySyncTargetGuard {
        base_url: normalized_host(base_url).ok_or_else(target_changed_error)?,
        library_id: settings.library_id.trim().to_string(),
        generation: settings.target_generation,
    };

    if !target_matches(&settings, &guard)
        || expected_library_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some_and(|expected| expected != guard.library_id)
    {
        return Ok(None);
    }

    Ok(Some(guard))
}

pub(crate) fn ensure_library_sync_target_current(
    state: &AppState,
    guard: &LibrarySyncTargetGuard,
) -> Result<(), String> {
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    if target_matches(&settings, guard) {
        Ok(())
    } else {
        Err(target_changed_error())
    }
}

pub(crate) fn with_current_library_sync_target<T>(
    state: &AppState,
    guard: &LibrarySyncTargetGuard,
    operation: impl FnOnce(InventoryEngine) -> InventoryResult<T>,
) -> Result<T, String> {
    with_current_library_sync_target_if_current(state, guard, operation)?
        .ok_or_else(target_changed_error)
}

pub(crate) fn with_current_library_sync_target_if_current<T>(
    state: &AppState,
    guard: &LibrarySyncTargetGuard,
    operation: impl FnOnce(InventoryEngine) -> InventoryResult<T>,
) -> Result<Option<T>, String> {
    // Target changes use this same gate. Whichever operation enters first is
    // therefore ordered atomically: an old cache write is either committed
    // before the settings transaction clears it, or rejected after the target
    // generation changes.
    let _target_mutation = lock_secure_credential_mutation()?;
    let settings = with_inventory(state, |engine| engine.get_library_sync_settings())?;
    if !target_matches(&settings, guard) {
        return Ok(None);
    }
    with_inventory(state, operation).map(Some)
}

fn target_matches(settings: &LibrarySyncSettingsRow, guard: &LibrarySyncTargetGuard) -> bool {
    settings.mode == "CLIENT"
        && normalized_host(settings.host_base_url.as_deref().unwrap_or_default()).as_deref()
            == Some(guard.base_url.as_str())
        && settings.library_id.trim() == guard.library_id
        && settings.target_generation == guard.generation
}

fn normalized_host(value: &str) -> Option<String> {
    let normalized = value.trim().trim_end_matches('/');
    (!normalized.is_empty()).then(|| normalized.to_string())
}

fn target_changed_error() -> String {
    crate::app_error::coded_command_error("common.invalid_request")
}

#[cfg(test)]
mod tests {
    use super::{
        capture_current_library_sync_target_if_matching, capture_library_sync_target,
        ensure_library_sync_target_current, with_current_library_sync_target,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DATABASE: AtomicU64 = AtomicU64::new(1);

    fn client_test_state() -> (AppState, std::path::PathBuf) {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let sequence = NEXT_TEST_DATABASE.fetch_add(1, Ordering::Relaxed);
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-target-guard-{}-{suffix}-{sequence}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open test database");
        db.apply_schema().expect("apply test schema");
        let mut settings = db.get_library_sync_settings().expect("load settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some("http://host-a.local:4278".to_string());
        settings.library_id = "library-a".to_string();
        db.save_library_sync_settings(&settings)
            .expect("save Client target");
        drop(db);
        (
            AppState {
                db_path: db_path.to_string_lossy().into_owned(),
                companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                    TRUSTED_LAN_DEFAULT_PORT,
                )),
                credentials: CredentialStore::in_memory(),
                library_sync_auth: LibrarySyncRuntimeAuth::new(),
            },
            db_path,
        )
    }

    #[test]
    fn unchanged_target_allows_scoped_cache_write() {
        let (state, db_path) = client_test_state();
        let guard =
            capture_library_sync_target(&state, "http://host-a.local:4278/", Some("library-a"))
                .expect("capture target");

        with_current_library_sync_target(&state, &guard, |engine| {
            engine.save_library_sync_cached_spools(&[])
        })
        .expect("write current-target cache");

        let db = FilamentDatabase::open(&db_path).expect("reopen test database");
        let settings = db.get_library_sync_settings().expect("reload settings");
        assert!(settings.cached_spools.is_some());
        drop(db);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn draft_or_different_target_is_not_captured_for_persistence() {
        let (state, db_path) = client_test_state();
        let target = capture_current_library_sync_target_if_matching(
            &state,
            "http://host-b.local:4278",
            Some("library-b"),
        )
        .expect("inspect draft target");
        assert!(target.is_none());

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn a_to_b_to_a_target_change_rejects_an_in_flight_cache_write() {
        let (state, db_path) = client_test_state();
        let guard =
            capture_library_sync_target(&state, "http://host-a.local:4278", Some("library-a"))
                .expect("capture target A");

        let db = FilamentDatabase::open(&db_path).expect("reopen test database");
        let mut settings = db.get_library_sync_settings().expect("load target A");
        settings.host_base_url = Some("http://host-b.local:4278".to_string());
        settings.library_id = "library-b".to_string();
        let target_b = db
            .save_library_sync_settings(&settings)
            .expect("switch to target B");
        let mut target_a_again = target_b;
        target_a_again.host_base_url = Some("http://host-a.local:4278".to_string());
        target_a_again.library_id = "library-a".to_string();
        db.save_library_sync_settings(&target_a_again)
            .expect("switch back to target A");
        drop(db);

        assert!(ensure_library_sync_target_current(&state, &guard).is_err());
        let operation_ran = AtomicBool::new(false);
        let result = with_current_library_sync_target(&state, &guard, |engine| {
            operation_ran.store(true, Ordering::SeqCst);
            engine.save_library_sync_cached_spools(&[])
        });
        assert!(result.is_err());
        assert!(!operation_ran.load(Ordering::SeqCst));

        let db = FilamentDatabase::open(&db_path).expect("reopen test database");
        let settings = db.get_library_sync_settings().expect("reload settings");
        assert!(settings.cached_spools.is_none());
        assert!(settings.target_generation > guard.generation());
        drop(db);
        let _ = std::fs::remove_file(db_path);
    }
}
