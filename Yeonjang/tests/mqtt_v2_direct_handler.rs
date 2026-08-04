use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_registration::ArtifactRegistrationUseCase;
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleRead, DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::artifact_sink::CaptureArtifactKind;
use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::ActiveCommandRegistry;
use knowbee_yeonjang::contract_only_platform::{ContractOnlyPlatform, ContractOnlyPlatformAdapter};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
};
use knowbee_yeonjang::mqtt_v2_direct_handler::{MqttV2CommandHandler, MqttV2HandlerResult};
use knowbee_yeonjang::mqtt_v2_response_adapter::{
    MqttV2InboundCommand, MqttV2ResponseAdapter, MqttV2ResponseAdapterResult,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttQos;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::platform_execution::{ExecutionFailure, ExecutionFailureReason};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, PlatformPreflightReceipt, PreflightObservation,
    PreflightPermissionState, TargetPlatform,
};
use knowbee_yeonjang::platform_port::{
    PlatformCapabilityPort, PlatformCaptureArtifactReceipt, PlatformEffectReceipt,
};
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use knowbee_yeonjang::protocol_v2::V2CommandSignatureVerifier;
use knowbee_yeonjang::protocol_v2_operation::V2OperationBindingContext;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext, V2TerminalResponseContent,
};
use knowbee_yeonjang::stage_timing::{
    RuntimeStage, StageTimingClock, StageTimingEvidence, StageTimingRecorder, StageTimingSink,
    StageTimingWriteError,
};
use knowbee_yeonjang::v2_delivery_receipt::{
    V2DeliveryIdentityResolution, V2DeliveryIdentityResolver, V2DeliveryReceipt,
};
use knowbee_yeonjang::v2_terminal_repository::{
    DurableV2TerminalRepository, InMemoryV2TerminalRepository, V2TerminalClaim, V2TerminalComplete,
    V2TerminalLookup, V2TerminalRepository, V2TerminalScope,
};
use sha2::Digest;

