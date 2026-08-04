use knowbee_yeonjang::authorization::RejectAllAuthorizationVerifier;
use knowbee_yeonjang::protocol::Request;
use knowbee_yeonjang::side_effect_admission::{
    AdmissionError, AdmissionOutcome, SideEffectAdmission,
};
use serde_json::json;
use std::sync::Arc;

#[test]
fn common_admission_distinguishes_read_only_unknown_and_invalid_capture_params() {
    let admission = SideEffectAdmission::new(Arc::new(RejectAllAuthorizationVerifier));
    assert_eq!(
        admission.admit(&request("node.ping", json!({}))),
        Ok(AdmissionOutcome::ReadOnly)
    );
    assert_eq!(
        admission.admit(&request("unknown.method", json!({}))),
        Err(AdmissionError::UnknownMethod)
    );
    assert_eq!(
        admission.admit(&request("camera.capture", json!({ "unexpected": true }))),
        Err(AdmissionError::InvalidParams)
    );
}

fn request(method: &str, params: serde_json::Value) -> Request {
    Request {
        id: Some("admission-request".to_string()),
        method: method.to_string(),
        params,
        metadata: Default::default(),
    }
}
