export interface ScheduleActionResultNotice {
  kind: "schedule_action_result"
  ok: boolean
  actionCount: number
  successCount: number
  failureCount: number
  deliveryMode: "control"
  textSource: "schedule_action_result_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildScheduleActionResultNotice(params: {
  ok: boolean
  actionCount: number
  successCount: number
  failureCount: number
}): ScheduleActionResultNotice {
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
  }
}
