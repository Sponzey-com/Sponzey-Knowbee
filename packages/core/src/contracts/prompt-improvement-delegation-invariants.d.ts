import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
export declare const REQUIRED_DELEGATION_HANDOFF_FIELDS: readonly ["task_goal", "context", "constraints", "expected_output", "validation_method", "retry_limit", "termination_condition"];
export declare const REQUIRED_PARENT_DELEGATION_ACTIONS: readonly ["review", "aggregate", "reject", "correct_and_redelegate"];
export type DelegationHandoffRequiredField = typeof REQUIRED_DELEGATION_HANDOFF_FIELDS[number];
export type ParentDelegationAction = typeof REQUIRED_PARENT_DELEGATION_ACTIONS[number];
export interface PromptImprovementDelegationInvariantSnapshot {
    schemaVersion: 1;
    mainAgentDelegationScope: "configured_top_level_direct_children_only";
    subAgentDelegationScope: "configured_direct_children_only";
    runtimeChildCreationAllowed: false;
    handoffRequiredFields: DelegationHandoffRequiredField[];
    parentActions: ParentDelegationAction[];
    retryLimitRequired: boolean;
    insufficientResultMayBeCorrectedAndRedelegated: boolean;
    evidenceRef: string;
}
export interface PromptImprovementDelegationInvariantInput {
    snapshot: PromptImprovementDelegationInvariantSnapshot;
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}
export interface PromptImprovementDelegationInvariantReceipt {
    schemaVersion: 1;
    invariant: "delegation_rules";
    decision: "preserved";
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    evidenceRef: string;
    handoffRequiredFields: DelegationHandoffRequiredField[];
    parentActions: ParentDelegationAction[];
}
export type PromptImprovementDelegationInvariantReasonCode = "delegation_snapshot_invalid" | "main_delegation_scope_weakened" | "sub_agent_delegation_scope_weakened" | "runtime_child_creation_enabled" | "handoff_contract_incomplete" | "parent_review_capability_weakened" | "retry_boundary_weakened" | "delegation_review_lineage_invalid";
export type PromptImprovementDelegationInvariantDecision = {
    status: "authorized";
    receipt: PromptImprovementDelegationInvariantReceipt;
} | {
    status: "blocked";
    reasonCode: PromptImprovementDelegationInvariantReasonCode;
};
export type DelegationRulesInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "delegation_review_receipt_invalid" | "delegation_review_expired" | "delegation_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function authorizePromptImprovementDelegationInvariant(input: PromptImprovementDelegationInvariantInput): PromptImprovementDelegationInvariantDecision;
export declare function projectDelegationRulesInvariantReview(input: {
    receipt: PromptImprovementDelegationInvariantReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): DelegationRulesInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-delegation-invariants.d.ts.map