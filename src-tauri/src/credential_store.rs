//! Platform credential storage for reusable authentication secrets.
//!
//! This module intentionally has no plaintext fallback. Production builds use the
//! current user's login Keychain on macOS and a non-roaming Generic Credential on
//! Windows. The in-memory implementation only exists in test builds.

use sha2::{Digest, Sha256};
use std::fmt;
use std::sync::{Arc, Mutex};
use zeroize::Zeroize;

const CREDENTIAL_SERVICE: &str = "no.bliatun.filamentmanager.credentials";
const PROFILE_SCOPED_CREDENTIAL_SCHEMA_VERSION: &str = "v2";
const LEGACY_UNSCOPED_CREDENTIAL_SCHEMA_VERSION: &str = "v1";
const MAX_STABLE_IDENTIFIER_BYTES: usize = 2_048;
const MAX_SECRET_BYTES: usize = 2_048;
const CREDENTIAL_BINDING_ID_HEX_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum CredentialPurpose {
    BambuAccessCode,
    LibrarySyncClientDeviceToken,
}

impl CredentialPurpose {
    fn path_component(self) -> &'static str {
        match self {
            Self::BambuAccessCode => "bambu-live/access-code",
            Self::LibrarySyncClientDeviceToken => "library-sync/client-device-token",
        }
    }
}

/// An opaque identifier for one credential.
///
/// Raw printer IDs and host URLs are reduced to a SHA-256 scope digest when the
/// key is created. This keeps platform credential names bounded and prevents
/// private LAN details from appearing in Keychain or Credential Manager labels.
#[derive(Clone, PartialEq, Eq, Hash)]
pub(crate) struct CredentialKey {
    purpose: CredentialPurpose,
    account_name: String,
    namespace: CredentialNamespace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum CredentialNamespace {
    ProfileScopedV2,
    LegacyUnscopedV1,
}

impl CredentialKey {
    pub(crate) fn bambu_access_code(
        printer_id: &str,
        binding_id: &str,
    ) -> Result<Self, CredentialStoreError> {
        let binding_id = normalize_credential_binding_id(binding_id)?;
        let printer_digest = stable_identifier_digest(printer_id)?;
        Ok(Self {
            purpose: CredentialPurpose::BambuAccessCode,
            account_name: format!(
                "{}/{}/{binding_id}",
                CredentialPurpose::BambuAccessCode.path_component(),
                printer_digest
            ),
            namespace: CredentialNamespace::ProfileScopedV2,
        })
    }

    pub(crate) fn legacy_bambu_access_code(printer_id: &str) -> Result<Self, CredentialStoreError> {
        Self::legacy_unscoped(CredentialPurpose::BambuAccessCode, printer_id)
    }

    /// Creates the device-token key for one normalized library host base URL.
    ///
    /// Callers must use the same normalized value used by library-sync settings
    /// (trimmed and without a trailing slash).
    pub(crate) fn library_sync_client_device_token(
        normalized_host_base_url: &str,
    ) -> Result<Self, CredentialStoreError> {
        Self::profile_scoped(
            CredentialPurpose::LibrarySyncClientDeviceToken,
            normalized_host_base_url,
        )
    }

    pub(crate) fn legacy_library_sync_client_device_token(
        normalized_host_base_url: &str,
    ) -> Result<Self, CredentialStoreError> {
        Self::legacy_unscoped(
            CredentialPurpose::LibrarySyncClientDeviceToken,
            normalized_host_base_url,
        )
    }

    fn profile_scoped(
        purpose: CredentialPurpose,
        stable_identifier: &str,
    ) -> Result<Self, CredentialStoreError> {
        let digest_hex = stable_identifier_digest(stable_identifier)?;
        Ok(Self {
            purpose,
            account_name: format!("{}/{}", purpose.path_component(), digest_hex),
            namespace: CredentialNamespace::ProfileScopedV2,
        })
    }

    fn legacy_unscoped(
        purpose: CredentialPurpose,
        stable_identifier: &str,
    ) -> Result<Self, CredentialStoreError> {
        let digest_hex = stable_identifier_digest(stable_identifier)?;
        Ok(Self {
            purpose,
            account_name: format!(
                "{}/{}/{}",
                LEGACY_UNSCOPED_CREDENTIAL_SCHEMA_VERSION,
                purpose.path_component(),
                digest_hex
            ),
            namespace: CredentialNamespace::LegacyUnscopedV1,
        })
    }

    fn resolve_for_profile(&self, profile_scope_digest: &str) -> Self {
        match self.namespace {
            CredentialNamespace::ProfileScopedV2 => Self {
                purpose: self.purpose,
                account_name: format!(
                    "{PROFILE_SCOPED_CREDENTIAL_SCHEMA_VERSION}/profile/{profile_scope_digest}/{}",
                    self.account_name
                ),
                namespace: CredentialNamespace::LegacyUnscopedV1,
            },
            CredentialNamespace::LegacyUnscopedV1 => self.clone(),
        }
    }

