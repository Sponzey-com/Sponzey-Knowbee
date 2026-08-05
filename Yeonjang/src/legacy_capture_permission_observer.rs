//! Platform adapter for non-prompting capture permission reads.
//!
//! Backend availability is snapshotted at composition. Each read invokes only
//! the existing camera status and screen preflight APIs; individual native
//! observation failures become `NotObserved` rather than fabricated grants.

use std::sync::Arc;

use crate::automation::{AutomationBackend, CameraPermissionState};
use crate::capability_permission::{CaptureCapabilityAvailability, CapturePermissionObservations};
use crate::capture_permission_read::{
    CapturePermissionObservationPort, CapturePermissionObservationRead,
};
use crate::legacy_capture_platform::LegacyScreenPermissionProbe;
use crate::platform_operation::PreflightPermissionState;

pub struct LegacyCapturePermissionObserver {
    backend: Arc<dyn AutomationBackend>,
    screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
    availability: CaptureCapabilityAvailability,
}

impl LegacyCapturePermissionObserver {
    pub fn new(
        backend: Arc<dyn AutomationBackend>,
        screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
    ) -> Self {
        let capabilities = backend.capabilities();
        Self {
            backend,
            screen_permission,
            availability: CaptureCapabilityAvailability {
                camera: capabilities.camera_management,
                screen: capabilities.screen_capture,
            },
        }
    }
}

impl CapturePermissionObservationPort for LegacyCapturePermissionObserver {
    fn observe(&self) -> CapturePermissionObservationRead {
        CapturePermissionObservationRead::Snapshot {
            availability: self.availability,
            observations: CapturePermissionObservations {
                camera: self
                    .backend
                    .camera_permission_status()
                    .ok()
                    .and_then(|status| camera_permission(status.status)),
                screen: self.screen_permission.permission().ok(),
            },
        }
    }
}

fn camera_permission(state: CameraPermissionState) -> Option<PreflightPermissionState> {
    match state {
        CameraPermissionState::Authorized => Some(PreflightPermissionState::Granted),
        CameraPermissionState::NotDetermined => Some(PreflightPermissionState::NotDetermined),
        CameraPermissionState::Denied => Some(PreflightPermissionState::Denied),
        CameraPermissionState::Restricted => Some(PreflightPermissionState::Restricted),
        CameraPermissionState::Unavailable => None,
    }
}

#[cfg(test)]
mod tests {
    use super::camera_permission;
    use crate::automation::CameraPermissionState;
    use crate::platform_operation::PreflightPermissionState;

    #[test]
    fn camera_native_states_map_without_inventing_unavailable_permission() {
        for (native, expected) in [
            (
                CameraPermissionState::Authorized,
                Some(PreflightPermissionState::Granted),
            ),
            (
                CameraPermissionState::NotDetermined,
                Some(PreflightPermissionState::NotDetermined),
            ),
            (
                CameraPermissionState::Denied,
                Some(PreflightPermissionState::Denied),
            ),
            (
                CameraPermissionState::Restricted,
                Some(PreflightPermissionState::Restricted),
            ),
            (CameraPermissionState::Unavailable, None),
        ] {
            assert_eq!(camera_permission(native), expected);
        }
    }
}
