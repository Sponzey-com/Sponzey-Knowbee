import {
  admitWebEvidenceCompression,
  validateWebEvidenceCompressionContext,
  type WebEvidenceCompressionAdmission,
  type WebEvidenceCompressionContext,
  type WebEvidenceSourceMetadata,
} from "../contracts/web-evidence-compression.js"
import type { WebDocumentChunk } from "../contracts/web-document-chunk.js"

export interface WebEvidenceCompressionPort {
  compressEvidence(input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    source: WebEvidenceSourceMetadata
    selectedChunks: readonly WebDocumentChunk[]
  }>): Promise<unknown>
}

export async function compressWebResearchEvidence(
  input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    source: WebEvidenceSourceMetadata
    selectedChunks: readonly WebDocumentChunk[]
  }>,
  port: WebEvidenceCompressionPort,
): Promise<WebEvidenceCompressionAdmission> {
  const requestGoal = input.requestGoal.trim()
  const context: WebEvidenceCompressionContext = Object.freeze({
    source: input.source,
    selectedChunks: Object.freeze([...input.selectedChunks]),
    requiredFactKeys: Object.freeze(input.requiredFactKeys.map((key) => key.trim())),
  })
  if (!requestGoal || requestGoal.length > 2_048 || !validateWebEvidenceCompressionContext(context)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_context_invalid" })
  }

  let receipt: unknown
  try {
    receipt = await port.compressEvidence(Object.freeze({
      requestGoal,
      requiredFactKeys: context.requiredFactKeys,
      source: context.source,
      selectedChunks: context.selectedChunks,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
  }
  return admitWebEvidenceCompression(receipt, context)
}
