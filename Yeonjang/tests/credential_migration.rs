use std::fs;
use std::process;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::credential_store::{
    CredentialBundle, CredentialMigrationError, CredentialStore, CredentialStoreError,
    load_startup_credentials, migrate_legacy_credentials, resolve_settings_with_credentials,
};
use knowbee_yeonjang::settings::{YeonjangSettings, save_settings_to_path};

type StoredCredentialBundle = (String, Vec<u8>, Vec<u8>);

#[derive(Default)]
struct FakeCredentialStore {
    stored: Mutex<Option<StoredCredentialBundle>>,
    fail_store: bool,
}

impl CredentialStore for FakeCredentialStore {
    fn store_bundle(
        &self,
        scope: &str,
        credentials: &CredentialBundle,
    ) -> Result<(), CredentialStoreError> {
        if self.fail_store {
            return Err(CredentialStoreError::Unavailable);
        }
        *self.stored.lock().expect("fake store") = Some((
            scope.to_string(),
            credentials.broker_password().to_vec(),
            credentials.pairing_secret().to_vec(),
        ));
        Ok(())
    }

    fn load_bundle(&self, scope: &str) -> Result<CredentialBundle, CredentialStoreError> {
        let stored = self.stored.lock().expect("fake store");
        let (stored_scope, broker, pairing) =
            stored.as_ref().ok_or(CredentialStoreError::NotFound)?;
        if stored_scope != scope {
            return Err(CredentialStoreError::NotFound);
        }
        CredentialBundle::new(broker.clone(), pairing.clone())
    }
}

fn legacy_settings() -> YeonjangSettings {
    let mut settings = YeonjangSettings {
        instance_id: "instance-1".to_string(),
        pairing_secret: "legacy-pairing-secret".to_string(),
        ..YeonjangSettings::default()
    };
    settings.connection.password = "legacy-broker-password".to_string();
    settings
}

#[test]
fn migration_persists_the_secure_bundle_before_saving_sanitized_settings() {
    let settings = legacy_settings();
    let store = FakeCredentialStore::default();
    let saved = Mutex::new(None);

    let migrated = migrate_legacy_credentials(&settings, &store, |sanitized| {
        *saved.lock().expect("saved settings") = Some(sanitized.clone());
        Ok::<(), ()>(())
    })
    .expect("credential migration");

    assert!(migrated.connection.password.is_empty());
    assert!(migrated.pairing_secret.is_empty());
    assert_eq!(settings.connection.password, "legacy-broker-password");
    assert_eq!(settings.pairing_secret, "legacy-pairing-secret");
    let persisted = saved.lock().expect("saved settings");
    let persisted = persisted.as_ref().expect("sanitized settings saved");
    assert!(persisted.connection.password.is_empty());
    assert!(persisted.pairing_secret.is_empty());

    let lease = load_startup_credentials(&migrated, &store).expect("startup credential lease");
    assert_eq!(lease.broker_password(), b"legacy-broker-password");
    assert_eq!(lease.pairing_secret(), b"legacy-pairing-secret");
    let debug = format!("{lease:?}");
    assert!(!debug.contains("legacy-broker-password"));
    assert!(!debug.contains("legacy-pairing-secret"));

    let restarted = resolve_settings_with_credentials(persisted, &store, |_| Ok::<(), ()>(()))
        .expect("restart credential resolution");
    assert_eq!(restarted.connection.password, "legacy-broker-password");
    assert_eq!(restarted.pairing_secret, "legacy-pairing-secret");
}

#[test]
fn migration_preserves_an_existing_non_empty_broker_credential_without_strength_drift() {
    let mut settings = legacy_settings();
    settings.connection.password = "samjoko1".to_string();
    let store = FakeCredentialStore::default();

    let migrated = migrate_legacy_credentials(&settings, &store, |_| Ok::<(), ()>(()))
        .expect("existing broker credential remains valid during storage migration");
    let lease = load_startup_credentials(&migrated, &store).expect("migrated broker credential");

    assert_eq!(lease.broker_password(), b"samjoko1");
}

#[test]
fn provider_failure_does_not_call_the_settings_writer_or_mutate_the_input() {
    let settings = legacy_settings();
    let store = FakeCredentialStore {
        fail_store: true,
        ..Default::default()
    };
    let writer_calls = Mutex::new(0_u32);

    assert_eq!(
        migrate_legacy_credentials(&settings, &store, |_| {
            *writer_calls.lock().expect("writer calls") += 1;
            Ok::<(), ()>(())
        })
        .expect_err("provider failure"),
        CredentialMigrationError::CredentialStore(CredentialStoreError::Unavailable)
    );
    assert_eq!(*writer_calls.lock().expect("writer calls"), 0);
    assert_eq!(settings.connection.password, "legacy-broker-password");
    assert_eq!(settings.pairing_secret, "legacy-pairing-secret");
}

#[test]
fn settings_save_failure_is_typed_and_never_reports_migration_success() {
    let settings = legacy_settings();
    let store = FakeCredentialStore::default();

    assert_eq!(
        migrate_legacy_credentials(&settings, &store, |_| Err(()))
            .expect_err("settings save failure"),
        CredentialMigrationError::SettingsSaveFailed
    );
    assert_eq!(settings.connection.password, "legacy-broker-password");
    assert_eq!(settings.pairing_secret, "legacy-pairing-secret");
}

#[test]
fn explicit_file_migration_atomically_replaces_legacy_secret_fields() {
    let settings = legacy_settings();
    let store = FakeCredentialStore::default();
    let path = std::env::temp_dir().join(format!(
        "knowbee-credential-migration-{}-{}.json",
        process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    fs::write(
        &path,
        serde_json::json!({
            "instance_id": "instance-1",
            "pairing_secret": "legacy-pairing-secret",
            "connection": { "password": "legacy-broker-password" }
        })
        .to_string(),
    )
    .expect("legacy file");

    migrate_legacy_credentials(&settings, &store, |sanitized| {
        save_settings_to_path(sanitized, &path).map_err(|_| ())
    })
    .expect("file migration");
    let persisted = fs::read_to_string(&path).expect("migrated file");
    assert!(!persisted.contains("legacy-broker-password"));
    assert!(!persisted.contains("legacy-pairing-secret"));
    assert!(!persisted.contains("\"password\""));
    assert!(!persisted.contains("\"pairing_secret\""));
    let temporary_prefix = format!(
        ".{}.",
        path.file_name()
            .and_then(|name| name.to_str())
            .expect("fixture file name")
    );
    assert!(
        fs::read_dir(path.parent().expect("temporary parent"))
            .expect("temporary directory")
            .filter_map(Result::ok)
            .all(|entry| !entry
                .file_name()
                .to_string_lossy()
                .starts_with(&temporary_prefix))
    );
    fs::remove_file(path).expect("remove migrated fixture");
}
