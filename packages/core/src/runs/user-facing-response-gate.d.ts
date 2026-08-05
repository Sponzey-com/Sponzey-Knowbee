import type { UserFacingTextSource } from "./loop-directive.js";
export type UserFacingResponseContentKind = "direct_answer" | "planning" | "delegation" | "tool_result" | "yeonjang_result" | "sub_agent_result" | "prompt_improvement" | "final_report" | "safety_notice" | "system_status" | "validation_error" | "fixed_notice";
export interface LlmResponseReviewReceiptV1 {
    schemaVersion: 1;
    receiptId: string;
    reviewedBy: "llm_final_response";
    promptSourceId: "final_response";
    contentKind: UserFacingResponseContentKind;
    rawTextSource: UserFacingTextSource;
    rawTextSha256: string;
    responseTextSha256: string;
    responseLanguage: "ko" | "en" | "unknown";
}
export interface LlmResponseReviewReceiptV2 {
    schemaVersion: 2;
    receiptId: string;
    reviewedBy: "llm_final_response";
    promptSourceId: "final_response";
    promptSourceIds: readonly ["task_intake", "final_response"];
    promptSourceFingerprints: {
        taskIntakeSha256: string;
        finalResponseSha256: string;
    };
    providerInvocationRef: string;
    contentKind: "direct_answer";
    rawTextSource: "llm_generated";
    rawTextSha256: string;
    responseTextSha256: string;
    responseLanguage: "ko" | "en" | "unknown";
}
export type LlmResponseReviewReceipt = LlmResponseReviewReceiptV1 | LlmResponseReviewReceiptV2;
export interface UserFacingResponseAuthorization {
    ok: boolean;
    reasonCode?: "review_receipt_missing" | "review_source_mismatch" | "review_content_mismatch" | "review_language_mismatch" | "review_provenance_missing" | "review_provenance_mismatch";
}
export declare function buildLlmResponseReviewReceipt(input: {
    rawText: string;
    responseText: string;
    rawTextSource: UserFacingTextSource;
    contentKind: UserFacingResponseContentKind;
}): LlmResponseReviewReceiptV1;
export declare function buildDirectLlmResponseReviewReceipt(input: {
    rawText: string;
    responseText: string;
    taskIntakePromptSha256: string;
    finalResponsePromptSha256: string;
    providerInvocationRef: string;
}): LlmResponseReviewReceiptV2;
export declare function authorizeUserFacingResponse(input: {
    rawText: string;
    responseText: string;
    rawTextSource: UserFacingTextSource;
    contentKind: UserFacingResponseContentKind;
    expectedLanguage: "ko" | "en" | "unknown";
    receipt?: LlmResponseReviewReceipt | undefined;
}): UserFacingResponseAuthorization;
export declare function authorizePersistedUserFacingResponse(input: {
    rawTextSha256: string;
    responseText: string;
    rawTextSource: UserFacingTextSource;
    contentKind: UserFacingResponseContentKind;
    expectedLanguage: "ko" | "en" | "unknown";
    receipt?: LlmResponseReviewReceipt | undefined;
}): UserFacingResponseAuthorization;
//# sourceMappingURL=user-facing-response-gate.d.ts.map