import { type AIProvider } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { InstructionRuntimeContext } from "../instructions/merge.js";
import { type SuccessfulToolEvidence } from "../runs/recovery.js";
export { aggregateSubSessionResultsForParent, buildParentAggregationRuntimeEvent, buildFeedbackRequest, collectResultReviewIssues, decideSubSessionCompletionIntegration, getSubAgentResultRetryBudgetLimit, normalizeResultReviewFailureKey, reviewSubAgentResult, summarizeChildResultForParent, } from "./sub-agent-result-review.js";
export type { ParentAggregationChildInput, ParentAggregationInput, ParentAggregationNextAction, ParentAggregationRuntimeEventInput, ParentAggregationTrace, ParentFacingChildResult, ParentFacingChildResultStatus, SubAgentResultParentIntegrationStatus, SubAgentResultReview, SubAgentResultReviewInput, SubAgentResultReviewIssue, SubAgentResultReviewIssueCode, SubAgentResultReviewVerdict, SubAgentRetryClass, SubSessionCompletionIntegrationDecision, } from "./sub-agent-result-review.js";
export type CompletionReviewStatus = "complete" | "followup" | "ask_user" | "blocked" | "paths_exhausted";
export declare const COMPLETION_REVIEW_CRITERION_KEYS: readonly ["existence", "accuracy", "completeness", "freshness", "target_match", "constraint_compliance", "delivery"];
export type CompletionReviewCriterionKey = (typeof COMPLETION_REVIEW_CRITERION_KEYS)[number];
export type CompletionReviewCriterionVerdict = "satisfied" | "unsatisfied" | "uncertain";
export interface CompletionReviewCriterionAssessment {
    criterionKey: CompletionReviewCriterionKey;
    applicable: boolean;
    verdict: CompletionReviewCriterionVerdict;
    evidenceRefs: string[];
    uncertainty: string;
    reason: string;
}
export interface CompletionReviewExpectedCondition {
    conditionId: `condition:${string}`;
    description: string;
}
export interface CompletionReviewConditionAssessment {
    conditionId: `condition:${string}`;
    verdict: CompletionReviewCriterionVerdict;
    evidenceRefs: string[];
    uncertainty: string;
    reason: string;
}
export interface CompletionReviewResult {
    status: CompletionReviewStatus;
    summary: string;
    reason: string;
    followupPrompt?: string;
    followupEvidenceRefs: string[];
    followupExecutionMode?: "tool" | "response_only";
    followupRequiredToolNames?: string[];
    followupTargetRefs?: string[];
    userMessage?: string;
    remainingItems: string[];
    criterionAssessments?: CompletionReviewCriterionAssessment[];
    conditionAssessments?: CompletionReviewConditionAssessment[];
    contextReceipt?: CompletionReviewContextReceipt;
    terminalEvidence?: CompletionReviewTerminalEvidence;
}
export interface CompletionReviewTerminalEvidence {
    blockerEvidenceRefs: string[];
    evaluatedAlternativeEvidenceRefs: string[];
    excludedCandidateEvidenceRefs: string[];
}
export type CompletionReviewCriterionGateResult = {
    ok: true;
} | {
    ok: false;
    reasonCode: "completion_review_criteria_missing" | "completion_review_criteria_duplicate" | "completion_review_criteria_incomplete" | "completion_review_evidence_ref_foreign" | "completion_review_applicable_criterion_not_satisfied" | "completion_review_criterion_evidence_missing" | "completion_review_complete_without_evidence_refs" | "completion_review_freshness_evidence_invalid" | "completion_review_conditions_missing" | "completion_review_conditions_duplicate" | "completion_review_conditions_mismatch" | "completion_review_condition_not_satisfied" | "completion_review_condition_evidence_missing" | "completion_review_required_tool_evidence_missing";
};
type CompletionReviewCriterionGateFailure = Extract<CompletionReviewCriterionGateResult, {
    ok: false;
}>;
export type CompletionReviewRejectionReasonCode = "completion_review_parse_failed" | "completion_review_followup_evidence_missing" | "completion_review_followup_evidence_foreign" | "completion_review_followup_execution_missing" | "completion_review_followup_execution_invalid" | "completion_review_followup_transition_repeated" | CompletionReviewTerminalGateFailure["reasonCode"] | CompletionReviewCriterionGateFailure["reasonCode"];
export type CompletionReviewTerminalGateResult = {
    ok: true;
} | {
    ok: false;
    reasonCode: "completion_review_terminal_evidence_missing" | "completion_review_terminal_evidence_foreign" | "completion_review_blocker_evidence_missing" | "completion_review_alternative_evidence_missing" | "completion_review_candidate_exclusion_incomplete";
};
type CompletionReviewTerminalGateFailure = Extract<CompletionReviewTerminalGateResult, {
    ok: false;
}>;
export interface CompletionReviewContextReceipt {
    schemaVersion: 1;
    receiptId: `completion-review:${string}`;
    contextFingerprint: `sha256:${string}`;
    requestFingerprint: `sha256:${string}`;
    candidateFingerprint: `sha256:${string}`;
    evidenceFingerprint: `sha256:${string}`;
    conditionsFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
export interface CompletionReviewOperationalEvidence {
    artifacts: Array<{
        artifactRef: string;
        targetRef: string;
        observedAt?: string;
        receiptRef?: string;
    }>;
    stateChanges: Array<{
        stateRef: string;
        targetRef: string;
        observedAt?: string;
        status: "observed" | "not_observed";
    }>;
    deliveries: Array<{
        deliveryRef: string;
        targetRef: string;
        observedAt?: string;
        status: "satisfied" | "unsatisfied";
    }>;
}
export declare function buildCompletionReviewEvidenceBlock(successfulTools: SuccessfulToolEvidence[], operationalEvidence?: CompletionReviewOperationalEvidence): string;
export declare function buildCompletionReviewFreshnessEvidenceRefs(successfulTools: SuccessfulToolEvidence[], operationalEvidence?: CompletionReviewOperationalEvidence): string[];
export declare function buildCompletionReviewContextReceipt(input: {
    originalRequest: string;
    latestAssistantMessage: string;
    successfulTools: SuccessfulToolEvidence[];
    operationalEvidence?: CompletionReviewOperationalEvidence;
    completionConditions?: string[];
}): CompletionReviewContextReceipt;
export declare function buildCompletionReviewExpectedConditions(completionConditions: string[]): CompletionReviewExpectedCondition[];
export declare function reviewTaskCompletion(params: {
    instructionRuntime: InstructionRuntimeContext;
    originalRequest: string;
    latestAssistantMessage: string;
    priorAssistantMessages?: string[];
    model?: string;
    providerId?: string;
    provider?: AIProvider;
    config: KnowbeeConfig;
    workDir?: string;
    successfulTools?: SuccessfulToolEvidence[];
    operationalEvidence?: CompletionReviewOperationalEvidence;
    completionConditions?: string[];
    requiresSuccessfulToolEvidence?: boolean;
    runId?: string | undefined;
    requestGroupId?: string | undefined;
    sessionId?: string | undefined;
    seenFollowupTransitionKeys?: ReadonlySet<string>;
    onRejected?: (reasonCode: CompletionReviewRejectionReasonCode, attempt: number) => void;
}): Promise<CompletionReviewResult | null>;
export declare function evaluateCompletionReviewFollowupGate(review: CompletionReviewResult, successfulTools?: SuccessfulToolEvidence[], allowedEvidenceRefs?: readonly string[], freshnessEvidenceRefs?: readonly string[]): {
    ok: true;
} | {
    ok: false;
    reasonCode: "completion_review_followup_evidence_missing" | "completion_review_followup_evidence_foreign" | "completion_review_followup_execution_missing" | "completion_review_followup_execution_invalid";
};
export declare function buildCompletionReviewSystemPrompt(options?: {
    workDir?: string | undefined;
    locale?: "ko" | "en" | undefined;
}): string;
export declare function parseCompletionReviewResult(raw: string): CompletionReviewResult | null;
export declare function evaluateCompletionReviewCriterionGate(input: {
    review: CompletionReviewResult;
    allowedEvidenceRefs: string[];
    freshnessEvidenceRefs?: string[];
    expectedConditions?: CompletionReviewExpectedCondition[];
    requiresSuccessfulToolEvidence?: boolean;
    successfulToolEvidenceRefs?: string[];
}): CompletionReviewCriterionGateResult;
export declare function evaluateCompletionReviewTerminalGate(input: {
    review: CompletionReviewResult;
    allowedEvidenceRefs: readonly string[];
}): CompletionReviewTerminalGateResult;
//# sourceMappingURL=completion-review.d.ts.map