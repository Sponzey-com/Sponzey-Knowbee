use hmac::{Hmac, Mac};
use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperationError, CapabilityCommand, TargetPlatform,
};
use knowbee_yeonjang::protocol_v2::{
    V2CommandMethod, V2CommandParseError, V2CommandSignatureVerifier, V2SignatureError,
    parse_v2_command, verify_v2_command_signature,
};
use knowbee_yeonjang::protocol_v2_admission::{V2CommandAdmission, V2CommandAdmissionError};
use knowbee_yeonjang::protocol_v2_operation::{
    V2OperationBindingContext, bind_admitted_v2_command,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseEnvelopeBuildError, V2ResponseSigner, V2ResponseSignerError,
    V2ResponseSigningContext, V2TerminalResponseContent, V2TerminalResponseEnvelope,
    V2TerminalResponseError,
};
use knowbee_yeonjang::terminal_receipt::{DeliveryOutcome, ExecutionOutcome, TerminalReceipt};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

#[test]
fn strict_camera_command_preserves_typed_identity_and_payload() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");

    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("v2 command");

    assert_eq!(command.request_id(), "request-v2");
    assert_eq!(command.command_id(), "command-v2");
    assert_eq!(command.operation_id(), "operation-v2");
    assert_eq!(command.requester_id(), "requester-a");
    assert_eq!(command.method(), V2CommandMethod::CameraCapture);
    assert_eq!(command.target_session_id(), "session-a");
}

#[test]
fn v1_and_unknown_versions_stop_before_payload_schema_handling() {
    let topics = topics();
    let mut v1 = valid_camera_command();
    v1["protocol_version"] = 1.into();
    v1["payload"]["unexpected_legacy_field"] = true.into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&v1).expect("v1 fixture"),
            1_000,
            &topics,
        )
        .expect_err("v1 cutover"),
        V2CommandParseError::ProtocolUpgradeRequired
    );

    let mut v3 = valid_camera_command();
    v3["protocol_version"] = 3.into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&v3).expect("v3 fixture"),
            1_000,
            &topics,
        )
        .expect_err("unknown version"),
        V2CommandParseError::ProtocolVersionUnsupported
    );
}

#[test]
fn unknown_top_level_payload_and_authorization_fields_are_rejected() {
    let topics = topics();
    let mut fixture = valid_camera_command();
    fixture["extra"] = true.into();
    let error = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&fixture).expect("unknown fixture"),
        1_000,
        &topics,
    )
    .expect_err("unknown field");
    assert_eq!(error, V2CommandParseError::UnknownOrInvalidField);

    let mut payload = valid_camera_command();
    payload["payload"]["params"]["output_path"] = "/tmp/not-allowed".into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&payload).expect("payload fixture"),
            1_000,
            &topics,
        )
        .expect_err("unknown payload field"),
        V2CommandParseError::UnknownOrInvalidField
    );

    let mut authorization = valid_camera_command();
    authorization["authorization"]["raw_secret"] = "secret".into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&authorization).expect("authorization fixture"),
            1_000,
            &topics,
        )
        .expect_err("unknown authorization field"),
        V2CommandParseError::UnknownOrInvalidField
    );
}

#[test]
fn topic_expiry_and_authorization_mismatches_are_closed_before_execution() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");
    assert_eq!(
        parse_v2_command(
            "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-b/command",
            &bytes,
            1_000,
            &topics,
        )
        .expect_err("wrong requester topic"),
        V2CommandParseError::TopicMismatch
    );

    let mut expired = valid_camera_command();
    expired["expires_at"] = 999.into();
    expired["authorization"]["expires_at"] = 999.into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&expired).expect("expired fixture"),
            1_000,
            &topics,
        )
        .expect_err("expired"),
        V2CommandParseError::Expired
    );

    let mut wrong_authorization = valid_camera_command();
    wrong_authorization["authorization"]["requester_id"] = "requester-b".into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&wrong_authorization).expect("authorization mismatch"),
            1_000,
            &topics,
        )
        .expect_err("authorization mismatch"),
        V2CommandParseError::AuthorizationMismatch
    );
}

