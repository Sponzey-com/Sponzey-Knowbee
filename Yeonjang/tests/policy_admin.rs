use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use knowbee_yeonjang::policy_admin::{
    PolicyAdminActionBinding, PolicyAdminAuthorizationDecision, PolicyAdminAuthorizationGrant,
    PolicyAdminAuthorizationRejection, PolicyAdminAuthorizationScope,
    PolicyAdminAuthorizationVerifier, PolicyAdminResult, PolicyAdminUseCase, PolicyRollbackCommand,
};
use knowbee_yeonjang::policy_repository::{
    PermissionPolicyAdminWriter, PolicyAdminAuditEvidence, PolicyAdminWriteResult,
    PolicyRepositoryResult,
};

const FINGERPRINT: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

struct FixedVerifier(Mutex<PolicyAdminAuthorizationDecision>);

impl FixedVerifier {
    fn new(decision: PolicyAdminAuthorizationDecision) -> Self {
        Self(Mutex::new(decision))
    }
}

impl PolicyAdminAuthorizationVerifier for FixedVerifier {
    fn verify(&self, _grant: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision {
        *self.0.lock().expect("verifier")
    }
}

#[derive(Default)]
struct CountingWriter {
    updates: AtomicUsize,
    rollbacks: AtomicUsize,
}

impl PermissionPolicyAdminWriter for CountingWriter {
    fn update_admin(
        &self,
        command: &PolicyUpdateCommand,
        _evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        self.updates.fetch_add(1, Ordering::SeqCst);
        PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Applied {
            revision: command.expected_revision() + 1,
        })
    }

    fn rollback_admin(
        &self,
        expected_current_revision: u64,
        _restore_revision: u64,
        _evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        self.rollbacks.fetch_add(1, Ordering::SeqCst);
        PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Applied {
            revision: expected_current_revision + 1,
        })
    }
}

fn update() -> PolicyUpdateCommand {
    PolicyUpdateCommand::new(
        "instance-a",
        4,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command")
}

fn grant(
    scope: PolicyAdminAuthorizationScope,
    action: PolicyAdminActionBinding,
    target_instance_id: &str,
) -> PolicyAdminAuthorizationGrant {
    PolicyAdminAuthorizationGrant::new(
        scope,
        "auth-admin-1",
        "requester-a",
        target_instance_id,
        "session-a",
        FINGERPRINT,
        "nonce-admin-1",
        20_000,
        action,
    )
    .expect("grant")
}

#[test]
fn effect_execute_grant_cannot_call_the_policy_writer() {
    let writer = Arc::new(CountingWriter::default());
    let use_case = PolicyAdminUseCase::new(
        Arc::new(FixedVerifier::new(
            PolicyAdminAuthorizationDecision::Authorized,
        )),
        writer.clone(),
    );
    let command = update();
    let effect_grant = grant(
        PolicyAdminAuthorizationScope::EffectExecute,
        PolicyAdminActionBinding::from_update(&command),
        "instance-a",
    );

    assert_eq!(
        use_case.update(&command, &effect_grant),
        PolicyAdminResult::AuthorizationRejected(PolicyAdminAuthorizationRejection::ScopeMismatch)
    );
    assert_eq!(writer.updates.load(Ordering::SeqCst), 0);
}

#[test]
fn exact_admin_policy_write_grant_calls_the_writer_once() {
    let writer = Arc::new(CountingWriter::default());
    let use_case = PolicyAdminUseCase::new(
        Arc::new(FixedVerifier::new(
            PolicyAdminAuthorizationDecision::Authorized,
        )),
        writer.clone(),
    );
    let command = update();
    let admin_grant = grant(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        PolicyAdminActionBinding::from_update(&command),
        "instance-a",
    );

    assert_eq!(
        use_case.update(&command, &admin_grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 5 })
    );
    assert_eq!(writer.updates.load(Ordering::SeqCst), 1);
}

#[test]
fn wrong_target_or_action_binding_never_reaches_verifier_or_writer() {
    let writer = Arc::new(CountingWriter::default());
    let use_case = PolicyAdminUseCase::new(
        Arc::new(FixedVerifier::new(
            PolicyAdminAuthorizationDecision::Authorized,
        )),
        writer.clone(),
    );
    let command = update();
    let wrong_target = grant(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        PolicyAdminActionBinding::from_update(&command),
        "instance-b",
    );
    let wrong_action = grant(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        PolicyAdminActionBinding::Rollback {
            expected_current_revision: 4,
            restore_revision: 0,
        },
        "instance-a",
    );

    assert!(matches!(
        use_case.update(&command, &wrong_target),
        PolicyAdminResult::AuthorizationRejected(
            PolicyAdminAuthorizationRejection::BindingMismatch
        )
    ));
    assert!(matches!(
        use_case.update(&command, &wrong_action),
        PolicyAdminResult::AuthorizationRejected(
            PolicyAdminAuthorizationRejection::BindingMismatch
        )
    ));
    assert_eq!(writer.updates.load(Ordering::SeqCst), 0);
}

#[test]
fn expired_replayed_or_unavailable_verification_has_writer_effect_zero() {
    for rejection in [
        PolicyAdminAuthorizationRejection::Expired,
        PolicyAdminAuthorizationRejection::Replayed,
        PolicyAdminAuthorizationRejection::VerifierUnavailable,
    ] {
        let writer = Arc::new(CountingWriter::default());
        let use_case = PolicyAdminUseCase::new(
            Arc::new(FixedVerifier::new(
                PolicyAdminAuthorizationDecision::Rejected(rejection),
            )),
            writer.clone(),
        );
        let command = update();
        let admin_grant = grant(
            PolicyAdminAuthorizationScope::AdminPolicyWrite,
            PolicyAdminActionBinding::from_update(&command),
            "instance-a",
        );

        assert_eq!(
            use_case.update(&command, &admin_grant),
            PolicyAdminResult::AuthorizationRejected(rejection)
        );
        assert_eq!(writer.updates.load(Ordering::SeqCst), 0);
    }
}

#[test]
fn update_grant_cannot_authorize_rollback_and_exact_rollback_is_distinct() {
    let writer = Arc::new(CountingWriter::default());
    let use_case = PolicyAdminUseCase::new(
        Arc::new(FixedVerifier::new(
            PolicyAdminAuthorizationDecision::Authorized,
        )),
        writer.clone(),
    );
    let update = update();
    let rollback = PolicyRollbackCommand::new("instance-a", 4, 1).expect("rollback");
    let update_grant = grant(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        PolicyAdminActionBinding::from_update(&update),
        "instance-a",
    );
    assert!(matches!(
        use_case.rollback(&rollback, &update_grant),
        PolicyAdminResult::AuthorizationRejected(
            PolicyAdminAuthorizationRejection::BindingMismatch
        )
    ));

    let rollback_grant = grant(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        PolicyAdminActionBinding::from_rollback(&rollback),
        "instance-a",
    );
    assert_eq!(
        use_case.rollback(&rollback, &rollback_grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 5 })
    );
    assert_eq!(writer.rollbacks.load(Ordering::SeqCst), 1);
}
