export interface ScheduleActionResultNotice {
    kind: "schedule_action_result";
    ok: boolean;
    actionCount: number;
    successCount: number;
    failureCount: number;
    deliveryMode: "control";
    textSource: "schedule_action_result_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildScheduleActionResultNotice(params: {
    ok: boolean;
    actionCount: number;
    successCount: number;
    failureCount: number;
}): ScheduleActionResultNotice;
//# sourceMappingURL=schedule-action-notice.d.ts.map