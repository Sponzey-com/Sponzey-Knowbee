import type { AgentPromptImprovementAuthorizationDecision } from "./agent-prompt-improvement-authorization.js";
import type { PlatformPromptInvariantReview, PlatformPromptProtectedInvariant } from "./prompt-improvement-application-gate.js";
import type { PromptSourceApplicationDecision } from "./platform-prompt-activation-boundary.js";
export declare const PROMPT_IMPROVEMENT_IMPACT_KINDS: readonly ["identity", "delegation", "memory", "yeonjang", "tool_mcp", "safety", "recursive_ownership"];
export type PromptImprovementImpactKind = typeof PROMPT_IMPROVEMENT_IMPACT_KINDS[number];
export type GoalInvariantEnforcement = "advisory" | "required" | "strict";
export type PromptInvariantOwnershipMode = "agent_owned" | "common_policy";
export interface PromptInvariantCoverageEvidence {
    impact: PromptImprovementImpactKind;
    goalSection3Fingerprint: string;
    evidenceRef: string;
    applicationReview: boolean;
    review: PlatformPromptInvariantReview;
}
export interface GoalProductInvariantRuleSnapshot {
    ruleId: string;
    semanticChecksum: string;
    enforcement: GoalInvariantEnforcement;
}
export interface HarnessInvariantProjectionRuleSnapshot {
    projectionRuleId: string;
    canonicalRuleId: string;
    semanticChecksum: string;
    enforcement: GoalInvariantEnforcement;
}
export interface PromptAgentOwnershipReviewEvidence {
    reviewedAgentId: string;
    decision: AgentPromptImprovementAuthorizationDecision;
}
export interface GoalInvariantProjectionCorrection {
    projectionRuleId: string;
    authoritativeRuleId: string;
    authoritativeSemanticChecksum: string;
    authoritativeEnforcement: GoalInvariantEnforcement;
}
export interface PromptInvariantCoverageReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    goalSection3Fingerprint: string;
    coveredImpacts: PromptImprovementImpactKind[];
    ownershipMode: PromptInvariantOwnershipMode;
    targetOwnerAgentId: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    mainReviewId: string | undefined;
    coverageEvidenceRefs: string[];
    canonicalRuleIds: string[];
    applicationInvariantNames: PlatformPromptProtectedInvariant[];
}
export type PromptInvariantCoverageReasonCode = "impact_scope_mismatch" | "invariant_review_missing" | "invariant_review_duplicate" | "invariant_not_preserved" | "invariant_review_scope_mismatch" | "goal_section3_lineage_mismatch" | "invariant_review_expired" | "application_review_missing" | "application_review_duplicate" | "harness_projection_missing" | "harness_projection_orphan" | "goal_section3_conflict" | "common_policy_final_review_missing" | "common_policy_final_review_blocked" | "common_policy_final_review_scope_mismatch" | "agent_ownership_review_missing" | "agent_ownership_review_scope_mismatch";
export type PromptInvariantCoverageDecision = {
    status: "authorized";
    receipt: PromptInvariantCoverageReceipt;
    applicationReviews: PlatformPromptInvariantReview[];
} | {
    status: "blocked";
    reasonCode: PromptInvariantCoverageReasonCode;
    corrections?: GoalInvariantProjectionCorrection[];
};
export declare function authorizePromptInvariantCoverage(input: {
    declaredImpacts: PromptImprovementImpactKind[];
    analyzedImpacts: PromptImprovementImpactKind[];
    coverage: PromptInvariantCoverageEvidence[];
    canonicalRules: GoalProductInvariantRuleSnapshot[];
    harnessProjectionRules: HarnessInvariantProjectionRuleSnapshot[];
    ownershipMode: PromptInvariantOwnershipMode;
    targetOwnerAgentId: string;
    configuredMainAgentId: string;
    platformSourceDecision?: PromptSourceApplicationDecision;
    ownershipReview?: PromptAgentOwnershipReviewEvidence;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptInvariantCoverageDecision;
//# sourceMappingURL=prompt-invariant-coverage.d.ts.map