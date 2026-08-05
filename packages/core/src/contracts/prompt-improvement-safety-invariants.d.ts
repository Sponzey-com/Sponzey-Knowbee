import type { CompletePromptActivationDecision } from "./complete-prompt-activation.js";
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
import type { PromptActivationEvidenceDecision } from "./prompt-activation-evidence.js";
export declare const PROMPT_SAFETY_BOUNDARY_KINDS: readonly ["refusal", "safety", "permission", "data"];
export declare const PROMPT_SAFETY_MANDATORY_CONTROLS: readonly ["change_disclosure", "audit_log", "required_tests", "approval"];
export type PromptSafetyBoundaryKind = (typeof PROMPT_SAFETY_BOUNDARY_KINDS)[number];
export type PromptSafetyMandatoryControl = (typeof PROMPT_SAFETY_MANDATORY_CONTROLS)[number];
export type PromptSafetyEnforcement = "monitor" | "block" | "refuse";
export type PromptSafetySemanticDecision = "preserved" | "strengthened" | "weakened";
export type PromptSafetyControlLevel = "optional" | "required" | "explicit";
export type PromptSafetyControlOutcome = "verified" | "hide" | "suppress" | "skip" | "bypass";
export type PromptSafetyActivationState = "proposed" | "validated" | "approved" | "active" | "completed";
export interface PromptSafetyBoundaryRuleSnapshot {
    ruleId: string;
    kind: PromptSafetyBoundaryKind;
    canonicalOwner: string;
    checksum: string;
    enforcement: PromptSafetyEnforcement;
    semanticDecision: PromptSafetySemanticDecision;
    baselineChecksum: string;
    reviewEvidenceRef: string;
}
export interface PromptSafetyControlReceipt {
    control: PromptSafetyMandatoryControl;
    baselineLevel: PromptSafetyControlLevel;
    proposedLevel: PromptSafetyControlLevel;
    outcome: PromptSafetyControlOutcome;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    evidenceRef: string;
}
export type PromptSafetyActivationClaim = {
    claimState: "proposed" | "validated" | "approved";
} | {
    claimState: "active" | "completed";
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    sourceRef: string;
    sourceChecksum: string;
    runtimeTargetFingerprint: string;
    confirmationRef: string;
    activationEvidence: PromptActivationEvidenceDecision;
    completeActivation: CompletePromptActivationDecision;
};
export interface PromptImprovementSafetyInvariantReceipt {
    schemaVersion: 1;
    invariant: "safety_rules";
    decision: "preserved";
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    boundaryRuleIds: string[];
    mandatoryControls: PromptSafetyMandatoryControl[];
    activationState: PromptSafetyActivationState;
    activationId: string | undefined;
}
export type PromptImprovementSafetyInvariantReasonCode = "safety_boundary_snapshot_invalid" | "safety_boundary_missing" | "safety_boundary_owner_changed" | "safety_boundary_weakened" | "safety_boundary_change_unverified" | "mandatory_control_invalid" | "mandatory_control_missing" | "mandatory_control_bypass" | "mandatory_control_weakened" | "mandatory_control_scope_mismatch" | "activation_confirmation_missing" | "activation_scope_mismatch" | "activation_source_mismatch" | "activation_runtime_mismatch" | "activation_evidence_mismatch" | "safety_review_lineage_invalid";
export type PromptImprovementSafetyInvariantDecision = {
    status: "authorized";
    receipt: PromptImprovementSafetyInvariantReceipt;
} | {
    status: "blocked";
    reasonCode: PromptImprovementSafetyInvariantReasonCode;
};
export type SafetyRulesInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "safety_review_receipt_invalid" | "safety_review_expired" | "safety_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function authorizePromptImprovementSafetyInvariant(input: {
    baselineRules: PromptSafetyBoundaryRuleSnapshot[];
    proposedRules: PromptSafetyBoundaryRuleSnapshot[];
    controls: PromptSafetyControlReceipt[];
    activationClaim?: PromptSafetyActivationClaim;
    expectedRuntimeTargetFingerprint: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptImprovementSafetyInvariantDecision;
export declare function projectSafetyRulesInvariantReview(input: {
    receipt: PromptImprovementSafetyInvariantReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): SafetyRulesInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-safety-invariants.d.ts.map