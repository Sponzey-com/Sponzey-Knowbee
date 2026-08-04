#![recursion_limit = "256"]

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::mqtt_v2_response_ack_adapter::{
    MqttV2InboundResponseAck, MqttV2ResponseAckAdapter, MqttV2ResponseAckAdapterResult,
    MqttV2ResponseAckRejection,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_response_ack::{
    V2ResponseAckParseError, V2ResponseAckSignatureVerifier, parse_v2_response_ack,
};
use knowbee_yeonjang::protocol_v2_response_ack_admission::{
    V2ResponseAckAdmission, V2ResponseAckAdmissionOutcome,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use knowbee_yeonjang::v2_delivery_receipt::{
    DurableV2DeliveryRepository, V2DeliveryAckBinding, V2DeliveryAckStoreResult,
    V2DeliveryIdentityResolution, V2DeliveryReceipt, V2DeliveryReceiptState,
    V2DeliveryReceiptStore, V2DeliveryRegisterResult,
};
use knowbee_yeonjang::v2_response_ack_use_case::{
    V2ResponseAckOutcome, V2ResponseAckOwnerScope, V2ResponseAckUseCase,
};
use serde_json::{Value, json};

#[test]
fn signed_ack_binds_exact_receipt_revision_digest_and_owner() {
    let ack = parse(&ack_fixture()).expect("ack");
    assert_eq!(ack.receipt_id(), "receipt-camera");
    assert_eq!(ack.target_request_id(), "request-camera");
    assert_eq!(ack.terminal_revision(), 1);
    assert_eq!(ack.response_digest(), digest('d'));

    let mut wrong = ack_fixture();
    wrong["authorization"]["response_digest"] = json!(digest('e'));
    assert_eq!(
        parse(&wrong),
        Err(V2ResponseAckParseError::AuthorizationMismatch)
    );

    let replay = InMemoryAuthorizationReplayGuard::new(2).expect("replay");
    let admission = V2ResponseAckAdmission::new(&AcceptSignatures, &replay);
    assert!(matches!(
        admission.admit_or_replay(&ack, 1_000),
        Ok(V2ResponseAckAdmissionOutcome::Fresh(_))
    ));
    assert!(matches!(
        admission.admit_or_replay(&ack, 1_001),
        Ok(V2ResponseAckAdmissionOutcome::VerifiedReplay(_))
    ));
}

#[test]
fn durable_ack_persists_before_success_and_duplicate_is_idempotent_after_restart() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        Arc::new(DurableV2DeliveryRepository::bootstrap(8, storage.clone()).expect("repository"));
    let receipt = published_receipt();
    assert!(repository.register(receipt.clone()).is_registered());
    let use_case = V2ResponseAckUseCase::new(
        repository,
        V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );

    let admitted = admitted_ack();
    let first = match admitted {
        V2ResponseAckAdmissionOutcome::Fresh(ack) => use_case.execute(&ack),
        V2ResponseAckAdmissionOutcome::VerifiedReplay(_) => panic!("fresh"),
    };
    assert_eq!(first.outcome(), V2ResponseAckOutcome::Accepted);

    let restarted =
        Arc::new(DurableV2DeliveryRepository::bootstrap(8, storage).expect("restart repository"));
    let restored = restarted
        .load_exact("receipt-camera")
        .expect("restored receipt");
    assert_eq!(
        restored.state(),
        V2DeliveryReceiptState::ConsumerAcknowledged
    );
    assert_eq!(restored.delivery_revision(), 2);
    let replay_use_case = V2ResponseAckUseCase::new(
        restarted,
        V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );
    let duplicate = admitted_ack();
    let duplicate = match duplicate {
        V2ResponseAckAdmissionOutcome::Fresh(ack) => replay_use_case.execute(&ack),
        V2ResponseAckAdmissionOutcome::VerifiedReplay(ack) => replay_use_case.replay(&ack),
    };
    assert_eq!(duplicate.outcome(), V2ResponseAckOutcome::Duplicate);
}

#[test]
fn restart_registration_reuses_immutable_binding_without_reverting_published_state() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        DurableV2DeliveryRepository::bootstrap(8, storage.clone()).expect("repository");
    assert_eq!(
        repository.register(queued_receipt()),
        V2DeliveryRegisterResult::Registered
    );
    assert!(matches!(
        repository.mark_published("receipt-camera"),
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult::Published {
            delivery_revision: 2
        }
    ));
    drop(repository);

    let restarted = DurableV2DeliveryRepository::bootstrap(8, storage).expect("restart repository");
    assert_eq!(
        restarted.register(queued_receipt()),
        V2DeliveryRegisterResult::Duplicate
    );
    let persisted = restarted
        .load_exact("receipt-camera")
        .expect("persisted receipt");
    assert_eq!(persisted.state(), V2DeliveryReceiptState::Published);
    assert_eq!(persisted.delivery_revision(), 2);
}

