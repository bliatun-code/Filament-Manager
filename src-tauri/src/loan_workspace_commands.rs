use crate::backend::{
    database_loan_workspace::LoanWorkspaceCounts,
    database_result::InventoryResult,
    filament_database::{FilamentDatabase, InventoryLocationRow},
};
use crate::companion_models::{INVENTORY_LOCATIONS_CAPABILITY, LOAN_WORKSPACE_COUNTS};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write_for_generation,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated_for_target as host_get;
use crate::library_sync_models::LibrarySyncSnapshotResponse;
use crate::library_sync_target_guard::LibrarySyncTargetGuard;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::{state::AppState, with_db};
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct CountsTarget {
    base_url: Option<String>,
    expected_library_id: String,
    target_generation: u64,
}

impl CountsTarget {
    // Serialize the cache read/write with target changes, including A–B–A.
    fn with_database<T>(
        &self,
        state: &AppState,
        read: impl FnOnce(&FilamentDatabase) -> InventoryResult<T>,
    ) -> Result<T, String> {
        let _guard = lock_secure_credential_mutation()?;
        with_db(state, |db| {
            let current = db.get_library_sync_page_status()?;
            if self.expected_library_id.is_empty()
                || current.library_id != self.expected_library_id
                || current.target_generation != self.target_generation
                || (current.mode == "CLIENT") != self.base_url.is_some()
                || (self.base_url.is_some() && current.host_base_url != self.base_url)
            {
                return Err(
                    crate::backend::database_result::InventoryError::InvalidOperation {
                        code: "common.invalid_request",
                        message: "The selected library changed.".into(),
                    },
                );
            }
            read(db)
        })
    }
}

#[tauri::command]
pub(crate) async fn get_loan_workspace_counts(
    state: tauri::State<'_, AppState>,
    target: CountsTarget,
) -> Result<LoanWorkspaceCounts, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || counts_blocking(&state, target)).await
}

pub(crate) fn counts_blocking(
    state: &AppState,
    target: CountsTarget,
) -> Result<LoanWorkspaceCounts, String> {
    let Some(url) = target.base_url.as_ref() else {
        return target.with_database(state, FilamentDatabase::loan_workspace_counts);
    };
    let fetch = || {
        let input = library_sync_host_input(url, Some(&target.expected_library_id));
        let (_, health, peer) = prepare_library_sync_host_write_for_generation(
            state,
            &input,
            Some(target.target_generation),
        )?;
        if health
            .capabilities
            .iter()
            .any(|c| c == LOAN_WORKSPACE_COUNTS)
        {
            host_get(state, "/api/v1/library/loan-workspace-counts", &peer)
        } else {
            legacy_counts(
                state,
                &peer,
                health
                    .capabilities
                    .iter()
                    .any(|c| c == INVENTORY_LOCATIONS_CAPABILITY),
            )
        }
    };
    match fetch() {
        Ok(counts) => target.with_database(state, |db| {
            db.save_loan_workspace_counts(&counts)?;
            Ok(counts)
        }),
        Err(_) => target.with_database(state, FilamentDatabase::cached_loan_workspace_counts),
    }
}

// Older Hosts have no combined counts. Their overview counts borrowed ownership
// only for on-hand rolls. Leave the loan badge unknown when it cannot be exact.
fn legacy_counts(
    state: &AppState,
    peer: &LibrarySyncTargetGuard,
    locations_supported: bool,
) -> Result<LoanWorkspaceCounts, String> {
    let snapshot: LibrarySyncSnapshotResponse = host_get(state, "/api/v1/library/snapshot", peer)?;
    if !snapshot.ok || snapshot.library_id != peer.library_id() {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    let inventory = snapshot.inventory;
    let locations = if locations_supported {
        host_get::<Vec<InventoryLocationRow>>(state, "/api/v1/library/locations", peer)
            .ok()
            .map(|rows| {
                rows.iter()
                    .filter(|r| !r.is_system_owned() && !r.is_archived())
                    .count() as i64
            })
    } else {
        None
    };
    let purchases =
        host_get::<Vec<serde::de::IgnoredAny>>(state, "/api/v1/library/wishlist?limit=500", peer)
            .ok()
            .map(|rows| rows.len() as i64);
    let classified = inventory.total_owned_spools + inventory.total_borrowed_in_spools;
    Ok(LoanWorkspaceCounts {
        stock: Some(inventory.total_spools),
        loans: (classified == inventory.total_spools)
            .then_some(snapshot.active_loans + inventory.total_borrowed_in_spools),
        locations,
        purchases,
    })
}
