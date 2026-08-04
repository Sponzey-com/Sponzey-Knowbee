use std::fmt;
use std::sync::Arc;

use zeroize::Zeroize;

use crate::settings::{YeonjangSettings, load_settings, save_settings};

const MAX_SECRET_BYTES: usize = 4096;
#[cfg(any(target_os = "macos", test))]
const CREDENTIAL_BUNDLE_VERSION: u8 = 1;
#[cfg(target_os = "macos")]
const SYSTEM_CREDENTIAL_SERVICE: &str = "com.sponzey.knowbee.yeonjang.credentials.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialStoreError {
    NotFound,
    Unavailable,
    InteractionRequired,
    InvalidScope,
    InvalidCredential,
}

pub struct CredentialBundle {
    broker_password: Vec<u8>,
    pairing_secret: Vec<u8>,
}

impl CredentialBundle {
    pub fn new(
        broker_password: Vec<u8>,
        pairing_secret: Vec<u8>,
    ) -> Result<Self, CredentialStoreError> {
        // The credential store preserves the broker's already-validated
        // credential bytes; it must not introduce a second strength policy
        // that can invalidate an otherwise usable existing configuration.
        if broker_password.is_empty()
            || broker_password.len() > MAX_SECRET_BYTES
            || pairing_secret.len() > MAX_SECRET_BYTES
        {
            return Err(CredentialStoreError::InvalidCredential);
        }
        Ok(Self {
            broker_password,
            pairing_secret,
        })
    }

    pub fn broker_password(&self) -> &[u8] {
        &self.broker_password
    }

    pub fn pairing_secret(&self) -> &[u8] {
        &self.pairing_secret
    }
}

impl fmt::Debug for CredentialBundle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CredentialBundle")
            .field("broker_password", &"[REDACTED]")
            .field("pairing_secret", &"[REDACTED]")
            .finish()
    }
}

impl Drop for CredentialBundle {
    fn drop(&mut self) {
        self.broker_password.zeroize();
        self.pairing_secret.zeroize();
    }
}

pub trait CredentialStore: Send + Sync {
    /// Replaces the complete credential bundle or returns without changing the
    /// previously readable bundle.
    fn store_bundle(
        &self,
        scope: &str,
        credentials: &CredentialBundle,
    ) -> Result<(), CredentialStoreError>;

    fn load_bundle(&self, scope: &str) -> Result<CredentialBundle, CredentialStoreError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialMigrationError {
    InvalidScope,
    MissingLegacyCredential,
    CredentialStore(CredentialStoreError),
    SettingsSaveFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupCredentialError {
    SettingsUnavailable,
    Migration(CredentialMigrationError),
    CredentialStore(CredentialStoreError),
    InvalidEncoding,
}

impl fmt::Display for StartupCredentialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let code = match self {
            Self::SettingsUnavailable => "credential_settings_unavailable",
            Self::Migration(_) => "credential_migration_failed",
            Self::CredentialStore(CredentialStoreError::NotFound) => "credential_not_configured",
            Self::CredentialStore(CredentialStoreError::InteractionRequired) => {
                "credential_interaction_required"
            }
            Self::CredentialStore(_) => "credential_store_unavailable",
            Self::InvalidEncoding => "credential_encoding_invalid",
        };
        formatter.write_str(code)
    }
}

pub fn load_system_settings_with_credentials() -> Result<YeonjangSettings, StartupCredentialError> {
    let settings = load_settings().map_err(|_| StartupCredentialError::SettingsUnavailable)?;
    resolve_system_settings_with_credentials(settings)
}

pub fn resolve_system_settings_with_credentials(
    settings: YeonjangSettings,
) -> Result<YeonjangSettings, StartupCredentialError> {
    let store = system_credential_store();
    match resolve_settings_with_credentials(&settings, store.as_ref(), |sanitized| {
        save_settings(sanitized).map(|_| ())
    }) {
        Err(StartupCredentialError::CredentialStore(CredentialStoreError::NotFound))
            if settings.connection.password.is_empty() =>
        {
            Ok(settings)
        }
        result => result,
    }
}

