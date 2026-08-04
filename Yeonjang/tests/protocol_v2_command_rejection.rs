use std::sync::Mutex;

use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use knowbee_yeonjang::protocol_v2_command_rejection::{
    V2CommandRejectionBuildError, V2CommandRejectionEnvelope,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};

#[test]
fn rejection_signing_binds_exact_topic_and_failure_without_untrusted_operation_ids() {
    let signer = RecordingSigner::default();
    let envelope = V2CommandRejectionEnvelope::sign(
        failure(ExecutionFailureReason::ProtocolUpgradeRequired, 'a'),
        &topics(),
        context(),
        &signer,
    )
    .expect("signed rejection");
    assert_eq!(
        signer.bytes.lock().expect("recording signer").as_slice(),
        envelope.authorization_signing_bytes()
    );
    let value = serde_json::to_value(envelope).expect("rejection JSON");
    assert_eq!(value["target_instance_id"], "instance-a");
    assert_eq!(value["target_session_id"], "session-a");
    assert_eq!(value["requester_id"], "requester-a");
    let serialized = value.to_string();
    for forbidden in [
        "request_id",
        "command_id",
        "operation_id",
        "idempotency_key",
    ] {
        assert!(!serialized.contains(forbidden), "{forbidden} leaked");
    }
}

#[test]
fn rejection_signing_fails_closed_on_wrong_topic_identity() {
    let signer = RecordingSigner::default();
    let mut wrong = context();
    wrong.audience = "requester-b".to_string();
    assert!(matches!(
        V2CommandRejectionEnvelope::sign(
            failure(ExecutionFailureReason::RequestExpired, 'b'),
            &topics(),
            wrong,
            &signer,
        ),
        Err(V2CommandRejectionBuildError::IdentityOrTiming)
    ));
    assert!(signer.bytes.lock().expect("recording signer").is_empty());
}

#[derive(Default)]
struct RecordingSigner {
    bytes: Mutex<Vec<u8>>,
}

impl V2ResponseSigner for RecordingSigner {
    fn sign(&self, _: &str, _: &str, bytes: &[u8]) -> Result<String, V2ResponseSignerError> {
        *self.bytes.lock().expect("recording signer") = bytes.to_vec();
        Ok("aa".repeat(32))
    }
}

fn failure(reason: ExecutionFailureReason, digest: char) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::IngressValidation,
        reason,
        EffectState::NotStarted,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::CorrectRequest,
        None,
        format!("sha256:{}", digest.to_string().repeat(64)),
    )
    .expect("failure")
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "rejection-message".to_string(),
        issued_at: 1_000,
        expires_at: 2_000,
        issuer: "instance-a".to_string(),
        key_id: "response-key".to_string(),
        audience: "requester-a".to_string(),
        nonce: "rejection-nonce".to_string(),
    }
}
