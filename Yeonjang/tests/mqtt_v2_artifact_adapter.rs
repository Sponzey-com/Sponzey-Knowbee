#![recursion_limit = "256"]

use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_lifecycle::{ArtifactBinding, ArtifactLifecycleState};
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleRead, ArtifactRepositoryResult, DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::artifact_transfer::decode_artifact_chunk_frame;
use knowbee_yeonjang::artifact_transfer_use_case::{
    ArtifactAckResult, ArtifactCancelResult, ArtifactPublishFailureResult, ArtifactPublishResult,
    ArtifactTransferReject, ArtifactTransferUseCase, VerifiedArtifactBytes, VerifiedArtifactSource,
    VerifiedArtifactSourceError,
};
use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::capture_artifact_postcheck::CaptureArtifactKind;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::mqtt_v2_artifact_adapter::{
    ArtifactPublicationCompletionResult, MqttV2ArtifactAdapter, MqttV2ArtifactAdapterResult,
    MqttV2InboundArtifactControl,
};
use knowbee_yeonjang::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use knowbee_yeonjang::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use serde_json::{Value, json};

const NOW_MS: i64 = 2_000;

#[test]
fn fetch_publishes_exact_chunk_and_records_awaiting_ack_only_after_enqueue_completion() {
    let fixture = Fixture::new();
    let adapter = fixture.adapter();
    let result = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: serde_json::to_vec(&fixture.fetch_envelope()).expect("fetch JSON"),
            retained: false,
        },
        NOW_MS,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::Prepared {
        publishes,
        completion,
    } = result
    else {
        panic!("prepared")
    };
    assert_eq!(publishes.len(), 1);
    assert_eq!(
        publishes[0].topic,
        fixture
            .topics
            .artifact_chunk("transfer-a")
            .expect("chunk topic")
    );
    assert_eq!(publishes[0].qos, MqttQos::AtLeastOnce);
    assert!(!publishes[0].retained);
    let chunk = decode_artifact_chunk_frame(&publishes[0].payload).expect("chunk");
    assert_eq!(
        chunk.header().artifact_ref(),
        fixture.binding.artifact_ref()
    );
    assert!(matches!(
        fixture.repository.read(fixture.binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Fetching { .. })
    ));

    assert_eq!(
        adapter.complete_publication(completion, true, NOW_MS + 1),
        ArtifactPublicationCompletionResult::Published(
            ArtifactPublishResult::AwaitingAcknowledgement {
                lifecycle_revision: 2
            }
        )
    );
}

#[test]
fn exact_signed_ack_is_the_only_path_to_cleanup_required() {
    let fixture = Fixture::new();
    let adapter = fixture.adapter();
    let MqttV2ArtifactAdapterResult::Prepared {
        publishes,
        completion,
    } = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: serde_json::to_vec(&fixture.fetch_envelope()).expect("fetch JSON"),
            retained: false,
        },
        NOW_MS,
        response_context(),
    )
    else {
        panic!("prepared")
    };
    assert_eq!(publishes.len(), 1);
    assert!(matches!(
        adapter.complete_publication(completion, true, NOW_MS + 1),
        ArtifactPublicationCompletionResult::Published(
            ArtifactPublishResult::AwaitingAcknowledgement { .. }
        )
    ));

    let result = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture
                .topics
                .artifact_ack("transfer-a")
                .expect("ack topic"),
            payload: serde_json::to_vec(&fixture.ack_envelope()).expect("ack JSON"),
            retained: false,
        },
        NOW_MS + 2,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::Acknowledged {
        result: ArtifactAckResult::CleanupRequired {
            lifecycle_revision: 3,
        },
        cleanup: Some(cleanup),
    } = result
    else {
        panic!("cleanup required")
    };
    assert_eq!(cleanup.artifact_ref(), fixture.binding.artifact_ref());
    assert_eq!(cleanup.transfer_id(), "transfer-a");
    assert_eq!(cleanup.lifecycle_revision(), 3);
    assert_eq!(cleanup.acknowledged_at_ms(), NOW_MS + 2);
}

#[test]
fn exact_cancel_and_its_replay_publish_distinct_closed_acknowledgements() {
    let fixture = Fixture::new();
    let adapter = fixture.adapter();
    assert!(matches!(
        adapter.process(
            MqttV2InboundArtifactControl {
                topic: fixture.topics.control(),
                payload: serde_json::to_vec(&fixture.fetch_envelope()).expect("fetch JSON"),
                retained: false,
            },
            NOW_MS,
            response_context(),
        ),
        MqttV2ArtifactAdapterResult::Prepared { .. }
    ));

    let cancel =
        serde_json::to_vec(&fixture.cancel_envelope("cancel", "transfer-a")).expect("cancel JSON");
    let first = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: cancel.clone(),
            retained: false,
        },
        NOW_MS + 1,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::Cancelled {
        result: ArtifactCancelResult::Cancelled { .. },
        response,
        ..
    } = first
    else {
        panic!("fresh cancel acknowledgement")
    };
    let first_json: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(first_json["payload"]["outcome"], "cancelled");

    let replay = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: cancel,
            retained: false,
        },
        NOW_MS + 2,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::Cancelled {
        result: ArtifactCancelResult::AlreadyCancelled { .. },
        response,
        ..
    } = replay
    else {
        panic!("replayed cancel acknowledgement")
    };
    let replay_json: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(replay_json["payload"]["outcome"], "already_cancelled");

    let rejected = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: serde_json::to_vec(&fixture.cancel_envelope("cancel-wrong", "transfer-b"))
                .expect("wrong cancel JSON"),
            retained: false,
        },
        NOW_MS + 3,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::Cancelled {
        result:
            ArtifactCancelResult::Rejected {
                reason: ArtifactTransferReject::WrongTransfer,
            },
        response,
        ..
    } = rejected
    else {
        panic!("rejected cancel acknowledgement")
    };
    let rejected_json: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(rejected_json["payload"]["outcome"], "rejected");
    assert_eq!(rejected_json["payload"]["reason"], "wrong_transfer");
}

