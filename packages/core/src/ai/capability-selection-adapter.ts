import type {
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionAttemptResult,
  LlmCapabilitySelectionDecision,
  LlmCapabilitySelectionProvider,
  LlmCapabilitySelectionProviderInput,
  LlmCapabilitySelectionSchemaRepairProvider,
  LlmCapabilitySelectionSchemaRepairProviderInput,
} from "../contracts/llm-capability-selection.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import {
  collectStructuredJsonAttempt,
  StructuredJsonAttemptError,
} from "./structured-json-attempt.js"
import type { AIProvider, ChatParams } from "./types.js"

export interface AiChatCapabilitySelectionProviderAdapterOptions {
  provider: AIProvider
  model: string
  capabilitySelectionPromptSourceBlock: string
  maxTokens?: number
  deadlineMs?: number
  maxVisibleTextBytes?: number
  workDir?: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

export class AiChatCapabilitySelectionProviderAdapter
  implements
    LlmCapabilitySelectionProvider,
    LlmCapabilitySelectionAttemptProvider,
    LlmCapabilitySelectionSchemaRepairProvider
{
  constructor(private readonly options: AiChatCapabilitySelectionProviderAdapterOptions) {}

  async selectCapability(
    input: LlmCapabilitySelectionProviderInput,
  ): Promise<LlmCapabilitySelectionDecision> {
    const result = await this.attemptCapabilitySelection(input)
    if (result.status === "completed") {
      return result.output as LlmCapabilitySelectionDecision
    }
    if (result.status === "invalid_output") {
      return {
        capability_selection_adapter_error: "invalid_json_object",
      } as unknown as LlmCapabilitySelectionDecision
    }
    throw new StructuredJsonAttemptError(result.reasonCode)
  }

  attemptCapabilitySelection(
    input: LlmCapabilitySelectionProviderInput,
  ): Promise<LlmCapabilitySelectionAttemptResult> {
    return this.runAttempt({
      kind: "capability_selection",
      instruction: this.jsonInstruction(),
      input,
    }, "capability_selection")
  }

  repairCapabilitySelection(
    input: LlmCapabilitySelectionSchemaRepairProviderInput,
  ): Promise<LlmCapabilitySelectionAttemptResult> {
    return this.runAttempt({
      kind: "capability_selection_schema_repair",
      instruction: this.jsonInstruction(),
      repair: input,
    }, "capability_selection_schema_repair")
  }

  private jsonInstruction(): string {
    return loadPromptValue(
      "capability_selection_json_instruction_user",
      {},
      {
        required: true,
        ...(this.options.workDir === undefined
          ? {}
          : { workDir: this.options.workDir }),
      },
    )
  }

  private async runAttempt(
    payload: Record<string, unknown>,
    operationCode: "capability_selection" | "capability_selection_schema_repair",
  ): Promise<LlmCapabilitySelectionAttemptResult> {
    const result = await collectStructuredJsonAttempt({
      provider: this.options.provider,
      chatParams: {
        model: this.options.model,
        system: this.options.capabilitySelectionPromptSourceBlock,
        messages: [
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
        ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
        ...(this.options.observabilityContext
          ? {
              observability: {
                ...this.options.observabilityContext,
                stage: "planning" as const,
                operationCode,
              },
            }
          : {}),
      },
      deadlineMs: this.options.deadlineMs ?? 180_000,
      maxVisibleTextBytes: this.options.maxVisibleTextBytes ?? 65_536,
    })
    if (result.status === "parsed") {
      return { status: "completed", output: result.value }
    }
    if (result.status === "invalid_json" || result.status === "json_object_required") {
      return { status: "invalid_output", reasonCode: result.status }
    }
    if (result.status === "cancelled") {
      return { status: "cancelled", reasonCode: "cancelled" }
    }
    return { status: "failed", reasonCode: result.status }
  }
}