    fn account_name(&self) -> &str {
        &self.account_name
    }

    #[cfg(target_os = "windows")]
    fn windows_target_name(&self) -> String {
        format!("{CREDENTIAL_SERVICE}/{}", self.account_name())
    }
}

/// Generates a non-reusable binding between one integration snapshot and one
/// platform credential. Replacements and delete/re-add flows always receive a
/// fresh key, so an old in-flight TLS connection cannot resolve a later secret.
pub(crate) fn new_credential_binding_id() -> String {
    format!("{:032x}", rand::random::<u128>())
}

impl fmt::Debug for CredentialKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CredentialKey")
            .field("purpose", &self.purpose)
            .field("account_name", &self.account_name)
            .field("namespace", &self.namespace)
            .finish()
    }
}

fn stable_identifier_digest(stable_identifier: &str) -> Result<String, CredentialStoreError> {
    let stable_identifier = stable_identifier.trim();
    if stable_identifier.is_empty()
        || stable_identifier.len() > MAX_STABLE_IDENTIFIER_BYTES
        || stable_identifier.chars().any(char::is_control)
    {
        return Err(CredentialStoreError::InvalidStableIdentifier);
    }
    Ok(sha256_hex(stable_identifier.as_bytes()))
}

fn sha256_hex(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    let mut digest_hex = String::with_capacity(digest.len() * 2);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in digest {
        digest_hex.push(char::from(HEX[usize::from(byte >> 4)]));
        digest_hex.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    digest_hex
}

/// A secret byte buffer whose debug output is always redacted and whose storage
/// is zeroed on drop.
pub(crate) struct SecretValue(Vec<u8>);

impl SecretValue {
    pub(crate) fn from_bytes(value: Vec<u8>) -> Self {
        Self(value)
    }

    pub(crate) fn from_utf8(value: String) -> Self {
        Self(value.into_bytes())
    }

    pub(crate) fn expose_bytes(&self) -> &[u8] {
        &self.0
    }

    pub(crate) fn expose_utf8(&self) -> Result<&str, CredentialStoreError> {
        std::str::from_utf8(&self.0).map_err(|_| CredentialStoreError::StoredSecretIsNotUtf8)
    }

    fn len(&self) -> usize {
        self.0.len()
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl fmt::Debug for SecretValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretValue([REDACTED])")
    }
}

impl Drop for SecretValue {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CredentialOperation {
    Read,
    Write,
    Delete,
}

impl fmt::Display for CredentialOperation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Delete => "delete",
        };
        formatter.write_str(value)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum CredentialStoreError {
    InvalidStableIdentifier,
    InvalidCredentialBinding,
    InvalidProfileScope,
    EmptySecret,
    SecretTooLarge {
        actual_bytes: usize,
        maximum_bytes: usize,
    },
    StoredSecretIsEmpty,
    StoredSecretTooLarge {
        actual_bytes: usize,
        maximum_bytes: usize,
    },
    StoredSecretIsNotUtf8,
    LockPoisoned,
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    UnsupportedPlatform,
    Backend {
        operation: CredentialOperation,
        platform: &'static str,
        code: Option<i64>,
        detail: String,
    },
}

impl fmt::Display for CredentialStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidStableIdentifier => {
                formatter.write_str("Credential identity is empty or invalid.")
            }
            Self::InvalidCredentialBinding => {
                formatter.write_str("Credential binding identity is invalid.")
            }
            Self::InvalidProfileScope => {
                formatter.write_str("Credential profile identity is empty or invalid.")
            }
            Self::EmptySecret => formatter.write_str("Credential value must not be empty."),
            Self::SecretTooLarge {
                actual_bytes,
                maximum_bytes,
            } => write!(
                formatter,
                "Credential value is {actual_bytes} bytes; the maximum is {maximum_bytes} bytes."
            ),
            Self::StoredSecretIsEmpty => {
                formatter.write_str("Stored credential value is unexpectedly empty.")
            }
            Self::StoredSecretTooLarge {
                actual_bytes,
                maximum_bytes,
            } => write!(
                formatter,
                "Stored credential value is {actual_bytes} bytes; the maximum is {maximum_bytes} bytes."
            ),
            Self::StoredSecretIsNotUtf8 => {
                formatter.write_str("Stored credential value is not valid UTF-8.")
            }
            Self::LockPoisoned => {
                formatter.write_str("Credential storage is temporarily unavailable.")
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            Self::UnsupportedPlatform => {
                formatter.write_str("Secure credential storage is unavailable on this platform.")
            }
            Self::Backend {
                operation,
                platform,
                code,
                detail,
            } => {
                write!(
                    formatter,
                    "Could not {operation} credential using {platform}"
                )?;
                if let Some(code) = code {
                    write!(formatter, " (error {code})")?;
                }
                write!(formatter, ": {detail}")
            }
        }
    }
}