#[test]
fn legacy_receipt_identity_is_reused_for_the_same_immutable_delivery_binding() {
    let storage = Arc::new(MemoryStorage::default());
    let repository = DurableV2DeliveryRepository::bootstrap(8, storage).expect("legacy repository");
    assert!(repository.register(published_receipt()).is_registered());
    let candidate = V2DeliveryReceipt::queued(
        "receipt-deterministic-candidate",
        "brad",
        "request-camera",
        "command-camera",
        "operation-camera",
        "idem-camera",
        "yeonjang-main",
        "session-main",
        &digest('a'),
        1,
        &digest('d'),
    )
    .expect("deterministic candidate");

    assert_eq!(
        repository.resolve_receipt_id(&candidate),
        V2DeliveryIdentityResolution::Existing("receipt-camera".to_string())
    );
}

#[test]
fn multiple_legacy_identities_for_one_terminal_fail_resolution_closed() {
    let repository = DurableV2DeliveryRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
        .expect("repository");
    assert!(repository.register(published_receipt()).is_registered());
    let second = delivery_receipt("receipt-camera-second");
    assert!(repository.register(second).is_registered());
    let candidate = delivery_receipt("receipt-deterministic-candidate");

    assert_eq!(
        repository.resolve_receipt_id(&candidate),
        V2DeliveryIdentityResolution::Conflict
    );
}

