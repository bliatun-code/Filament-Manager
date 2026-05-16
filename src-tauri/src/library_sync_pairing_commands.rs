use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::library_sync_command_support::normalize_library_sync_host_input;
use crate::library_sync_host_client::{
    ensure_library_sync_host_matches, extract_library_sync_pairing_token,
    pair_library_sync_host_session,
};
use crate::library_sync_models::{PairLibrarySyncHostInput, ValidateLibrarySyncHostInput};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn pair_library_sync_host(
    state: tauri::State<'_, AppState>,
    input: PairLibrarySyncHostInput,
) -> Result<LibrarySyncSettingsRow, String> {
    let (normalized_base_url, _) = normalize_library_sync_host_input(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: None,
    })?;
    let pairing_token = extract_library_sync_pairing_token(&input.pairing_token_or_url)
        .ok_or_else(|| "Pairing token or URL is required.".to_string())?;

    let auth_state = pair_library_sync_host_session(&normalized_base_url, &pairing_token)?;
    let health = ensure_library_sync_host_matches(&normalized_base_url, None)?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_client_auth_state(
            &auth_state.session_id,
            &auth_state.device_token,
            &auth_state.csrf_token,
            None,
        )?;
        engine.save_library_sync_validation_state(
            true,
            Some("Host desktop pairing completed."),
            health.device_name.as_deref(),
        )?;
        engine.get_library_sync_settings()
    })
}