impl std::error::Error for CredentialStoreError {}

pub(crate) trait CredentialBackend: Send + Sync {
    fn get(&self, key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError>;
    fn set(&self, key: &CredentialKey, value: &SecretValue) -> Result<(), CredentialStoreError>;
    fn delete(&self, key: &CredentialKey) -> Result<bool, CredentialStoreError>;
}

struct SerializedCredentialStore {
    backend: Box<dyn CredentialBackend>,
    operation_gate: Mutex<()>,
}

/// Cloneable, serialized access to the current platform credential backend.
#[derive(Clone)]
pub(crate) struct CredentialStore {
    inner: Arc<SerializedCredentialStore>,
    profile_scope_digest: Arc<Mutex<String>>,
}

impl CredentialStore {
    #[cfg(target_os = "macos")]
    pub(crate) fn system(profile_id: &str) -> Result<Self, CredentialStoreError> {
        Self::with_backend_for_profile(MacOsCredentialBackend::new()?, profile_id)
    }

    #[cfg(target_os = "windows")]
    pub(crate) fn system(profile_id: &str) -> Result<Self, CredentialStoreError> {
        Self::with_backend_for_profile(WindowsCredentialBackend, profile_id)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub(crate) fn system(_profile_id: &str) -> Result<Self, CredentialStoreError> {
        Err(CredentialStoreError::UnsupportedPlatform)
    }

    #[cfg(test)]
    fn with_backend(backend: impl CredentialBackend + 'static) -> Self {
        Self::with_backend_for_profile(backend, "filament-manager-test-profile")
            .expect("fixed test credential profile is valid")
    }

    fn with_backend_for_profile(
        backend: impl CredentialBackend + 'static,
        profile_id: &str,
    ) -> Result<Self, CredentialStoreError> {
        Ok(Self {
            inner: Arc::new(SerializedCredentialStore {
                backend: Box::new(backend),
                operation_gate: Mutex::new(()),
            }),
            profile_scope_digest: Arc::new(Mutex::new(profile_scope_digest(profile_id)?)),
        })
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Self {
        Self::with_backend(InMemoryCredentialBackend::default())
    }

    #[cfg(test)]
    pub(crate) fn in_memory_with_delete_failures(delete_failures: usize) -> Self {
        Self::with_backend(InMemoryCredentialBackend {
            remaining_delete_failures: std::sync::atomic::AtomicUsize::new(delete_failures),
            ..InMemoryCredentialBackend::default()
        })
    }

    #[cfg(test)]
    pub(crate) fn in_memory_with_read_failures(read_failures: usize) -> Self {
        Self::with_backend(InMemoryCredentialBackend {
            remaining_read_failures: std::sync::atomic::AtomicUsize::new(read_failures),
            ..InMemoryCredentialBackend::default()
        })
    }

    pub(crate) fn get(
        &self,
        key: &CredentialKey,
    ) -> Result<Option<SecretValue>, CredentialStoreError> {
        let _operation = self
            .inner
            .operation_gate
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        let resolved_key = self.resolve_key(key)?;
        let value = self.inner.backend.get(&resolved_key)?;
        if let Some(value) = &value {
            validate_stored_secret(value)?;
        }
        Ok(value)
    }

    pub(crate) fn set(
        &self,
        key: &CredentialKey,
        value: &SecretValue,
    ) -> Result<(), CredentialStoreError> {
        validate_new_secret(value)?;
        let _operation = self
            .inner
            .operation_gate
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        let resolved_key = self.resolve_key(key)?;
        self.inner.backend.set(&resolved_key, value)
    }

    pub(crate) fn delete(&self, key: &CredentialKey) -> Result<bool, CredentialStoreError> {
        let _operation = self
            .inner
            .operation_gate
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        let resolved_key = self.resolve_key(key)?;
        self.inner.backend.delete(&resolved_key)
    }

    pub(crate) fn profile_scope_digest(&self) -> Result<String, CredentialStoreError> {
        let _operation = self
            .inner
            .operation_gate
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        self.profile_scope_digest
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)
            .map(|scope| scope.clone())
    }

    pub(crate) fn switch_profile(&self, profile_id: &str) -> Result<(), CredentialStoreError> {
        let next_scope = profile_scope_digest(profile_id)?;
        let _operation = self
            .inner
            .operation_gate
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        *self
            .profile_scope_digest
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)? = next_scope;
        Ok(())
    }