#[test]
fn partial_publish_failure_is_durable_and_invalid_scope_never_starts_fetch() {
    let fixture = Fixture::new();
    let adapter = fixture.adapter();
    let MqttV2ArtifactAdapterResult::Prepared { completion, .. } = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: serde_json::to_vec(&fixture.fetch_envelope()).expect("fetch JSON"),
            retained: false,
        },
        NOW_MS,
        response_context(),
    ) else {
        panic!("prepared")
    };
    assert_eq!(
        adapter.complete_publication(completion, false, NOW_MS + 1),
        ArtifactPublicationCompletionResult::Failed(ArtifactPublishFailureResult::Failed {
            lifecycle_revision: 2
        })
    );
    assert!(matches!(
        fixture.repository.read(fixture.binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Failed { .. })
    ));

    let invalid = Fixture::new();
    let invalid_adapter = invalid.adapter();
    let mut wrong_scope = invalid.fetch_envelope();
    wrong_scope["authorization"]["scope"] = json!("effect.execute");
    assert!(matches!(
        invalid_adapter.process(
            MqttV2InboundArtifactControl {
                topic: invalid.topics.control(),
                payload: serde_json::to_vec(&wrong_scope).expect("wrong scope"),
                retained: false,
            },
            NOW_MS,
            response_context(),
        ),
        MqttV2ArtifactAdapterResult::Rejected(_)
    ));
    assert!(matches!(
        invalid.repository.read(invalid.binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Registered)
    ));
}

#[test]
fn admitted_fetch_rejection_returns_one_signed_typed_response() {
    let fixture = Fixture::new();
    let adapter = fixture.adapter();
    let mut revision_conflict = fixture.fetch_envelope();
    revision_conflict["payload"]["params"]["expected_revision"] = json!(1);
    revision_conflict["authorization"]["expected_revision"] = json!(1);

    let result = adapter.process(
        MqttV2InboundArtifactControl {
            topic: fixture.topics.control(),
            payload: serde_json::to_vec(&revision_conflict).expect("revision conflict JSON"),
            retained: false,
        },
        NOW_MS,
        response_context(),
    );
    let MqttV2ArtifactAdapterResult::FetchRejected {
        reason: ArtifactTransferReject::RevisionConflict,
        response,
    } = result
    else {
        panic!("signed typed fetch rejection")
    };
    assert_eq!(response.topic, fixture.topics.response());
    assert_eq!(response.qos, MqttQos::AtLeastOnce);
    assert!(!response.retained);
    assert!(response.delivery_receipt.is_none());

    let payload: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(payload["protocol_version"], 2);
    assert_eq!(payload["schema_id"], "yeonjang.artifact-fetch-result.v2");
    assert_eq!(payload["message_kind"], "response");
    assert_eq!(payload["request_id"], "request-fetch");
    assert_eq!(payload["operation_id"], "operation-fetch");
    assert_eq!(
        payload["payload"]["artifact_ref"],
        fixture.binding.artifact_ref()
    );
    assert_eq!(payload["payload"]["owner_request_id"], "request-camera");
    assert_eq!(payload["payload"]["owner_operation_id"], "operation-camera");
    assert_eq!(payload["payload"]["transfer_id"], "transfer-a");
    assert_eq!(payload["payload"]["observed_revision"], 1);
    assert_eq!(payload["payload"]["outcome"], "rejected");
    assert_eq!(payload["payload"]["reason"], "revision_conflict");
    assert_eq!(payload["authorization"]["scope"], "response.publish");
    assert_eq!(payload["authorization"]["audience"], "brad");
    assert!(payload.get("bytes").is_none());
    assert!(payload.get("path").is_none());
}

struct Fixture {
    topics: MqttV2TopicSet,
    binding: ArtifactBinding,
    repository: Arc<DurableArtifactLifecycleRepository>,
    source: Arc<StaticSource>,
}