#[test]
fn oversized_payload_is_rejected_before_json_parsing() {
    let topics = topics();
    assert_eq!(
        parse_v2_command(topics.command(), &vec![b'x'; 65_537], 1_000, &topics)
            .expect_err("oversized"),
        V2CommandParseError::PayloadTooLarge
    );
}

#[test]
fn canonical_signing_bytes_are_stable_and_cover_identity_and_payload_mutation() {
    let topics = topics();
    let original = valid_camera_command();
    let original_bytes = serde_json::to_vec(&original).expect("fixture");
    let parsed =
        parse_v2_command(topics.command(), &original_bytes, 1_000, &topics).expect("command");
    let reparsed =
        parse_v2_command(topics.command(), &original_bytes, 1_000, &topics).expect("command");

    assert_eq!(
        parsed.authorization_signing_bytes(),
        reparsed.authorization_signing_bytes()
    );
    assert_eq!(
        hex_digest(&parsed.authorization_signing_bytes()),
        "28cbe57c0c54875bdf22f1181e2f2c0219903886fee4943980dc5769bd076cef"
    );

    let mut mutated = original;
    mutated["idempotency_key"] = "idempotency-v2-mutated".into();
    mutated["authorization"]["idempotency_key"] = "idempotency-v2-mutated".into();
    let mutated = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&mutated).expect("mutated fixture"),
        1_000,
        &topics,
    )
    .expect("mutated command");
    assert_ne!(
        parsed.authorization_signing_bytes(),
        mutated.authorization_signing_bytes()
    );

    let mut payload_mutation = valid_camera_command();
    payload_mutation["payload"]["params"]["capture_timeout_ms"] = 2_000.into();
    let payload_mutation = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&payload_mutation).expect("payload mutation fixture"),
        1_000,
        &topics,
    )
    .expect("payload mutation command");
    assert_ne!(
        parsed.authorization_signing_bytes(),
        payload_mutation.authorization_signing_bytes()
    );

    let mut cancellation_mutation = valid_camera_command();
    cancellation_mutation["cancel_token"] = "cancel-token-mutated".into();
    cancellation_mutation["authorization"]["cancel_token"] = "cancel-token-mutated".into();
    let cancellation_mutation = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&cancellation_mutation).expect("cancellation mutation fixture"),
        1_000,
        &topics,
    )
    .expect("cancellation mutation command");
    assert_ne!(
        parsed.authorization_signing_bytes(),
        cancellation_mutation.authorization_signing_bytes()
    );
}

#[test]
fn command_requires_exact_signed_cancellation_binding() {
    let topics = topics();
    let mut fixture = valid_camera_command();
    fixture["cancellation_id"] = "cancel-v2".into();
    fixture["cancel_token"] = "cancel-token-v2".into();
    fixture["authorization"]["cancellation_id"] = "cancel-v2".into();
    fixture["authorization"]["cancel_token"] = "cancel-token-v2".into();
    let command = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&fixture).expect("cancellable command"),
        1_000,
        &topics,
    )
    .expect("signed cancellation binding");

    assert_eq!(command.cancellation_id(), "cancel-v2");
    assert!(!format!("{command:?}").contains("cancel-token-v2"));

    let mut missing = valid_camera_command();
    missing
        .as_object_mut()
        .expect("command object")
        .remove("cancel_token");
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&missing).expect("missing token"),
            1_000,
            &topics,
        ),
        Err(V2CommandParseError::UnknownOrInvalidField)
    );

    fixture["authorization"]["cancellation_id"] = "cancel-other".into();
    assert_eq!(
        parse_v2_command(
            topics.command(),
            &serde_json::to_vec(&fixture).expect("mismatch"),
            1_000,
            &topics,
        ),
        Err(V2CommandParseError::AuthorizationMismatch)
    );
}

