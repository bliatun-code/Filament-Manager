use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_settings::{
    credential_store_profile_migration_completed as credential_store_profile_migration_completed_row,
    delete_setting as delete_setting_row,
    get_or_create_credential_store_profile_id as get_or_create_credential_store_profile_id_row,
    get_setting as get_setting_row,
    initialize_fresh_credential_store_profile as initialize_fresh_credential_store_profile_row,
    mark_credential_store_profile_migration_completed as mark_credential_store_profile_migration_completed_row,
    set_setting as set_setting_row,
};

impl FilamentDatabase {
    pub fn set_setting(&self, key: &str, value: &str) -> InventoryResult<()> {
        set_setting_row(self.connection(), key, value)
    }

    pub fn delete_setting(&self, key: &str) -> InventoryResult<()> {
        delete_setting_row(self.connection(), key)
    }

    pub fn get_setting(&self, key: &str) -> InventoryResult<Option<String>> {
        get_setting_row(self.connection(), key)
    }

    pub fn get_or_create_credential_store_profile_id(&self) -> InventoryResult<String> {
        get_or_create_credential_store_profile_id_row(self.connection())
    }

    pub fn credential_store_profile_migration_completed(&self) -> InventoryResult<bool> {
        credential_store_profile_migration_completed_row(self.connection())
    }

    pub fn mark_credential_store_profile_migration_completed(&self) -> InventoryResult<()> {
        mark_credential_store_profile_migration_completed_row(self.connection())
    }

    pub fn initialize_fresh_credential_store_profile(&self) -> InventoryResult<String> {
        initialize_fresh_credential_store_profile_row(self.connection())
    }
}