#[test]
fn direct_handler_executes_one_exact_effect_and_returns_terminal_content() {
    let calls = Arc::new(AtomicUsize::new(0));
    let handler = handler(
        Arc::new(SuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
    );

    let result = handler.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );

    let MqttV2HandlerResult::Terminal(content) = result else {
        panic!("expected terminal content");
    };
    let value = serde_json::to_value(content).expect("terminal JSON");
    assert_eq!(value["schema_version"], 3);
    assert!(
        value["target_scope_digest"]
            .as_str()
            .is_some_and(|digest| digest.starts_with("sha256:"))
    );
    assert_eq!(value["request_id"], "request-v2");
    assert_eq!(value["terminal"]["execution_outcome"], "succeeded");
    assert_eq!(value["terminal"]["delivery_outcome"], "not_started");
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    let replayed = handler.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_001,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Terminal(replayed_content) = replayed else {
        panic!("completed redelivery must replay terminal");
    };
    assert_eq!(
        serde_json::to_value(replayed_content).expect("replayed JSON"),
        value
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    let conflict = handler.handle(
        &topics().command(),
        &scope_conflict_command_bytes(),
        1_002,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = conflict else {
        panic!("same idempotency with another scope must reject");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::IdempotencyScopeConflict
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    let cancellation_conflict = handler.handle(
        &topics().command(),
        &cancellation_scope_conflict_command_bytes(),
        1_003,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = cancellation_conflict else {
        panic!("same idempotency with another cancellation binding must reject");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::IdempotencyScopeConflict
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn direct_handler_observes_authorization_and_common_execution_stages() {
    let calls = Arc::new(AtomicUsize::new(0));
    let timing_sink = Arc::new(StageValues::default());
    let handler = handler(
        Arc::new(SuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
    )
    .with_stage_timing(StageTimingRecorder::new(
        Arc::new(FixedStageClock),
        timing_sink.clone(),
    ));
    let bytes = valid_command_bytes();

    let result = handler.handle(
        &topics().command(),
        &bytes,
        1_000,
        binding(TargetPlatform::Macos),
    );

    assert!(matches!(result, MqttV2HandlerResult::Terminal(_)));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let evidence = timing_sink.values();
    assert_eq!(
        evidence
            .iter()
            .map(StageTimingEvidence::stage)
            .collect::<Vec<_>>(),
        [
            RuntimeStage::Authorization,
            RuntimeStage::Handler,
            RuntimeStage::PostCheck
        ]
    );
    assert_eq!(
        evidence[0].correlation_id(),
        format!("sha256:{:x}", sha2::Sha256::digest(&bytes))
    );
    assert!(
        evidence[1..]
            .iter()
            .all(|row| row.correlation_id().starts_with("sha256:"))
    );
}

#[test]
fn prepared_restart_replays_effect_unknown_without_platform_reexecution() {
    let storage = Arc::new(MemoryStorage::default());
    let durable = Arc::new(
        DurableV2TerminalRepository::bootstrap(4, storage.clone())
            .expect("initial durable terminal"),
    );
    let interrupted: Arc<dyn V2TerminalRepository> = Arc::new(PrepareThenUnavailable {
        inner: durable.clone(),
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let first = handler_with_terminal_repository(
        Arc::new(SuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
        allowed_policy(),
        interrupted,
    );

    let result = first.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = result else {
        panic!("controlled interruption must stop before effect");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::TerminalRepositoryUnavailable
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    drop(first);
    drop(durable);

    let recovered: Arc<dyn V2TerminalRepository> = Arc::new(
        DurableV2TerminalRepository::bootstrap(4, storage).expect("prepared restart recovery"),
    );
    let restarted = handler_with_terminal_repository(
        Arc::new(SuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
        allowed_policy(),
        recovered,
    );
    let replayed = restarted.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_001,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Terminal(content) = replayed else {
        panic!("restart must replay the recovered terminal");
    };
    let value = serde_json::to_value(content).expect("recovered terminal JSON");
    assert_eq!(value["terminal"]["execution_outcome"], "effect_unknown");
    assert_eq!(
        value["terminal"]["failure"]["reason_code"],
        "restart_recovery_required"
    );
    assert_eq!(
        value["terminal"]["failure"]["recovery_action"],
        "manual_effect_verification"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[test]
fn capture_success_registers_artifact_before_terminal_descriptor_is_returned() {
    let calls = Arc::new(AtomicUsize::new(0));
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
            .expect("artifact repository"),
    );
    let registration = Arc::new(
        ArtifactRegistrationUseCase::new(repository.clone(), 600_000)
            .expect("artifact registration"),
    );
    let handler = handler(
        Arc::new(ArtifactSuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
    )
    .with_artifact_registration(registration);

    let result = handler.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );

    let MqttV2HandlerResult::Terminal(content) = result else {
        panic!("expected terminal content");
    };
    let artifact = content.artifact().expect("artifact terminal descriptor");
    assert_eq!(
        artifact.artifact_ref(),
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    assert_eq!(artifact.lifecycle_revision(), 0);
    assert!(matches!(
        repository.read(artifact.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if lifecycle.binding().owner_request_id() == "request-v2"
                && lifecycle.binding().owner_operation_id() == "operation-v2"
    ));
    let value = serde_json::to_value(content).expect("terminal JSON");
    assert_eq!(value["schema_version"], 3);
    assert_eq!(value["artifact"]["mediaType"], "image/jpeg");
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn malformed_or_rejected_signature_never_reaches_platform() {
    let malformed_calls = Arc::new(AtomicUsize::new(0));
    let malformed_handler = handler(
        Arc::new(SuccessPort(Arc::clone(&malformed_calls))),
        Arc::new(AcceptSignatures),
    );
    let malformed = malformed_handler.handle(
        &topics().command(),
        b"{not-json",
        1_000,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = malformed else {
        panic!("expected malformed rejection");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::InvalidRequest
    );
    assert_eq!(malformed_calls.load(Ordering::SeqCst), 0);

    let signature_calls = Arc::new(AtomicUsize::new(0));
    let signature_handler = handler(
        Arc::new(SuccessPort(Arc::clone(&signature_calls))),
        Arc::new(RejectSignatures),
    );
    let rejected = signature_handler.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = rejected else {
        panic!("expected authorization rejection");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::AuthorizationRejected
    );
    assert_eq!(signature_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn contract_only_target_returns_blocked_terminal_without_fabricated_success() {
    let handler = handler(
        Arc::new(ContractOnlyPlatformAdapter::new(ContractOnlyPlatform::Ios)),
        Arc::new(AcceptSignatures),
    );

    let result = handler.handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Ios),
    );

    let MqttV2HandlerResult::Terminal(content) = result else {
        panic!("expected blocked terminal");
    };
    let value = serde_json::to_value(content).expect("terminal JSON");
    assert_eq!(value["terminal"]["execution_outcome"], "blocked");
    assert_eq!(
        value["terminal"]["failure"]["reason_code"],
        "capability_unavailable"
    );
    assert_eq!(value["terminal"]["failure"]["effect_state"], "not_started");
}

#[test]
fn response_adapter_emits_exact_non_retained_qos1_signed_publish() {
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = MqttV2ResponseAdapter::new(
        handler(
            Arc::new(SuccessPort(Arc::clone(&calls))),
            Arc::new(AcceptSignatures),
        ),
        Arc::new(FixedResponseSigner),
    );

    let result = adapter.process(
        MqttV2InboundCommand {
            topic: topics().command(),
            payload: valid_command_bytes(),
            retained: false,
        },
        1_000,
        binding(TargetPlatform::Macos),
        response_signing_context(),
    );

    let MqttV2ResponseAdapterResult::Publish(publish) = result else {
        panic!("expected response publish");
    };
    assert_eq!(publish.topic, topics().response());
    assert_eq!(publish.qos, MqttQos::AtLeastOnce);
    assert!(!publish.retained);
    let value: serde_json::Value = serde_json::from_slice(&publish.payload).expect("response");
    assert_eq!(value["schema_id"], "yeonjang.response.v2");
    assert_eq!(
        value["receipt_id"],
        publish
            .delivery_receipt
            .as_ref()
            .expect("delivery receipt")
            .receipt_id()
    );
    assert_eq!(value["receipt_id"].as_str().expect("receipt ID").len(), 64);
    assert_eq!(
        value["response_digest"],
        publish
            .delivery_receipt
            .as_ref()
            .expect("delivery receipt")
            .response_digest()
    );
    assert_eq!(
        publish
            .delivery_receipt
            .as_ref()
            .expect("delivery receipt")
            .state(),
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryReceiptState::Queued
    );
    assert_eq!(value["authorization"]["signature"], "aa".repeat(32));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn response_adapter_reuses_the_durable_legacy_receipt_identity() {
    let adapter = MqttV2ResponseAdapter::new(
        handler(
            Arc::new(SuccessPort(Arc::new(AtomicUsize::new(0)))),
            Arc::new(AcceptSignatures),
        ),
        Arc::new(FixedResponseSigner),
    )
    .with_delivery_identity_resolver(Arc::new(LegacyDeliveryIdentity));

    let result = adapter.process(
        MqttV2InboundCommand {
            topic: topics().command(),
            payload: valid_command_bytes(),
            retained: false,
        },
        1_000,
        binding(TargetPlatform::Macos),
        response_signing_context(),
    );
    let MqttV2ResponseAdapterResult::Publish(publish) = result else {
        panic!("expected response publish");
    };
    let value: serde_json::Value = serde_json::from_slice(&publish.payload).expect("response");
    assert_eq!(value["receipt_id"], "receipt-legacy-sequence-25");
    assert_eq!(
        publish
            .delivery_receipt
            .expect("delivery receipt")
            .receipt_id(),
        "receipt-legacy-sequence-25"
    );
}

#[test]
fn v1_command_returns_a_signed_path_free_ingress_rejection_without_effect() {
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = MqttV2ResponseAdapter::new(
        handler(
            Arc::new(SuccessPort(Arc::clone(&calls))),
            Arc::new(AcceptSignatures),
        ),
        Arc::new(FixedResponseSigner),
    );
    let mut v1: serde_json::Value =
        serde_json::from_slice(&valid_command_bytes()).expect("base command");
    v1["protocol_version"] = 1.into();
    let inbound = serde_json::to_vec(&v1).expect("v1 command");
    let expected_correlation = format!("sha256:{:x}", sha2::Sha256::digest(&inbound));

    let result = adapter.process(
        MqttV2InboundCommand {
            topic: topics().command(),
            payload: inbound,
            retained: false,
        },
        1_000,
        binding(TargetPlatform::Macos),
        response_signing_context(),
    );

    let MqttV2ResponseAdapterResult::Publish(publish) = result else {
        panic!("v1 rejection must be visible to the exact requester");
    };
    assert_eq!(publish.topic, topics().response());
    assert!(publish.delivery_receipt.is_none());
    let value: serde_json::Value =
        serde_json::from_slice(&publish.payload).expect("ingress rejection");
    assert_eq!(value["schema_id"], "yeonjang.command-rejection.v2");
    assert_eq!(value["requester_id"], topics().requester_id());
    assert_eq!(value["target_instance_id"], topics().instance_id());
    assert_eq!(value["target_session_id"], topics().session_id());
    assert_eq!(
        value["payload"]["failure"]["reason_code"],
        "protocol_upgrade_required"
    );
    assert_eq!(value["payload"]["failure"]["effect_state"], "not_started");
    assert_eq!(
        value["payload"]["failure"]["correlation_id"],
        expected_correlation
    );
    assert_eq!(value["authorization"]["scope"], "response.publish");
    assert_eq!(value["authorization"]["signature"], "aa".repeat(32));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[test]
fn retained_command_and_response_signer_failure_never_create_publish() {
    let retained_calls = Arc::new(AtomicUsize::new(0));
    let retained_adapter = MqttV2ResponseAdapter::new(
        handler(
            Arc::new(SuccessPort(Arc::clone(&retained_calls))),
            Arc::new(AcceptSignatures),
        ),
        Arc::new(FixedResponseSigner),
    );
    let retained = retained_adapter.process(
        MqttV2InboundCommand {
            topic: topics().command(),
            payload: valid_command_bytes(),
            retained: true,
        },
        1_000,
        binding(TargetPlatform::Macos),
        response_signing_context(),
    );
    let MqttV2ResponseAdapterResult::Rejected(failure) = retained else {
        panic!("retained command must reject");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::RetainedMessageRejected
    );
    assert_eq!(retained_calls.load(Ordering::SeqCst), 0);

    let signer_calls = Arc::new(AtomicUsize::new(0));
    let signer_adapter = MqttV2ResponseAdapter::new(
        handler(
            Arc::new(SuccessPort(Arc::clone(&signer_calls))),
            Arc::new(AcceptSignatures),
        ),
        Arc::new(UnavailableResponseSigner),
    );
    assert!(matches!(
        signer_adapter.process(
            MqttV2InboundCommand {
                topic: topics().command(),
                payload: valid_command_bytes(),
                retained: false,
            },
            1_000,
            binding(TargetPlatform::Macos),
            response_signing_context(),
        ),
        MqttV2ResponseAdapterResult::ResponseSigningFailed
    ));
    assert_eq!(signer_calls.load(Ordering::SeqCst), 1);
}

#[test]
fn denied_or_unavailable_canonical_policy_stops_before_platform_preflight() {
    let denied_calls = Arc::new(AtomicUsize::new(0));
    let denied = handler_with_policy(
        Arc::new(SuccessPort(Arc::clone(&denied_calls))),
        Arc::new(AcceptSignatures),
        Arc::new(FixedPolicy(Some(
            PermissionPolicySnapshot::new("instance-a").expect("policy"),
        ))),
    )
    .handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = denied else {
        panic!("policy denied")
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::LocalPolicyDenied
    );
    assert_eq!(denied_calls.load(Ordering::SeqCst), 0);

    let unavailable_calls = Arc::new(AtomicUsize::new(0));
    let unavailable = handler_with_policy(
        Arc::new(SuccessPort(Arc::clone(&unavailable_calls))),
        Arc::new(AcceptSignatures),
        Arc::new(FixedPolicy(None)),
    )
    .handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        binding(TargetPlatform::Macos),
    );
    let MqttV2HandlerResult::Rejected(failure) = unavailable else {
        panic!("policy unavailable")
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::LocalPolicyUnavailable
    );
    assert_eq!(unavailable_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn exact_resource_mismatch_is_denied_and_snapshot_revision_overrides_legacy_context() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let command = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::exact_camera("camera-other"),
    )
    .expect("update");
    let policy = match apply_policy_update(&initial, &command) {
        knowbee_yeonjang::permission_policy::PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("applied policy: {other:?}"),
    };
    let calls = Arc::new(AtomicUsize::new(0));
    let result = handler_with_policy(
        Arc::new(SuccessPort(Arc::clone(&calls))),
        Arc::new(AcceptSignatures),
        Arc::new(FixedPolicy(Some(policy))),
    )
    .handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 999,
            artifact_lease_ref: Some("artifact-v2".to_string()),
        },
    );
    let MqttV2HandlerResult::Rejected(failure) = result else {
        panic!("resource mismatch")
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::LocalPolicyDenied
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[test]
fn allowed_operation_binds_the_snapshot_revision_not_the_legacy_context_revision() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let command = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("update");
    let policy = match apply_policy_update(&initial, &command) {
        knowbee_yeonjang::permission_policy::PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("applied policy: {other:?}"),
    };
    let observed_revision = Arc::new(AtomicU64::new(u64::MAX));
    let result = handler_with_policy(
        Arc::new(RevisionPort(Arc::clone(&observed_revision))),
        Arc::new(AcceptSignatures),
        Arc::new(FixedPolicy(Some(policy))),
    )
    .handle(
        &topics().command(),
        &valid_command_bytes(),
        1_000,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 999,
            artifact_lease_ref: Some("artifact-v2".to_string()),
        },
    );

    assert!(matches!(result, MqttV2HandlerResult::Terminal(_)));
    assert_eq!(observed_revision.load(Ordering::SeqCst), 1);
}

struct FixedResponseSigner;

impl V2ResponseSigner for FixedResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

struct LegacyDeliveryIdentity;

impl V2DeliveryIdentityResolver for LegacyDeliveryIdentity {
    fn resolve_receipt_id(&self, _: &V2DeliveryReceipt) -> V2DeliveryIdentityResolution {
        V2DeliveryIdentityResolution::Existing("receipt-legacy-sequence-25".to_string())
    }
}

struct UnavailableResponseSigner;

impl V2ResponseSigner for UnavailableResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Err(V2ResponseSignerError::Unavailable)
    }
}

fn response_signing_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "response-message-v2".to_string(),
        issued_at: 1_001,
        expires_at: 3_000,
        issuer: "instance-a".to_string(),
        key_id: "response-key-v2".to_string(),
        audience: "requester-a".to_string(),
        nonce: "response-nonce-v2".to_string(),
    }
}

struct SuccessPort(Arc<AtomicUsize>);

impl PlatformCapabilityPort for SuccessPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-resource".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(
            PlatformEffectReceipt::for_operation(operation, "native:v2".to_string(), 1_001)
                .expect("effect receipt"),
        )
    }
}

struct ArtifactSuccessPort(Arc<AtomicUsize>);

impl PlatformCapabilityPort for ArtifactSuccessPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-v2".to_string(),
                observed_at_ms: 990,
            },
        )
        .map_err(|error| panic!("preflight fixture failed: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.0.fetch_add(1, Ordering::SeqCst);
        let artifact = PlatformCaptureArtifactReceipt::new(
            format!("capture:{}", "a".repeat(64)),
            CaptureArtifactKind::CameraJpeg,
            512,
            format!("sha256:{}", "b".repeat(64)),
        )
        .expect("artifact receipt");
        Ok(
            PlatformEffectReceipt::for_capture_operation(operation, artifact, 1_001)
                .expect("capture receipt"),
        )
    }
}

#[derive(Default)]
struct MemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

impl DurableRecordStorage for MemoryStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.0.lock().expect("storage");
        if state.1.is_empty() {
            RawStoreRead::Missing { revision: state.0 }
        } else {
            RawStoreRead::Records {
                revision: state.0,
                records: state.1.clone(),
            }
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

struct PrepareThenUnavailable {
    inner: Arc<DurableV2TerminalRepository>,
}

impl V2TerminalRepository for PrepareThenUnavailable {
    fn prepare(
        &self,
        scope: &V2TerminalScope,
        restart_recovery: V2TerminalResponseContent,
    ) -> V2TerminalClaim {
        match self.inner.prepare(scope, restart_recovery) {
            V2TerminalClaim::Claimed => V2TerminalClaim::Unavailable,
            other => other,
        }
    }

    fn lookup(&self, scope: &V2TerminalScope) -> V2TerminalLookup {
        self.inner.lookup(scope)
    }

    fn complete(
        &self,
        scope: &V2TerminalScope,
        content: V2TerminalResponseContent,
    ) -> V2TerminalComplete {
        self.inner.complete(scope, content)
    }
}

struct RevisionPort(Arc<AtomicU64>);
impl PlatformCapabilityPort for RevisionPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.0.store(operation.policy_revision(), Ordering::SeqCst);
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-resource".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        PlatformEffectReceipt::for_operation(operation, "native:revision".to_string(), 1_001)
            .map_err(|error| panic!("fixture: {error}"))
    }
}

struct FixedClock;
impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

struct FixedStageClock;
impl StageTimingClock for FixedStageClock {
    fn wall_time_ms(&self) -> i64 {
        5_000
    }

    fn monotonic_time_us(&self) -> u64 {
        10_000
    }
}

#[derive(Default)]
struct StageValues(Mutex<Vec<StageTimingEvidence>>);

impl StageValues {
    fn values(&self) -> Vec<StageTimingEvidence> {
        self.0.lock().expect("stage values").clone()
    }
}

impl StageTimingSink for StageValues {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError> {
        self.0
            .lock()
            .map_err(|_| StageTimingWriteError::Unavailable)?
            .push(evidence);
        Ok(())
    }
}

struct NeverCancelled;
impl ExecutionCancellation for NeverCancelled {
    fn is_cancelled(&self, _cancellation_id: &str) -> bool {
        false
    }
}

struct AcceptSignatures;
impl V2CommandSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignatures;
impl V2CommandSignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}

struct FixedPolicy(Option<PermissionPolicySnapshot>);
impl PermissionPolicyReader for FixedPolicy {
    fn snapshot(&self) -> PolicySnapshotRead {
        self.0.clone().map_or(
            PolicySnapshotRead::Unavailable,
            PolicySnapshotRead::Snapshot,
        )
    }
}

fn handler(
    port: Arc<dyn PlatformCapabilityPort>,
    verifier: Arc<dyn V2CommandSignatureVerifier>,
) -> MqttV2CommandHandler {
    handler_with_terminal_repository(
        port,
        verifier,
        allowed_policy(),
        Arc::new(InMemoryV2TerminalRepository::new(4).expect("terminal repository")),
    )
}

fn allowed_policy() -> Arc<dyn PermissionPolicyReader> {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let allow = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("update");
    let allowed = match apply_policy_update(&initial, &allow) {
        knowbee_yeonjang::permission_policy::PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("allowed policy: {other:?}"),
    };
    Arc::new(FixedPolicy(Some(allowed)))
}

fn handler_with_policy(
    port: Arc<dyn PlatformCapabilityPort>,
    verifier: Arc<dyn V2CommandSignatureVerifier>,
    policy: Arc<dyn PermissionPolicyReader>,
) -> MqttV2CommandHandler {
    handler_with_terminal_repository(
        port,
        verifier,
        policy,
        Arc::new(InMemoryV2TerminalRepository::new(4).expect("terminal repository")),
    )
}

fn handler_with_terminal_repository(
    port: Arc<dyn PlatformCapabilityPort>,
    verifier: Arc<dyn V2CommandSignatureVerifier>,
    policy: Arc<dyn PermissionPolicyReader>,
    terminal_repository: Arc<dyn V2TerminalRepository>,
) -> MqttV2CommandHandler {
    MqttV2CommandHandler::new(
        topics(),
        verifier,
        Arc::new(InMemoryAuthorizationReplayGuard::new(4).expect("replay")),
        terminal_repository,
        Arc::new(ActiveCommandRegistry::default()),
        policy,
        ExecuteCapabilityUseCase::new(port, Arc::new(FixedClock), Arc::new(NeverCancelled), 100),
    )
}

fn binding(target_platform: TargetPlatform) -> V2OperationBindingContext {
    V2OperationBindingContext {
        target_platform,
        policy_revision: 1,
        artifact_lease_ref: Some("artifact-v2".to_string()),
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn valid_command_bytes() -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.command.v2",
        "message_kind": "command", "message_id": "message-v2",
        "request_id": "request-v2", "command_id": "command-v2",
        "operation_id": "operation-v2", "correlation_id": "correlation-v2",
        "causation_id": "causation-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idempotency-v2", "cancellation_id": "cancel-v2",
        "cancel_token": "cancel-token-v2", "issued_at": 900, "expires_at": 2_000,
        "sequence": 1,
        "payload": {"method": "camera.capture", "params": {"capture_timeout_ms": 1_000}},
        "authorization": {
            "schema_version": 1, "authorization_id": "authorization-v2",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "yeonjang-v2",
            "scope": "effect.execute", "method": "camera.capture", "resource": "camera",
            "requester_id": "requester-a", "command_id": "command-v2",
            "operation_id": "operation-v2", "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "idempotency-v2", "cancellation_id": "cancel-v2",
            "cancel_token": "cancel-token-v2", "expires_at": 2_000,
            "nonce": "nonce-v2", "signature": "aa".repeat(32)
        }
    }))
    .expect("command")
}

fn scope_conflict_command_bytes() -> Vec<u8> {
    let mut value: serde_json::Value =
        serde_json::from_slice(&valid_command_bytes()).expect("base command");
    value["command_id"] = "command-v2-conflict".into();
    value["operation_id"] = "operation-v2-conflict".into();
    value["authorization"]["authorization_id"] = "authorization-v2-conflict".into();
    value["authorization"]["command_id"] = "command-v2-conflict".into();
    value["authorization"]["operation_id"] = "operation-v2-conflict".into();
    value["authorization"]["nonce"] = "nonce-v2-conflict".into();
    serde_json::to_vec(&value).expect("conflict command")
}

fn cancellation_scope_conflict_command_bytes() -> Vec<u8> {
    let mut value: serde_json::Value =
        serde_json::from_slice(&valid_command_bytes()).expect("base command");
    value["cancellation_id"] = "cancel-v2-conflict".into();
    value["cancel_token"] = "cancel-token-v2-conflict".into();
    value["authorization"]["authorization_id"] = "authorization-cancel-conflict".into();
    value["authorization"]["cancellation_id"] = "cancel-v2-conflict".into();
    value["authorization"]["cancel_token"] = "cancel-token-v2-conflict".into();
    value["authorization"]["nonce"] = "nonce-cancel-conflict".into();
    serde_json::to_vec(&value).expect("cancellation conflict command")
}
