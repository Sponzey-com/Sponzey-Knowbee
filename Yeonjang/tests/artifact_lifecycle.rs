use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactCleanupStatus, ArtifactEvent, ArtifactFailureReason,
    ArtifactLifecycle, ArtifactLifecycleState, ArtifactTransition, ArtifactTransitionReject,
    apply_artifact_event,
};

#[test]
fn exact_owner_fetch_publish_and_ack_reaches_one_terminal_state() {
    let lifecycle = ArtifactLifecycle::new(binding()).expect("lifecycle");
    let lifecycle = applied(apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::BeginFetch {
            requester_id: "requester-a".to_string(),
            request_id: "request-a".to_string(),
            operation_id: "operation-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count: 3,
            now_ms: 2_000,
        },
    ));
    assert!(matches!(
        lifecycle.state(),
        ArtifactLifecycleState::Fetching {
            transfer_id,
            chunk_count: 3,
            ..
        } if transfer_id == "transfer-a"
    ));
    let lifecycle = applied(apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::ChunksPublished {
            transfer_id: "transfer-a".to_string(),
            chunk_count: 3,
            now_ms: 2_100,
        },
    ));
    let lifecycle = applied(apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::Acknowledge {
            requester_id: "requester-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            full_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            now_ms: 2_200,
        },
    ));
    assert_eq!(lifecycle.revision(), 3);
    assert!(matches!(
        lifecycle.state(),
        ArtifactLifecycleState::Acknowledged { transfer_id, .. }
            if transfer_id == "transfer-a"
    ));
}

#[test]
fn wrong_owner_transfer_digest_expiry_and_terminal_mutation_are_rejected() {
    let lifecycle = ArtifactLifecycle::new(binding()).expect("lifecycle");
    for event in [
        ArtifactEvent::BeginFetch {
            requester_id: "requester-b".to_string(),
            request_id: "request-a".to_string(),
            operation_id: "operation-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count: 1,
            now_ms: 2_000,
        },
        ArtifactEvent::BeginFetch {
            requester_id: "requester-a".to_string(),
            request_id: "wrong-request".to_string(),
            operation_id: "operation-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count: 1,
            now_ms: 2_000,
        },
    ] {
        assert_eq!(
            apply_artifact_event(&lifecycle, &event),
            ArtifactTransition::Rejected {
                reason: ArtifactTransitionReject::WrongOwner
            }
        );
    }

    let expired = applied(apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::Expire { now_ms: 601_000 },
    ));
    assert!(matches!(
        expired.state(),
        ArtifactLifecycleState::Expired { .. }
    ));
    assert_eq!(
        apply_artifact_event(
            &expired,
            &ArtifactEvent::BeginFetch {
                requester_id: "requester-a".to_string(),
                request_id: "request-a".to_string(),
                operation_id: "operation-a".to_string(),
                transfer_id: "late-transfer".to_string(),
                chunk_count: 1,
                now_ms: 601_001,
            },
        ),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::TerminalState
        }
    );
}

#[test]
fn identical_fetch_and_ack_duplicates_are_idempotent_but_mismatch_is_not() {
    let initial = ArtifactLifecycle::new(binding()).expect("lifecycle");
    let fetch = ArtifactEvent::BeginFetch {
        requester_id: "requester-a".to_string(),
        request_id: "request-a".to_string(),
        operation_id: "operation-a".to_string(),
        transfer_id: "transfer-a".to_string(),
        chunk_count: 2,
        now_ms: 2_000,
    };
    let fetching = applied(apply_artifact_event(&initial, &fetch));
    assert_eq!(
        apply_artifact_event(&fetching, &fetch),
        ArtifactTransition::Idempotent {
            revision: fetching.revision()
        }
    );
    assert_eq!(
        apply_artifact_event(
            &fetching,
            &ArtifactEvent::ChunksPublished {
                transfer_id: "wrong-transfer".to_string(),
                chunk_count: 2,
                now_ms: 2_100,
            },
        ),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::WrongTransfer
        }
    );
    let awaiting = applied(apply_artifact_event(
        &fetching,
        &ArtifactEvent::ChunksPublished {
            transfer_id: "transfer-a".to_string(),
            chunk_count: 2,
            now_ms: 2_100,
        },
    ));
    let wrong_digest = ArtifactEvent::Acknowledge {
        requester_id: "requester-a".to_string(),
        transfer_id: "transfer-a".to_string(),
        full_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            .to_string(),
        now_ms: 2_200,
    };
    assert_eq!(
        apply_artifact_event(&awaiting, &wrong_digest),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::DigestMismatch
        }
    );
    let ack = ArtifactEvent::Acknowledge {
        requester_id: "requester-a".to_string(),
        transfer_id: "transfer-a".to_string(),
        full_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            .to_string(),
        now_ms: 2_200,
    };
    let acknowledged = applied(apply_artifact_event(&awaiting, &ack));
    assert_eq!(
        apply_artifact_event(&acknowledged, &ack),
        ArtifactTransition::Idempotent {
            revision: acknowledged.revision()
        }
    );
}

