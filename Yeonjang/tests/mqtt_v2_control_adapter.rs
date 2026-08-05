use std::sync::{Arc, Mutex};

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding,
};
use knowbee_yeonjang::durable_cancellation::DurableCancellationReceiptRepository;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::mqtt_v2_control_adapter::{
    MqttV2ControlAdapter, MqttV2ControlAdapterResult, MqttV2ControlRejection, MqttV2InboundControl,
};
use knowbee_yeonjang::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use knowbee_yeonjang::protocol_v2_control::V2ControlSignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use knowbee_yeonjang::v2_cancel_use_case::{V2CancelClock, V2CancelOwnerScope, V2CancelUseCase};
use serde_json::{Value, json};

#[test]
fn fresh_and_qos_redelivery_publish_the_same_durable_cancel_outcome() {
    let (adapter, registry) = adapter(Arc::new(AcceptSignatures));
    let first = adapter.process(
        inbound(false),
        1_000,
        signing_context("response-first", "nonce-first"),
    );
    let MqttV2ControlAdapterResult::Publish(first) = first else {
        panic!("fresh publish");
    };
    assert_eq!(first.topic, topics().response());
    assert_eq!(first.qos, MqttQos::AtLeastOnce);
    assert!(!first.retained);
    let first_value: Value = serde_json::from_slice(&first.payload).expect("first response");
    assert_eq!(first_value["payload"]["outcome"], "accepted");
    assert_eq!(first_value["payload"]["target_terminal"], false);
    assert!(registry.is_cancelled_id("cancel-camera"));

    let replay = adapter.process(
        inbound(false),
        1_001,
        signing_context("response-replay", "nonce-replay"),
    );
    let MqttV2ControlAdapterResult::Publish(replay) = replay else {
        panic!("replay publish");
    };
    let replay_value: Value = serde_json::from_slice(&replay.payload).expect("replay response");
    assert_eq!(replay_value["payload"], first_value["payload"]);
}

#[test]
fn retained_and_invalid_signature_are_rejected_before_cancellation() {
    let (retained_adapter, retained_registry) = adapter(Arc::new(AcceptSignatures));
    assert_eq!(
        retained_adapter.process(
            inbound(true),
            1_000,
            signing_context("response-retained", "nonce-retained"),
        ),
        MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::RetainedMessage)
    );
    assert!(!retained_registry.is_cancelled_id("cancel-camera"));

    let (rejected_adapter, rejected_registry) = adapter(Arc::new(RejectSignatures));
    assert!(matches!(
        rejected_adapter.process(
            inbound(false),
            1_000,
            signing_context("response-rejected", "nonce-rejected"),
        ),
        MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::Admission(_))
    ));
    assert!(!rejected_registry.is_cancelled_id("cancel-camera"));

    let (wrong_topic_adapter, wrong_topic_registry) = adapter(Arc::new(AcceptSignatures));
    let mut wrong_topic = inbound(false);
    wrong_topic.topic = topics().command();
    assert!(matches!(
        wrong_topic_adapter.process(
            wrong_topic,
            1_000,
            signing_context("response-wrong-topic", "nonce-wrong-topic"),
        ),
        MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::Parse(_))
    ));
    assert!(!wrong_topic_registry.is_cancelled_id("cancel-camera"));

    let (malformed_adapter, malformed_registry) = adapter(Arc::new(AcceptSignatures));
    assert!(matches!(
        malformed_adapter.process(
            MqttV2InboundControl {
                topic: topics().control(),
                payload: b"{not-json".to_vec(),
                retained: false,
            },
            1_000,
            signing_context("response-malformed", "nonce-malformed"),
        ),
        MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::Parse(_))
    ));
    assert!(!malformed_registry.is_cancelled_id("cancel-camera"));
}

fn adapter(
    verifier: Arc<dyn V2ControlSignatureVerifier>,
) -> (MqttV2ControlAdapter, Arc<ActiveCommandRegistry>) {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let target = CommandTargetBinding::new(
        "request-camera",
        "command-camera",
        "operation-camera",
        "session-main",
        &fingerprint('a'),
        "idem-camera",
    )
    .expect("target");
    assert!(matches!(
        registry.register_bound_with_cancellation_id(target, "cancel-camera", "token-camera"),
        ActiveCommandRegistration::Registered(_)
    ));
    let storage = Arc::new(MemoryStorage::default());
    let receipts =
        Arc::new(DurableCancellationReceiptRepository::bootstrap(8, storage).expect("receipts"));
    let use_case = V2CancelUseCase::new_durable(
        Arc::clone(&registry),
        V2CancelOwnerScope::new("yeonjang-main", "session-main", fingerprint('a')).expect("owner"),
        receipts,
        Arc::new(FixedClock),
    );
    (
        MqttV2ControlAdapter::new(
            topics(),
            verifier,
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("replay")),
            use_case,
            Arc::new(FixedSigner),
        ),
        registry,
    )
}

fn inbound(retained: bool) -> MqttV2InboundControl {
    MqttV2InboundControl {
        topic: topics().control(),
        payload: serde_json::to_vec(&control_fixture()).expect("control JSON"),
        retained,
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn signing_context(message_id: &str, nonce: &str) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: message_id.to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: "brad".to_string(),
        nonce: nonce.to_string(),
    }
}

#[derive(Default)]
struct MemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

impl DurableRecordStorage for MemoryStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.0.lock().expect("storage");
        RawStoreRead::Records {
            revision: state.0,
            records: state.1.clone(),
        }
    }
    fn compare_and_swap(&self, expected: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.0.lock().expect("storage");
        if state.0 != expected {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

struct FixedClock;
impl V2CancelClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_100
    }
}

struct FixedSigner;
impl V2ResponseSigner for FixedSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

struct AcceptSignatures;
impl V2ControlSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignatures;
impl V2ControlSignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}

fn fingerprint(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

fn control_fixture() -> Value {
    json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "message-cancel",
        "request_id": "request-cancel", "command_id": "command-cancel",
        "operation_id": "operation-cancel", "correlation_id": "correlation-cancel",
        "causation_id": "message-camera", "requester_id": "brad",
        "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
        "target_fingerprint": fingerprint('a'), "idempotency_key": "idem-cancel",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "command.cancel", "params": {
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera", "target_idempotency_key": "idem-camera",
            "cancellation_id": "cancel-camera", "cancel_token": "token-camera",
            "reason": "user_requested"
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "auth-cancel",
            "issuer": "gateway-main", "key_id": "key-main", "audience": "yeonjang-main",
            "scope": "effect.cancel", "requester_id": "brad",
            "command_id": "command-cancel", "operation_id": "operation-cancel",
            "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
            "target_fingerprint": fingerprint('a'), "idempotency_key": "idem-cancel",
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera", "target_idempotency_key": "idem-camera",
            "cancellation_id": "cancel-camera", "cancel_token": "token-camera",
            "expires_at": 2_000, "nonce": "nonce-cancel", "signature": "bb".repeat(32)
        }
    })
}