#[test]
fn injected_signature_verifier_accepts_reference_hmac_and_rejects_corruption() {
    let topics = topics();
    let secret = b"test-only-v2-signing-key";
    let mut fixture = valid_camera_command();
    let unsigned = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&fixture).expect("unsigned fixture"),
        1_000,
        &topics,
    )
    .expect("unsigned command");
    fixture["authorization"]["signature"] =
        reference_hmac(secret, &unsigned.authorization_signing_bytes()).into();
    let signed = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&fixture).expect("signed fixture"),
        1_000,
        &topics,
    )
    .expect("signed command");
    let verifier = ReferenceHmacVerifier { secret };

    assert_eq!(verify_v2_command_signature(&signed, &verifier), Ok(()));

    fixture["authorization"]["signature"] =
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into();
    let corrupt = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&fixture).expect("corrupt fixture"),
        1_000,
        &topics,
    )
    .expect("well-formed corrupt command");
    assert_eq!(
        verify_v2_command_signature(&corrupt, &verifier),
        Err(V2SignatureError::Rejected)
    );
}

#[test]
fn v2_admission_consumes_verified_replay_identity_exactly_once() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");
    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("command");
    let replay = InMemoryAuthorizationReplayGuard::new(2).expect("replay guard");
    let admission = V2CommandAdmission::new(&AcceptAllSignatures, &replay);

    assert!(admission.admit(&command, 1_000).is_ok());
    assert!(matches!(
        admission.admit(&command, 1_001),
        Err(V2CommandAdmissionError::Replayed)
    ));
}

#[test]
fn rejected_signature_does_not_consume_replay_identity() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");
    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("command");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay guard");

    assert!(matches!(
        V2CommandAdmission::new(&RejectAllSignatures, &replay).admit(&command, 1_000),
        Err(V2CommandAdmissionError::SignatureRejected)
    ));
    assert!(
        V2CommandAdmission::new(&AcceptAllSignatures, &replay)
            .admit(&command, 1_001)
            .is_ok()
    );
}

#[test]
fn v2_admission_rechecks_expiry_and_evicts_expired_replay_entries() {
    let topics = topics();
    let first_bytes = serde_json::to_vec(&valid_camera_command()).expect("first fixture");
    let first =
        parse_v2_command(topics.command(), &first_bytes, 1_000, &topics).expect("first command");
    let mut second_fixture = valid_camera_command();
    second_fixture["authorization"]["authorization_id"] = "authorization-v2-second".into();
    second_fixture["authorization"]["nonce"] = "nonce-v2-second".into();
    second_fixture["expires_at"] = 4_000.into();
    second_fixture["authorization"]["expires_at"] = 4_000.into();
    let second = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&second_fixture).expect("second fixture"),
        1_000,
        &topics,
    )
    .expect("second command");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay guard");
    let admission = V2CommandAdmission::new(&AcceptAllSignatures, &replay);

    assert!(admission.admit(&first, 1_000).is_ok());
    assert!(matches!(
        admission.admit(&second, 1_001),
        Err(V2CommandAdmissionError::ReplayUnavailable)
    ));
    assert!(matches!(
        admission.admit(&first, 2_000),
        Err(V2CommandAdmissionError::Expired)
    ));
    assert!(admission.admit(&second, 2_001).is_ok());
}

