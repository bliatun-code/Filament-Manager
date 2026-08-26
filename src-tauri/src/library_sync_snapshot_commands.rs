use crate::backend::database_library_sync_models::LibrarySyncCachedSnapshotRow;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    prepare_library_sync_host_checked, save_library_sync_success,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated;
use crate::library_sync_models::{
    LibrarySyncRemoteSnapshot, LibrarySyncSnapshotResponse, ValidateLibrarySyncHostInput,
};
use crate::library_sync_target_guard::with_current_library_sync_target;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn fetch_library_sync_snapshot(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncRemoteSnapshot, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || fetch_library_sync_snapshot_blocking(&state, input)).await
}

fn fetch_library_sync_snapshot_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncRemoteSnapshot, String> {
    let (normalized_base_url, _, target) = prepare_library_sync_host_checked(state, &input)?;
    let parsed: LibrarySyncSnapshotResponse = get_library_sync_host_json_authenticated(
        state,
        &normalized_base_url,
        "/api/v1/library/snapshot",
    )?;

    if !parsed.ok {
        return Err("Host snapshot reported not ready.".to_string());
    }

    if parsed.library_id != target.library_id() {
        return Err(format!(
            "Host snapshot belongs to a different library ({}).",
            parsed.library_id
        ));
    }

    let snapshot = LibrarySyncRemoteSnapshot {
        captured_at: parsed.captured_at,
        library_id: parsed.library_id,
        device_name: parsed.device_name,
        sync_mode: parsed.sync_mode,
        inventory: parsed.inventory.clone(),
        total_spools: parsed.inventory.total_spools,
        in_use: parsed.inventory.in_use,
        low_stock: parsed.inventory.low_stock,
        active_loans: parsed.active_loans,
        printers: parsed.printers,
    };

    with_current_library_sync_target(state, &target, |engine| {
        engine.save_library_sync_cached_snapshot(&LibrarySyncCachedSnapshotRow {
            captured_at: snapshot.captured_at.clone(),
            library_id: snapshot.library_id.clone(),
            device_name: snapshot.device_name.clone(),
            sync_mode: snapshot.sync_mode.clone(),
            inventory: snapshot.inventory.clone(),
            total_spools: snapshot.total_spools,
            in_use: snapshot.in_use,
            low_stock: snapshot.low_stock,
            active_loans: snapshot.active_loans,
            printers: snapshot.printers,
        })?;
        Ok(())
    })?;
    save_library_sync_success(
        state,
        &target,
        "Host snapshot refreshed.",
        Some(&snapshot.device_name),
    )?;

    Ok(snapshot)
}