impl Fixture {
    fn new() -> Self {
        let topics = MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics");
        let bytes = camera_bytes();
        let verified = VerifiedArtifactBytes::new(
            "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            CaptureArtifactKind::CameraJpeg,
            bytes,
        )
        .expect("verified");
        let binding = ArtifactBinding::new(
            verified.artifact_ref(),
            "brad",
            "request-camera",
            "operation-camera",
            verified.metadata().sha256_digest(),
            verified.metadata().size_bytes(),
            1_000,
            601_000,
        )
        .expect("binding");
        let repository = Arc::new(
            DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
                .expect("repository"),
        );
        assert!(matches!(
            repository.register(binding.clone()),
            ArtifactRepositoryResult::Registered { .. }
        ));
        Self {
            topics,
            binding,
            repository,
            source: Arc::new(StaticSource { verified }),
        }
    }

    fn adapter(&self) -> MqttV2ArtifactAdapter {
        MqttV2ArtifactAdapter::new(
            self.topics.clone(),
            Arc::new(AcceptSignatures),
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("replay")),
            Arc::new(ArtifactTransferUseCase::new(
                self.repository.clone(),
                self.source.clone(),
            )),
            Arc::new(TestResponseSigner),
        )
    }

    fn fetch_envelope(&self) -> Value {
        self.envelope(
            "fetch",
            json!({
                "artifact": "artifact.fetch",
                "params": {
                    "artifact_ref": self.binding.artifact_ref(),
                    "owner_request_id": "request-camera",
                    "owner_operation_id": "operation-camera",
                    "expected_revision": 0,
                    "transfer_id": "transfer-a",
                    "chunk_payload_bytes": 262144
                }
            }),
            None,
            Some(262_144),
        )
    }

    fn ack_envelope(&self) -> Value {
        self.envelope(
            "ack",
            json!({
                "artifact": "artifact.ack",
                "params": {
                    "artifact_ref": self.binding.artifact_ref(),
                    "owner_request_id": "request-camera",
                    "owner_operation_id": "operation-camera",
                    "expected_revision": 2,
                    "transfer_id": "transfer-a",
                    "full_digest": self.binding.full_digest()
                }
            }),
            Some(self.binding.full_digest()),
            None,
        )
    }

    fn cancel_envelope(&self, variant: &str, transfer_id: &str) -> Value {
        let mut value = self.envelope(
            variant,
            json!({
                "artifact": "artifact.cancel",
                "params": {
                    "artifact_ref": self.binding.artifact_ref(),
                    "owner_request_id": "request-camera",
                    "owner_operation_id": "operation-camera",
                    "expected_revision": 1,
                    "transfer_id": transfer_id
                }
            }),
            None,
            None,
        );
        value["authorization"]["scope"] = json!("artifact.cancel");
        value["authorization"]["expected_revision"] = json!(1);
        value["authorization"]["transfer_id"] = json!(transfer_id);
        value
    }

    fn envelope(
        &self,
        variant: &str,
        payload: Value,
        full_digest: Option<&str>,
        chunk_payload_bytes: Option<u32>,
    ) -> Value {
        json!({
            "protocol_version": 2,
            "schema_id": "yeonjang.artifact-control.v2",
            "message_kind": "control",
            "message_id": format!("message-{variant}"),
            "request_id": format!("request-{variant}"),
            "command_id": format!("command-{variant}"),
            "operation_id": format!("operation-{variant}"),
            "correlation_id": "correlation-artifact",
            "causation_id": "message-camera",
            "requester_id": "brad",
            "target_instance_id": "yeonjang-main",
            "target_session_id": "session-main",
            "target_fingerprint":
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "idempotency_key": format!("idem-{variant}"),
            "issued_at": 1_900,
            "expires_at": 3_000,
            "sequence": 1,
            "payload": payload,
            "authorization": {
                "schema_version": 1,
                "authorization_id": format!("authorization-{variant}"),
                "issuer": "issuer-main",
                "key_id": "key-main",
                "audience": "yeonjang-main",
                "scope": "artifact.read",
                "requester_id": "brad",
                "command_id": format!("command-{variant}"),
                "operation_id": format!("operation-{variant}"),
                "target_instance_id": "yeonjang-main",
                "target_session_id": "session-main",
                "target_fingerprint":
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "idempotency_key": format!("idem-{variant}"),
                "artifact_ref": self.binding.artifact_ref(),
                "owner_request_id": "request-camera",
                "owner_operation_id": "operation-camera",
                "transfer_id": "transfer-a",
                "expected_revision": if full_digest.is_some() { 2 } else { 0 },
                "full_digest": full_digest,
                "chunk_payload_bytes": chunk_payload_bytes,
                "expires_at": 3_000,
                "nonce": format!("nonce-{variant}"),
                "signature": "c".repeat(64)
            }
        })
    }
}

struct StaticSource {
    verified: VerifiedArtifactBytes,
}

impl VerifiedArtifactSource for StaticSource {
    fn read_verified(&self, _: &str) -> Result<VerifiedArtifactBytes, VerifiedArtifactSourceError> {
        Ok(self.verified.clone())
    }
}

struct AcceptSignatures;

impl V2ArtifactSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct TestResponseSigner;

impl V2ResponseSigner for TestResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

fn response_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "artifact-response".to_string(),
        issued_at: 2_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: "brad".to_string(),
        nonce: "artifact-response-nonce".to_string(),
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

fn camera_bytes() -> Vec<u8> {
    vec![
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
        0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]
}