#[test]
fn admitted_camera_command_binds_exact_wire_and_runtime_identity() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");
    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("command");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay guard");
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");

    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-v2".to_string()),
        },
    )
    .expect("bound operation");

    let operation = bound.operation();
    assert_eq!(operation.request_id(), "request-v2");
    assert_eq!(operation.command_id(), "command-v2");
    assert_eq!(operation.operation_id(), "operation-v2");
    assert_eq!(operation.requester_id(), "requester-a");
    assert_eq!(operation.target_instance_id(), "instance-a");
    assert_eq!(operation.target_session_id(), "session-a");
    assert_eq!(operation.authorization_ref(), "authorization-v2");
    assert_eq!(operation.policy_revision(), 7);
    assert_eq!(operation.deadline_ms(), 2_000);
    assert_eq!(operation.cancellation_id(), "cancel-v2");
    assert_eq!(operation.artifact_lease_ref(), Some("artifact-v2"));
    assert_eq!(
        operation.command(),
        &CapabilityCommand::CameraCapture {
            device_id: Some("camera-a".to_string()),
            capture_timeout_ms: Some(1_000),
        }
    );
}

#[test]
fn admitted_screen_command_preserves_contract_only_platform_and_display() {
    let topics = topics();
    let mut fixture = valid_camera_command();
    fixture["payload"] = serde_json::json!({
        "method": "screen.capture",
        "params": { "display": 2 }
    });
    fixture["authorization"]["method"] = "screen.capture".into();
    fixture["authorization"]["resource"] = "screen".into();
    let bytes = serde_json::to_vec(&fixture).expect("fixture");
    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("command");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay guard");
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");

    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Ios,
            policy_revision: 3,
            artifact_lease_ref: Some("artifact-screen-v2".to_string()),
        },
    )
    .expect("bound operation");

    let operation = bound.operation();
    assert_eq!(operation.target_platform(), TargetPlatform::Ios);
    assert_eq!(
        operation.command(),
        &CapabilityCommand::ScreenCapture { display: Some(2) }
    );
}

#[test]
fn v2_operation_binding_rejects_invalid_runtime_context_without_defaults() {
    let topics = topics();
    let bytes = serde_json::to_vec(&valid_camera_command()).expect("fixture");
    let command = parse_v2_command(topics.command(), &bytes, 1_000, &topics).expect("command");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay guard");
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");

    assert_eq!(
        bind_admitted_v2_command(
            admitted,
            V2OperationBindingContext {
                target_platform: TargetPlatform::Linux,
                policy_revision: 1,
                artifact_lease_ref: Some(String::new()),
            },
        )
        .expect_err("invalid artifact binding"),
        BoundPlatformOperationError::InvalidField("artifact_lease_ref")
    );
}

#[test]
fn v2_terminal_content_preserves_exact_identity_and_independent_outcomes() {
    let (command, replay) = parsed_camera_command();
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");
    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-terminal-v2".to_string()),
        },
    )
    .expect("bound");
    let delivery_failure = ExecutionFailure::new(
        ExecutionStage::ResponsePublish,
        ExecutionFailureReason::InternalUnclassified,
        EffectState::ConfirmedApplied,
        RetrySafety::SafeRedeliverySameIdempotency,
        RecoveryAction::ReconnectTransport,
        Some("evidence:delivery:v2".to_string()),
        bound.operation().binding_digest().to_string(),
    )
    .expect("delivery failure");
    let receipt = TerminalReceipt::new(
        bound.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::PendingRetry,
        1,
        Some(delivery_failure),
    )
    .expect("terminal");

    let value = serde_json::to_value(
        V2TerminalResponseContent::new(&bound, receipt).expect("response content"),
    )
    .expect("JSON");
    assert_eq!(value["schema_version"], 2);
    assert_eq!(value["request_id"], "request-v2");
    assert_eq!(value["command_id"], "command-v2");
    assert_eq!(value["operation_id"], "operation-v2");
    assert_eq!(value["correlation_id"], "correlation-v2");
    assert_eq!(value["causation_id"], "message-v2");
    assert_eq!(value["target_instance_id"], "instance-a");
    assert_eq!(value["terminal"]["execution_outcome"], "succeeded");
    assert_eq!(value["terminal"]["delivery_outcome"], "pending_retry");
    assert_eq!(
        value["terminal"]["failure"]["effect_state"],
        "confirmed_applied"
    );
    assert_eq!(value["terminal"]["terminal_revision"], 1);
}

