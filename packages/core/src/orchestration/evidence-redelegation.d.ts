import type { SubAgentResultReview } from "../agent/sub-agent-result-review.js";
import type { StructuredTaskScope } from "../contracts/sub-agent-orchestration.js";
export type RedelegationReasonCode = "missing_evidence" | "low_quality" | "incomplete_scope" | "execution_failure" | "permission_boundary" | "user_goal_changed";
export interface ParentCorrectionPackage {
    reviewId: string;
    sourceResultReportId: string;
    verdict: Exclude<SubAgentResultReview["verdict"], "accept">;
    missingItems: string[];
    requiredChanges: string[];
    preservedEvidenceRefs: string[];
    correctedScope: StructuredTaskScope;
    correctedScopeFingerprint: `sha256:${string}`;
    correctionFingerprint: `sha256:${string}`;
}
export type ParentResultDisposition = {
    outcome: "accept";
    reviewId: string;
    sourceResultReportId: string;
} | {
    outcome: "correct";
    correction: ParentCorrectionPackage;
};
export interface RedelegationAuthorizationInput {
    correction: ParentCorrectionPackage;
    parentAgentName: string;
    previousTargetAgentName: string;
    nextTargetAgentName: string;
    reasonCode: RedelegationReasonCode;
    reasonDetail: string;
    reasonEvidenceRefs: string[];
    originalScopeFingerprint: string;
    previousStrategyFingerprint?: string;
    currentStrategyFingerprint?: string;
    /** @deprecated Failure identity alone cannot prove that an execution strategy repeated. */
    previousFailureFingerprint?: string;
    /** @deprecated Failure identity alone cannot prove that an execution strategy repeated. */
    currentFailureFingerprint?: string;
}
export type RedelegationAuthorizationDecision = {
    ok: false;
    reasonCode: string;
} | {
    ok: true;
    reasonCode: RedelegationReasonCode;
    authorizationReceiptId: `redelegation:${string}`;
    authorizationFingerprint: `sha256:${string}`;
};
export declare function fingerprintStructuredTaskScope(scope: StructuredTaskScope): `sha256:${string}`;
export declare function isRedelegationReasonCode(value: string): value is RedelegationReasonCode;
export declare function buildParentResultDisposition(input: {
    reviewId: string;
    sourceResultReportId: string;
    review: SubAgentResultReview;
    correctedScope: StructuredTaskScope;
    preservedEvidenceRefs: string[];
}): ParentResultDisposition;
export declare function authorizeEvidenceBackedRedelegation(input: RedelegationAuthorizationInput): RedelegationAuthorizationDecision;
//# sourceMappingURL=evidence-redelegation.d.ts.map