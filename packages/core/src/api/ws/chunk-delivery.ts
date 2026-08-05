import { basename } from "node:path"
import type { AgentChunk } from "../../agent/index.js"
import {
  buildArtifactAccessDescriptor,
  resolveArtifactReference,
  type ArtifactStorageContext,
} from "../../artifacts/lifecycle.js"
import { eventBus } from "../../events/index.js"
import {
  type ChunkDeliveryReceipt,
  type RunChunkDeliveryHandler,
  deliverArtifactOnce,
} from "../../runs/delivery.js"
import { decideIsolatedToolResponse } from "../../runs/isolated-tool-response.js"
import { sanitizeCompletionAwaitingUserText } from "../../runs/completion-application.js"
import type { MessageLedgerDeliveryKind } from "../../runs/message-ledger.js"
import {
  isArtifactDeliveryResultDetails,
  type ArtifactDeliveryResultDetails,
} from "../../tools/types.js"

function isWebUiArtifactDeliveryDetails(value: unknown): value is ArtifactDeliveryResultDetails {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<ArtifactDeliveryResultDetails>
  return (
    isArtifactDeliveryResultDetails(value) &&
    candidate.channel === "webui" &&
    typeof candidate.size === "number"
  )
}

export function createWebUiChunkDeliveryHandler(params: {
  artifactStorage: ArtifactStorageContext
  sessionId: string
  runId: string
  deliveryKind?: MessageLedgerDeliveryKind
  parentRunId?: string
  subSessionId?: string
  agentId?: string
}): RunChunkDeliveryHandler {
  let bufferedText = ""
  let toolOwnedResponseActive = false
  let canonicalFinalDelivered = false

  return async (chunk: AgentChunk): Promise<ChunkDeliveryReceipt | undefined> => {
    if (chunk.type === "text") {
      if (canonicalFinalDelivered) return
      if (chunk.textSource !== "llm_reviewed") return
      bufferedText += chunk.delta
      return
    }

    if (chunk.type === "tool_end") {
      const isolatedToolResponse = decideIsolatedToolResponse(chunk)
      if (
        isolatedToolResponse.kind === "artifact" &&
        chunk.success &&
        isWebUiArtifactDeliveryDetails(chunk.details)
      ) {
        const details = chunk.details
        const artifactRef = "artifactRef" in details ? details.artifactRef : undefined
        if (!details.filePath && !artifactRef) return undefined
        const resolvedArtifact = "filePath" in details && details.filePath
          ? {
              ok: true as const,
              filePath: details.filePath,
              mimeType: details.mimeType,
              sizeBytes: details.size,
            }
          : resolveArtifactReference({
              artifactRef: artifactRef!,
              runId: params.runId,
            }, params.artifactStorage)
        if (!resolvedArtifact.ok) return undefined
        const filePath = resolvedArtifact.filePath
        const mimeType = details.mimeType ?? resolvedArtifact.mimeType
        const sizeBytes = details.size || resolvedArtifact.sizeBytes
        const caption = details.caption
          ? sanitizeCompletionAwaitingUserText(details.caption)
          : undefined
        const receipt = await deliverArtifactOnce({
          artifactStorage: params.artifactStorage,
          runId: params.runId,
          channel: "webui",
          filePath,
          channelTarget: params.sessionId,
          sizeBytes,
          ...(mimeType ? { mimeType } : {}),
          task: async () => {
            const artifact = buildArtifactAccessDescriptor({
              filePath,
              sizeBytes,
              ...(mimeType ? { mimeType } : {}),
            }, params.artifactStorage)
            if (!artifact.ok || !artifact.url) return undefined

            eventBus.emit("agent.artifact", {
              sessionId: params.sessionId,
              runId: params.runId,
              url: artifact.url,
              ...(artifact.previewUrl ? { previewUrl: artifact.previewUrl } : {}),
              ...(artifact.downloadUrl ? { downloadUrl: artifact.downloadUrl } : {}),
              previewable: artifact.previewable,
              fileName: basename(artifact.filePath),
              mimeType: artifact.mimeType,
              ...(caption ? { caption } : {}),
            })
            return {
              artifactDeliveries: [
                {
                  toolName: chunk.toolName,
                  channel: "webui" as const,
                  filePath,
                  url: artifact.url,
                  ...(artifact.previewUrl ? { previewUrl: artifact.previewUrl } : {}),
                  ...(artifact.downloadUrl ? { downloadUrl: artifact.downloadUrl } : {}),
                  previewable: artifact.previewable,
                  mimeType: artifact.mimeType,
                  sizeBytes: details.size,
                  ...(caption ? { caption } : {}),
                },
              ],
            }
          },
        })
        if (receipt) {
          toolOwnedResponseActive = true
          bufferedText = ""
          return receipt
        }
      }

      if (isolatedToolResponse.kind === "text" && isolatedToolResponse.text) {
        toolOwnedResponseActive = true
        bufferedText = sanitizeCompletionAwaitingUserText(isolatedToolResponse.text)
      }
    }

    if (chunk.type === "done") {
      if (canonicalFinalDelivered) return
      if (!bufferedText.trim()) return
      const deliveredText = bufferedText
      bufferedText = ""
      canonicalFinalDelivered = true
      return {
        textDeliveries: [
          {
            channel: "webui",
            text: deliveredText,
            ...(params.deliveryKind ? { deliveryKind: params.deliveryKind } : {}),
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.subSessionId ? { subSessionId: params.subSessionId } : {}),
            ...(params.agentId ? { agentId: params.agentId } : {}),
          },
        ],
      }
    }

    if (chunk.type === "error") {
      if (toolOwnedResponseActive) {
        return
      }
      bufferedText = ""
    }
  }
}
