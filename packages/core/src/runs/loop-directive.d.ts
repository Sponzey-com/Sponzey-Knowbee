import type { LlmResponseReviewReceipt } from "./user-facing-response-gate.js";
import type { RecoveryChangedDimension } from "../contracts/work-record.js";
export interface IntakeRecoveryAdmission {
    previousStrategyFingerprint: string;
    nextStrategyFingerprint: string;
    changedDimensions: RecoveryChangedDimension[];
}
export type UserFacingTextSource = "llm_generated" | "llm_reviewed" | "runtime_deterministic" | "user_supplied_literal" | "mixed";
export declare function combineUserFacingTextSources(sources: UserFacingTextSource[]): UserFacingTextSource;
export declare function userFacingTextSourceRequiresFinalResponseReview(source: UserFacingTextSource): boolean;
export interface LoopDirectiveNotice {
    kind: string;
    textSource: string;
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export interface DirectAnswerResponseReview {
    rawText: string;
    rawTextSource: "llm_generated";
    contentKind: "direct_answer";
    expectedLanguage: "ko" | "en" | "unknown";
    receipt: LlmResponseReviewReceipt;
}
export type LoopDirective = {
    kind: "execute";
    message: string;
    requiredToolNames: string[];
    eventLabel?: string;
} | {
    kind: "complete";
    text: string;
    textSource: UserFacingTextSource;
    responseReview?: DirectAnswerResponseReview;
    notice?: LoopDirectiveNotice;
    eventLabel?: string;
} | {
    kind: "complete_silent";
    summary: string;
    eventLabel?: string;
} | {
    kind: "retry_intake";
    summary: string;
    reason: string;
    message: string;
    recoveryAdmission?: IntakeRecoveryAdmission;
    remainingItems?: string[];
    eventLabel?: string;
} | {
    kind: "awaiting_user";
    preview: string;
    summary: string;
    reason?: string;
    userMessage?: string;
    userMessageSource?: UserFacingTextSource;
    remainingItems?: string[];
    eventLabel?: string;
} | {
    kind: "stop";
    preview: string;
    summary: string;
    reason?: string;
    userMessage?: string;
    userMessageSource?: UserFacingTextSource;
    remainingItems?: string[];
    eventLabel?: string;
};
//# sourceMappingURL=loop-directive.d.ts.map