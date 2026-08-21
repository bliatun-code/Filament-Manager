use crate::backend::filament_database::LibrarySyncSettingsRow;
use crate::backend::inventory_engine::UpdateSpoolDetailsInput;
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::library_sync_command_support::normalize_library_sync_base_url;
use crate::library_sync_spool_write_commands::update_active_library_host_spool_details_blocking;
use crate::state::AppState;
use crate::with_inventory;

const INCOMPLETE_CLIENT_CONFIGURATION_ERROR: &str =
    "Active library CLIENT configuration is incomplete. Configure and pair a valid Host library before writing.";

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
    ) -> Result<(), String> {
        let settings = with_inventory(self.state, |engine| engine.get_library_sync_settings())?;
        let target = resolve_write_target(ActiveLibraryConfiguration::from(settings))?;

        dispatch_spool_details_update(
            target,
            input,
            |input| {
                companion_service(self.state)
                    .update_spool_details(input)
                    .map_err(inventory_error_to_string)
            },
            |target, input| {
                update_active_library_host_spool_details_blocking(
                    self.state,
                    &target.base_url,
                    &target.library_id,
                    input,
                )
            },
        )
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
                return Err(INCOMPLETE_CLIENT_CONFIGURATION_ERROR.to_string());
            }
            let raw_base_url = configuration
                .host_base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| INCOMPLETE_CLIENT_CONFIGURATION_ERROR.to_string())?;
            let base_url = normalize_library_sync_base_url(raw_base_url)
                .map_err(|_| INCOMPLETE_CLIENT_CONFIGURATION_ERROR.to_string())?;
            let library_id = configuration.library_id.trim();
            if library_id.is_empty() {
                return Err(INCOMPLETE_CLIENT_CONFIGURATION_ERROR.to_string());
            }
            Ok(ActiveLibraryWriteTarget::Host(ActiveLibraryHostTarget {
                base_url,
                library_id: library_id.to_string(),
            }))
        }
        _ => Err("Active library mode is invalid; refusing to select a write target.".to_string()),
    }
}

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
        dispatch_spool_details_update, resolve_write_target, ActiveLibraryConfiguration,
        ActiveLibraryWriteTarget, INCOMPLETE_CLIENT_CONFIGURATION_ERROR,
    };
    use crate::backend::inventory_engine::UpdateSpoolDetailsInput;
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
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
            assert_eq!(
                resolve_write_target(case).expect_err("configuration must fail"),
                INCOMPLETE_CLIENT_CONFIGURATION_ERROR
            );
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
    fn unknown_modes_fail_closed() {
        let error = resolve_write_target(configuration("CORRUPT"))
            .expect_err("unknown mode must not choose local storage");
        assert!(error.contains("refusing"));
    }
}
