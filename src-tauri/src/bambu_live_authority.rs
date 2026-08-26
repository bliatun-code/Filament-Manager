use crate::backend::filament_database::{BambuLiveIntegrationEntryRow, FilamentDatabase};
use crate::credential_store::CredentialStore;
use crate::secure_credential_mutation::lock_secure_credential_mutation;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct BambuLivePollAuthority {
    library_id: String,
    pub(crate) target_generation: u64,
    credential_profile_id: String,
}

pub(crate) fn capture_bambu_live_poll_batch(
    db_path: &str,
    credentials: &CredentialStore,
) -> Result<
    Option<(
        BambuLivePollAuthority,
        CredentialStore,
        Vec<BambuLiveIntegrationEntryRow>,
    )>,
    String,
> {
    let _authority_gate = lock_secure_credential_mutation()?;
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    if !bambu_live_mode_is_authoritative(&settings.mode) {
        return Ok(None);
    }
    let credential_profile_id = db
        .get_or_create_credential_store_profile_id()
        .map_err(|error| error.to_string())?;
    let integrations = db
        .list_bambu_live_integrations()
        .map_err(|error| error.to_string())?;
    let poll_credentials = credentials
        .scoped_to_profile_id(&credential_profile_id)
        .map_err(|error| error.to_string())?;
    Ok(Some((
        BambuLivePollAuthority {
            library_id: settings.library_id.trim().to_string(),
            target_generation: settings.target_generation,
            credential_profile_id,
        },
        poll_credentials,
        integrations,
    )))
}

pub(crate) fn with_current_bambu_live_authority<T>(
    db_path: &str,
    authority: &BambuLivePollAuthority,
    operation: impl FnOnce(&FilamentDatabase) -> Result<T, String>,
) -> Result<Option<T>, String> {
    // Library-role and restore workflows use this same gate. The observation
    // is therefore either fully applied to the library that started the poll,
    // or discarded before matching, usage accounting, and persistence begin.
    let _authority_gate = lock_secure_credential_mutation()?;
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    if !bambu_live_mode_is_authoritative(&settings.mode)
        || settings.library_id.trim() != authority.library_id
        || settings.target_generation != authority.target_generation
        || db
            .get_or_create_credential_store_profile_id()
            .map_err(|error| error.to_string())?
            != authority.credential_profile_id
    {
        return Ok(None);
    }
    operation(&db).map(Some)
}

fn bambu_live_mode_is_authoritative(mode: &str) -> bool {
    matches!(
        mode.trim().to_ascii_uppercase().as_str(),
        "STANDALONE" | "HOST"
    )
}