#[test]
fn v2_terminal_content_rejects_a_receipt_from_another_bound_target() {
    let (command, replay) = parsed_camera_command();
    let admission = V2CommandAdmission::new(&AcceptAllSignatures, &replay);
    let admitted = admission.admit(&command, 1_000).expect("admitted");
    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-terminal-v2".to_string()),
        },
    )
    .expect("bound");
    let other_replay = InMemoryAuthorizationReplayGuard::new(1).expect("other replay");
    let other_admitted = V2CommandAdmission::new(&AcceptAllSignatures, &other_replay)
        .admit(&command, 1_000)
        .expect("other admitted");
    let other = bind_admitted_v2_command(
        other_admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Ios,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-terminal-v2".to_string()),
        },
    )
    .expect("other bound");
    let wrong_receipt = TerminalReceipt::new(
        other.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        1,
        None,
    )
    .expect("wrong terminal");

    assert_eq!(
        V2TerminalResponseContent::new(&bound, wrong_receipt)
            .expect_err("wrong binding must close"),
        V2TerminalResponseError::BindingMismatch
    );
}

#[test]
fn v2_terminal_response_has_stable_signed_envelope_and_exact_identity() {
    let (command, replay) = parsed_camera_command();
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");
    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-response-v2".to_string()),
        },
    )
    .expect("bound");
    let terminal = TerminalReceipt::new(
        bound.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        3,
        None,
    )
    .expect("terminal");
    let content = V2TerminalResponseContent::new(&bound, terminal).expect("content");
    let signer = RecordingResponseHmacSigner::new(b"test-only-response-key");

    let envelope = V2TerminalResponseEnvelope::sign(
        content,
        V2ResponseSigningContext {
            message_id: "response-message-v2".to_string(),
            issued_at: 1_100,
            expires_at: 5_000,
            issuer: "instance-a".to_string(),
            key_id: "response-key-v2".to_string(),
            audience: "requester-a".to_string(),
            nonce: "response-nonce-v2".to_string(),
        },
        &signer,
    )
    .expect("signed envelope");

    assert_eq!(
        hex_digest(&envelope.authorization_signing_bytes()),
        "b5969beef874d71491630ee2cecb7f959dfa7bad0e9bd9e78e44cabb810598f4"
    );
    assert_eq!(
        signer.recorded_bytes(),
        envelope.authorization_signing_bytes()
    );
    let value = serde_json::to_value(envelope).expect("response JSON");
    assert_eq!(value["protocol_version"], 2);
    assert_eq!(value["schema_id"], "yeonjang.response.v2");
    assert_eq!(value["message_kind"], "response");
    assert_eq!(value["request_id"], "request-v2");
    assert_eq!(value["sequence"], 3);
    assert_eq!(value["authorization"]["scope"], "response.publish");
    assert_eq!(
        value["authorization"]["signature"].as_str().unwrap().len(),
        64
    );
}

#[test]
fn terminal_delivery_identity_is_stable_across_ephemeral_signing_contexts() {
    let (_, content) = response_content_fixture();
    let signer = RecordingResponseHmacSigner::new(b"test-only-response-key");
    let first = V2TerminalResponseEnvelope::sign(
        content.clone(),
        V2ResponseSigningContext {
            message_id: "response-before-restart".to_string(),
            issued_at: 1_100,
            expires_at: 5_000,
            issuer: "instance-a".to_string(),
            key_id: "response-key-v2".to_string(),
            audience: "requester-a".to_string(),
            nonce: "response-nonce-before-restart".to_string(),
        },
        &signer,
    )
    .expect("first signed envelope");
    let second = V2TerminalResponseEnvelope::sign(
        content,
        V2ResponseSigningContext {
            message_id: "response-after-restart".to_string(),
            issued_at: 1_200,
            expires_at: 5_100,
            issuer: "instance-a".to_string(),
            key_id: "response-key-v2".to_string(),
            audience: "requester-a".to_string(),
            nonce: "response-nonce-after-restart".to_string(),
        },
        &signer,
    )
    .expect("second signed envelope");
    let first = serde_json::to_value(first).expect("first response JSON");
    let second = serde_json::to_value(second).expect("second response JSON");

    assert_eq!(first["receipt_id"], second["receipt_id"]);
    assert_eq!(first["response_digest"], second["response_digest"]);
    assert_ne!(first["message_id"], second["message_id"]);
}

