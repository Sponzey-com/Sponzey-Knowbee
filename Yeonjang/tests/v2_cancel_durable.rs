use std::sync::{Arc, Mutex};
use std::time::Duration;

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding,
};
use knowbee_yeonjang::durable_cancellation::{
    CancellationBeginResult, CancellationFinalizeResult, CancellationLoadResult,
    CancellationStoreTerminalResult, DurableCancellationReceipt, DurableCancellationReceiptStore,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_control::{V2ControlSignatureVerifier, parse_v2_control};
use knowbee_yeonjang::protocol_v2_control_admission::{
    V2ControlAdmission, V2ControlAdmissionOutcome,
};
use knowbee_yeonjang::v2_cancel_use_case::{
    V2CancelClock, V2CancelOutcome, V2CancelOwnerScope, V2CancelUseCase,
};
use serde_json::{Value, json};

#[test]
fn durable_cancel_persists_before_signal_and_replays_after_restart() {
    let registry = active_registry();
    let store = Arc::new(RecordingStore::new(Arc::clone(&registry)));
    let control = parsed_control();
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let verifier = AcceptSignatures;
    let admission = V2ControlAdmission::new(&verifier, &replay);
    let V2ControlAdmissionOutcome::Fresh(admitted) = admission
        .admit_or_replay(&control, 1_000)
        .expect("fresh admitted")
    else {
        panic!("first delivery must be fresh");
    };
    let use_case = V2CancelUseCase::new_durable(
        Arc::clone(&registry),
        owner_scope(),
        store.clone(),
        Arc::new(FixedClock),
    );

    assert_eq!(
        use_case.execute(&admitted).outcome(),
        V2CancelOutcome::Accepted
    );
    assert!(registry.is_cancelled_id("cancel-camera"));
    assert_eq!(
        store.events.lock().expect("events").as_slice(),
        ["begin", "finalize"]
    );

    let restarted = V2CancelUseCase::new_durable(
        Arc::new(ActiveCommandRegistry::default()),
        owner_scope(),
        store,
        Arc::new(FixedClock),
    );
    let V2ControlAdmissionOutcome::VerifiedReplay(replayed) = admission
        .admit_or_replay(&control, 1_001)
        .expect("verified replay")
    else {
        panic!("second delivery must be replay");
    };
    assert_eq!(
        restarted.replay(&replayed).outcome(),
        V2CancelOutcome::Accepted
    );
}

#[test]
fn broker_ordered_cancel_waits_for_the_preceding_command_registration() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let store = Arc::new(RecordingStore::new(Arc::clone(&registry)));
    let cancelling_registry = Arc::clone(&registry);
    let cancelling_store = store.clone();
    let cancellation = std::thread::spawn(move || {
        let control = parsed_control();
        let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
        let verifier = AcceptSignatures;
        let admitted = V2ControlAdmission::new(&verifier, &replay)
            .admit(&control, 1_000)
            .expect("admitted");
        V2CancelUseCase::new_durable(
            cancelling_registry,
            owner_scope(),
            cancelling_store,
            Arc::new(FixedClock),
        )
        .execute(&admitted)
        .outcome()
    });

    std::thread::sleep(Duration::from_millis(50));
    let target = CommandTargetBinding::new(
        "request-camera",
        "command-camera",
        "operation-camera",
        "session-main",
        &fingerprint('a'),
        "idem-camera",
    )
    .expect("target");
    let handle =
        match registry.register_bound_with_cancellation_id(target, "cancel-camera", "token-camera")
        {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("preceding command registration"),
        };

    assert_eq!(
        cancellation.join().expect("cancel worker"),
        V2CancelOutcome::Accepted
    );
    assert!(handle.cancellation_signal().is_cancelled());
    assert_eq!(
        store.events.lock().expect("events").as_slice(),
        ["begin", "finalize"]
    );
}

#[test]
fn durable_scope_mismatch_never_changes_active_signal() {
    let registry = active_registry();
    let use_case = V2CancelUseCase::new_durable(
        Arc::clone(&registry),
        owner_scope(),
        Arc::new(ScopeMismatchStore),
        Arc::new(FixedClock),
    );
    let control = parsed_control();
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");

    assert_eq!(
        use_case.execute(&admitted).outcome(),
        V2CancelOutcome::BindingMismatch
    );
    assert!(!registry.is_cancelled_id("cancel-camera"));
}

#[test]
fn durable_prepare_failure_and_not_active_do_not_change_or_consume_state() {
    let registry = active_registry();
    let control = parsed_control();
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");
    let unavailable = V2CancelUseCase::new_durable(
        Arc::clone(&registry),
        owner_scope(),
        Arc::new(UnavailableBeginStore),
        Arc::new(FixedClock),
    );
    assert_eq!(
        unavailable.execute(&admitted).outcome(),
        V2CancelOutcome::StateUnavailable
    );
    assert!(!registry.is_cancelled_id("cancel-camera"));

    let missing = V2CancelUseCase::new_durable(
        Arc::new(ActiveCommandRegistry::default()),
        owner_scope(),
        Arc::new(PanicMutationStore),
        Arc::new(FixedClock),
    );
    assert_eq!(
        missing.execute(&admitted).outcome(),
        V2CancelOutcome::NotActive
    );
}