    pub(crate) fn scoped_to_profile_digest(
        &self,
        profile_scope_digest: &str,
    ) -> Result<Self, CredentialStoreError> {
        if profile_scope_digest.len() != 64
            || !profile_scope_digest
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(CredentialStoreError::InvalidProfileScope);
        }
        Ok(Self {
            inner: self.inner.clone(),
            profile_scope_digest: Arc::new(Mutex::new(profile_scope_digest.to_ascii_lowercase())),
        })
    }

    pub(crate) fn scoped_to_profile_id(
        &self,
        profile_id: &str,
    ) -> Result<Self, CredentialStoreError> {
        let digest = profile_scope_digest(profile_id)?;
        self.scoped_to_profile_digest(&digest)
    }

    fn resolve_key(&self, key: &CredentialKey) -> Result<CredentialKey, CredentialStoreError> {
        let profile_scope = self
            .profile_scope_digest
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        Ok(key.resolve_for_profile(&profile_scope))
    }
}

impl fmt::Debug for CredentialStore {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CredentialStore([PLATFORM BACKEND])")
    }
}

fn profile_scope_digest(profile_id: &str) -> Result<String, CredentialStoreError> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty()
        || profile_id.len() > MAX_STABLE_IDENTIFIER_BYTES
        || profile_id.chars().any(char::is_control)
    {
        return Err(CredentialStoreError::InvalidProfileScope);
    }
    Ok(sha256_hex(profile_id.as_bytes()))
}

pub(crate) fn normalize_credential_binding_id(
    binding_id: &str,
) -> Result<String, CredentialStoreError> {
    let binding_id = binding_id.trim();
    if binding_id.len() != CREDENTIAL_BINDING_ID_HEX_BYTES
        || !binding_id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(CredentialStoreError::InvalidCredentialBinding);
    }
    Ok(binding_id.to_ascii_lowercase())
}

fn validate_new_secret(value: &SecretValue) -> Result<(), CredentialStoreError> {
    if value.is_empty() {
        return Err(CredentialStoreError::EmptySecret);
    }
    if value.len() > MAX_SECRET_BYTES {
        return Err(CredentialStoreError::SecretTooLarge {
            actual_bytes: value.len(),
            maximum_bytes: MAX_SECRET_BYTES,
        });
    }
    Ok(())
}

fn validate_stored_secret(value: &SecretValue) -> Result<(), CredentialStoreError> {
    if value.is_empty() {
        return Err(CredentialStoreError::StoredSecretIsEmpty);
    }
    if value.len() > MAX_SECRET_BYTES {
        return Err(CredentialStoreError::StoredSecretTooLarge {
            actual_bytes: value.len(),
            maximum_bytes: MAX_SECRET_BYTES,
        });
    }
    Ok(())
}

#[cfg(target_os = "macos")]
struct MacOsCredentialBackend;

#[cfg(target_os = "macos")]
impl MacOsCredentialBackend {
    fn new() -> Result<Self, CredentialStoreError> {
        Ok(Self)
    }
}

