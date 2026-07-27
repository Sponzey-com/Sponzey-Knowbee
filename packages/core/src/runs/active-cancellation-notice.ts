import type { ActiveQueueCancellationMode } from "./entry-semantics.js"

export interface ActiveQueueCancellationNotice {
  kind: "active_queue_cancellation"
  mode: ActiveQueueCancellationMode
  hadTargets: boolean
  cancelledCount: number
  remainingCount: number
  deliveryMode: "control"
  textSource: "active_queue_cancellation_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildActiveQueueCancellationNotice(params: {
  mode: ActiveQueueCancellationMode
  hadTargets: boolean
  cancelledCount: number
  remainingCount: number
}): ActiveQueueCancellationNotice {
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
  }
}
