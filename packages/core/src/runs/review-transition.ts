import crypto from "node:crypto"
import { insertMessage } from "../db/index.js"
import { logAssistantReply, type DeliverySource } from "./delivery.js"
import type { UserFacingTextSource } from "./loop-directive.js"
import type { RunStepStatus } from "./types.js"

interface ReviewTransitionDependencies {
  appendRunEvent: (runId: string, label: string) => void
  setRunStepStatus: (
    runId: string,
    step: string,
    status: RunStepStatus,
    summary: string,
  ) => unknown
  insertMessage: typeof insertMessage
  writeReplyLog: (source: DeliverySource, text: string) => void
  createId: () => string
  now: () => number
}

const defaultDependencies: ReviewTransitionDependencies = {
  appendRunEvent: () => {},
  setRunStepStatus: () => {},
  insertMessage,
  writeReplyLog: logAssistantReply,
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
}

function canDeliverReviewPreviewSource(source: UserFacingTextSource): boolean {
  return source === "llm_reviewed"
}

export function prepareRunForReview(params: {
  runId: string
  sessionId: string
  source: DeliverySource
  preview: string
  previewSource?: UserFacingTextSource
  workerSessionId?: string
  persistRuntimePreview: boolean
  dependencies?: Partial<ReviewTransitionDependencies>
}): void {
  const dependencies = { ...defaultDependencies, ...params.dependencies }
  const preview = params.preview.trim() ? params.preview : ""
  const previewSource = params.previewSource ?? "llm_generated"

  if (params.workerSessionId) {
    dependencies.appendRunEvent(params.runId, `${params.workerSessionId} 실행 종료`)
  }

  if (preview) {
    dependencies.appendRunEvent(
      params.runId,
      `user_facing_review_preview_source:${previewSource}`,
    )
  }

  const canDeliverPreview = preview ? canDeliverReviewPreviewSource(previewSource) : false
  if (preview && !canDeliverPreview) {
    dependencies.appendRunEvent(
      params.runId,
      `user_facing_review_preview_delivery_blocked:${previewSource}`,
    )
  }

  if (params.persistRuntimePreview && preview && canDeliverPreview) {
    dependencies.insertMessage({
      id: dependencies.createId(),
      session_id: params.sessionId,
      root_run_id: params.runId,
      role: "assistant",
      content: preview,
      tool_calls: null,
      tool_call_id: null,
      created_at: dependencies.now(),
    })
  }

  if (preview && canDeliverPreview) {
    dependencies.writeReplyLog(params.source, preview)
  }
  dependencies.setRunStepStatus(
    params.runId,
    "executing",
    "completed",
    canDeliverPreview ? preview : "응답 생성을 마쳤습니다.",
  )
  dependencies.setRunStepStatus(
    params.runId,
    "reviewing",
    "running",
    "남은 작업이 있는지 검토 중입니다.",
  )
}
