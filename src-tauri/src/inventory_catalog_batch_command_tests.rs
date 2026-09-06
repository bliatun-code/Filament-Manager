use super::*;
use crate::backend::filament_database::FilamentDatabase;
use crate::companion_session::random_hex_token;
use crate::credential_store::CredentialStore;
use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
use crate::state::{CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT};

#[test]
fn local_catalog_batch_rejects_client_role_and_stale_library_or_generation_before_write() {
    let path = std::env::temp_dir().join(format!("local-batch-{}.db", random_hex_token(16)));
    let db = FilamentDatabase::open(&path).unwrap();
    db.apply_schema().unwrap();
    let settings = db.get_library_sync_settings().unwrap();
    let state = AppState {
        db_path: path.to_string_lossy().into_owned(),
        companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
            TRUSTED_LAN_DEFAULT_PORT,
        )),
        credentials: CredentialStore::in_memory(),
        library_sync_auth: LibrarySyncRuntimeAuth::new(),
    };
    let input = || CatalogSpoolBatchInput {
        batch_id: "must-not-write".into(),
        master_ids: vec!["missing-master".into()],
        initial_weight_g: 1000,
        ownership_type: "OWNED".into(),
        owner_name: None,
        owner_contact: None,
        ownership_note: None,
        location: None,
    };
    for (library, generation) in [
        ("", settings.target_generation),
        ("another-library", settings.target_generation),
        (settings.library_id.as_str(), settings.target_generation + 1),
    ] {
        let error = create_catalog_spool_batch_for_target(&state, input(), library, generation)
            .unwrap_err();
        assert!(error.contains("common.invalid_request"), "{error}");
    }
    db.set_setting("library_sync_mode", "CLIENT").unwrap();
    let error = create_catalog_spool_batch_for_target(
        &state,
        input(),
        &settings.library_id,
        settings.target_generation,
    )
    .unwrap_err();
    assert!(error.contains("common.forbidden"), "{error}");
    assert!(db.list_spools_with_master(100, 0).unwrap().is_empty());
    assert!(db.list_inventory_locations(true).unwrap().is_empty());
    drop(db);
    std::fs::remove_file(path).unwrap();
}
