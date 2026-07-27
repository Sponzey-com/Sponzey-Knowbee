import { loadPromptValue } from "../memory/prompt-fragments.js"
import type { WebChunkSelectionPort } from "../runs/web-chunk-selection.js"
import type { WebEvidenceCompressionPort } from "../runs/web-evidence-compression.js"
import type { WebEvidenceReviewPort } from "../runs/web-evidence-pack.js"
import type { WebEvidenceVerifierPort } from "../runs/web-evidence-verifier.js"
import type { WebSourceSelectionPort } from "../runs/web-source-selection.js"
import type { AIProvider, ChatParams } from "./types.js"

export const WEB_EVIDENCE_AI_OPERATIONS = [
  "web_source_selection",
  "web_chunk_selection",
  "web_evidence_compression",
  "web_evidence_review",
  "web_evidence_verification",
] as const

export type WebEvidenceAiOperation = (typeof WEB_EVIDENCE_AI_OPERATIONS)[number]

export interface AiChatWebEvidencePipelineAdapterOptions {
  provider: AIProvider
  model: string
  promptSourceBlocks: Readonly<Record<WebEvidenceAiOperation, string>>
  maxTokens?: number
  workDir?: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

export class AiChatWebEvidencePipelineAdapter
  implements
    WebSourceSelectionPort,
    WebChunkSelectionPort,
    WebEvidenceCompressionPort,
    WebEvidenceReviewPort,
    WebEvidenceVerifierPort
{
  constructor(private readonly options: AiChatWebEvidencePipelineAdapterOptions) {}

  private async request(operation: WebEvidenceAiOperation, input: unknown): Promise<unknown> {
    let rawOutput = ""
    for await (const chunk of this.options.provider.chat({
      model: this.options.model,
      system: this.options.promptSourceBlocks[operation],
      messages: [{
        role: "user",
        content: JSON.stringify({
          kind: operation,
          instruction: loadPromptValue(
            `${operation}_json_instruction_user`,
            {},
            {
              required: true,
              ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
            },
          ),
          input,
        }),
      }],
      ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
      ...(this.options.observabilityContext ? {
        observability: {
          ...this.options.observabilityContext,
          stage: operation === "web_source_selection" || operation === "web_chunk_selection"
            ? "planning" as const
            : "review" as const,
          operationCode: operation,
        },
      } : {}),
    })) {
      if (chunk.type === "text_delta") rawOutput += chunk.delta
    }
    try {
      const parsed = JSON.parse(rawOutput)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
    } catch {
      // Closed adapter errors never expose model output.
    }
    return {
      web_evidence_adapter_error: "invalid_json_object",
      operation,
    }
  }

  selectSources(input: Parameters<WebSourceSelectionPort["selectSources"]>[0]): Promise<unknown> {
    return this.request("web_source_selection", input)
  }

  selectChunks(input: Parameters<WebChunkSelectionPort["selectChunks"]>[0]): Promise<unknown> {
    return this.request("web_chunk_selection", input)
  }

  compressEvidence(
    input: Parameters<WebEvidenceCompressionPort["compressEvidence"]>[0],
  ): Promise<unknown> {
    return this.request("web_evidence_compression", input)
  }

  reviewEvidence(input: Parameters<WebEvidenceReviewPort["reviewEvidence"]>[0]): Promise<unknown> {
    return this.request("web_evidence_review", input)
  }

  verifyEvidence(input: Parameters<WebEvidenceVerifierPort["verifyEvidence"]>[0]): Promise<unknown> {
    return this.request("web_evidence_verification", input)
  }
}
