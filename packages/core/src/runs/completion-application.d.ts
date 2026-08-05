import type { UserInputRequirement } from "../contracts/user-input-requirement.js";
import type { SuccessfulToolEvidence } from "./recovery.js";
import type { CompletionFlowDecision } from "./completion-flow.js";
import { type NextAttemptToolPolicy } from "./next-attempt-tool-policy.js";
export type CompletionApplicationDecision = {
    kind: "complete";
    summary: string;
    persistedText: string;
    statusText: string;
} | {
    kind: "stop";
    summary: string;
    reason: string;
    remainingItems?: string[];
} | {
    kind: "retry";
    budgetKind: "execution" | "interpretation";
    summary: string;
    detail?: string;
    title?: string;
    eventLabel: string;
    nextMessage: string;
    reviewStepStatus: "running" | "completed";
    executingStepSummary: string;
    updateRunStatusSummary?: string;
    structuredFollowupKey?: string;
    markTruncatedOutputRecoveryAttempted?: boolean;
    clearWorkerRuntime?: boolean;
    requiredToolNames?: string[];
    nextAttemptToolPolicy?: NextAttemptToolPolicy;
} | {
    kind: "awaiting_user";
    summary: string;
    reason?: string;
    remainingItems?: string[];
    userMessage?: string;
    inputRequirement?: UserInputRequirement;
};
export interface CompletionFollowupTransitionIdentity {
    kind: "completion_followup";
    actionProposal: string;
    reason: string;
    remainingItems: string[];
    summary: string;
    evidenceRefs: string[];
    executionMode: "tool" | "response_only" | "legacy";
    requiredToolNames: string[];
    targetRefs: string[];
}
export declare function decideCompletionApplication(params: {
    decision: CompletionFlowDecision;
    originalRequest: string;
    previousResult: string;
    successfulTools: SuccessfulToolEvidence[];
    sawRealFilesystemMutation: boolean;
    usedTurns: number;
    maxTurns: number;
    interpretationBudgetLimit: number;
    executionBudgetLimit: number;
    canRetryInterpretation: boolean;
    canRetryExecution: boolean;
    followupAlreadySeen: boolean;
}): CompletionApplicationDecision;
export declare function buildStructuredFollowupKey(decision: Extract<CompletionFlowDecision, {
    kind: "followup";
}>, evidenceRevisionRefs?: readonly string[]): string;
export declare function buildCompletionFollowupTransitionIdentity(decision: Extract<CompletionFlowDecision, {
    kind: "followup";
}>, evidenceRevisionRefs?: readonly string[]): CompletionFollowupTransitionIdentity;
export declare function buildCompletionFollowupExecutionMessage(decision: Extract<CompletionFlowDecision, {
    kind: "followup";
}>): string;
export declare function sanitizeCompletionAwaitingUserText(value: string | undefined, fallback?: string): string;
//# sourceMappingURL=completion-application.d.ts.map