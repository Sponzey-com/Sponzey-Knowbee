import { createHash } from "node:crypto"
import { loadPromptTemplate } from "../memory/knowbee-md.js"
export type { TaskIntakeIntentCategory } from "./intake-category.js"

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

export interface TaskIntakeFirstResponsePromptOptions extends TaskIntakePromptOptions {
  mainAgentName: string
  productName: string
  productNameKo: string
  identityContext?: string
}

export interface TaskIntakeFirstResponsePromptAssembly {
  systemPrompt: string
  taskIntakePromptSha256: string
  finalResponsePromptSha256: string
}

function promptSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
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

export function buildTaskIntakeFirstResponseSystemPrompt(
  options: TaskIntakeFirstResponsePromptOptions,
): string {
  return buildTaskIntakeFirstResponsePromptAssembly(options).systemPrompt
}

export function buildTaskIntakeFirstResponsePromptAssembly(
  options: TaskIntakeFirstResponsePromptOptions,
): TaskIntakeFirstResponsePromptAssembly {
  const variables = {
    maxDelegationTurns: options.maxDelegationTurns ?? 0,
    mainAgentName: options.mainAgentName,
    productName: options.productName,
    productNameKo: options.productNameKo,
  }
  const load = (sourceId: string) =>
    loadPromptTemplate({
      sourceId,
      workDir: options.workDir,
      locale: options.locale ?? "en",
      variables,
    })
  const taskIntakePrompt = load("task_intake")
  const finalResponsePrompt = load("final_response")
  const systemPrompt = [
    load("system"),
    load("identity"),
    options.identityContext?.trim(),
    taskIntakePrompt,
    finalResponsePrompt,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n---\n\n")
  return {
    systemPrompt,
    taskIntakePromptSha256: promptSha256(taskIntakePrompt),
    finalResponsePromptSha256: promptSha256(finalResponsePrompt),
  }
}
