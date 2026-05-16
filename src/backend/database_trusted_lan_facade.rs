use super::database_result::InventoryResult;
use super::database_trusted_lan::{
    consume_trusted_lan_pairing as consume_trusted_lan_pairing_row,
    create_trusted_lan_paired_browser as create_trusted_lan_paired_browser_row,
    create_trusted_lan_pairing as create_trusted_lan_pairing_row,
    get_active_trusted_lan_paired_browser_by_device_token_hash as get_active_trusted_lan_paired_browser_by_device_token_hash_row,
    get_trusted_lan_paired_browser_by_id as get_trusted_lan_paired_browser_by_id_row,
    list_trusted_lan_paired_browsers as list_trusted_lan_paired_browser_rows,
    revoke_all_trusted_lan_paired_browsers as revoke_all_trusted_lan_paired_browser_rows,
    revoke_trusted_lan_paired_browser as revoke_trusted_lan_paired_browser_row,
    touch_trusted_lan_paired_browser as touch_trusted_lan_paired_browser_row,
};
use super::database_trusted_lan_models::{TrustedLanPairedBrowserRow, TrustedLanSettingsRow};
use super::database_trusted_lan_settings::{
    get_trusted_lan_settings as get_trusted_lan_setting_rows,
    save_trusted_lan_settings as save_trusted_lan_setting_rows,
};
use super::filament_database::FilamentDatabase;

impl FilamentDatabase {
    pub fn get_trusted_lan_settings(&self) -> InventoryResult<TrustedLanSettingsRow> {
        get_trusted_lan_setting_rows(self.connection())
    }

    pub fn save_trusted_lan_settings(
        &self,
        settings: &TrustedLanSettingsRow,
    ) -> InventoryResult<()> {
        save_trusted_lan_setting_rows(self.connection(), settings)
    }

    pub fn create_trusted_lan_pairing(
        &self,
        display_name: Option<&str>,
        pairing_token_hash: &str,
        expires_in_seconds: u64,
    ) -> InventoryResult<String> {
        create_trusted_lan_pairing_row(
            self.connection(),
            display_name,
            pairing_token_hash,
            expires_in_seconds,
        )
    }

    pub fn consume_trusted_lan_pairing(
        &self,
        pairing_token_hash: &str,
    ) -> InventoryResult<Option<Option<String>>> {
        consume_trusted_lan_pairing_row(self.connection(), pairing_token_hash)
    }

    pub fn create_trusted_lan_paired_browser(
        &self,
        display_name: Option<&str>,
        device_token_hash: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<TrustedLanPairedBrowserRow> {
        create_trusted_lan_paired_browser_row(
            self.connection(),
            display_name,
            device_token_hash,
            last_origin,
        )
    }

    pub fn get_trusted_lan_paired_browser_by_id(
        &self,
        browser_id: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        get_trusted_lan_paired_browser_by_id_row(self.connection(), browser_id)
    }

    pub fn get_active_trusted_lan_paired_browser_by_device_token_hash(
        &self,
        device_token_hash: &str,
    ) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
        get_active_trusted_lan_paired_browser_by_device_token_hash_row(
            self.connection(),
            device_token_hash,
        )
    }

    pub fn list_trusted_lan_paired_browsers(
        &self,
    ) -> InventoryResult<Vec<TrustedLanPairedBrowserRow>> {
        list_trusted_lan_paired_browser_rows(self.connection())
    }

    pub fn touch_trusted_lan_paired_browser(
        &self,
        browser_id: &str,
        last_origin: Option<&str>,
    ) -> InventoryResult<()> {
        touch_trusted_lan_paired_browser_row(self.connection(), browser_id, last_origin)
    }

    pub fn revoke_trusted_lan_paired_browser(&self, browser_id: &str) -> InventoryResult<()> {
        revoke_trusted_lan_paired_browser_row(self.connection(), browser_id)
    }

    pub fn revoke_all_trusted_lan_paired_browsers(&self) -> InventoryResult<usize> {
        revoke_all_trusted_lan_paired_browser_rows(self.connection())
    }
}