#[test]
fn v2_response_signing_rejects_invalid_timing_and_signer_failure() {
    let (bound, content) = response_content_fixture();
    let context = V2ResponseSigningContext {
        message_id: "response-message-v2".to_string(),
        issued_at: 5_000,
        expires_at: 5_000,
        issuer: "instance-a".to_string(),
        key_id: "response-key-v2".to_string(),
        audience: "requester-a".to_string(),
        nonce: "response-nonce-v2".to_string(),
    };
    assert_eq!(
        V2TerminalResponseEnvelope::sign(content, context, &UnavailableResponseSigner)
            .expect_err("invalid timing"),
        V2ResponseEnvelopeBuildError::InvalidTiming
    );

    let terminal = TerminalReceipt::new(
        bound.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        4,
        None,
    )
    .expect("terminal");
    let content = V2TerminalResponseContent::new(&bound, terminal).expect("content");
    assert_eq!(
        V2TerminalResponseEnvelope::sign(
            content,
            V2ResponseSigningContext {
                message_id: "response-message-v2b".to_string(),
                issued_at: 5_000,
                expires_at: 6_000,
                issuer: "instance-a".to_string(),
                key_id: "response-key-v2".to_string(),
                audience: "requester-a".to_string(),
                nonce: "response-nonce-v2b".to_string(),
            },
            &UnavailableResponseSigner,
        )
        .expect_err("signer unavailable"),
        V2ResponseEnvelopeBuildError::SignerUnavailable
    );

    let terminal = TerminalReceipt::new(
        bound.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        5,
        None,
    )
    .expect("terminal");
    let content = V2TerminalResponseContent::new(&bound, terminal).expect("content");
    assert_eq!(
        V2TerminalResponseEnvelope::sign(
            content,
            V2ResponseSigningContext {
                message_id: "response-message-v2c".to_string(),
                issued_at: 6_000,
                expires_at: 7_000,
                issuer: "instance-a".to_string(),
                key_id: "response-key-v2".to_string(),
                audience: "requester-a".to_string(),
                nonce: "response-nonce-v2c".to_string(),
            },
            &MalformedResponseSigner,
        )
        .expect_err("malformed signature"),
        V2ResponseEnvelopeBuildError::InvalidSignature
    );
}

struct RecordingResponseHmacSigner {
    secret: Vec<u8>,
    recorded: Mutex<Vec<u8>>,
}

impl RecordingResponseHmacSigner {
    fn new(secret: &[u8]) -> Self {
        Self {
            secret: secret.to_vec(),
            recorded: Mutex::new(Vec::new()),
        }
    }

    fn recorded_bytes(&self) -> Vec<u8> {
        self.recorded.lock().expect("recording").clone()
    }
}

