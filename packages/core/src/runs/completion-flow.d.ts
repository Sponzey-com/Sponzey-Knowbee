import type { CompletionReviewResult } from "../agent/completion-review.js";
import type { UserInputRequirement } from "../contracts/user-input-requirement.js";
import type { TaskExecutionSemantics } from "../agent/intake.js";
import { type SuccessfulToolEvidence } from "./recovery.js";
export type CompletionFlowDecision = {
    kind: "recover_empty_result";
    summary: string;
    reason: string;
    remainingItems: string[];
} | {
    kind: "complete";
    summary: string;
    persistedText: string;
    statusText: string;
} | {
    kind: "invalid_followup";
    summary: string;
    reason: string;
    remainingItems: string[];
} | {
    kind: "followup";
    summary: string;
    reason: string;
    remainingItems: string[];
    followupPrompt: string;
    followupEvidenceRefs: string[];
    evidenceRevisionRefs?: string[];
    followupExecutionMode?: "tool" | "response_only";
    followupRequiredToolNames?: string[];
    followupTargetRefs?: string[];
} | {
    kind: "retry_truncated";
    summary: string;
    reason?: string;
    remainingItems?: string[];
} | {
    kind: "ask_user";
    summary: string;
    reason?: string;
    remainingItems?: string[];
    userMessage?: string;
    inputRequirement: UserInputRequirement;
} | {
    kind: "blocked";
    summary: string;
    reason: string;
    remainingItems: string[];
};
export declare function decideCompletionFlow(params: {
    review: CompletionReviewResult | null;
    reviewFailureReasonCode?: "completion_review_provider_failed" | "completion_review_contract_invalid";
    executionSemantics: TaskExecutionSemantics;
    preview: string;
    deliverySatisfied: boolean;
    successfulTools: SuccessfulToolEvidence[];
    sawRealFilesystemMutation: boolean;
    requiresFilesystemMutation: boolean;
    truncatedOutputRecoveryAttempted: boolean;
}): CompletionFlowDecision;
//# sourceMappingURL=completion-flow.d.ts.map