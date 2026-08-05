export function buildProgressMessageNotice() {
    return {
        kind: "progress_message",
        deliveryMode: "progress",
        textSource: "progress_message_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
//# sourceMappingURL=progress-message-notice.js.map