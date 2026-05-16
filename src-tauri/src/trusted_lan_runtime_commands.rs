use crate::backend::filament_database::FilamentDatabase;
use crate::state::TrustedLanCompanionRuntime;

pub(crate) fn load_trusted_lan_runtime(
    db_path: &str,
) -> Result<TrustedLanCompanionRuntime, String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_trusted_lan_settings()
        .map_err(|error| error.to_string())?;
    let runtime =
        TrustedLanCompanionRuntime::new(settings.listen_port).with_enabled(settings.enabled);
    let runtime = match (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        (Some(name), Some(address)) if !name.trim().is_empty() && !address.trim().is_empty() => {
            runtime.with_selected_interface(name.trim(), address.trim())
        }
        _ => runtime,
    };
    Ok(runtime)
}
