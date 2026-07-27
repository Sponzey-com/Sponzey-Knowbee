export interface ProgressMessageNotice {
    kind: "progress_message";
    deliveryMode: "progress";
    textSource: "progress_message_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildProgressMessageNotice(): ProgressMessageNotice;
//# sourceMappingURL=progress-message-notice.d.ts.map