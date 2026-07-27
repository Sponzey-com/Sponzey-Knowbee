import { buildStructuredExecutionBrief } from "./request-prompt.js"
import type { TaskExecutionSemantics } from "../agent/intake.js"
import { loadPromptTemplate, type PromptTemplateVariables } from "../memory/knowbee-md.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"

const SCHEDULED_SOURCE_IDS = {
  defaultDestination: "scheduled_default_destination_user",
  structuredRequestHeader: "scheduled_structured_request_header_user",
  contextTaskPayload: "scheduled_context_task_payload_user",
  contextTaskProfile: "scheduled_context_task_profile_user",
  contextTimeReached: "scheduled_context_time_reached_user",
  completeTimeReached: "scheduled_complete_time_reached_user",
  completeDestination: "scheduled_complete_destination_user",
} as const
const STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID = "structured_execution_section_labels_user"

function structuredExecutionSectionLabel(key: string, variables: PromptTemplateVariables = {}): string {
  const entries = loadPromptValue(STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID, variables, { required: true })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): [string, string] => {
      const separator = line.indexOf("=")
      if (separator < 0) return [line, ""]
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    })
  const value = new Map(entries).get(key)
  if (!value) throw new Error(`structured execution section label missing: ${key}`)
  return value
}

export interface ScheduledRunExecutionOptions {
  toolsEnabled: boolean
  contextMode: "isolated"
}

export function shouldDisableToolsForScheduledTask(
  task: string,
  taskProfile: string | undefined,
  executionSemantics?: TaskExecutionSemantics | undefined,
): boolean {
  void task
  void taskProfile
  if (!executionSemantics) return false
  return executionSemantics.filesystemEffect === "none"
    && executionSemantics.privilegedOperation === "none"
    && executionSemantics.artifactDelivery !== "direct"
}

export function getScheduledRunExecutionOptions(
  task: string,
  taskProfile: string | undefined,
  executionSemantics?: TaskExecutionSemantics | undefined,
): ScheduledRunExecutionOptions {
  return {
    toolsEnabled: !shouldDisableToolsForScheduledTask(task, taskProfile, executionSemantics),
    contextMode: "isolated",
  }
}

export function extractDirectChannelDeliveryText(task: string): string | null {
  void task
  return null
}

function buildScheduledStructuredRequest(params: {
  task: string
  goal: string
  taskProfile: string
  destination?: string
}): string {
  const target = params.goal.trim()
  const destination = params.destination?.trim()
    || loadPromptValue(SCHEDULED_SOURCE_IDS.defaultDestination, {}, { required: true })
  const contextLines = [
    loadPromptValue(SCHEDULED_SOURCE_IDS.contextTaskPayload, { task: params.task.trim() }, { required: true }),
    loadPromptValue(SCHEDULED_SOURCE_IDS.contextTaskProfile, { taskProfile: params.taskProfile.trim() }, { required: true }),
    loadPromptValue(SCHEDULED_SOURCE_IDS.contextTimeReached, {}, { required: true }),
  ].filter(Boolean)
  const completeConditionLines = [
    loadPromptValue(SCHEDULED_SOURCE_IDS.completeTimeReached, {}, { required: true }),
    loadPromptValue(SCHEDULED_SOURCE_IDS.completeDestination, { destination }, { required: true }),
  ]

  return buildStructuredExecutionBrief({
    header: loadPromptValue(SCHEDULED_SOURCE_IDS.structuredRequestHeader, {}, { required: true }),
    structuredRequest: {
      source_language: "unknown",
      normalized_english: [
        `${structuredExecutionSectionLabel("target_label")} ${target}`,
        `${structuredExecutionSectionLabel("to_label")} ${destination}`,
        `${structuredExecutionSectionLabel("context_label")} ${contextLines.join(" | ")}`,
        `${structuredExecutionSectionLabel("complete_condition_label")} ${completeConditionLines.join(" | ")}`,
      ].join("\n"),
      target,
      to: destination,
      context: contextLines,
      complete_condition: completeConditionLines,
    },
    executionSemantics: {
      filesystemEffect: "none",
      privilegedOperation: "none",
      artifactDelivery: "none",
      approvalRequired: false,
      approvalTool: "external_action",
    },
  })
}

function normalizeScheduledPrompt(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildPreferredTargetBlock(preferredTarget: string | undefined): string {
  if (!preferredTarget) return ""
  return `${structuredExecutionSectionLabel("preferred_target_header")}\n${preferredTarget}`
}

function buildScheduledToolInstruction(toolsEnabled: boolean): string {
  return loadPromptTemplate({
    sourceId: toolsEnabled
      ? "scheduled_tool_enabled_instruction_user"
      : "scheduled_tool_disabled_instruction_user",
  }).trim()
}

export function buildScheduledFollowupPrompt(params: {
  task: string
  goal?: string
  taskProfile?: string
  preferredTarget?: string
  toolsEnabled: boolean
  destination?: string
}): string {
  const goal = params.goal?.trim() || params.task.trim()
  const taskProfile = params.taskProfile?.trim() || "general_chat"
  const preferredTarget = params.preferredTarget?.trim()

  return normalizeScheduledPrompt(loadPromptTemplate({
    sourceId: "scheduled_followup_user",
    variables: {
      structuredRequest: buildScheduledStructuredRequest({
        task: params.task,
        goal,
        taskProfile,
        ...(params.destination ? { destination: params.destination } : {}),
      }),
      preferredTargetBlock: buildPreferredTargetBlock(preferredTarget),
      toolInstruction: buildScheduledToolInstruction(params.toolsEnabled),
    },
  }))
}
