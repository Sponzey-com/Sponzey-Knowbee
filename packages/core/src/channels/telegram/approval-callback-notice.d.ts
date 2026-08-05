import type { ApprovalDecision, ApprovalKind } from "../../events/index.js";
export type TelegramApprovalCallbackLanguage = "ko" | "en";
export type TelegramApprovalCallbackReason = "late" | "unauthorized" | "decision";
export interface TelegramApprovalCallbackNotice {
    kind: "telegram_approval_callback_notice";
    language: TelegramApprovalCallbackLanguage;
    reason: TelegramApprovalCallbackReason;
    deliveryMode: "callback_query_answer";
    textSource: "telegram_approval_callback_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
    text: string;
}
export declare function resolveTelegramApprovalCallbackLanguage(languageCode: string | undefined): TelegramApprovalCallbackLanguage;
export declare function buildTelegramApprovalCallbackNotice(input: {
    language?: TelegramApprovalCallbackLanguage | undefined;
    reason: TelegramApprovalCallbackReason;
    approvalKind?: ApprovalKind | undefined;
    decision?: ApprovalDecision | undefined;
    text?: string | undefined;
}): TelegramApprovalCallbackNotice;
export declare function buildTelegramApprovalResultLabel(input: {
    language?: TelegramApprovalCallbackLanguage | undefined;
    approvalKind: ApprovalKind;
    decision: ApprovalDecision;
    username: string;
}): string;
//# sourceMappingURL=approval-callback-notice.d.ts.map