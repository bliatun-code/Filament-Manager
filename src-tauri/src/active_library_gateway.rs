use crate::app_error::coded_command_error;
use crate::backend::filament_database::FilamentDatabase;
use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::backend::inventory_engine::UpdateSpoolDetailsInput;
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_spool_write_commands::update_active_library_host_spool_details_blocking;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::with_inventory;

pub(crate) fn require_authoritative_local_library_under_gate(
    state: &AppState,
) -> Result<(), String> {
    require_authoritative_local_library_path_under_gate(&state.db_path)
}

pub(crate) fn require_authoritative_local_library_path_under_gate(
    db_path: &str,
) -> Result<(), String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    require_authoritative_local_mode(&settings.mode)
}

pub(crate) fn with_authoritative_local_library<Output>(
    state: &AppState,
    write: impl FnOnce() -> Result<Output, String>,
) -> Result<Output, String> {
    // Role transitions use this same gate. Holding it from the persisted-role
    // check through the mutation prevents HOST -> CLIENT from racing between
    // authorization and a local database or credential write.
    let _authority_gate = lock_secure_credential_mutation()?;
    require_authoritative_local_library_under_gate(state)?;
    write()
}

pub(crate) fn require_authoritative_local_mode(mode: &str) -> Result<(), String> {
    match mode.trim().to_ascii_uppercase().as_str() {
        "STANDALONE" | "HOST" => Ok(()),
        _ => Err(coded_command_error("common.forbidden")),
    }
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(tag = "mode", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub(crate) enum ReviewedLibraryAuthority {
    Local,
    Client {
        base_url: String,
        library_id: String,
        target_generation: u64,
    },
}

fn require_reviewed_authority(
    settings: &LibrarySyncSettingsRow,
    expected: &ReviewedLibraryAuthority,
) -> Result<(), String> {
    let matches = match expected {
        ReviewedLibraryAuthority::Local => require_authoritative_local_mode(&settings.mode).is_ok(),
        ReviewedLibraryAuthority::Client {
            base_url,
            library_id,
            target_generation,
        } => {
            settings.mode == "CLIENT"
                && settings.target_generation == *target_generation
                && !library_id.trim().is_empty()
                && settings.library_id.trim() == library_id.trim()
                && normalize_library_sync_base_url(base_url)
                    .ok()
                    .is_some_and(|url| {
                        settings
                            .host_base_url
                            .as_deref()
                            .and_then(|host| normalize_library_sync_base_url(host).ok())
                            .as_ref()
                            == Some(&url)
                    })
        }
    };
    if matches {
        Ok(())
    } else {
        Err(coded_command_error("common.invalid_request"))
    }
}

pub(crate) struct ActiveLibraryGateway<'state> {
    state: &'state AppState,
}

impl<'state> ActiveLibraryGateway<'state> {
    pub(crate) fn new(state: &'state AppState) -> Self {
        Self { state }
    }

    pub(crate) fn update_spool_details(
        &self,
        input: UpdateSpoolDetailsInput,
        expected_authority: Option<ReviewedLibraryAuthority>,
    ) -> Result<(), String> {
        let authority_gate = lock_secure_credential_mutation()?;
        let settings = with_inventory(self.state, |engine| engine.get_library_sync_settings())?;
        if let Some(expected) = &expected_authority {
            require_reviewed_authority(&settings, expected)?;
        }
        let generation = settings.target_generation;
        let target = resolve_write_target(ActiveLibraryConfiguration::from(settings))?;
        match target {
            ActiveLibraryWriteTarget::Local => {
                with_inventory(self.state, |engine| engine.update_spool_details(input))
            }
            ActiveLibraryWriteTarget::Host(target) => {
                // Do not serialize a network round-trip behind the local
                // authority gate. The Host command has its own persisted
                // target-generation guard.
                drop(authority_gate);
                update_active_library_host_spool_details_blocking(
                    self.state,
                    &target.base_url,
                    &target.library_id,
                    generation,
                    input,
                )
            }
        }
    }
}

#[derive(Clone, Debug)]
struct ActiveLibraryConfiguration {
    mode: String,
    host_base_url: Option<String>,
    library_id: String,
    client_auth_paired: bool,
}

impl From<LibrarySyncSettingsRow> for ActiveLibraryConfiguration {
    fn from(settings: LibrarySyncSettingsRow) -> Self {
        Self {
            mode: settings.mode,
            host_base_url: settings.host_base_url,
            library_id: settings.library_id,
            client_auth_paired: settings.client_auth_paired,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ActiveLibraryHostTarget {
    base_url: String,
    library_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ActiveLibraryWriteTarget {
    Local,
    Host(ActiveLibraryHostTarget),
}

fn resolve_write_target(
    configuration: ActiveLibraryConfiguration,
) -> Result<ActiveLibraryWriteTarget, String> {
    match configuration.mode.trim().to_ascii_uppercase().as_str() {
        "STANDALONE" | "HOST" => Ok(ActiveLibraryWriteTarget::Local),
        "CLIENT" => {
            if !configuration.client_auth_paired {
                return Err(coded_command_error("common.forbidden"));
            }
            let raw_base_url = configuration
                .host_base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| coded_command_error("common.forbidden"))?;
            let base_url = normalize_library_sync_base_url(raw_base_url)
                .map_err(|_| coded_command_error("common.forbidden"))?;
            let library_id = configuration.library_id.trim();
            if library_id.is_empty() {
                return Err(coded_command_error("common.forbidden"));
            }
            Ok(ActiveLibraryWriteTarget::Host(ActiveLibraryHostTarget {
                base_url,
                library_id: library_id.to_string(),
            }))
        }
        _ => Err(coded_command_error("common.forbidden")),
    }
}

#[cfg(test)]
fn dispatch_spool_details_update<LocalWrite, HostWrite>(
    target: ActiveLibraryWriteTarget,
    input: UpdateSpoolDetailsInput,
    update_local: LocalWrite,
    update_host: HostWrite,
) -> Result<(), String>
where
    LocalWrite: FnOnce(UpdateSpoolDetailsInput) -> Result<(), String>,
    HostWrite: FnOnce(ActiveLibraryHostTarget, UpdateSpoolDetailsInput) -> Result<(), String>,
{
    match target {
        ActiveLibraryWriteTarget::Local => update_local(input),
        ActiveLibraryWriteTarget::Host(target) => update_host(target, input),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        dispatch_spool_details_update, require_authoritative_local_mode, resolve_write_target,
        with_authoritative_local_library, ActiveLibraryConfiguration, ActiveLibraryWriteTarget,
    };
    use crate::backend::filament_database::FilamentDatabase;
    use crate::backend::inventory_engine::UpdateSpoolDetailsInput;
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::cell::{Cell, RefCell};

    fn configuration(mode: &str) -> ActiveLibraryConfiguration {
        ActiveLibraryConfiguration {
            mode: mode.to_string(),
            host_base_url: Some("http://host.local:4278/".to_string()),
            library_id: " library-host ".to_string(),
            client_auth_paired: true,
        }
    }

    fn detail_input() -> UpdateSpoolDetailsInput {
        UpdateSpoolDetailsInput {
            spool_id: "spool-1".to_string(),
            qr_code: Some("FM-SPOOL-1".to_string()),
            status: "IN_STOCK".to_string(),
            location: Some("Shelf A".to_string()),
            home_location: Some(Some("Drybox 2".to_string())),
            spool_tare_weight_g: Some(241),
            ownership: None,
            purchase_metadata: Some(PurchaseReceiptMetadata {
                purchase_price: Some(249.0),
                purchase_currency: Some("NOK".to_string()),
                purchase_date: Some("2026-08-21".to_string()),
                batch_code: Some("batch-7".to_string()),
                supplier_reference: Some("po-19".to_string()),
            }),
            purchase_price_batch_locked: None,
        }
    }

    #[test]
    fn standalone_and_host_modes_preserve_the_existing_local_write_contract() {
        for mode in ["STANDALONE", "HOST"] {
            let target = resolve_write_target(configuration(mode)).expect("local target");
            assert_eq!(target, ActiveLibraryWriteTarget::Local);

            let local_calls = RefCell::new(Vec::new());
            let host_called = Cell::new(false);
            dispatch_spool_details_update(
                target,
                detail_input(),
                |input| {
                    local_calls.borrow_mut().push(input.spool_id);
                    Ok(())
                },
                |_target, _input| {
                    host_called.set(true);
                    Ok(())
                },
            )
            .expect("local update");

            assert_eq!(local_calls.into_inner(), vec!["spool-1"]);
            assert!(!host_called.get());
        }
    }

    #[test]
    fn client_mode_routes_the_complete_atomic_input_to_the_stored_host() {
        let target = resolve_write_target(configuration("CLIENT")).expect("client target");
        let local_called = Cell::new(false);
        let host_call = RefCell::new(None);

        dispatch_spool_details_update(
            target,
            detail_input(),
            |_input| {
                local_called.set(true);
                Ok(())
            },
            |target, input| {
                host_call.replace(Some((target, input)));
                Ok(())
            },
        )
        .expect("host update");

        assert!(!local_called.get());
        let (target, input) = host_call.into_inner().expect("host call");
        assert_eq!(target.base_url, "http://host.local:4278");
        assert_eq!(target.library_id, "library-host");
        assert_eq!(input.spool_id, "spool-1");
        assert_eq!(input.home_location, Some(Some("Drybox 2".to_string())));
        assert_eq!(input.spool_tare_weight_g, Some(241));
        assert_eq!(
            input
                .purchase_metadata
                .as_ref()
                .and_then(|metadata| metadata.purchase_currency.as_deref()),
            Some("NOK")
        );
    }

    #[test]
    fn incomplete_or_invalid_client_configuration_fails_before_any_write() {
        let cases = [
            ActiveLibraryConfiguration {
                client_auth_paired: false,
                ..configuration("CLIENT")
            },
            ActiveLibraryConfiguration {
                host_base_url: None,
                ..configuration("CLIENT")
            },
            ActiveLibraryConfiguration {
                host_base_url: Some("ftp://host.local".to_string()),
                ..configuration("CLIENT")
            },
            ActiveLibraryConfiguration {
                library_id: "  ".to_string(),
                ..configuration("CLIENT")
            },
        ];

        for case in cases {
            assert!(resolve_write_target(case)
                .expect_err("configuration must fail")
                .contains("common.forbidden"));
        }
    }

    #[test]
    fn client_host_failures_are_returned_without_a_local_fallback() {
        let target = resolve_write_target(configuration("CLIENT")).expect("client target");
        let local_called = Cell::new(false);
        let result = dispatch_spool_details_update(
            target,
            detail_input(),
            |_input| {
                local_called.set(true);
                Ok(())
            },
            |_target, _input| Err("host unavailable".to_string()),
        );

        assert_eq!(result.expect_err("host error"), "host unavailable");
        assert!(!local_called.get());
    }

    #[test]
    fn reviewed_authority_matches_role_library_url_and_generation() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let mut settings = db.get_library_sync_settings().unwrap();
        let local = super::ReviewedLibraryAuthority::Local;
        super::require_reviewed_authority(&settings, &local).unwrap();
        settings.mode = "CLIENT".into();
        settings.host_base_url = Some("http://host-a.local:4278".into());
        settings.library_id = "library-a".into();
        settings.target_generation = 7;
        let client = super::ReviewedLibraryAuthority::Client {
            base_url: "http://host-a.local:4278/".into(),
            library_id: "library-a".into(),
            target_generation: 7,
        };
        super::require_reviewed_authority(&settings, &client).unwrap();
        assert!(super::require_reviewed_authority(&settings, &local).is_err());
        settings.library_id = "library-b".into();
        assert!(super::require_reviewed_authority(&settings, &client).is_err());
        settings.library_id = "library-a".into();
        settings.host_base_url = Some("http://host-b.local:4278".into());
        assert!(super::require_reviewed_authority(&settings, &client).is_err());
        settings.host_base_url = Some("http://host-a.local:4278".into());
        settings.target_generation = 9;
        assert!(super::require_reviewed_authority(&settings, &client).is_err());
        settings.target_generation = 7;
        settings.mode = "STANDALONE".into();
        assert!(super::require_reviewed_authority(&settings, &client).is_err());
        assert!(serde_json::from_value::<super::ReviewedLibraryAuthority>(serde_json::json!({"mode":"CLIENT","base_url":"http://host-a.local:4278","library_id":"library-a"})).is_err());
    }

    #[test]
    fn unknown_modes_fail_closed() {
        let error = resolve_write_target(configuration("CORRUPT"))
            .expect_err("unknown mode must not choose local storage");
        assert!(error.contains("common.forbidden"));
    }

    #[test]
    fn direct_local_library_writes_require_standalone_or_host_authority() {
        for mode in ["STANDALONE", "HOST", " host "] {
            require_authoritative_local_mode(mode).expect("authoritative local role");
        }
        assert!(require_authoritative_local_mode("CLIENT")
            .expect_err("client must fail closed")
            .contains("common.forbidden"));
        assert!(require_authoritative_local_mode("CORRUPT")
            .expect_err("unknown role must fail closed")
            .contains("common.forbidden"));
    }

    #[test]
    fn persisted_client_role_rejects_a_direct_local_mutation_before_it_runs() {
        let path = std::env::temp_dir().join(format!(
            "filament-manager-authority-guard-{}-{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let db = FilamentDatabase::open(&path).expect("create test database");
        db.apply_schema().expect("apply schema");
        db.set_setting("library_sync_mode", "CLIENT")
            .expect("set client role");
        drop(db);
        let state = AppState {
            db_path: path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        let mutation_ran = Cell::new(false);

        let error = with_authoritative_local_library(&state, || {
            mutation_ran.set(true);
            Ok(())
        })
        .expect_err("client role must reject local mutation");

        assert!(error.contains("common.forbidden"));
        assert!(!mutation_ran.get());
        let _ = std::fs::remove_file(path);
    }
}
