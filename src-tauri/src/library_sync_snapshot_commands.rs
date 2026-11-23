use crate::backend::database_library_sync_models::LibrarySyncCachedSnapshotRow;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    prepare_library_sync_host_write_for_generation, save_library_sync_success,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated_for_target;
use crate::library_sync_models::{LibrarySyncSnapshotResponse, ValidateLibrarySyncHostInput};
use crate::library_sync_target_guard::with_current_library_sync_target;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn fetch_library_sync_snapshot(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
    dashboard: Option<bool>,
    expected_generation: Option<u64>,
) -> Result<LibrarySyncCachedSnapshotRow, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        fetch_library_sync_snapshot_blocking(
            &state,
            input,
            dashboard.unwrap_or(false),
            expected_generation,
        )
    })
    .await
}

fn fetch_library_sync_snapshot_blocking(
    state: &AppState,
    input: ValidateLibrarySyncHostInput,
    dashboard: bool,
    expected_generation: Option<u64>,
) -> Result<LibrarySyncCachedSnapshotRow, String> {
    let (_, _, target) =
        prepare_library_sync_host_write_for_generation(state, &input, expected_generation)?;
    let parsed: LibrarySyncSnapshotResponse = get_library_sync_host_json_authenticated_for_target(
        state,
        if dashboard {
            "/api/v1/library/snapshot?dashboard=true"
        } else {
            "/api/v1/library/snapshot"
        },
        &target,
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

    let snapshot = LibrarySyncCachedSnapshotRow {
        dashboard_stock: parsed.dashboard_stock,
        captured_at: parsed.captured_at,
        app_version: parsed.app_version,
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
        engine.save_library_sync_host_snapshot(snapshot.clone(), dashboard)?;
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
