import type { CompletionReviewRejectionReasonCode, CompletionReviewOperationalEvidence, CompletionReviewResult } from "../agent/completion-review.js";
import { reviewTaskCompletion } from "../agent/completion-review.js";
import type { AIProvider } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { DeliveryOutcome, SuccessfulFileDelivery } from "./delivery.js";
import { type SyntheticApprovalRequest } from "./approval.js";
import type { SuccessfulToolEvidence } from "./recovery.js";
import type { InstructionRuntimeContext } from "../instructions/merge.js";
export interface ReviewPassResult {
    review: CompletionReviewResult | null;
    reviewFailureReasonCode?: "completion_review_provider_failed" | "completion_review_contract_invalid";
    syntheticApproval: SyntheticApprovalRequest | null;
}
export interface ReviewPassDependencies {
    reviewTaskCompletion: typeof reviewTaskCompletion;
    onReviewError?: (message: string) => void;
    onReviewRejected?: (reasonCode: CompletionReviewRejectionReasonCode, attempt: number) => void;
}
export declare function buildCompletionReviewOperationalEvidence(input: {
    successfulFileDeliveries: SuccessfulFileDelivery[];
    sawRealFilesystemMutation: boolean;
    deliveryOutcome?: DeliveryOutcome;
}): CompletionReviewOperationalEvidence;
export declare function runReviewPass(params: {
    instructionRuntime: InstructionRuntimeContext;
    runId?: string | undefined;
    requestGroupId?: string | undefined;
    sessionId?: string | undefined;
    executionProfile: {
        approvalRequired: boolean;
        approvalTool: string;
    };
    originalRequest: string;
    preview: string;
    priorAssistantMessages: string[];
    model?: string;
    providerId?: string;
    provider?: AIProvider;
    config: KnowbeeConfig;
    workDir?: string;
    usesWorkerRuntime: boolean;
    requiresPrivilegedToolExecution: boolean;
    successfulTools: SuccessfulToolEvidence[];
    requiresSuccessfulToolEvidence?: boolean;
    completionConditions: string[];
    seenFollowupTransitionKeys?: ReadonlySet<string>;
    operationalEvidence?: CompletionReviewOperationalEvidence;
    successfulFileDeliveries: SuccessfulFileDelivery[];
    sawRealFilesystemMutation: boolean;
    deliveryOutcome?: DeliveryOutcome;
}, dependencies: ReviewPassDependencies): Promise<ReviewPassResult>;
export declare const defaultReviewPassDependencies: ReviewPassDependencies;
//# sourceMappingURL=review-pass.d.ts.map