pub fn save_system_settings_with_credentials(
    settings: &YeonjangSettings,
) -> Result<YeonjangSettings, StartupCredentialError> {
    let store = system_credential_store();
    if settings.connection.password.is_empty() {
        save_settings(settings).map_err(|_| StartupCredentialError::SettingsUnavailable)?;
        return Ok(settings.clone());
    }
    resolve_settings_with_credentials(settings, store.as_ref(), |sanitized| {
        save_settings(sanitized).map(|_| ())
    })
}

pub fn migrate_legacy_credentials<F, E>(
    settings: &YeonjangSettings,
    store: &dyn CredentialStore,
    save_sanitized_settings: F,
) -> Result<YeonjangSettings, CredentialMigrationError>
where
    F: FnOnce(&YeonjangSettings) -> Result<(), E>,
{
    let scope = credential_scope(settings)?;
    if settings.connection.password.is_empty() {
        return Err(CredentialMigrationError::MissingLegacyCredential);
    }
    let bundle = CredentialBundle::new(
        settings.connection.password.as_bytes().to_vec(),
        settings.pairing_secret.as_bytes().to_vec(),
    )
    .map_err(CredentialMigrationError::CredentialStore)?;
    store
        .store_bundle(scope, &bundle)
        .map_err(CredentialMigrationError::CredentialStore)?;

    let mut sanitized = settings.clone();
    sanitized.connection.password.zeroize();
    sanitized.pairing_secret.zeroize();
    save_sanitized_settings(&sanitized)
        .map_err(|_| CredentialMigrationError::SettingsSaveFailed)?;
    Ok(sanitized)
}

pub fn load_startup_credentials(
    settings: &YeonjangSettings,
    store: &dyn CredentialStore,
) -> Result<CredentialBundle, CredentialStoreError> {
    let scope = credential_scope(settings).map_err(|_| CredentialStoreError::InvalidScope)?;
    store.load_bundle(scope)
}

pub fn resolve_settings_with_credentials<F, E>(
    settings: &YeonjangSettings,
    store: &dyn CredentialStore,
    save_sanitized_settings: F,
) -> Result<YeonjangSettings, StartupCredentialError>
where
    F: FnOnce(&YeonjangSettings) -> Result<(), E>,
{
    let sanitized = if settings.connection.password.is_empty() {
        settings.clone()
    } else {
        migrate_legacy_credentials(settings, store, save_sanitized_settings)
            .map_err(StartupCredentialError::Migration)?
    };
    let credentials = load_startup_credentials(&sanitized, store)
        .map_err(StartupCredentialError::CredentialStore)?;
    let broker_password = String::from_utf8(credentials.broker_password().to_vec())
        .map_err(|_| StartupCredentialError::InvalidEncoding)?;
    let pairing_secret = String::from_utf8(credentials.pairing_secret().to_vec())
        .map_err(|_| StartupCredentialError::InvalidEncoding)?;
    let mut hydrated = sanitized;
    hydrated.connection.password = broker_password;
    hydrated.pairing_secret = pairing_secret;
    Ok(hydrated)
}

fn credential_scope(settings: &YeonjangSettings) -> Result<&str, CredentialMigrationError> {
    let scope = settings.instance_id.trim();
    if scope.is_empty() || scope.len() > 256 {
        return Err(CredentialMigrationError::InvalidScope);
    }
    Ok(scope)
}

#[cfg(target_os = "macos")]
pub struct MacOsKeychainCredentialStore {
    service: String,
    interaction: KeychainInteraction,
}

#[cfg(target_os = "macos")]
impl MacOsKeychainCredentialStore {
    pub fn new(service: impl Into<String>) -> Result<Self, CredentialStoreError> {
        Self::with_interaction(service, KeychainInteraction::Deny)
    }

    fn interactive(service: impl Into<String>) -> Result<Self, CredentialStoreError> {
        Self::with_interaction(service, KeychainInteraction::Allow)
    }

