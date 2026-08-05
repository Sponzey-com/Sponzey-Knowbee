use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use knowbee_yeonjang::capability_permission::{
    CaptureCapabilityAvailability, CapturePermissionObservations, LocalPolicyState,
    OsPermissionState,
};
use knowbee_yeonjang::capture_permission_read::{
    CapturePermissionObservationPort, CapturePermissionObservationRead, CapturePermissionReadOwner,
    CapturePermissionReadRequest, CapturePermissionReadResult, CapturePermissionReadUseCase,
};
use knowbee_yeonjang::permission_policy::PermissionPolicySnapshot;
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};

#[test]
fn exact_read_keeps_availability_policy_and_os_observation_separate() {
    let observations = Arc::new(ObservationFixture::available());
    let use_case = CapturePermissionReadUseCase::new(
        owner(),
        Arc::new(PolicyFixture::snapshot()),
        observations.clone(),
    );
    let CapturePermissionReadResult::Available { rows } = use_case.execute(&request("instance-a"))
    else {
        panic!("available projection")
    };
    assert_eq!(observations.calls.load(Ordering::SeqCst), 1);
    assert_eq!(rows[0].method, "camera.capture");
    assert!(rows[0].capability_available);
    assert_eq!(rows[0].local_policy, LocalPolicyState::Denied);
    assert_eq!(rows[0].os_permission, OsPermissionState::Granted);
    assert_eq!(rows[1].method, "screen.capture");
    assert!(!rows[1].capability_available);
    assert_eq!(rows[1].os_permission, OsPermissionState::Denied);
}

#[test]
fn wrong_target_and_unavailable_policy_never_observe_the_platform() {
    let observations = Arc::new(ObservationFixture::available());
    let use_case = CapturePermissionReadUseCase::new(
        owner(),
        Arc::new(PolicyFixture::snapshot()),
        observations.clone(),
    );
    assert_eq!(
        use_case.execute(&request("instance-b")),
        CapturePermissionReadResult::BindingMismatch
    );
    assert_eq!(observations.calls.load(Ordering::SeqCst), 0);

    let unavailable = CapturePermissionReadUseCase::new(
        owner(),
        Arc::new(PolicyFixture::Unavailable),
        observations.clone(),
    );
    assert_eq!(
        unavailable.execute(&request("instance-a")),
        CapturePermissionReadResult::PolicyUnavailable
    );
    assert_eq!(observations.calls.load(Ordering::SeqCst), 0);
}

#[test]
fn observation_unavailable_is_typed_and_cannot_look_like_success() {
    let observations = Arc::new(ObservationFixture {
        calls: AtomicUsize::new(0),
        result: CapturePermissionObservationRead::Unavailable,
    });
    let use_case = CapturePermissionReadUseCase::new(
        owner(),
        Arc::new(PolicyFixture::snapshot()),
        observations.clone(),
    );
    assert_eq!(
        use_case.execute(&request("instance-a")),
        CapturePermissionReadResult::ObservationUnavailable
    );
    assert_eq!(observations.calls.load(Ordering::SeqCst), 1);
}

fn owner() -> CapturePermissionReadOwner {
    CapturePermissionReadOwner::new(
        "instance-a",
        "session-a",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .expect("owner")
}

fn request(instance_id: &str) -> CapturePermissionReadRequest {
    CapturePermissionReadRequest::new(
        instance_id,
        "session-a",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    .expect("request")
}

enum PolicyFixture {
    Snapshot(PermissionPolicySnapshot),
    Unavailable,
}

impl PolicyFixture {
    fn snapshot() -> Self {
        Self::Snapshot(PermissionPolicySnapshot::new("instance-a").expect("policy"))
    }
}

impl PermissionPolicyReader for PolicyFixture {
    fn snapshot(&self) -> PolicySnapshotRead {
        match self {
            Self::Snapshot(snapshot) => PolicySnapshotRead::Snapshot(snapshot.clone()),
            Self::Unavailable => PolicySnapshotRead::Unavailable,
        }
    }
}

struct ObservationFixture {
    calls: AtomicUsize,
    result: CapturePermissionObservationRead,
}

impl ObservationFixture {
    fn available() -> Self {
        Self {
            calls: AtomicUsize::new(0),
            result: CapturePermissionObservationRead::Snapshot {
                availability: CaptureCapabilityAvailability {
                    camera: true,
                    screen: false,
                },
                observations: CapturePermissionObservations {
                    camera: Some(PreflightPermissionState::Granted),
                    screen: Some(PreflightPermissionState::Denied),
                },
            },
        }
    }
}

impl CapturePermissionObservationPort for ObservationFixture {
    fn observe(&self) -> CapturePermissionObservationRead {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.result.clone()
    }
}
