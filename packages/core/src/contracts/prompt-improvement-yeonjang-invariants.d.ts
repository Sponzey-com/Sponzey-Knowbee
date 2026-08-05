import type { NoYeonjangCapabilityGapDecision, TruthfulNoYeonjangResult } from "./no-yeonjang-capability-gap.js";
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
import { type YeonjangBroadcastIntent } from "./yeonjang-broadcast.js";
import { type YeonjangIdentityBoundarySnapshot } from "./yeonjang-identity-boundary.js";
import type { YeonjangSensitiveAuthorizationDecision } from "./yeonjang-sensitive-operation-authorization.js";
import { type ExactYeonjangSelector, type YeonjangExactTargetDecision } from "./yeonjang-target-resolution.js";
export interface AllYeonjangInstancesUserRequestReceipt {
    schemaVersion: 1;
    requestId: string;
    actorType: "user";
    explicitAllInstances: true;
    targetInstanceIds: string[];
    issuedAt: number;
    expiresAt: number;
}
export type PromptImprovementYeonjangControlScope = {
    kind: "single";
    selector: ExactYeonjangSelector;
    targetDecision: YeonjangExactTargetDecision;
    requiredCapabilityIds: string[];
} | {
    kind: "all_instances";
    broadcastIntent: YeonjangBroadcastIntent;
    userRequest?: AllYeonjangInstancesUserRequestReceipt;
    requiredCapabilityIds: string[];
} | {
    kind: "no_computer_control";
    fallbackDecision: NoYeonjangCapabilityGapDecision;
    truthfulResult: TruthfulNoYeonjangResult;
};
export interface YeonjangSensitiveControlEvidence {
    targetInstanceId: string;
    decision: YeonjangSensitiveAuthorizationDecision;
}
export interface PromptImprovementYeonjangInvariantReceipt {
    schemaVersion: 1;
    invariant: "tool_boundary";
    decision: "preserved";
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    operationScope: PromptImprovementYeonjangControlScope["kind"];
    targetInstanceIds: string[];
    requiredCapabilityIds: string[];
    blockedCapabilityIds: string[];
    sensitiveAuthorizationCount: number;
}
export type PromptImprovementYeonjangInvariantDecision = {
    status: "authorized";
    receipt: PromptImprovementYeonjangInvariantReceipt;
} | {
    status: "blocked";
    reasonCode: "host_instance_duplicate" | "exact_target_required" | "target_capability_missing" | "all_instances_broadcast_invalid" | "all_instances_user_request_missing" | "all_instances_user_request_invalid" | "all_instances_scope_mismatch" | "no_yeonjang_scope_invalid" | "no_yeonjang_result_invalid" | "sensitive_authorization_missing" | "sensitive_authorization_scope_mismatch" | "yeonjang_review_lineage_invalid";
};
export type YeonjangToolBoundaryInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "yeonjang_review_receipt_invalid" | "yeonjang_review_expired" | "yeonjang_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function authorizePromptImprovementYeonjangInvariant(input: {
    identitySnapshot: YeonjangIdentityBoundarySnapshot;
    maxIdentityAgeMs: number;
    scope: PromptImprovementYeonjangControlScope;
    sensitiveOperations: YeonjangSensitiveControlEvidence[];
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptImprovementYeonjangInvariantDecision;
export declare function projectYeonjangToolBoundaryInvariantReview(input: {
    receipt: PromptImprovementYeonjangInvariantReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): YeonjangToolBoundaryInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-yeonjang-invariants.d.ts.map