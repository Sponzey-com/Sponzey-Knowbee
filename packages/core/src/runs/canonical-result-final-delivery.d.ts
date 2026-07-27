import type { CanonicalResultOutcome, CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
export interface CanonicalResultReportLlmInput {
    instruction: string;
    language: "ko" | "en";
    result: CanonicalResultOutcome;
    completedScope: string[];
    unresolvedScope: string[];
    verifiedReasonFacts: string[];
    nextActions: Array<{
        kind: "user_action" | "required_condition";
        text: string;
    }>;
    reviewFeedback?: string;
}
export interface CanonicalResultReportReviewPolicy {
    maxRepairAttempts: number;
    maxReasonCharacters: number;
    maxNextActionCharacters: number;
    maxReportCharacters: number;
}
export interface CanonicalResultReportLlmOutput {
    result: CanonicalResultOutcome;
    reason: string;
    nextAction: string;
    text: string;
}
export type CanonicalResultReportRenderer = (input: CanonicalResultReportLlmInput) => Promise<CanonicalResultReportLlmOutput>;
export type CanonicalResultReportRenderResolution = {
    status: "ready";
    outcome: CanonicalResultOutcome;
    text: string;
    textSource: "llm_reviewed";
    repairAttempts: number;
} | {
    status: "blocked";
    reasonCode: string;
};
export declare function renderCanonicalResultReport(input: {
    originalRequest: string;
    facts: CanonicalResultReportFacts;
    render: CanonicalResultReportRenderer;
    reviewPolicy: CanonicalResultReportReviewPolicy;
}): Promise<CanonicalResultReportRenderResolution>;
export declare function applyCanonicalResultReport(input: {
    originalRequest: string;
    facts: CanonicalResultReportFacts;
    render: CanonicalResultReportRenderer;
    reviewPolicy: CanonicalResultReportReviewPolicy;
    deliver: (input: {
        outcome: CanonicalResultOutcome;
        text: string;
        textSource: "llm_reviewed";
    }) => Promise<void>;
}): Promise<{
    status: "delivered";
    outcome: CanonicalResultOutcome;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=canonical-result-final-delivery.d.ts.map