import {
  AiChatWebEvidencePipelineAdapter,
  WEB_EVIDENCE_AI_OPERATIONS,
  type WebEvidenceAiOperation,
} from "./web-evidence-pipeline-adapter.js"
import type { AIProvider, ChatParams } from "./types.js"
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js"

export interface FileBackedWebEvidencePipelineAdapterInput {
  provider: AIProvider
  model: string
  workDir: string
  maxTokens?: number
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

export const WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS = WEB_EVIDENCE_AI_OPERATIONS

export function createFileBackedWebEvidencePipelineAdapter(
  input: FileBackedWebEvidencePipelineAdapterInput,
): AiChatWebEvidencePipelineAdapter {
  const sources = loadPromptSourceRegistry(input.workDir)
  const missing = WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS.filter((sourceId) =>
    sources.filter((source) =>
      source.sourceId === sourceId && source.locale === "en" && source.enabled).length !== 1)
  const missingInstructions = WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS
    .map((sourceId) => `${sourceId}_json_instruction_user`)
    .filter((sourceId) =>
      sources.filter((source) =>
        source.sourceId === sourceId && source.locale === "en" && source.enabled).length !== 1)
  if (missing.length > 0 || missingInstructions.length > 0) {
    throw new Error(
      `web evidence pipeline prompt sources missing: ${[
        ...missing,
        ...missingInstructions,
      ].join(", ")}`,
    )
  }
  const promptSourceBlocks = Object.fromEntries(
    WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS.map((sourceId) => {
      const source = sources.find((candidate) =>
        candidate.sourceId === sourceId &&
        candidate.locale === "en" &&
        candidate.enabled)
      if (!source) throw new Error(`web evidence pipeline prompt source missing: ${sourceId}`)
      return [
        sourceId,
        [
          "[Web Evidence Pipeline Prompt Source]",
          "",
          `sourceId: ${source.sourceId}`,
          `locale: ${source.locale}`,
          `usageScope: ${source.usageScope}`,
          `path: ${source.path}`,
          `checksum: ${source.checksum}`,
          "",
          source.content.trim(),
        ].join("\n"),
      ]
    }),
  ) as Record<WebEvidenceAiOperation, string>
  return new AiChatWebEvidencePipelineAdapter({
    provider: input.provider,
    model: input.model,
    promptSourceBlocks,
    workDir: input.workDir,
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
  })
}
