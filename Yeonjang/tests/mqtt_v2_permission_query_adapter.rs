use std::sync::Arc;

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::capability_permission::{
    CaptureCapabilityAvailability, CapturePermissionObservations,
};
use knowbee_yeonjang::capture_permission_read::{
    CapturePermissionObservationPort, CapturePermissionObservationRead, CapturePermissionReadOwner,
    CapturePermissionReadUseCase,
};
use knowbee_yeonjang::mqtt_v2_permission_query_adapter::{
    MqttV2CapturePermissionAdapter, MqttV2CapturePermissionAdapterResult,
    MqttV2InboundCapturePermissionQuery,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::PermissionPolicySnapshot;
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use knowbee_yeonjang::protocol_v2_permission_query::V2CapturePermissionQuerySignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use serde_json::{Value, json};

const NOW_MS: i64 = 10_000;

#[test]
fn exact_query_publishes_signed_separate_policy_and_os_rows_and_replays_safely() {
    let adapter = adapter(
        Arc::new(PolicyFixture::Snapshot(
            PermissionPolicySnapshot::new("instance-a").expect("policy"),
        )),
        Arc::new(ObservationFixture::Snapshot),
    );
    let inbound = inbound(query_fixture());
    for expected in ["available", "available"] {
        let MqttV2CapturePermissionAdapterResult::Publish(publish) =
            adapter.process(inbound.clone(), NOW_MS, signing_context())
        else {
            panic!("signed permission response")
        };
        assert_eq!(publish.topic, topics().response());
        let value: Value = serde_json::from_slice(&publish.payload).expect("response JSON");
        assert_eq!(
            value["schema_id"],
            "yeonjang.capture-permission-response.v2"
        );
        assert_eq!(value["request_id"], "permission-request");
        assert_eq!(value["payload"]["outcome"], expected);
        assert_eq!(value["payload"]["policyRevision"], 0);
        assert_eq!(
            value["payload"]["permissions"][0]["method"],
            "camera.capture"
        );
        assert_eq!(value["payload"]["permissions"][0]["localPolicy"], "denied");
        assert_eq!(
            value["payload"]["permissions"][0]["osPermission"],
            "granted"
        );
        assert_eq!(value["authorization"]["scope"], "response.publish");
        assert_eq!(value["authorization"]["signature"], "cd".repeat(32));
    }
}

#[test]
fn observation_failure_is_signed_without_success_rows_and_bad_scope_is_rejected() {
    let adapter = adapter(
        Arc::new(PolicyFixture::Snapshot(
            PermissionPolicySnapshot::new("instance-a").expect("policy"),
        )),
        Arc::new(ObservationFixture::Unavailable),
    );
    let MqttV2CapturePermissionAdapterResult::Publish(publish) =
        adapter.process(inbound(query_fixture()), NOW_MS, signing_context())
    else {
        panic!("typed unavailable response")
    };
    let value: Value = serde_json::from_slice(&publish.payload).expect("response JSON");
    assert_eq!(value["payload"]["outcome"], "observation_unavailable");
    assert!(value["payload"].get("permissions").is_none());
    assert!(value["payload"].get("policyRevision").is_none());

    let mut wrong_scope = query_fixture();
    wrong_scope["authorization"]["scope"] = json!("effect.execute");
    assert!(matches!(
        adapter.process(inbound(wrong_scope), NOW_MS, signing_context()),
        MqttV2CapturePermissionAdapterResult::Rejected(_)
    ));
}

fn adapter(
    policy: Arc<dyn PermissionPolicyReader>,
    observation: Arc<dyn CapturePermissionObservationPort>,
) -> MqttV2CapturePermissionAdapter {
    MqttV2CapturePermissionAdapter::new(
        topics(),
        Arc::new(AcceptSignature),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("guard")),
        CapturePermissionReadUseCase::new(
            CapturePermissionReadOwner::new("instance-a", "session-a", digest('a')).expect("owner"),
            policy,
            observation,
        ),
        Arc::new(ResponseSigner),
    )
}

fn inbound(value: Value) -> MqttV2InboundCapturePermissionQuery {
    MqttV2InboundCapturePermissionQuery {
        topic: topics().control(),
        payload: serde_json::to_vec(&value).expect("query JSON"),
        retained: false,
    }
}

enum PolicyFixture {
    Snapshot(PermissionPolicySnapshot),
}

impl PermissionPolicyReader for PolicyFixture {
    fn snapshot(&self) -> PolicySnapshotRead {
        match self {
            Self::Snapshot(snapshot) => PolicySnapshotRead::Snapshot(snapshot.clone()),
        }
    }
}

enum ObservationFixture {
    Snapshot,
    Unavailable,
}

impl CapturePermissionObservationPort for ObservationFixture {
    fn observe(&self) -> CapturePermissionObservationRead {
        match self {
            Self::Snapshot => CapturePermissionObservationRead::Snapshot {
                availability: CaptureCapabilityAvailability {
                    camera: true,
                    screen: true,
                },
                observations: CapturePermissionObservations {
                    camera: Some(PreflightPermissionState::Granted),
                    screen: Some(PreflightPermissionState::Denied),
                },
            },
            Self::Unavailable => CapturePermissionObservationRead::Unavailable,
        }
    }
}

struct AcceptSignature;

impl V2CapturePermissionQuerySignatureVerifier for AcceptSignature {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct ResponseSigner;

impl V2ResponseSigner for ResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("cd".repeat(32))
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn signing_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "permission-response-message".to_string(),
        issued_at: NOW_MS,
        expires_at: 20_000,
        issuer: "instance-a".to_string(),
        key_id: "instance-hmac-v2".to_string(),
        audience: "requester-a".to_string(),
        nonce: "permission-response-nonce".to_string(),
    }
}

fn query_fixture() -> Value {
    json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "permission-message",
        "request_id": "permission-request", "command_id": "permission-command",
        "operation_id": "permission-operation", "correlation_id": "permission-correlation",
        "causation_id": "permission-causation", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": digest('a'), "idempotency_key": "permission-idempotency",
        "issued_at": 9_000, "expires_at": 11_000, "sequence": 1,
        "payload": {"control": "capture.permission.get", "params": {}},
        "authorization": {
            "schema_version": 1, "authorization_id": "permission-authorization",
            "issuer": "requester-a", "key_id": "requester-hmac-v2",
            "audience": "instance-a", "scope": "permission.read",
            "requester_id": "requester-a", "command_id": "permission-command",
            "operation_id": "permission-operation", "target_instance_id": "instance-a",
            "target_session_id": "session-a", "target_fingerprint": digest('a'),
            "idempotency_key": "permission-idempotency", "expires_at": 11_000,
            "nonce": "permission-nonce", "signature": "ab".repeat(32)
        }
    })
}

fn digest(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}
