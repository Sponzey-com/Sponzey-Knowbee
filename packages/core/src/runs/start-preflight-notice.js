export function buildStartPreflightFailureNotice(failure) {
    return {
        kind: "start_preflight_failure",
        code: failure.code,
        summary: normalizeStartPreflightSummary(failure.summary),
        deliveryMode: "diagnostic",
        textSource: "start_preflight_failure_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function normalizeStartPreflightSummary(summary) {
    const normalized = summary.trim();
    return normalized.length > 0 ? normalized : "Start preflight failed.";
}
//# sourceMappingURL=start-preflight-notice.js.map