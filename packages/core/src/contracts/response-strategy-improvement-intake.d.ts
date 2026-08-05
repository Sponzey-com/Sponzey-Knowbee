export declare const RESPONSE_STRATEGY_CATEGORIES: readonly ["request_analysis", "clarification", "solution_path", "failure_report", "next_action", "delegation"];
export declare const RESPONSE_EVIDENCE_SIGNAL_KINDS: readonly ["repeated_request", "repeated_failure", "clarification_request", "satisfaction", "dissatisfaction", "correction"];
export type ResponseStrategyCategory = typeof RESPONSE_STRATEGY_CATEGORIES[number];
export type ResponseEvidenceSignalKind = typeof RESPONSE_EVIDENCE_SIGNAL_KINDS[number];
export interface ResponseImprovementTriggerReceipt {
    triggerId: string;
    source: "explicit_user_request" | "approved_operational_event";
    targetAgentId: string;
    requestedPromptSourceRefs: string[];
}
export interface ResponseEvidenceSignal {
    kind: ResponseEvidenceSignalKind;
    interactionReceiptRef: string;
    observedBehavior: string;
    expectedBehavior: string;
    occurrenceCount: number;
    windowStartedAt: number;
    windowEndedAt: number;
}
export interface ResponseStrategyImprovementCandidate {
    category: ResponseStrategyCategory;
    targetPromptSourceRef: string;
    currentBehavior: string;
    desiredBehavior: string;
    successCriterion: string;
    evidenceReceiptRefs: string[];
}
export interface ResponseStrategyImprovementIntake {
    schemaVersion: 1;
    agent: {
        agentId: string;
        agentName: string;
        agentType: "main" | "sub_agent";
    };
    trigger: ResponseImprovementTriggerReceipt;
    ownershipSnapshotFingerprint: string;
    evidence: ResponseEvidenceSignal[];
    candidate: ResponseStrategyImprovementCandidate;
    harnessInput: {
        targetPromptSources: string[];
        agentOwnedPromptScope: string[];
        userReactionEvidence: string[];
        responseStrategyTarget: ResponseStrategyCategory;
        currentBehavior: string;
        desiredBehavior: string;
        requiredTests: string[];
    };
}
export type ResponseStrategyImprovementIntakeDecision = {
    status: "ready";
    intake: ResponseStrategyImprovementIntake;
} | {
    status: "rejected";
    reasonCode: "explicit_trigger_required" | "trigger_agent_mismatch" | "target_not_owned" | "evidence_required" | "evidence_not_repeated" | "evidence_receipt_duplicate" | "style_only_change" | "candidate_target_mismatch" | "candidate_behavior_evidence_mismatch" | "protected_invariant_weakening";
};
export declare function buildResponseStrategyImprovementIntake(input: {
    agent: {
        agentId: string;
        agentName: string;
        agentType: "main" | "sub_agent";
    };
    ownedPromptSourceRefs: string[];
    ownershipSnapshotFingerprint: string;
    trigger?: ResponseImprovementTriggerReceipt;
    evidence: ResponseEvidenceSignal[];
    candidate: ResponseStrategyImprovementCandidate;
}): ResponseStrategyImprovementIntakeDecision;
//# sourceMappingURL=response-strategy-improvement-intake.d.ts.map