#[cfg(target_os = "macos")]
impl CredentialBackend for MacOsCredentialBackend {
    fn get(&self, key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError> {
        match security_framework::passwords::get_generic_password(
            CREDENTIAL_SERVICE,
            key.account_name(),
        ) {
            Ok(password) => Ok(Some(SecretValue::from_bytes(password))),
            Err(error) if error.code() == security_framework_sys::base::errSecItemNotFound => {
                Ok(None)
            }
            Err(error) => Err(macos_backend_error(CredentialOperation::Read, error)),
        }
    }

    fn set(&self, key: &CredentialKey, value: &SecretValue) -> Result<(), CredentialStoreError> {
        security_framework::passwords::set_generic_password(
            CREDENTIAL_SERVICE,
            key.account_name(),
            value.expose_bytes(),
        )
        .map_err(|error| macos_backend_error(CredentialOperation::Write, error))
    }

    fn delete(&self, key: &CredentialKey) -> Result<bool, CredentialStoreError> {
        match security_framework::passwords::delete_generic_password(
            CREDENTIAL_SERVICE,
            key.account_name(),
        ) {
            Ok(()) => Ok(true),
            Err(error) if error.code() == security_framework_sys::base::errSecItemNotFound => {
                Ok(false)
            }
            Err(error) => Err(macos_backend_error(CredentialOperation::Delete, error)),
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_backend_error(
    operation: CredentialOperation,
    error: security_framework::base::Error,
) -> CredentialStoreError {
    CredentialStoreError::Backend {
        operation,
        platform: "macOS login Keychain",
        code: Some(i64::from(error.code())),
        detail: error.to_string(),
    }
}

#[cfg(target_os = "windows")]
struct WindowsCredentialBackend;

#[cfg(target_os = "windows")]
impl CredentialBackend for WindowsCredentialBackend {
    fn get(&self, key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError> {
        use std::ptr;
        use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
        use windows_sys::Win32::Security::Credentials::{
            CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
        };

        let target_name = to_null_terminated_utf16(&key.windows_target_name());
        let mut credential_ptr: *mut CREDENTIALW = ptr::null_mut();
        let succeeded = unsafe {
            CredReadW(
                target_name.as_ptr(),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            )
        };
        if succeeded == 0 {
            let error_code = unsafe { GetLastError() };
            return if error_code == ERROR_NOT_FOUND {
                Ok(None)
            } else {
                Err(windows_backend_error(CredentialOperation::Read, error_code))
            };
        }
        if credential_ptr.is_null() {
            return Err(CredentialStoreError::Backend {
                operation: CredentialOperation::Read,
                platform: "Windows Credential Manager",
                code: None,
                detail: "the operating system returned an empty credential pointer".to_string(),
            });
        }

        struct CredentialBuffer(*mut CREDENTIALW);
        impl Drop for CredentialBuffer {
            fn drop(&mut self) {
                unsafe {
                    if !self.0.is_null() {
                        let credential = &mut *self.0;
                        if !credential.CredentialBlob.is_null() && credential.CredentialBlobSize > 0
                        {
                            std::slice::from_raw_parts_mut(
                                credential.CredentialBlob,
                                credential.CredentialBlobSize as usize,
                            )
                            .zeroize();
                        }
                    }
                    CredFree(self.0.cast());
                }
            }
        }

        let credential_buffer = CredentialBuffer(credential_ptr);
        let credential = unsafe { &*credential_buffer.0 };
        if credential.CredentialBlobSize == 0 || credential.CredentialBlob.is_null() {
            return Err(CredentialStoreError::StoredSecretIsEmpty);
        }
        let secret_size = credential.CredentialBlobSize as usize;
        if secret_size > MAX_SECRET_BYTES {
            return Err(CredentialStoreError::StoredSecretTooLarge {
                actual_bytes: secret_size,
                maximum_bytes: MAX_SECRET_BYTES,
            });
        }
        let secret = unsafe { std::slice::from_raw_parts(credential.CredentialBlob, secret_size) };
        Ok(Some(SecretValue::from_bytes(secret.to_vec())))
    }

    fn set(&self, key: &CredentialKey, value: &SecretValue) -> Result<(), CredentialStoreError> {
        use std::ptr;
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::Security::Credentials::{
            CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        };

        let mut target_name = to_null_terminated_utf16(&key.windows_target_name());
        let mut user_name = to_null_terminated_utf16("Filament Manager");
        let mut credential_blob = zeroize::Zeroizing::new(value.expose_bytes().to_vec());
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: target_name.as_mut_ptr(),
            CredentialBlobSize: credential_blob.len() as u32,
            CredentialBlob: credential_blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: user_name.as_mut_ptr(),
            Comment: ptr::null_mut(),
            TargetAlias: ptr::null_mut(),
            Attributes: ptr::null_mut(),
            ..CREDENTIALW::default()
        };

        let succeeded = unsafe { CredWriteW(&credential, 0) };
        if succeeded == 0 {
            return Err(windows_backend_error(CredentialOperation::Write, unsafe {
                GetLastError()
            }));
        }
        Ok(())
    }

    fn delete(&self, key: &CredentialKey) -> Result<bool, CredentialStoreError> {
        use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
        use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

        let target_name = to_null_terminated_utf16(&key.windows_target_name());
        let succeeded = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if succeeded != 0 {
            return Ok(true);
        }

        let error_code = unsafe { GetLastError() };
        if error_code == ERROR_NOT_FOUND {
            Ok(false)
        } else {
            Err(windows_backend_error(
                CredentialOperation::Delete,
                error_code,
            ))
        }
    }
}

#[cfg(target_os = "windows")]
fn to_null_terminated_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn windows_backend_error(operation: CredentialOperation, error_code: u32) -> CredentialStoreError {
    CredentialStoreError::Backend {
        operation,
        platform: "Windows Credential Manager",
        code: Some(i64::from(error_code)),
        detail: std::io::Error::from_raw_os_error(error_code as i32).to_string(),
    }
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryCredentialBackend {
    values: Mutex<std::collections::HashMap<CredentialKey, SecretValue>>,
    remaining_read_failures: std::sync::atomic::AtomicUsize,
    remaining_delete_failures: std::sync::atomic::AtomicUsize,
}

#[cfg(test)]
impl CredentialBackend for InMemoryCredentialBackend {
    fn get(&self, key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError> {
        if self
            .remaining_read_failures
            .fetch_update(
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
                |remaining| remaining.checked_sub(1),
            )
            .is_ok()
        {
            return Err(CredentialStoreError::Backend {
                operation: CredentialOperation::Read,
                platform: "test credential store",
                code: None,
                detail: "injected read failure".to_string(),
            });
        }
        let values = self
            .values
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        Ok(values
            .get(key)
            .map(|value| SecretValue::from_bytes(value.expose_bytes().to_vec())))
    }

    fn set(&self, key: &CredentialKey, value: &SecretValue) -> Result<(), CredentialStoreError> {
        let mut values = self
            .values
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        values.insert(
            key.clone(),
            SecretValue::from_bytes(value.expose_bytes().to_vec()),
        );
        Ok(())
    }

    fn delete(&self, key: &CredentialKey) -> Result<bool, CredentialStoreError> {
        if self
            .remaining_delete_failures
            .fetch_update(
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
                |remaining| remaining.checked_sub(1),
            )
            .is_ok()
        {
            return Err(CredentialStoreError::Backend {
                operation: CredentialOperation::Delete,
                platform: "test credential store",
                code: None,
                detail: "injected delete failure".to_string(),
            });
        }
        let mut values = self
            .values
            .lock()
            .map_err(|_| CredentialStoreError::LockPoisoned)?;
        let removed = values.remove(key);
        drop(values);
        Ok(removed.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[test]
    fn credential_names_are_versioned_stable_and_do_not_expose_scope() {
        let key =
            CredentialKey::bambu_access_code(" printer-1 ", "77777777777777777777777777777777")
                .expect("credential key");

        assert_eq!(
            key.account_name(),
            "bambu-live/access-code/06787fc58aa44e839835620fecfb43b94c94fc2a70a05dcfe9f63ccb3eb4f981/77777777777777777777777777777777"
        );
        let debug = format!("{key:?}");
        assert!(!debug.contains("printer-1"));
        assert!(debug.contains("BambuAccessCode"));
    }

    #[test]
    fn library_host_scope_is_stable_and_separate_from_bambu_scope() {
        let host_key = CredentialKey::library_sync_client_device_token("http://192.168.1.9:4278")
            .expect("host credential key");
        let bambu_key = CredentialKey::bambu_access_code(
            "http://192.168.1.9:4278",
            "11111111111111111111111111111111",
        )
        .expect("Bambu credential key");

        assert_eq!(
            host_key.account_name(),
            "library-sync/client-device-token/86dcedfb0c87a11b002511b60c5d403841459c56676a4de276298ef2e7732d7e"
        );
        assert_ne!(host_key, bambu_key);
        assert!(!format!("{host_key:?}").contains("192.168.1.9"));
    }

    #[test]
    fn profile_scopes_isolate_identical_logical_credentials() {
        let first = CredentialStore::in_memory();
        let second = first
            .scoped_to_profile_id("independent-library")
            .expect("second profile");
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");
        first
            .set(&key, &SecretValue::from_utf8("first-code".to_string()))
            .expect("first write");
        assert!(second.get(&key).expect("second read").is_none());
        second
            .set(&key, &SecretValue::from_utf8("second-code".to_string()))
            .expect("second write");
        assert_eq!(
            first
                .get(&key)
                .expect("first read")
                .expect("first value")
                .expose_utf8()
                .expect("UTF-8"),
            "first-code"
        );
        assert_eq!(
            second
                .get(&key)
                .expect("second read")
                .expect("second value")
                .expose_utf8()
                .expect("UTF-8"),
            "second-code"
        );
        first.delete(&key).expect("first delete");
        assert!(first.get(&key).expect("first final read").is_none());
        assert_eq!(
            second
                .get(&key)
                .expect("second final read")
                .expect("second remains")
                .expose_utf8()
                .expect("UTF-8"),
            "second-code"
        );
    }

    #[test]
    fn immutable_profile_snapshot_does_not_follow_a_later_app_profile_switch() {
        let app_store = CredentialStore::in_memory();
        app_store
            .switch_profile("old-library")
            .expect("select old profile");
        let poll_store = app_store
            .scoped_to_profile_id("old-library")
            .expect("snapshot poll profile");
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");
        poll_store
            .set(&key, &SecretValue::from_utf8("old-code".to_string()))
            .expect("store old code");

        app_store
            .switch_profile("restored-library")
            .expect("switch app profile");
        app_store
            .set(&key, &SecretValue::from_utf8("new-code".to_string()))
            .expect("store new code");

        assert_eq!(
            poll_store
                .get(&key)
                .expect("old poll read")
                .expect("old poll credential")
                .expose_utf8()
                .expect("UTF-8"),
            "old-code"
        );
        assert_eq!(
            app_store
                .get(&key)
                .expect("new profile read")
                .expect("new profile credential")
                .expose_utf8()
                .expect("UTF-8"),
            "new-code"
        );
    }

    #[test]
    fn generated_credential_bindings_are_valid_and_distinct() {
        let first = new_credential_binding_id();
        let second = new_credential_binding_id();
        assert_ne!(first, second);
        CredentialKey::bambu_access_code("printer-1", &first).expect("first binding");
        CredentialKey::bambu_access_code("printer-1", &second).expect("second binding");
    }

    #[test]
    fn legacy_v1_keys_are_shared_only_for_compatible_one_time_migration() {
        let first = CredentialStore::in_memory();
        let second = first
            .scoped_to_profile_id("another-library")
            .expect("second profile");
        let legacy = CredentialKey::legacy_bambu_access_code("printer-1").expect("legacy key");
        first
            .set(&legacy, &SecretValue::from_utf8("legacy-code".to_string()))
            .expect("legacy write");
        assert_eq!(
            second
                .get(&legacy)
                .expect("legacy read")
                .expect("legacy value")
                .expose_utf8()
                .expect("UTF-8"),
            "legacy-code"
        );
    }

    #[test]
    fn bambu_bindings_never_resolve_to_the_same_credential() {
        let store = CredentialStore::in_memory();
        let first =
            CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
                .expect("first");
        let second =
            CredentialKey::bambu_access_code("printer-1", "22222222222222222222222222222222")
                .expect("second");
        store
            .set(&first, &SecretValue::from_utf8("old-code".to_string()))
            .expect("old write");
        store
            .set(&second, &SecretValue::from_utf8("new-code".to_string()))
            .expect("new write");
        assert_eq!(
            store
                .get(&first)
                .expect("old read")
                .expect("old value")
                .expose_utf8()
                .expect("UTF-8"),
            "old-code"
        );
        assert_eq!(
            store
                .get(&second)
                .expect("new read")
                .expect("new value")
                .expose_utf8()
                .expect("UTF-8"),
            "new-code"
        );
    }

    #[test]
    fn invalid_stable_identifiers_are_rejected() {
        assert_eq!(
            CredentialKey::bambu_access_code("   ", "11111111111111111111111111111111")
                .expect_err("blank must fail"),
            CredentialStoreError::InvalidStableIdentifier
        );
        assert_eq!(
            CredentialKey::bambu_access_code("printer\n1", "11111111111111111111111111111111",)
                .expect_err("control chars must fail"),
            CredentialStoreError::InvalidStableIdentifier
        );
        assert_eq!(
            CredentialKey::bambu_access_code(
                &"x".repeat(MAX_STABLE_IDENTIFIER_BYTES + 1),
                "11111111111111111111111111111111",
            )
            .expect_err("oversized identifiers must fail"),
            CredentialStoreError::InvalidStableIdentifier
        );
        assert_eq!(
            CredentialKey::bambu_access_code("printer-1", "not-a-binding")
                .expect_err("invalid binding must fail"),
            CredentialStoreError::InvalidCredentialBinding
        );
    }

    #[test]
    fn in_memory_store_supports_crud_overwrite_and_idempotent_delete() {
        let store = CredentialStore::in_memory();
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");
        let first = SecretValue::from_utf8("first-secret".to_string());
        let second = SecretValue::from_utf8("second-secret".to_string());

        assert!(store.get(&key).expect("initial read").is_none());
        store.set(&key, &first).expect("first write");
        assert_eq!(
            store
                .get(&key)
                .expect("first read")
                .expect("stored value")
                .expose_utf8()
                .expect("UTF-8"),
            "first-secret"
        );

        store.set(&key, &second).expect("overwrite");
        assert_eq!(
            store
                .get(&key)
                .expect("second read")
                .expect("stored value")
                .expose_utf8()
                .expect("UTF-8"),
            "second-secret"
        );
        assert!(store.delete(&key).expect("first delete"));
        assert!(!store.delete(&key).expect("idempotent delete"));
        assert!(store.get(&key).expect("final read").is_none());
    }

    #[test]
    fn secret_values_are_redacted_and_invalid_sizes_never_reach_backend() {
        let store = CredentialStore::in_memory();
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");
        let secret = SecretValue::from_utf8("do-not-log-me".to_string());
        assert_eq!(format!("{secret:?}"), "SecretValue([REDACTED])");
        assert!(!format!("{store:?}").contains("do-not-log-me"));

        let empty = SecretValue::from_bytes(Vec::new());
        assert_eq!(
            store.set(&key, &empty).expect_err("empty must fail"),
            CredentialStoreError::EmptySecret
        );

        let oversized = SecretValue::from_bytes(vec![0; MAX_SECRET_BYTES + 1]);
        assert_eq!(
            store
                .set(&key, &oversized)
                .expect_err("oversized must fail"),
            CredentialStoreError::SecretTooLarge {
                actual_bytes: MAX_SECRET_BYTES + 1,
                maximum_bytes: MAX_SECRET_BYTES,
            }
        );
        assert!(store.get(&key).expect("unchanged read").is_none());
    }

    struct SerializedProbeBackend {
        active: Arc<AtomicUsize>,
        maximum_active: Arc<AtomicUsize>,
    }

    impl CredentialBackend for SerializedProbeBackend {
        fn get(&self, _key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError> {
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.maximum_active.fetch_max(active, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(5));
            self.active.fetch_sub(1, Ordering::SeqCst);
            Ok(None)
        }

        fn set(
            &self,
            _key: &CredentialKey,
            _value: &SecretValue,
        ) -> Result<(), CredentialStoreError> {
            Ok(())
        }

        fn delete(&self, _key: &CredentialKey) -> Result<bool, CredentialStoreError> {
            Ok(false)
        }
    }

    #[test]
    fn cloned_store_serializes_backend_operations() {
        let active = Arc::new(AtomicUsize::new(0));
        let maximum_active = Arc::new(AtomicUsize::new(0));
        let store = CredentialStore::with_backend(SerializedProbeBackend {
            active: active.clone(),
            maximum_active: maximum_active.clone(),
        });
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");

        let threads = (0..8)
            .map(|_| {
                let store = store.clone();
                let key = key.clone();
                std::thread::spawn(move || store.get(&key).expect("serialized read"))
            })
            .collect::<Vec<_>>();
        for thread in threads {
            assert!(thread.join().expect("read thread").is_none());
        }

        assert_eq!(maximum_active.load(Ordering::SeqCst), 1);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    struct FailingBackend;

    impl CredentialBackend for FailingBackend {
        fn get(&self, _key: &CredentialKey) -> Result<Option<SecretValue>, CredentialStoreError> {
            Err(test_backend_error(CredentialOperation::Read))
        }

        fn set(
            &self,
            _key: &CredentialKey,
            _value: &SecretValue,
        ) -> Result<(), CredentialStoreError> {
            Err(test_backend_error(CredentialOperation::Write))
        }

        fn delete(&self, _key: &CredentialKey) -> Result<bool, CredentialStoreError> {
            Err(test_backend_error(CredentialOperation::Delete))
        }
    }

    fn test_backend_error(operation: CredentialOperation) -> CredentialStoreError {
        CredentialStoreError::Backend {
            operation,
            platform: "test backend",
            code: Some(7),
            detail: "simulated failure".to_string(),
        }
    }

    #[test]
    fn backend_failures_are_returned_without_plaintext_fallback() {
        let store = CredentialStore::with_backend(FailingBackend);
        let key = CredentialKey::bambu_access_code("printer-1", "11111111111111111111111111111111")
            .expect("credential key");
        let secret = SecretValue::from_utf8("secret".to_string());

        assert_eq!(
            store.get(&key).expect_err("read must fail"),
            test_backend_error(CredentialOperation::Read)
        );
        assert_eq!(
            store.set(&key, &secret).expect_err("write must fail"),
            test_backend_error(CredentialOperation::Write)
        );
        assert_eq!(
            store.delete(&key).expect_err("delete must fail"),
            test_backend_error(CredentialOperation::Delete)
        );
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    struct SystemCredentialCleanupGuard {
        store: CredentialStore,
        key: CredentialKey,
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    impl Drop for SystemCredentialCleanupGuard {
        fn drop(&mut self) {
            let _ = self.store.delete(&self.key);
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    #[cfg_attr(
        target_os = "macos",
        ignore = "writes and removes one uniquely scoped item in the real OS credential store"
    )]
    fn system_store_supports_crud_overwrite_and_cleanup() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let key = CredentialKey::bambu_access_code(
            &format!("credential-store-smoke-{}-{nonce}", std::process::id()),
            "11111111111111111111111111111111",
        )
        .expect("credential key");
        let store = CredentialStore::system("credential-store-smoke-profile")
            .expect("platform credential store");
        let _cleanup_guard = SystemCredentialCleanupGuard {
            store: store.clone(),
            key: key.clone(),
        };

        let _ = store.delete(&key);
        let result = (|| -> Result<(), CredentialStoreError> {
            assert!(store.get(&key)?.is_none());
            store.set(&key, &SecretValue::from_utf8("first-smoke-secret".into()))?;
            assert_eq!(
                store
                    .get(&key)?
                    .expect("first stored secret")
                    .expose_utf8()?,
                "first-smoke-secret"
            );
            store.set(
                &key,
                &SecretValue::from_utf8("replacement-smoke-secret".into()),
            )?;
            assert_eq!(
                store
                    .get(&key)?
                    .expect("replacement stored secret")
                    .expose_utf8()?,
                "replacement-smoke-secret"
            );
            assert!(store.delete(&key)?);
            assert!(store.get(&key)?.is_none());
            Ok(())
        })();
        let cleanup = store.delete(&key);

        result.expect("system credential CRUD");
        cleanup.expect("system credential cleanup");
    }
}