#[test]
fn early_expiry_cancel_and_failed_transfer_have_closed_terminal_guards() {
    let initial = ArtifactLifecycle::new(binding()).expect("lifecycle");
    assert_eq!(
        apply_artifact_event(&initial, &ArtifactEvent::Expire { now_ms: 600_999 }),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::NotExpired
        }
    );
    assert_eq!(
        apply_artifact_event(
            &initial,
            &ArtifactEvent::Cancel {
                requester_id: "requester-b".to_string(),
                transfer_id: "transfer-a".to_string(),
                now_ms: 2_000,
            },
        ),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::WrongOwner
        }
    );
    let fetching = applied(apply_artifact_event(
        &initial,
        &ArtifactEvent::BeginFetch {
            requester_id: "requester-a".to_string(),
            request_id: "request-a".to_string(),
            operation_id: "operation-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count: 1,
            now_ms: 2_000,
        },
    ));
    let cancelled = applied(apply_artifact_event(
        &fetching,
        &ArtifactEvent::Cancel {
            requester_id: "requester-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            now_ms: 2_100,
        },
    ));
    assert!(matches!(
        cancelled.state(),
        ArtifactLifecycleState::Cancelled {
            transfer_id: Some(transfer_id),
            ..
        } if transfer_id == "transfer-a"
    ));
    assert_eq!(
        apply_artifact_event(
            &cancelled,
            &ArtifactEvent::Cancel {
                requester_id: "requester-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                now_ms: 2_200,
            },
        ),
        ArtifactTransition::Idempotent {
            revision: cancelled.revision()
        }
    );
    assert_eq!(
        apply_artifact_event(
            &cancelled,
            &ArtifactEvent::Cancel {
                requester_id: "requester-a".to_string(),
                transfer_id: "transfer-b".to_string(),
                now_ms: 2_200,
            },
        ),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::WrongTransfer
        }
    );
    assert_eq!(
        apply_artifact_event(
            &cancelled,
            &ArtifactEvent::Fail {
                transfer_id: None,
                reason: ArtifactFailureReason::CleanupFailed,
                now_ms: 2_100,
            },
        ),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::TerminalState
        }
    );

    let failed = applied(apply_artifact_event(
        &initial,
        &ArtifactEvent::Fail {
            transfer_id: None,
            reason: ArtifactFailureReason::SourceUnavailable,
            now_ms: 2_000,
        },
    ));
    assert!(matches!(
        failed.state(),
        ArtifactLifecycleState::Failed {
            reason: ArtifactFailureReason::SourceUnavailable,
            ..
        }
    ));
}

#[test]
fn terminal_cleanup_is_pending_until_durable_completion_and_duplicate_is_idempotent() {
    let initial = ArtifactLifecycle::new(binding()).expect("lifecycle");
    let expired = applied(apply_artifact_event(
        &initial,
        &ArtifactEvent::Expire { now_ms: 601_000 },
    ));
    assert_eq!(expired.cleanup_status(), ArtifactCleanupStatus::Pending);
    let cleaned = applied(apply_artifact_event(
        &expired,
        &ArtifactEvent::CleanupCompleted { now_ms: 601_100 },
    ));
    assert_eq!(
        cleaned.cleanup_status(),
        ArtifactCleanupStatus::Completed {
            completed_at_ms: 601_100
        }
    );
    assert_eq!(
        apply_artifact_event(
            &cleaned,
            &ArtifactEvent::CleanupCompleted { now_ms: 601_100 }
        ),
        ArtifactTransition::Idempotent {
            revision: cleaned.revision()
        }
    );
    assert_eq!(
        apply_artifact_event(&initial, &ArtifactEvent::CleanupCompleted { now_ms: 2_000 }),
        ArtifactTransition::Rejected {
            reason: ArtifactTransitionReject::InvalidState
        }
    );
}

fn binding() -> ArtifactBinding {
    ArtifactBinding::new(
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "requester-a",
        "request-a",
        "operation-a",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        1024,
        1_000,
        601_000,
    )
    .expect("binding")
}

fn applied(transition: ArtifactTransition) -> ArtifactLifecycle {
    let ArtifactTransition::Applied { lifecycle, .. } = transition else {
        panic!("expected applied transition")
    };
    lifecycle
}
