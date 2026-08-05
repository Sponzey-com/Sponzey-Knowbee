import { type LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
import type { LlmResultDiagnosisRecord } from "./work-record.js";
export declare const REQUIRED_SOLUTION_PATHS: readonly ["direct_answer", "plan", "tool", "sub_agent", "yeonjang", "ask_clarification", "partial_completion", "workaround_guidance"];
export type SolutionPath = typeof REQUIRED_SOLUTION_PATHS[number];
export type SolutionPathDisposition = "available" | "attempted" | "reviewed_unavailable" | "completed_partial" | "guidance_ready";
export interface SolutionPathReview {
    path: SolutionPath;
    disposition: SolutionPathDisposition;
    reasonCode: string;
    resultRefs?: string[];
    guidance?: string;
}
export interface SolutionPathExhaustionAssessment {
    complete: boolean;
    canFinalizeFailure: boolean;
    reviewedPaths: SolutionPath[];
    missingPaths: SolutionPath[];
    partialResultRefs: string[];
    workaroundGuidance: string[];
}
export interface AuthorizedSolutionPathReview extends SolutionPathReview {
    applicable: boolean;
    evidenceRefs: string[];
    attemptSignature?: string;
}
export interface AuthorizedSolutionPathExhaustionAssessment extends SolutionPathExhaustionAssessment {
    receiptId: string;
    nextAction: "partial_report" | "stop_blocked";
    reviews: AuthorizedSolutionPathReview[];
}
export interface TerminalFailurePayload {
    status: "blocked";
    conciseReason: string;
    attemptedPaths: SolutionPath[];
    partialResultRefs: string[];
    unresolvedScope: string[];
    workaroundGuidance: string[];
    userActions: string[];
    diagnosisReceiptId: string;
}
export interface PartialCompletionPayload {
    status: "partial";
    partialResultRefs: string[];
    unresolvedScope: string[];
    nextActions: string[];
    diagnosisReceiptId: string;
}
export declare function assessSolutionPathExhaustion(reviews: readonly SolutionPathReview[]): SolutionPathExhaustionAssessment;
export declare function assessAuthorizedSolutionPathExhaustion(input: {
    receipt: LlmDiagnosisReceipt | undefined;
    subjectPayload: unknown;
    diagnosis: LlmResultDiagnosisRecord;
    reviews: readonly AuthorizedSolutionPathReview[];
}): AuthorizedSolutionPathExhaustionAssessment;
export declare function buildTerminalFailurePayload(input: {
    assessment: AuthorizedSolutionPathExhaustionAssessment;
    conciseReason: string;
    unresolvedScope: string[];
    userActions: string[];
}): TerminalFailurePayload;
export declare function buildPartialCompletionPayload(input: {
    assessment: AuthorizedSolutionPathExhaustionAssessment;
    unresolvedScope: string[];
    nextActions: string[];
}): PartialCompletionPayload;
//# sourceMappingURL=solution-path-exhaustion.d.ts.map