#[test]
fn stale_digest_revision_owner_and_unpublished_ack_do_not_transition() {
    for (fixture, expected) in [
        (
            mutate_ack("response_digest", json!(digest('e'))),
            V2ResponseAckOutcome::BindingMismatch,
        ),
        (
            mutate_ack("terminal_revision", json!(2)),
            V2ResponseAckOutcome::RevisionMismatch,
        ),
        (
            mutate_owner_fingerprint(digest('f')),
            V2ResponseAckOutcome::BindingMismatch,
        ),
    ] {
        let repository = Arc::new(
            DurableV2DeliveryRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
                .expect("repository"),
        );
        repository.register(published_receipt());
        let use_case = V2ResponseAckUseCase::new(
            repository,
            V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a'))
                .expect("owner"),
        );
        let ack = admitted_ack_from(fixture);
        let result = match ack {
            V2ResponseAckAdmissionOutcome::Fresh(ack) => use_case.execute(&ack),
            V2ResponseAckAdmissionOutcome::VerifiedReplay(ack) => use_case.replay(&ack),
        };
        assert_eq!(result.outcome(), expected);
    }

    let repository = Arc::new(
        DurableV2DeliveryRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(queued_receipt());
    let use_case = V2ResponseAckUseCase::new(
        repository,
        V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );
    let ack = admitted_ack();
    let result = match ack {
        V2ResponseAckAdmissionOutcome::Fresh(ack) => use_case.execute(&ack),
        V2ResponseAckAdmissionOutcome::VerifiedReplay(ack) => use_case.replay(&ack),
    };
    assert_eq!(result.outcome(), V2ResponseAckOutcome::NotReady);
}

#[test]
fn failed_durable_commit_never_reports_consumer_acknowledged() {
    let storage = Arc::new(ToggleStorage::default());
    let repository =
        Arc::new(DurableV2DeliveryRepository::bootstrap(8, storage.clone()).expect("repository"));
    assert!(repository.register(published_receipt()).is_registered());
    storage.fail_writes.store(true, Ordering::SeqCst);
    let use_case = V2ResponseAckUseCase::new(
        repository.clone(),
        V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );
    let result = match admitted_ack() {
        V2ResponseAckAdmissionOutcome::Fresh(ack) => use_case.execute(&ack),
        V2ResponseAckAdmissionOutcome::VerifiedReplay(ack) => use_case.replay(&ack),
    };
    assert_eq!(result.outcome(), V2ResponseAckOutcome::StateUnavailable);
    assert_eq!(
        repository
            .load_exact("receipt-camera")
            .expect("receipt")
            .state(),
        V2DeliveryReceiptState::Published
    );
}

#[test]
fn retained_and_invalid_signature_are_rejected_before_delivery_writer() {
    let calls = Arc::new(AtomicUsize::new(0));
    let retained = ack_adapter(
        Arc::new(AcceptSignatures),
        Arc::new(RecordingAckStore(Arc::clone(&calls))),
    );
    assert_eq!(
        retained.process(
            inbound_ack(true),
            1_000,
            ack_signing_context("retained-result"),
        ),
        MqttV2ResponseAckAdapterResult::Rejected(MqttV2ResponseAckRejection::RetainedMessage)
    );

    let rejected = ack_adapter(
        Arc::new(RejectSignatures),
        Arc::new(RecordingAckStore(Arc::clone(&calls))),
    );
    assert!(matches!(
        rejected.process(
            inbound_ack(false),
            1_000,
            ack_signing_context("rejected-result"),
        ),
        MqttV2ResponseAckAdapterResult::Rejected(MqttV2ResponseAckRejection::Admission(_))
    ));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

fn mutate_ack(field: &str, value: Value) -> Value {
    let mut fixture = ack_fixture();
    fixture["payload"]["params"][field] = value.clone();
    fixture["authorization"][field] = value;
    fixture
}

fn mutate_owner_fingerprint(value: String) -> Value {
    let mut fixture = ack_fixture();
    fixture["target_fingerprint"] = json!(value.clone());
    fixture["authorization"]["target_fingerprint"] = json!(value);
    fixture
}

fn admitted_ack() -> V2ResponseAckAdmissionOutcome<'static> {
    admitted_ack_from(ack_fixture())
}

fn admitted_ack_from(fixture: Value) -> V2ResponseAckAdmissionOutcome<'static> {
    let ack = Box::leak(Box::new(parse(&fixture).expect("ack")));
    let replay = Box::leak(Box::new(
        InMemoryAuthorizationReplayGuard::new(2).expect("replay"),
    ));
    V2ResponseAckAdmission::new(&AcceptSignatures, replay)
        .admit_or_replay(ack, 1_000)
        .expect("admitted")
}

fn parse(
    value: &Value,
) -> Result<
    knowbee_yeonjang::protocol_v2_response_ack::V2ResponseAckEnvelope,
    V2ResponseAckParseError,
> {
    parse_v2_response_ack(
        topics().control(),
        &serde_json::to_vec(value).expect("JSON"),
        1_000,
        &topics(),
    )
}

fn published_receipt() -> V2DeliveryReceipt {
    delivery_receipt("receipt-camera")
}