impl V2ResponseSigner for RecordingResponseHmacSigner {
    fn sign(
        &self,
        _issuer: &str,
        _key_id: &str,
        signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError> {
        *self.recorded.lock().expect("recording") = signing_bytes.to_vec();
        Ok(reference_hmac(&self.secret, signing_bytes))
    }
}

struct UnavailableResponseSigner;

impl V2ResponseSigner for UnavailableResponseSigner {
    fn sign(
        &self,
        _issuer: &str,
        _key_id: &str,
        _signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError> {
        Err(V2ResponseSignerError::Unavailable)
    }
}

struct MalformedResponseSigner;

impl V2ResponseSigner for MalformedResponseSigner {
    fn sign(
        &self,
        _issuer: &str,
        _key_id: &str,
        _signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError> {
        Ok("not-a-signature".to_string())
    }
}

fn response_content_fixture() -> (
    knowbee_yeonjang::protocol_v2_operation::BoundV2Operation,
    V2TerminalResponseContent,
) {
    let (command, replay) = parsed_camera_command();
    let admitted = V2CommandAdmission::new(&AcceptAllSignatures, &replay)
        .admit(&command, 1_000)
        .expect("admitted");
    let bound = bind_admitted_v2_command(
        admitted,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 7,
            artifact_lease_ref: Some("artifact-response-fixture".to_string()),
        },
    )
    .expect("bound");
    let terminal = TerminalReceipt::new(
        bound.operation(),
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        4,
        None,
    )
    .expect("terminal");
    let content = V2TerminalResponseContent::new(&bound, terminal).expect("content");
    (bound, content)
}

fn parsed_camera_command() -> (
    knowbee_yeonjang::protocol_v2::V2CommandEnvelope,
    InMemoryAuthorizationReplayGuard,
) {
    let topics = topics();
    let command = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&valid_camera_command()).expect("fixture"),
        1_000,
        &topics,
    )
    .expect("command");
    (
        command,
        InMemoryAuthorizationReplayGuard::new(1).expect("replay"),
    )
}

struct AcceptAllSignatures;

impl V2CommandSignatureVerifier for AcceptAllSignatures {
    fn verify(
        &self,
        _issuer: &str,
        _key_id: &str,
        _signing_bytes: &[u8],
        _signature_hex: &str,
    ) -> bool {
        true
    }
}

struct RejectAllSignatures;

impl V2CommandSignatureVerifier for RejectAllSignatures {
    fn verify(
        &self,
        _issuer: &str,
        _key_id: &str,
        _signing_bytes: &[u8],
        _signature_hex: &str,
    ) -> bool {
        false
    }
}

struct ReferenceHmacVerifier<'a> {
    secret: &'a [u8],
}

impl V2CommandSignatureVerifier for ReferenceHmacVerifier<'_> {
    fn verify(
        &self,
        _issuer: &str,
        _key_id: &str,
        signing_bytes: &[u8],
        signature_hex: &str,
    ) -> bool {
        reference_hmac(self.secret, signing_bytes) == signature_hex
    }
}

fn reference_hmac(secret: &[u8], signing_bytes: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key size");
    mac.update(signing_bytes);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn valid_camera_command() -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.command.v2",
        "message_kind": "command",
        "message_id": "message-v2",
        "request_id": "request-v2",
        "command_id": "command-v2",
        "operation_id": "operation-v2",
        "correlation_id": "correlation-v2",
        "causation_id": "causation-v2",
        "requester_id": "requester-a",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint":
            "sha256:3434343434343434343434343434343434343434343434343434343434343434",
        "idempotency_key": "idempotency-v2",
        "cancellation_id": "cancel-v2",
        "cancel_token": "cancel-token-v2",
        "issued_at": 900,
        "expires_at": 2_000,
        "sequence": 1,
        "payload": {
            "method": "camera.capture",
            "params": {
                "device_id": "camera-a",
                "capture_timeout_ms": 1_000
            }
        },
        "authorization": {
            "schema_version": 1,
            "authorization_id": "authorization-v2",
            "issuer": "issuer-v2",
            "key_id": "key-v2",
            "audience": "yeonjang-v2",
            "scope": "effect.execute",
            "method": "camera.capture",
            "resource": "camera",
            "requester_id": "requester-a",
            "command_id": "command-v2",
            "operation_id": "operation-v2",
            "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint":
                "sha256:3434343434343434343434343434343434343434343434343434343434343434",
            "idempotency_key": "idempotency-v2",
            "cancellation_id": "cancel-v2",
            "cancel_token": "cancel-token-v2",
            "expires_at": 2_000,
            "nonce": "nonce-v2",
            "signature": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
    })
}
