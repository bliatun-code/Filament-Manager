use super::{AdvertisementError, ValidatedAdvertisementConfig};

pub(super) struct Registration;

impl Registration {
    pub(super) fn register(
        _config: &ValidatedAdvertisementConfig,
    ) -> Result<Self, AdvertisementError> {
        Err(AdvertisementError::UnsupportedPlatform)
    }

    pub(super) fn health(&self) -> Result<(), AdvertisementError> {
        Err(AdvertisementError::UnsupportedPlatform)
    }
}