fn active_registry() -> Arc<ActiveCommandRegistry> {
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
    registry
}

fn owner_scope() -> V2CancelOwnerScope {
    V2CancelOwnerScope::new("yeonjang-main", "session-main", fingerprint('a')).expect("owner")
}

fn parsed_control() -> knowbee_yeonjang::protocol_v2_control::V2ControlEnvelope {
    let topics = MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics");
    parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&control_fixture()).expect("JSON"),
        1_000,
        &topics,
    )
    .expect("control")
}

struct RecordingStore {
    registry: Arc<ActiveCommandRegistry>,
    receipt: Mutex<Option<DurableCancellationReceipt>>,
    events: Mutex<Vec<&'static str>>,
}

impl RecordingStore {
    fn new(registry: Arc<ActiveCommandRegistry>) -> Self {
        Self {
            registry,
            receipt: Mutex::new(None),
            events: Mutex::new(Vec::new()),
        }
    }
}

impl DurableCancellationReceiptStore for RecordingStore {
    fn load(
        &self,
        _: &knowbee_yeonjang::durable_cancellation::CancellationReceiptKey,
    ) -> CancellationLoadResult {
        self.receipt
            .lock()
            .expect("receipt")
            .clone()
            .map_or(CancellationLoadResult::Miss, CancellationLoadResult::Exact)
    }

    fn begin(&self, receipt: DurableCancellationReceipt) -> CancellationBeginResult {
        assert!(!self.registry.is_cancelled_id("cancel-camera"));
        self.events.lock().expect("events").push("begin");
        *self.receipt.lock().expect("receipt") = Some(receipt);
        CancellationBeginResult::Prepared
    }

    fn finalize(&self, receipt: DurableCancellationReceipt) -> CancellationFinalizeResult {
        self.events.lock().expect("events").push("finalize");
        *self.receipt.lock().expect("receipt") = Some(receipt);
        CancellationFinalizeResult::Finalized
    }

    fn store_terminal(&self, _: DurableCancellationReceipt) -> CancellationStoreTerminalResult {
        CancellationStoreTerminalResult::Stored
    }
}

struct ScopeMismatchStore;

impl DurableCancellationReceiptStore for ScopeMismatchStore {
    fn load(
        &self,
        _: &knowbee_yeonjang::durable_cancellation::CancellationReceiptKey,
    ) -> CancellationLoadResult {
        CancellationLoadResult::ScopeMismatch
    }
    fn begin(&self, _: DurableCancellationReceipt) -> CancellationBeginResult {
        panic!("begin must not run")
    }
    fn finalize(&self, _: DurableCancellationReceipt) -> CancellationFinalizeResult {
        panic!("finalize must not run")
    }
    fn store_terminal(&self, _: DurableCancellationReceipt) -> CancellationStoreTerminalResult {
        panic!("store must not run")
    }
}

struct UnavailableBeginStore;

impl DurableCancellationReceiptStore for UnavailableBeginStore {
    fn load(
        &self,
        _: &knowbee_yeonjang::durable_cancellation::CancellationReceiptKey,
    ) -> CancellationLoadResult {
        CancellationLoadResult::Miss
    }
    fn begin(&self, _: DurableCancellationReceipt) -> CancellationBeginResult {
        CancellationBeginResult::Unavailable
    }
    fn finalize(&self, _: DurableCancellationReceipt) -> CancellationFinalizeResult {
        panic!("finalize must not run")
    }
    fn store_terminal(&self, _: DurableCancellationReceipt) -> CancellationStoreTerminalResult {
        panic!("store must not run")
    }
}

struct PanicMutationStore;

impl DurableCancellationReceiptStore for PanicMutationStore {
    fn load(
        &self,
        _: &knowbee_yeonjang::durable_cancellation::CancellationReceiptKey,
    ) -> CancellationLoadResult {
        CancellationLoadResult::Miss
    }
    fn begin(&self, _: DurableCancellationReceipt) -> CancellationBeginResult {
        panic!("begin must not run")
    }
    fn finalize(&self, _: DurableCancellationReceipt) -> CancellationFinalizeResult {
        panic!("finalize must not run")
    }
    fn store_terminal(&self, _: DurableCancellationReceipt) -> CancellationStoreTerminalResult {
        panic!("store must not run")
    }
}

struct FixedClock;

impl V2CancelClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_100
    }
}

struct AcceptSignatures;
impl V2ControlSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
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
