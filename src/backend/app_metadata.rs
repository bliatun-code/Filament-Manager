/// The user-visible Filament Manager version.
///
/// `scripts/check-version-consistency.mjs` keeps the private core crate version
/// synchronized with the desktop, Tauri, and npm package versions. Keeping the
/// value here gives core features such as backups and catalog HTTP clients one
/// application-version source instead of independent, release-specific strings.
pub(crate) const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub(crate) const CATALOG_USER_AGENT: &str = concat!(
    "BambuFilamentManager/",
    env!("CARGO_PKG_VERSION"),
    " (+local catalog maintenance)"
);

#[cfg(test)]
mod tests {
    use super::{APP_VERSION, CATALOG_USER_AGENT};

    #[test]
    fn catalog_user_agent_uses_the_application_version() {
        assert_eq!(APP_VERSION, env!("CARGO_PKG_VERSION"));
        assert_eq!(
            CATALOG_USER_AGENT,
            format!("BambuFilamentManager/{APP_VERSION} (+local catalog maintenance)")
        );
    }
}
