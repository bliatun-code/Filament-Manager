pub(crate) const BAMBU_LIVE_INTEGRATION_SETTING_PREFIX: &str = "bambu_live_integration:";

pub(crate) fn bambu_live_integration_setting_key(printer_id: &str) -> String {
    format!("{BAMBU_LIVE_INTEGRATION_SETTING_PREFIX}{printer_id}")
}