fn delivery_receipt(receipt_id: &str) -> V2DeliveryReceipt {
    V2DeliveryReceipt::published(
        receipt_id,
        "brad",
        "request-camera",
        "command-camera",
        "operation-camera",
        "idem-camera",
        "yeonjang-main",
        "session-main",
        &digest('a'),
        1,
        &digest('d'),
    )
    .expect("receipt")
}

fn queued_receipt() -> V2DeliveryReceipt {
    V2DeliveryReceipt::queued(
        "receipt-camera",
        "brad",
        "request-camera",
        "command-camera",
        "operation-camera",
        "idem-camera",
        "yeonjang-main",
        "session-main",
        &digest('a'),
        1,
        &digest('d'),
    )
    .expect("receipt")
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
    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.0.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

#[derive(Default)]
struct ToggleStorage {
    state: Mutex<(u64, Vec<Vec<u8>>)>,
    fail_writes: AtomicBool,
}

impl DurableRecordStorage for ToggleStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.state.lock().expect("storage");
        RawStoreRead::Records {
            revision: state.0,
            records: state.1.clone(),
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        if self.fail_writes.load(Ordering::SeqCst) {
            return RawStoreWrite::Unavailable;
        }
        let mut state = self.state.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

struct AcceptSignatures;
impl V2ResponseAckSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct RejectSignatures;
impl V2ResponseAckSignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}

struct FixedSigner;
impl V2ResponseSigner for FixedSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

struct RecordingAckStore(Arc<AtomicUsize>);
impl V2DeliveryReceiptStore for RecordingAckStore {
    fn register(
        &self,
        _: V2DeliveryReceipt,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult::Unavailable
    }

    fn mark_published(
        &self,
        _: &str,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult::Unavailable
    }

    fn acknowledge(&self, _: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
        self.0.fetch_add(1, Ordering::SeqCst);
        V2DeliveryAckStoreResult::NotFound
    }
}

fn ack_adapter(
    verifier: Arc<dyn V2ResponseAckSignatureVerifier>,
    store: Arc<dyn V2DeliveryReceiptStore>,
) -> MqttV2ResponseAckAdapter {
    MqttV2ResponseAckAdapter::new(
        topics(),
        verifier,
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("replay")),
        V2ResponseAckUseCase::new(
            store,
            V2ResponseAckOwnerScope::new("yeonjang-main", "session-main", digest('a'))
                .expect("owner"),
        ),
        Arc::new(FixedSigner),
    )
}

fn inbound_ack(retained: bool) -> MqttV2InboundResponseAck {
    MqttV2InboundResponseAck {
        topic: topics().control(),
        payload: serde_json::to_vec(&ack_fixture()).expect("JSON"),
        retained,
    }
}

fn ack_signing_context(message_id: &str) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: message_id.to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: "brad".to_string(),
        nonce: format!("{message_id}-nonce"),
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn digest(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

fn ack_fixture() -> Value {
    json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "message-ack",
        "request_id": "request-ack", "command_id": "command-ack",
        "operation_id": "operation-ack", "correlation_id": "correlation-ack",
        "causation_id": "response-camera", "requester_id": "brad",
        "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
        "target_fingerprint": digest('a'), "idempotency_key": "idem-ack",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "response.ack", "params": {
            "receipt_id": "receipt-camera",
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera",
            "target_idempotency_key": "idem-camera", "terminal_revision": 1,
            "response_digest": digest('d')
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "auth-ack",
            "issuer": "gateway-main", "key_id": "key-main", "audience": "yeonjang-main",
            "scope": "response.ack", "requester_id": "brad",
            "command_id": "command-ack", "operation_id": "operation-ack",
            "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
            "target_fingerprint": digest('a'), "idempotency_key": "idem-ack",
            "receipt_id": "receipt-camera",
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera",
            "target_idempotency_key": "idem-camera", "terminal_revision": 1,
            "response_digest": digest('d'), "expires_at": 2_000,
            "nonce": "nonce-ack", "signature": "bb".repeat(32)
        }
    })
}
