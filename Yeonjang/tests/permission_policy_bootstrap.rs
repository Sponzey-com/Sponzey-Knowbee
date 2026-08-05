use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint,
};
use knowbee_yeonjang::permission_policy_bootstrap::open_permission_policy_repository;
use knowbee_yeonjang::settings::PermissionSettings;

#[test]
fn reviewed_legacy_capture_policy_migrates_only_when_canonical_store_is_missing() {
    let directory = TestDirectory::new("reviewed-migration");
    let (data_path, lock_path) = directory.policy_paths();
    let legacy = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: false,
        ..PermissionSettings::default()
    };

    let repository = open_permission_policy_repository(
        data_path.clone(),
        lock_path.clone(),
        "instance-a",
        &legacy,
        true,
    )
    .expect("missing canonical store should migrate reviewed legacy policy");
    let migrated = repository.snapshot().expect("migrated snapshot");
    assert_eq!(migrated.revision(), 1);
    assert_eq!(
        migrated.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Allowed
    );
    assert_eq!(
        migrated.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        migrated.entry(PolicyCapability::CameraCapture).resource(),
        &PolicyResourceConstraint::Any
    );

    let changed_legacy = PermissionSettings {
        allow_camera_access: false,
        allow_screen_capture: true,
        ..PermissionSettings::default()
    };
    let restarted = open_permission_policy_repository(
        data_path,
        lock_path,
        "instance-a",
        &changed_legacy,
        true,
    )
    .expect("existing canonical store should restart");
    let canonical = restarted.snapshot().expect("canonical snapshot");
    assert_eq!(canonical, migrated);
}

#[test]
fn unreviewed_legacy_side_effects_remain_fail_closed() {
    let directory = TestDirectory::new("unreviewed");
    let (data_path, lock_path) = directory.policy_paths();
    let legacy = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: true,
        ..PermissionSettings::default()
    };

    let repository = open_permission_policy_repository(
        data_path.clone(),
        lock_path,
        "instance-a",
        &legacy,
        false,
    )
    .expect("unreviewed legacy state should bootstrap fail closed");
    let snapshot = repository.snapshot().expect("default snapshot");
    assert_eq!(snapshot.revision(), 0);
    assert_eq!(
        snapshot.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        snapshot.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
    assert!(
        !data_path.exists(),
        "default deny needs no synthetic persistence write"
    );
}

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "knowbee-policy-bootstrap-{label}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory");
        Self(fs::canonicalize(path).expect("canonical test directory"))
    }

    fn policy_paths(&self) -> (PathBuf, PathBuf) {
        (
            self.0.join("permission-policy.json"),
            self.0.join("permission-policy.lock"),
        )
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        if self.0.starts_with(std::env::temp_dir()) && self.0.is_dir() {
            fs::remove_dir_all(&self.0).expect("remove isolated test directory");
        }
    }
}
