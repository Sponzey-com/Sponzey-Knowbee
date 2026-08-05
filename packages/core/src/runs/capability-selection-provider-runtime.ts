import type { AIProvider, ChatParams } from "../ai/types.js"
import type {
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionSchemaRepairProvider,
} from "../contracts/llm-capability-selection.js"
import { redactLogText } from "../logger/index.js"
import { createFileBackedCapabilitySelectionProvider } from "../orchestration/prompt-policy-adapter.js"

export interface RuntimeCapabilitySelectionProviderFactoryInput {
  provider: AIProvider
  model: string
  workDir: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
  maxTokens: number
  deadlineMs: number
  maxVisibleTextBytes: number
}

export type RuntimeCapabilitySelectionProviderResolution =
  | {
      status: "ready"
      capabilitySelectionProvider: LlmCapabilitySelectionAttemptProvider &
        LlmCapabilitySelectionSchemaRepairProvider
      fieldDebugEvent: string
    }
  | {
      status: "skipped"
      reasonCode: "provider_missing" | "model_missing"
      fieldDebugEvent: string
    }
  | {
      status: "unavailable"
      reasonCode: "capability_selection_provider_factory_failed"
      fieldDebugEvent: string
    }

function safeReasonDetail(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : String(error ?? "unknown_error")
  return redactLogText(message).replace(/\s+/gu, "_").slice(0, 120)
}

export function createRuntimeCapabilitySelectionProvider(input: {
  provider?: AIProvider
  model?: string
  workDir: string
  observabilityContext?: RuntimeCapabilitySelectionProviderFactoryInput["observabilityContext"]
  factory?: (
    input: RuntimeCapabilitySelectionProviderFactoryInput,
  ) => LlmCapabilitySelectionAttemptProvider & LlmCapabilitySelectionSchemaRepairProvider
}): RuntimeCapabilitySelectionProviderResolution {
  if (!input.provider) {
    return {
      status: "skipped",
      reasonCode: "provider_missing",
      fieldDebugEvent: "runtime_capability_selection_provider:skipped:provider_missing",
    }
  }
  const model = input.model?.trim()
  if (!model) {
    return {
      status: "skipped",
      reasonCode: "model_missing",
      fieldDebugEvent: "runtime_capability_selection_provider:skipped:model_missing",
    }
  }

  try {
    const capabilitySelectionProvider = (
      input.factory ?? createFileBackedCapabilitySelectionProvider
    )({
      provider: input.provider,
      model,
      workDir: input.workDir,
      maxTokens: 12_288,
      deadlineMs: 180_000,
      maxVisibleTextBytes: 65_536,
      ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    })
    return {
      status: "ready",
      capabilitySelectionProvider,
      fieldDebugEvent: "runtime_capability_selection_provider:ready",
    }
  } catch (error) {
    return {
      status: "unavailable",
      reasonCode: "capability_selection_provider_factory_failed",
      fieldDebugEvent: [
        "runtime_capability_selection_provider",
        "unavailable",
        "capability_selection_provider_factory_failed",
        safeReasonDetail(error),
      ].join(":"),
    }
  }
}
