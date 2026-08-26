use crate::library_sync_models::{
    LibrarySyncCacheTargetInput, LibrarySyncCachedLoanList, LibrarySyncCachedPrinterOverview,
    LibrarySyncCachedSpoolList, LibrarySyncCachedWishlistList, SaveLibrarySyncSpoolCacheInput,
};
use crate::library_sync_target_guard::{
    capture_library_sync_target, with_current_library_sync_target,
};
use crate::state::AppState;

fn capture_cache_target(
    state: &AppState,
    input: &LibrarySyncCacheTargetInput,
) -> Result<crate::library_sync_target_guard::LibrarySyncTargetGuard, String> {
    let target =
        capture_library_sync_target(state, &input.base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.target_generation {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    Ok(target)
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_spools(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCacheTargetInput,
) -> Result<Option<LibrarySyncCachedSpoolList>, String> {
    fetch_cached_library_sync_spools_blocking(&state, &input)
}

fn fetch_cached_library_sync_spools_blocking(
    state: &AppState,
    input: &LibrarySyncCacheTargetInput,
) -> Result<Option<LibrarySyncCachedSpoolList>, String> {
    let target = capture_cache_target(state, input)?;
    with_current_library_sync_target(state, &target, |engine| {
        let settings = engine.get_library_sync_settings()?;
        Ok(settings
            .cached_spools
            .map(|cached| LibrarySyncCachedSpoolList {
                captured_at: cached.captured_at,
                rows: cached.rows,
            }))
    })
}

#[cfg(test)]
mod tests {
    use super::fetch_cached_library_sync_spools_blocking;
    use crate::backend::filament_database::FilamentDatabase;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_models::LibrarySyncCacheTargetInput;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    fn client_state() -> (AppState, std::path::PathBuf, LibrarySyncCacheTargetInput) {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-cache-target-test-{}-{suffix}.sqlite",
            std::process::id(),
        ));
        let db = FilamentDatabase::open(&db_path).expect("open cache target database");
        db.apply_schema().expect("apply cache target schema");
        let mut settings = db.get_library_sync_settings().expect("load target A");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some("http://host-a.local:4278".to_string());
        settings.library_id = "library-a".to_string();
        let saved = db
            .save_library_sync_settings(&settings)
            .expect("save target A");
        db.save_library_sync_cached_spools(&[])
            .expect("seed target A cache");
        drop(db);
        let input = LibrarySyncCacheTargetInput {
            base_url: "http://host-a.local:4278".to_string(),
            expected_library_id: "library-a".to_string(),
            target_generation: saved.target_generation,
        };
        let state = AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        (state, db_path, input)
    }

    #[test]
    fn cached_read_rejects_a_to_b_target_switch() {
        let (state, db_path, input) = client_state();
        let db = FilamentDatabase::open(&db_path).expect("reopen target A");
        let mut settings = db.get_library_sync_settings().expect("load target A");
        settings.host_base_url = Some("http://host-b.local:4278".to_string());
        settings.library_id = "library-b".to_string();
        db.save_library_sync_settings(&settings)
            .expect("switch to target B");
        db.save_library_sync_cached_spools(&[])
            .expect("seed target B cache");
        drop(db);

        assert!(
            fetch_cached_library_sync_spools_blocking(&state, &input).is_err(),
            "target A fallback must not read target B cache",
        );
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn cached_read_rejects_a_to_b_to_a_generation_switch() {
        let (state, db_path, input) = client_state();
        let db = FilamentDatabase::open(&db_path).expect("reopen target A");
        let mut settings = db.get_library_sync_settings().expect("load target A");
        settings.host_base_url = Some("http://host-b.local:4278".to_string());
        settings.library_id = "library-b".to_string();
        let target_b = db
            .save_library_sync_settings(&settings)
            .expect("switch to target B");
        settings = target_b;
        settings.host_base_url = Some("http://host-a.local:4278".to_string());
        settings.library_id = "library-a".to_string();
        let returned_a = db
            .save_library_sync_settings(&settings)
            .expect("return to target A");
        assert!(returned_a.target_generation > input.target_generation);
        db.save_library_sync_cached_spools(&[])
            .expect("seed replacement target A cache");
        drop(db);

        assert!(
            fetch_cached_library_sync_spools_blocking(&state, &input).is_err(),
            "old target A generation must not read replacement A cache",
        );
        let _ = std::fs::remove_file(db_path);
    }
}

#[tauri::command]
pub(crate) fn save_library_sync_spool_cache(
    state: tauri::State<'_, AppState>,
    input: SaveLibrarySyncSpoolCacheInput,
) -> Result<(), String> {
    let target =
        capture_library_sync_target(&state, &input.base_url, Some(&input.expected_library_id))?;
    if target.generation() != input.target_generation {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    with_current_library_sync_target(&state, &target, |engine| {
        engine.save_library_sync_cached_spools(&input.rows)
    })
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCacheTargetInput,
) -> Result<Option<LibrarySyncCachedPrinterOverview>, String> {
    let target = capture_cache_target(&state, &input)?;
    with_current_library_sync_target(&state, &target, |engine| {
        let settings = engine.get_library_sync_settings()?;
        Ok(settings
            .cached_printers
            .map(|cached| LibrarySyncCachedPrinterOverview {
                captured_at: cached.captured_at,
                rows: cached.rows,
            }))
    })
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_loans(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCacheTargetInput,
) -> Result<Option<LibrarySyncCachedLoanList>, String> {
    let target = capture_cache_target(&state, &input)?;
    with_current_library_sync_target(&state, &target, |engine| {
        let settings = engine.get_library_sync_settings()?;
        Ok(settings
            .cached_loans
            .map(|cached| LibrarySyncCachedLoanList {
                captured_at: cached.captured_at,
                rows: cached.rows,
            }))
    })
}

#[tauri::command]
pub(crate) fn fetch_cached_library_sync_wishlist(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCacheTargetInput,
) -> Result<Option<LibrarySyncCachedWishlistList>, String> {
    let target = capture_cache_target(&state, &input)?;
    with_current_library_sync_target(&state, &target, |engine| {
        let settings = engine.get_library_sync_settings()?;
        Ok(settings
            .cached_wishlist
            .map(|cached| LibrarySyncCachedWishlistList {
                captured_at: cached.captured_at,
                rows: cached.rows,
            }))
    })
}
