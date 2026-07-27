export function buildChannelChunkErrorNotice(input) {
    const language = input.language ?? "en";
    const reason = normalizeChannelChunkErrorReason(input.reason);
    return {
        kind: "channel_chunk_error",
        provider: input.provider,
        stage: "chunk_delivery",
        language,
        reason,
        text: language === "ko"
            ? `채널 실행 중 오류가 발생했습니다. 원인: ${reason}`
            : `Channel execution failed. Reason: ${reason}`,
        deliveryMode: "diagnostic",
        textSource: "channel_chunk_error_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function normalizeChannelChunkErrorReason(reason) {
    const normalized = reason.trim();
    return normalized.length > 0 ? normalized : "unknown error";
}
//# sourceMappingURL=chunk-error-notice.js.map