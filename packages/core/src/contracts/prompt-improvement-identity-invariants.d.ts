import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
export interface PromptImprovementAgentIdentity {
    agentId: string;
    agentName: string;
}
export interface PromptImprovementIdentitySnapshot {
    productName: string;
    productNameKo: string;
    responseLanguage: "ko" | "en";
    configuredMainAgentId: string;
    configuredMainAgentName?: string;
    userName?: string;
    agents: PromptImprovementAgentIdentity[];
    responseAttributions: PromptImprovementAgentIdentity[];
    userFacingAgentFields: string[];
}
export type PromptImprovementIdentityAuditDecision = {
    status: "preserved";
    effectiveMainAgentName: string;
    normalizedAgentNames: string[];
} | {
    status: "blocked";
    reasonCode: "product_identity_mismatch" | "main_agent_identity_invalid" | "main_agent_name_mismatch" | "agent_identity_invalid" | "agent_identity_field_invalid" | "agent_name_duplicate" | "user_agent_name_collision" | "user_facing_identity_exposed" | "response_attribution_incomplete" | "response_attribution_mismatch";
};
export interface PromptImprovementIdentityReviewReceipt {
    schemaVersion: 1;
    invariant: "product_identity";
    decision: "preserved";
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    effectiveMainAgentName: string;
}
export type PromptImprovementIdentityReviewDecision = {
    status: "authorized";
    receipt: PromptImprovementIdentityReviewReceipt;
} | Extract<PromptImprovementIdentityAuditDecision, {
    status: "blocked";
}> | {
    status: "blocked";
    reasonCode: "identity_review_lineage_invalid";
};
export type ProductIdentityInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "identity_review_receipt_invalid" | "identity_review_expired" | "identity_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function auditPromptImprovementIdentitySnapshot(snapshot: PromptImprovementIdentitySnapshot): PromptImprovementIdentityAuditDecision;
export declare function createPromptImprovementIdentityReview(input: {
    snapshot: PromptImprovementIdentitySnapshot;
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptImprovementIdentityReviewDecision;
export declare function projectProductIdentityInvariantReview(input: {
    receipt: PromptImprovementIdentityReviewReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): ProductIdentityInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-identity-invariants.d.ts.map