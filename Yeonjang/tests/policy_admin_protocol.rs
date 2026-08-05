use hmac::{Hmac, Mac};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint,
};
use knowbee_yeonjang::policy_admin::{PolicyAdminAuthorizationScope, PolicyAdminRequest};
use knowbee_yeonjang::protocol_v2_policy_admin::{
    V2PolicyAdminAdmission, V2PolicyAdminAdmissionError, V2PolicyAdminParseError,
    V2PolicyAdminSignatureVerifier, parse_v2_policy_admin,
};
use serde_json::{Value, json};
use sha2::Sha256;

const SECRET: &[u8] = b"test-only-admin-signing-key";

#[test]
fn signed_update_converts_only_after_admission_to_exact_domain_command_and_admin_grant() {
    let signed = signed_fixture(update_fixture());
    let envelope = parse(&signed, false).expect("envelope");
    let admitted = V2PolicyAdminAdmission::new(&HmacVerifier)
        .admit(&envelope, 1_000)
        .expect("admitted");

    let PolicyAdminRequest::Update { command, grant } = admitted.into_request() else {
        panic!("update request")
    };
    assert_eq!(command.target_instance_id(), "instance-a");
    assert_eq!(command.expected_revision(), 4);
    assert_eq!(command.capability(), PolicyCapability::CameraCapture);
    assert_eq!(command.decision(), PolicyDecision::Allowed);
    assert_eq!(command.resource(), &PolicyResourceConstraint::Any);
    assert_eq!(
        grant.scope(),
        PolicyAdminAuthorizationScope::AdminPolicyWrite
    );
    assert_eq!(grant.requester_id(), "requester-a");
    assert_eq!(grant.nonce(), "nonce-admin");
}

#[test]
fn signed_rollback_is_a_distinct_action_and_preserves_exact_revisions() {
    let signed = signed_fixture(rollback_fixture());
    let envelope = parse(&signed, false).expect("envelope");
    let admitted = V2PolicyAdminAdmission::new(&HmacVerifier)
        .admit(&envelope, 1_000)
        .expect("admitted");

    let PolicyAdminRequest::Rollback { command, grant } = admitted.into_request() else {
        panic!("rollback request")
    };
    assert_eq!(command.target_instance_id(), "instance-a");
    assert_eq!(command.expected_current_revision(), 7);
    assert_eq!(command.restore_revision(), 2);
    assert_eq!(
        grant.scope(),
        PolicyAdminAuthorizationScope::AdminPolicyWrite
    );
}

#[test]
fn same_key_effect_scope_and_payload_tampering_cannot_authorize_policy_write() {
    let mut effect_scope = update_fixture();
    effect_scope["authorization"]["scope"] = json!("effect.execute");
    assert_eq!(
        parse(&effect_scope, false),
        Err(V2PolicyAdminParseError::AuthorizationMismatch)
    );

    let signed = signed_fixture(update_fixture());
    let mut tampered = signed.clone();
    tampered["payload"]["params"]["decision"] = json!("denied");
    let envelope = parse(&tampered, false).expect("structurally valid tamper");
    assert_eq!(
        V2PolicyAdminAdmission::new(&HmacVerifier).admit(&envelope, 1_000),
        Err(V2PolicyAdminAdmissionError::SignatureRejected)
    );
}

#[test]
fn retained_wrong_topic_target_expired_and_unknown_fields_are_closed_before_admission() {
    let fixture = update_fixture();
    assert_eq!(
        parse(&fixture, true),
        Err(V2PolicyAdminParseError::RetainedMessage)
    );
    assert_eq!(
        parse_v2_policy_admin(
            topics().control(),
            &serde_json::to_vec(&fixture).expect("json"),
            false,
            1_000,
            &topics(),
        ),
        Err(V2PolicyAdminParseError::TopicMismatch)
    );

    let mut wrong_target = fixture.clone();
    wrong_target["target_instance_id"] = json!("instance-b");
    wrong_target["authorization"]["target_instance_id"] = json!("instance-b");
    wrong_target["authorization"]["audience"] = json!("instance-b");
    assert_eq!(
        parse(&wrong_target, false),
        Err(V2PolicyAdminParseError::IdentityMismatch)
    );

    let mut expired = fixture.clone();
    expired["expires_at"] = json!(999);
    expired["authorization"]["expires_at"] = json!(999);
    assert_eq!(
        parse(&expired, false),
        Err(V2PolicyAdminParseError::Expired)
    );

    let mut unknown = fixture;
    unknown["payload"]["params"]["os_permission"] = json!("granted");
    assert_eq!(
        parse(&unknown, false),
        Err(V2PolicyAdminParseError::UnknownOrInvalidField)
    );
}

fn parse(
    value: &Value,
    retained: bool,
) -> Result<
    knowbee_yeonjang::protocol_v2_policy_admin::V2PolicyAdminEnvelope,
    V2PolicyAdminParseError,
> {
    parse_v2_policy_admin(
        topics().admin(),
        &serde_json::to_vec(value).expect("json"),
        retained,
        1_000,
        &topics(),
    )
}

fn signed_fixture(mut value: Value) -> Value {
    let unsigned = parse(&value, false).expect("unsigned envelope");
    value["authorization"]["signature"] = json!(sign(unsigned.authorization_signing_bytes()));
    value
}

fn sign(bytes: Vec<u8>) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(SECRET).expect("hmac");
    mac.update(&bytes);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

struct HmacVerifier;

impl V2PolicyAdminSignatureVerifier for HmacVerifier {
    fn verify(
        &self,
        _issuer: &str,
        _key_id: &str,
        signing_bytes: &[u8],
        signature_hex: &str,
    ) -> bool {
        sign(signing_bytes.to_vec()) == signature_hex
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn update_fixture() -> Value {
    base_fixture(json!({
        "admin": "policy.update",
        "params": {
            "expected_revision": 4,
            "capability": "camera.capture",
            "decision": "allowed",
            "resource": { "kind": "any" },
            "reason": "enable requested camera"
        }
    }))
}

fn rollback_fixture() -> Value {
    base_fixture(json!({
        "admin": "policy.rollback",
        "params": {
            "expected_current_revision": 7,
            "restore_revision": 2,
            "reason": "restore prior operator policy"
        }
    }))
}

fn base_fixture(payload: Value) -> Value {
    json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.admin.v2",
        "message_kind": "admin",
        "message_id": "message-admin",
        "request_id": "request-admin",
        "command_id": "command-admin",
        "operation_id": "operation-admin",
        "correlation_id": "correlation-admin",
        "causation_id": "causation-admin",
        "requester_id": "requester-a",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint":
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "idempotency_key": "idempotency-admin",
        "issued_at": 900,
        "expires_at": 2_000,
        "sequence": 1,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": "authorization-admin",
            "issuer": "issuer-v2",
            "key_id": "key-v2",
            "audience": "instance-a",
            "scope": "admin.policy.write",
            "requester_id": "requester-a",
            "command_id": "command-admin",
            "operation_id": "operation-admin",
            "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint":
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "idempotency_key": "idempotency-admin",
            "expires_at": 2_000,
            "nonce": "nonce-admin",
            "signature":
                "0000000000000000000000000000000000000000000000000000000000000000"
        }
    })
}
