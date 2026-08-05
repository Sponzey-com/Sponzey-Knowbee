import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js"
import {
  LLM_INVOCATION_RECEIPT_SCHEMA_VERSION,
  type LlmInvocationPhase,
  type LlmInvocationReceipt,
  type LlmInvocationTerminalReasonCode,
} from "../observability/llm-invocation-receipt.js"
import type { AIChunk, AIProvider, ChatParams } from "./types.js"
import { isAIProviderInvocationError } from "./provider-failure.js"

export interface ObservedAIProviderOptions {
  repository: LlmInvocationReceiptRepository
  now?: (() => number) | undefined
  idProvider?: (() => string) | undefined
  onDegraded?: ((error: unknown) => void) | undefined
}

export class ObservedAIProvider implements AIProvider {
  readonly id: string
  readonly supportedModels: string[]
  private readonly now: () => number
  private readonly idProvider: () => string

  constructor(
    private readonly provider: AIProvider,
    private readonly options: ObservedAIProviderOptions,
  ) {
    this.id = provider.id
    this.supportedModels = provider.supportedModels
    this.now = options.now ?? Date.now
    this.idProvider = options.idProvider ?? (() => crypto.randomUUID())
  }

  maxContextTokens(model: string): number {
    return this.provider.maxContextTokens(model)
  }

  private append(receipt: LlmInvocationReceipt): void {
    try {
      this.options.repository.append(receipt)
    } catch (error) {
      this.options.onDegraded?.(error)
    }
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    const { observability, ...providerParams } = params
    if (!observability) {
      yield* this.provider.chat(providerParams)
      return
    }
    const {
      invocationId: requestedInvocationId,
      ...invocationContext
    } = observability
    const invocationId = requestedInvocationId?.trim() || this.idProvider()
    const startedAt = this.now()
    const base = {
      schemaVersion: LLM_INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId,
      context: { ...invocationContext },
    } as const
    this.append({ ...base, phase: "started", at: startedAt })
    let inputTokens = 0
    let outputTokens = 0
    let terminalRecorded = false

    const recordTerminal = (
      phase: Exclude<LlmInvocationPhase, "started">,
      reasonCode?: LlmInvocationTerminalReasonCode,
    ): void => {
      if (terminalRecorded) return
      terminalRecorded = true
      const at = this.now()
      this.append({
        ...base,
        phase,
        at,
        durationMs: Math.max(0, at - startedAt),
        ...(phase === "completed" ? { inputTokens, outputTokens } : {}),
        ...(reasonCode ? { reasonCode } : {}),
      })
    }

    try {
      for await (const chunk of this.provider.chat(providerParams)) {
        if (chunk.type === "message_stop") {
          inputTokens = normalizeTokenCount(chunk.usage.input_tokens)
          outputTokens = normalizeTokenCount(chunk.usage.output_tokens)
        }
        yield chunk
      }
      recordTerminal("completed")
    } catch (error) {
      recordTerminal(
        params.signal?.aborted ? "cancelled" : "failed",
        params.signal?.aborted
          ? "aborted"
          : isAIProviderInvocationError(error)
            ? error.reasonCode
            : "provider_error",
      )
      throw error
    } finally {
      if (!terminalRecorded) recordTerminal("cancelled", "consumer_closed")
    }
  }
}

function normalizeTokenCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1_000_000_000, Math.floor(value)))
}
