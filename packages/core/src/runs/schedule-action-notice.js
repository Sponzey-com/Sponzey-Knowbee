export function buildScheduleActionResultNotice(params) {
    return {
        kind: "schedule_action_result",
        ok: params.ok,
        actionCount: Math.max(0, Math.trunc(params.actionCount)),
        successCount: Math.max(0, Math.trunc(params.successCount)),
        failureCount: Math.max(0, Math.trunc(params.failureCount)),
        deliveryMode: "control",
        textSource: "schedule_action_result_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
//# sourceMappingURL=schedule-action-notice.js.map