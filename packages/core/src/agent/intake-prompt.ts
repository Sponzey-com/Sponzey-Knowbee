import { loadPromptTemplate } from "../memory/knowbee-md.js"

export type TaskIntakeIntentCategory =
  | "direct_answer"
  | "task_intake"
  | "schedule_request"
  | "clarification"
  | "reject"

export type TaskIntakeMessageMode =
  | "direct_answer"
  | "accepted_receipt"
  | "failed_receipt"
  | "clarification_receipt"

export type TaskIntakeActionType =
  | "reply"
  | "run_task"
  | "delegate_agent"
  | "create_schedule"
  | "update_schedule"
  | "cancel_schedule"
  | "ask_user"
  | "log_only"

export type TaskIntakePriority = "low" | "normal" | "high" | "urgent"

export type TaskApprovalToolName =
  | "screen_capture"
  | "yeonjang_camera_capture"
  | "mouse_click"
  | "keyboard_type"
  | "file_write"
  | "app_launch"
  | "external_action"

export type TaskIntakeTaskProfile =
  | "general_chat"
  | "planning"
  | "coding"
  | "review"
  | "research"
  | "private_local"
  | "summarization"
  | "operations"

export interface TaskIntakePromptOptions {
  maxDelegationTurns?: number
  workDir?: string
  locale?: "ko" | "en"
}

export function buildTaskIntakeSystemPrompt(options: TaskIntakePromptOptions = {}): string {
  const maxDelegationTurns = options.maxDelegationTurns ?? 0
  return loadPromptTemplate({
    sourceId: "task_intake",
    workDir: options.workDir,
    locale: options.locale ?? "en",
    variables: { maxDelegationTurns },
  })
}
