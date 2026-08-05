use std::sync::{Arc, Mutex};

use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::mqtt_v2_policy_admin_adapter::{
    MqttV2InboundPolicyAdmin, MqttV2PolicyAdminAdapter, MqttV2PolicyAdminAdapterResult,
    MqttV2PolicyAdminRejection,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::policy_admin::{
    PolicyAdminAuthorizationDecision, PolicyAdminAuthorizationGrant,
    PolicyAdminAuthorizationVerifier, PolicyAdminUseCase,
};
use knowbee_yeonjang::policy_repository::DurablePermissionPolicyRepository;
use knowbee_yeonjang::protocol_v2_policy_admin::V2PolicyAdminSignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use serde_json::{Value, json};

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

struct Accept;
impl V2PolicyAdminSignatureVerifier for Accept {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
impl PolicyAdminAuthorizationVerifier for Accept {
    fn verify(&self, _: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision {
        PolicyAdminAuthorizationDecision::Authorized
    }
}
impl V2ResponseSigner for Accept {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("a".repeat(64))
    }
}

#[test]
fn valid_admin_apply_then_redelivery_returns_signed_applied_and_replayed_results() {
    let adapter = adapter();
    let first = adapter.process(inbound(false), 1_000, signing("result-admin-1"));
    let second = adapter.process(inbound(false), 1_001, signing("result-admin-2"));

    let (first, first_refresh) = published_json(first);
    let (second, second_refresh) = published_json(second);
    assert_eq!(first["schema_id"], "yeonjang.policy-admin-result.v2");
    assert_eq!(first["payload"]["outcome"], "applied");
    assert_eq!(first["payload"]["revision"], 1);
    assert_eq!(second["payload"]["outcome"], "authorization_rejected");
    assert_eq!(second["payload"]["reason_code"], "replayed");
    assert!(first_refresh);
    assert!(!second_refresh);
}

#[test]
fn retained_admin_is_rejected_before_policy_state_or_response_publish() {
    let adapter = adapter();
    assert_eq!(
        adapter.process(inbound(true), 1_000, signing("result-retained")),
        MqttV2PolicyAdminAdapterResult::Rejected(MqttV2PolicyAdminRejection::RetainedMessage)
    );
}

fn adapter() -> MqttV2PolicyAdminAdapter {
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            16,
            Arc::new(MemoryStorage::default()),
        )
        .expect("repository"),
    );
    MqttV2PolicyAdminAdapter::new(
        topics(),
        Arc::new(Accept),
        PolicyAdminUseCase::new(Arc::new(Accept), repository),
        Arc::new(Accept),
    )
}

fn published_json(result: MqttV2PolicyAdminAdapterResult) -> (Value, bool) {
    let MqttV2PolicyAdminAdapterResult::Publish {
        response,
        refresh_capabilities,
    } = result
    else {
        panic!("publish")
    };
    assert_eq!(response.topic, topics().response());
    assert!(!response.retained);
    assert!(response.delivery_receipt.is_none());
    (
        serde_json::from_slice(&response.payload).expect("response json"),
        refresh_capabilities,
    )
}

fn inbound(retained: bool) -> MqttV2InboundPolicyAdmin {
    MqttV2InboundPolicyAdmin {
        topic: topics().admin(),
        payload: serde_json::to_vec(&fixture()).expect("json"),
        retained,
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn signing(message_id: &str) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: message_id.to_string(),
        issuer: "yeonjang".to_string(),
        key_id: "key-v2".to_string(),
        audience: "requester-a".to_string(),
        issued_at: 1_000,
        expires_at: 2_000,
        nonce: format!("nonce-{message_id}"),
    }
}

fn fixture() -> Value {
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
        "payload": {
            "admin": "policy.update",
            "params": {
                "expected_revision": 0,
                "capability": "camera.capture",
                "decision": "allowed",
                "resource": {"kind": "any"},
                "reason": "enable camera"
            }
        },
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
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
    })
}
