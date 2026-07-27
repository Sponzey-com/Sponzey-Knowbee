import { detectPrimaryMessageLanguage } from "./language.js";
export function buildChannelIngressFailureNotice(input) {
    const language = detectIngressFailureLanguage(input.userMessage);
    const reason = normalizeIngressFailureReason(input.reason);
    const text = language === "ko"
        ? `요청 처리 중 채널 오류가 발생했습니다. 원인: ${reason}`
        : `Channel request processing failed. Reason: ${reason}`;
    return {
        kind: "channel_ingress_failed",
        provider: input.provider,
        language,
        reason,
        text,
        deliveryMode: "diagnostic",
        textSource: "channel_ingress_failure_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function normalizeIngressFailureReason(reason) {
    const normalized = reason.trim();
    return normalized.length > 0 ? normalized : "unknown error";
}
function detectIngressFailureLanguage(text) {
    return detectPrimaryMessageLanguage(text);
}
//# sourceMappingURL=ingress-failure-notice.js.map