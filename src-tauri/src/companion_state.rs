use crate::app_services::CompanionService;
use crate::backend::filament_database::{FilamentDatabase, PrinterAmsSlotRow};
use crate::companion_error::CompanionApiError;
use crate::companion_session::{new_companion_session_store, CompanionSessionStore};
use crate::credential_store::CredentialStore;
use crate::state::TrustedLanCompanionRuntime;

#[derive(Clone)]
pub(crate) struct CompanionApiState {
    pub(crate) service: CompanionService,
    pub(crate) db_path: String,
    pub(crate) runtime: TrustedLanCompanionRuntime,
    pub(crate) sessions: CompanionSessionStore,
    pub(crate) credentials: CredentialStore,
}

impl CompanionApiState {
    pub(crate) fn new(
        db_path: String,
        runtime: TrustedLanCompanionRuntime,
        credentials: CredentialStore,
    ) -> Self {
        Self {
            service: CompanionService::new(db_path.clone()),
            db_path,
            runtime,
            sessions: new_companion_session_store(),
            credentials,
        }
    }

    pub(crate) fn open_db(&self) -> Result<FilamentDatabase, CompanionApiError> {
        FilamentDatabase::open(&self.db_path).map_err(|error| {
            CompanionApiError::Internal(format!("Failed to open companion database: {error}"))
        })
    }

    pub(crate) fn find_printer_slot(
        &self,
        printer_id: &str,
        slot_id: &str,
    ) -> Result<PrinterAmsSlotRow, CompanionApiError> {
        self.service
            .list_printer_overview()
            .map_err(CompanionApiError::from)?
            .into_iter()
            .find(|printer| printer.printer.id == printer_id)
            .and_then(|printer| {
                printer
                    .slots
                    .into_iter()
                    .find(|slot| slot.slot_id == slot_id)
            })
            .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))
    }

    pub(crate) fn spool_assigned_to_printer(
        &self,
        spool_id: &str,
    ) -> Result<bool, CompanionApiError> {
        Ok(self
            .service
            .list_printer_overview()
            .map_err(CompanionApiError::from)?
            .into_iter()
            .flat_map(|printer| printer.slots.into_iter())
            .any(|slot| slot.spool_id.as_deref() == Some(spool_id)))
    }
}
