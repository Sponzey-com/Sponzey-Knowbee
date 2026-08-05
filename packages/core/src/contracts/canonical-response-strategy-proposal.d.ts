import type { ResponseStrategyCategory, ResponseStrategyImprovementIntake } from "./response-strategy-improvement-intake.js";
export declare const RESPONSE_STRATEGY_CANONICAL_MODULES: readonly ["prompts/task_intake.md", "prompts/workflow.md", "prompts/sub_agent_delegation.md", "prompts/result_review.md", "prompts/final_response.md"];
export type ResponseStrategyCanonicalModule = typeof RESPONSE_STRATEGY_CANONICAL_MODULES[number];
export type FailureReportProposalPurpose = "result_review" | "user_output";
export interface ResponseStrategyProposalValidationCriterion {
    inputCondition: string;
    expectedResult: string;
    passCondition: string;
}
export interface CanonicalResponseStrategyProposal {
    schemaVersion: 1;
    strategyCategory: ResponseStrategyCategory;
    targetModule: ResponseStrategyCanonicalModule;
    changePurpose: string;
    exactScope: string;
    evidenceReceiptRefs: string[];
    validationCriteria: ResponseStrategyProposalValidationCriterion[];
    harnessProjection: {
        targetPromptSources: [ResponseStrategyCanonicalModule];
        allowedChangeScope: [ResponseStrategyCanonicalModule];
        responseStrategyTarget: ResponseStrategyCategory;
        currentBehavior: string;
        desiredBehavior: string;
        userReactionEvidence: string[];
        requiredTests: string[];
    };
}
export type CanonicalResponseStrategyProposalDecision = {
    status: "ready";
    proposal: CanonicalResponseStrategyProposal;
} | {
    status: "rejected";
    reasonCode: "failure_report_purpose_required" | "canonical_module_mismatch" | "broad_scope_rejected" | "evidence_not_in_intake" | "one_off_emotion_global_change";
};
export declare function buildCanonicalResponseStrategyProposal(input: {
    intake: ResponseStrategyImprovementIntake;
    targetModules: ResponseStrategyCanonicalModule[];
    changePurpose: string;
    exactScope: string;
    evidenceReceiptRefs: string[];
    validationCriteria: ResponseStrategyProposalValidationCriterion[];
    failureReportPurpose?: FailureReportProposalPurpose;
}): CanonicalResponseStrategyProposalDecision;
//# sourceMappingURL=canonical-response-strategy-proposal.d.ts.map