    fn with_interaction(
        service: impl Into<String>,
        interaction: KeychainInteraction,
    ) -> Result<Self, CredentialStoreError> {
        let service = service.into();
        if service.trim().is_empty() || service.len() > 256 {
            return Err(CredentialStoreError::InvalidScope);
        }
        Ok(Self {
            service,
            interaction,
        })
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KeychainInteraction {
    Deny,
    Allow,
}

#[cfg(target_os = "macos")]
impl CredentialStore for MacOsKeychainCredentialStore {
    fn store_bundle(
        &self,
        scope: &str,
        credentials: &CredentialBundle,
    ) -> Result<(), CredentialStoreError> {
        validate_scope(scope)?;
        let encoded = encode_bundle(credentials)?;
        security_framework::passwords::set_generic_password(&self.service, scope, &encoded)
            .map_err(|_| CredentialStoreError::Unavailable)
    }

    fn load_bundle(&self, scope: &str) -> Result<CredentialBundle, CredentialStoreError> {
        validate_scope(scope)?;
        // Startup and request execution must never wait behind an invisible
        // Keychain dialog. An explicit settings action may repair access, but
        // the immutable runtime snapshot is loaded non-interactively.
        let _interaction_lock = match self.interaction {
            KeychainInteraction::Deny => Some(
                security_framework::os::macos::keychain::SecKeychain::disable_user_interaction()
                    .map_err(|_| CredentialStoreError::Unavailable)?,
            ),
            KeychainInteraction::Allow => None,
        };
        let encoded = security_framework::passwords::get_generic_password(&self.service, scope)
            .map_err(|error| map_macos_keychain_load_error(error.code()))?;
        decode_bundle(&encoded)
    }
}

#[cfg(target_os = "macos")]
fn map_macos_keychain_load_error(status: i32) -> CredentialStoreError {
    const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;
    if status == security_framework_sys::base::errSecItemNotFound {
        CredentialStoreError::NotFound
    } else if status == ERR_SEC_INTERACTION_NOT_ALLOWED {
        CredentialStoreError::InteractionRequired
    } else {
        CredentialStoreError::Unavailable
    }
}

struct UnavailableCredentialStore;

impl CredentialStore for UnavailableCredentialStore {
    fn store_bundle(
        &self,
        _scope: &str,
        _credentials: &CredentialBundle,
    ) -> Result<(), CredentialStoreError> {
        Err(CredentialStoreError::Unavailable)
    }

    fn load_bundle(&self, _scope: &str) -> Result<CredentialBundle, CredentialStoreError> {
        Err(CredentialStoreError::Unavailable)
    }
}

pub fn system_credential_store() -> Arc<dyn CredentialStore> {
    #[cfg(target_os = "macos")]
    {
        match MacOsKeychainCredentialStore::new(SYSTEM_CREDENTIAL_SERVICE) {
            Ok(store) => Arc::new(store),
            Err(_) => Arc::new(UnavailableCredentialStore),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Arc::new(UnavailableCredentialStore)
    }
}

pub fn load_system_settings_with_interactive_credential_repair()
-> Result<YeonjangSettings, StartupCredentialError> {
    let settings = load_settings().map_err(|_| StartupCredentialError::SettingsUnavailable)?;
    #[cfg(target_os = "macos")]
    {
        let store = MacOsKeychainCredentialStore::interactive(SYSTEM_CREDENTIAL_SERVICE)
            .map_err(StartupCredentialError::CredentialStore)?;
        resolve_settings_with_credentials(&settings, &store, |sanitized| {
            save_settings(sanitized).map(|_| ())
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        resolve_system_settings_with_credentials(settings)
    }
}

#[cfg(target_os = "macos")]
fn validate_scope(scope: &str) -> Result<(), CredentialStoreError> {
    if scope.trim().is_empty() || scope.len() > 256 {
        return Err(CredentialStoreError::InvalidScope);
    }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn encode_bundle(credentials: &CredentialBundle) -> Result<Vec<u8>, CredentialStoreError> {
    let broker_len = u32::try_from(credentials.broker_password.len())
        .map_err(|_| CredentialStoreError::InvalidCredential)?;
    let pairing_len = u32::try_from(credentials.pairing_secret.len())
        .map_err(|_| CredentialStoreError::InvalidCredential)?;
    let mut encoded = Vec::with_capacity(
        1 + 4 + credentials.broker_password.len() + 4 + credentials.pairing_secret.len(),
    );
    encoded.push(CREDENTIAL_BUNDLE_VERSION);
    encoded.extend_from_slice(&broker_len.to_be_bytes());
    encoded.extend_from_slice(&credentials.broker_password);
    encoded.extend_from_slice(&pairing_len.to_be_bytes());
    encoded.extend_from_slice(&credentials.pairing_secret);
    Ok(encoded)
}

#[cfg(any(target_os = "macos", test))]
fn decode_bundle(encoded: &[u8]) -> Result<CredentialBundle, CredentialStoreError> {
    if encoded.first().copied() != Some(CREDENTIAL_BUNDLE_VERSION) {
        return Err(CredentialStoreError::InvalidCredential);
    }
    let broker_len = read_length(encoded, 1)?;
    let broker_start = 5usize;
    let broker_end = broker_start
        .checked_add(broker_len)
        .ok_or(CredentialStoreError::InvalidCredential)?;
    let pairing_len = read_length(encoded, broker_end)?;
    let pairing_start = broker_end
        .checked_add(4)
        .ok_or(CredentialStoreError::InvalidCredential)?;
    let pairing_end = pairing_start
        .checked_add(pairing_len)
        .ok_or(CredentialStoreError::InvalidCredential)?;
    if pairing_end != encoded.len() {
        return Err(CredentialStoreError::InvalidCredential);
    }
    CredentialBundle::new(
        encoded
            .get(broker_start..broker_end)
            .ok_or(CredentialStoreError::InvalidCredential)?
            .to_vec(),
        encoded
            .get(pairing_start..pairing_end)
            .ok_or(CredentialStoreError::InvalidCredential)?
            .to_vec(),
    )
}

#[cfg(any(target_os = "macos", test))]
fn read_length(encoded: &[u8], offset: usize) -> Result<usize, CredentialStoreError> {
    let end = offset
        .checked_add(4)
        .ok_or(CredentialStoreError::InvalidCredential)?;
    let bytes: [u8; 4] = encoded
        .get(offset..end)
        .ok_or(CredentialStoreError::InvalidCredential)?
        .try_into()
        .map_err(|_| CredentialStoreError::InvalidCredential)?;
    usize::try_from(u32::from_be_bytes(bytes)).map_err(|_| CredentialStoreError::InvalidCredential)
}

#[cfg(test)]
mod tests {
    use super::{CredentialBundle, decode_bundle, encode_bundle};

    #[test]
    fn credential_bundle_binary_encoding_round_trips_without_debug_exposure() {
        let bundle =
            CredentialBundle::new(b"0123456789abcdef".to_vec(), b"pairing-secret".to_vec())
                .expect("bundle");
        let encoded = encode_bundle(&bundle).expect("encode");
        let decoded = decode_bundle(&encoded).expect("decode");

        assert_eq!(decoded.broker_password(), b"0123456789abcdef");
        assert_eq!(decoded.pairing_secret(), b"pairing-secret");
        assert!(!format!("{decoded:?}").contains("0123456789abcdef"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_keychain_load_distinguishes_missing_item_from_provider_failure() {
        use super::{
            CredentialStoreError, KeychainInteraction, MacOsKeychainCredentialStore,
            map_macos_keychain_load_error,
        };

        assert_eq!(
            map_macos_keychain_load_error(security_framework_sys::base::errSecItemNotFound),
            CredentialStoreError::NotFound
        );
        assert_eq!(
            map_macos_keychain_load_error(security_framework_sys::base::errSecAuthFailed),
            CredentialStoreError::Unavailable
        );
        assert_eq!(
            map_macos_keychain_load_error(-25308),
            CredentialStoreError::InteractionRequired
        );
        assert_eq!(
            MacOsKeychainCredentialStore::new("service")
                .expect("default store")
                .interaction,
            KeychainInteraction::Deny
        );
        assert_eq!(
            MacOsKeychainCredentialStore::interactive("service")
                .expect("explicit repair store")
                .interaction,
            KeychainInteraction::Allow
        );
    }
}
