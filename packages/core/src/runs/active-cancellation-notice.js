export function buildActiveQueueCancellationNotice(params) {
    return {
        kind: "active_queue_cancellation",
        mode: params.mode,
        hadTargets: params.hadTargets,
        cancelledCount: Math.max(0, Math.trunc(params.cancelledCount)),
        remainingCount: Math.max(0, Math.trunc(params.remainingCount)),
        deliveryMode: "control",
        textSource: "active_queue_cancellation_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
//# sourceMappingURL=active-cancellation-notice.js.map