import type { HarnessScopedApprovalDecision, HarnessEntryDecision } from "./harness-entry-approval-scope.js";
import type { HighRiskVerificationDecision } from "./high-risk-improvement-verification.js";
import type { HighRiskSourceEvidenceDecision } from "./high-risk-source-activation-evidence.js";
import type { CurrentHarnessControlDecision, HarnessPublicationDecision, HarnessStateMachineCompletenessDecision } from "./harness-publication-control.js";
import { type RequiredHarnessRegressionTestId } from "./recursive-prompt-improvement-gate.js";
import type { PromptChangeRollbackReadinessDecision } from "./prompt-change-rollback-readiness.js";
import type { ImprovementMutationDecision } from "../memory/improvement-mutation-boundary.js";
import type { HarnessApplicationAuthorizationDecision } from "../memory/harness-source-authorization.js";
export interface HarnessSelfImprovementReviewInput {
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    currentRuntimeSnapshotFingerprint: string;
    entry: HarnessEntryDecision;
    control: CurrentHarnessControlDecision;
    application: HarnessApplicationAuthorizationDecision;
    stateMachine: HarnessStateMachineCompletenessDecision;
    highRisk: HighRiskVerificationDecision;
    sourceEvidence: HighRiskSourceEvidenceDecision;
    applyApproval?: HarnessScopedApprovalDecision;
    mutations: ImprovementMutationDecision[];
    rollbackReadiness: PromptChangeRollbackReadinessDecision[];
}
export interface HarnessSelfImprovementReviewReceipt {
    schemaVersion: 1;
    stage: "apply_authorized";
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    currentRuntimeSnapshotFingerprint: string;
    sourceRefs: string[];
    fixedRisk: "high";
    entryRequestId: string;
    applyApprovalId: string;
    activeHarnessChecksum: string;
    rollbackSourceRefs: string[];
}
export type HarnessSelfImprovementReviewReasonCode = "runtime_snapshot_invalid" | "entry_unverified" | "current_harness_unverified" | "guardrail_review_unverified" | "state_machine_unverified" | "high_risk_review_unverified" | "source_evidence_unverified" | "apply_approval_missing" | "apply_approval_unverified" | "proposal_scope_mismatch" | "source_scope_mismatch" | "mutation_boundary_blocked" | "mutation_scope_mismatch" | "runtime_snapshot_mismatch" | "rollback_readiness_missing" | "rollback_readiness_unverified" | "rollback_scope_mismatch";
export type HarnessSelfImprovementReviewDecision = {
    status: "authorized";
    receipt: HarnessSelfImprovementReviewReceipt;
} | {
    status: "blocked";
    reasonCode: HarnessSelfImprovementReviewReasonCode;
};
export interface HarnessSourceWriteVerificationReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    sourceRefs: string[];
    appliedChecksum: string;
    writtenAt: number;
    verified: true;
}
export interface HarnessPostWriteRegressionReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    status: "passed" | "failed";
    requiredTestIds: RequiredHarnessRegressionTestId[];
    passedTestIds: RequiredHarnessRegressionTestId[];
    evidenceRef: string;
}
export interface HarnessSelfImprovementActivationReceipt {
    schemaVersion: 1;
    stage: "activation_authorized";
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    appliedChecksum: string;
    activationApprovalId: string;
    activationRunId: string;
    runtimeSnapshotFingerprint: string;
}
export type HarnessSelfImprovementActivationReasonCode = "review_unverified" | "source_write_unverified" | "post_write_scope_mismatch" | "post_write_regression_missing" | "post_write_regression_failed" | "post_write_regression_incomplete" | "activation_approval_unverified" | "activation_scope_mismatch" | "publication_unverified" | "current_runtime_activation_forbidden";
export type HarnessSelfImprovementActivationDecision = {
    status: "authorized";
    receipt: HarnessSelfImprovementActivationReceipt;
} | {
    status: "blocked";
    reasonCode: HarnessSelfImprovementActivationReasonCode;
};
export interface HarnessSelfImprovementFailureReceipt {
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    kind: "tests_failed_after_write" | "invariant_violation_after_apply" | "activation_verification_failed";
    evidenceRef: string;
}
export interface HarnessSelfImprovementRestorationReceipt {
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    restoredSourceRefs: string[];
    baselineRestored: boolean;
    verificationRef: string;
}
export type HarnessSelfImprovementFailureDecision = {
    status: "rollback_required";
    reasonCode: "post_write_failure" | "rollback_unverified";
    rollbackSourceRefs: string[];
} | {
    status: "rolled_back";
    proposalFingerprint: string;
    verificationRef: string;
} | {
    status: "blocked";
    reasonCode: "review_unverified" | "source_write_unverified" | "failure_scope_mismatch";
};
export declare function authorizeHarnessSelfImprovementReview(input: HarnessSelfImprovementReviewInput): HarnessSelfImprovementReviewDecision;
export declare function authorizeHarnessSelfImprovementActivation(input: {
    review: HarnessSelfImprovementReviewDecision;
    write: HarnessSourceWriteVerificationReceipt;
    regression?: HarnessPostWriteRegressionReceipt;
    activationApproval: HarnessScopedApprovalDecision;
    publication: HarnessPublicationDecision;
}): HarnessSelfImprovementActivationDecision;
export declare function decideHarnessSelfImprovementFailure(input: {
    review: HarnessSelfImprovementReviewDecision;
    write: HarnessSourceWriteVerificationReceipt;
    failure: HarnessSelfImprovementFailureReceipt;
    restoration?: HarnessSelfImprovementRestorationReceipt;
}): HarnessSelfImprovementFailureDecision;
export declare function executeAuthorizedHarnessSelfImprovement<T>(input: {
    decision: HarnessSelfImprovementReviewDecision;
    apply: (receipt: HarnessSelfImprovementReviewReceipt) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<HarnessSelfImprovementReviewDecision, {
    status: "blocked";
}>>;
export declare function publishAuthorizedHarnessSelfImprovement<T>(input: {
    decision: HarnessSelfImprovementActivationDecision;
    publish: (receipt: HarnessSelfImprovementActivationReceipt) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<HarnessSelfImprovementActivationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=harness-self-improvement-invariants.d.ts.map