import type { AgentChunk } from "../../agent/index.js"
import {
  buildArtifactAccessDescriptor,
  type ArtifactStorageContext,
} from "../../artifacts/lifecycle.js"
import {
  type ChunkDeliveryReceipt,
  type RunChunkDeliveryHandler,
  deliverArtifactOnce,
} from "../../runs/delivery.js"
import { sanitizeCompletionAwaitingUserText } from "../../runs/completion-application.js"
import { decideIsolatedToolResponse } from "../../runs/isolated-tool-response.js"
import {
  buildTextDeliveryKey,
  recordMessageLedgerEvent,
  type MessageLedgerDeliveryKind,
} from "../../runs/message-ledger.js"
import type { ArtifactDeliveryResultDetails } from "../../tools/types.js"
import type { DeliveryReceipt } from "../contracts.js"
import { buildChannelChunkErrorNotice } from "../chunk-error-notice.js"
import { renderChannelNoticeText, type ChannelNoticeRenderDependencies } from "../notice-rendering.js"
import { redactLogText } from "../../logger/index.js"
import {
  buildSlackFailedDeliveryReceipt,
  buildSlackSentDeliveryReceipt,
  type SlackDeliveryTarget,
  type SlackFileDeliveryResult,
  type SlackTextPartsDeliveryResult,
} from "./message-delivery.js"

function slackChunkDeliveryErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface SlackChunkResponder {
  sendToolStatus(toolName: string): Promise<string>
  updateToolStatus(messageId: string, toolName: string, success: boolean): Promise<void>
  clearToolStatus?(messageId: string): Promise<void>
  sendFile(filePath: string, caption?: string): Promise<string>
  sendFileWithReceipt?(
    filePath: string,
    idempotencyKey: string,
    caption?: string,
  ): Promise<SlackFileDeliveryResult>
  sendFinalResponse(text: string): Promise<string[]>
  sendFinalResponseWithReceipts?(
    text: string,
    idempotencyKeyPrefix: string,
  ): Promise<SlackTextPartsDeliveryResult>
  sendError(message: string): Promise<string>
}

export interface SlackChunkDeliveryContext {
  artifactStorage: ArtifactStorageContext
  responder: SlackChunkResponder
  sessionId: string
  channelId: string
  threadTs: string
  language?: SlackChunkFallbackLanguage | undefined
  getRunId: () => string | undefined
  deliveryKind?: MessageLedgerDeliveryKind
  parentRunId?: string
  subSessionId?: string
  agentId?: string
  noticeRendering?: ChannelNoticeRenderDependencies | undefined
  recordOutgoingMessageRef: (params: {
    sessionId: string
    runId: string
    channelId: string
    threadTs: string
    messageId: string
    role: "assistant" | "tool"
  }) => void
  logError: (message: string) => void
}

export type SlackChunkFallbackLanguage = "ko" | "en"
export type SlackChunkFallbackReason = "artifact_upload_failed"

export interface SlackChunkFallbackNotice {
  kind: "slack_chunk_fallback"
  reason: SlackChunkFallbackReason
  language: SlackChunkFallbackLanguage
  text: string
  deliveryMode: "diagnostic"
  textSource: "slack_chunk_fallback_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

function isArtifactDeliveryDetails(
  value: unknown,
): value is ArtifactDeliveryResultDetails & { filePath: string } {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<ArtifactDeliveryResultDetails>
  return (
    candidate.kind === "artifact_delivery" &&
    candidate.channel === "slack" &&
    typeof candidate.filePath === "string" &&
    typeof candidate.size === "number"
  )
}

export function buildSlackArtifactFallbackNotice(input: {
  fileName: string
  downloadUrl?: string | undefined
  caption?: string | undefined
  language?: SlackChunkFallbackLanguage | undefined
}): SlackChunkFallbackNotice {
  const language = input.language ?? "ko"
  const title = input.caption?.trim() || input.fileName
  const text = input.downloadUrl
    ? language === "en"
      ? `File upload failed, so a download link is provided in this Slack thread instead.\n- File: ${title}\n- Download: ${input.downloadUrl}`
      : `파일 업로드가 실패해 같은 Slack 스레드에 다운로드 링크로 대신 전달합니다.\n- 파일: ${title}\n- 다운로드: ${input.downloadUrl}`
    : language === "en"
      ? `File upload failed. No safe download link could be created in this Slack thread.\n- File: ${title}`
      : `파일 업로드가 실패했습니다. 안전한 다운로드 링크도 만들 수 없어 같은 Slack 스레드에서 완료할 수 없습니다.\n- 파일: ${title}`
  return {
    kind: "slack_chunk_fallback",
    reason: "artifact_upload_failed",
    language,
    text,
    deliveryMode: "diagnostic",
    textSource: "slack_chunk_fallback_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

function shouldSendToolStartStatus(toolName: string): boolean {
  return toolName !== "shell_exec"
}

export function createSlackChunkDeliveryHandler(
  context: SlackChunkDeliveryContext,
): RunChunkDeliveryHandler {
  let bufferedText = ""
  let toolOwnedResponseActive = false
  const toolMessageIds = new Map<string, string>()

  const recordIfRunPresent = (messageId: string, role: "assistant" | "tool") => {
    const runId = context.getRunId()
    if (!runId) return
    context.recordOutgoingMessageRef({
      sessionId: context.sessionId,
      runId,
      channelId: context.channelId,
      threadTs: context.threadTs,
      messageId,
      role,
    })
  }

  const target = (): SlackDeliveryTarget => ({
    channelId: context.channelId,
    threadTs: context.threadTs,
  })

  const textDeliveryIdempotencyPrefix = (kind: string): string => {
    return `slack:${kind}:${context.getRunId() ?? "pending"}:${context.channelId}:${context.threadTs}`
  }

  const recordSlackTextDeliveryFailure = (
    error: unknown,
    text: string,
    kind: string,
  ): void => {
    const runId = context.getRunId()
    if (!runId) return
    const failedReceipt = buildSlackFailedDeliveryReceipt({
      target: target(),
      idempotencyKey: `${textDeliveryIdempotencyPrefix(kind)}:failed`,
      error,
    })
    recordMessageLedgerEvent({
      runId,
      channel: "slack",
      eventKind: "text_delivery_failed",
      deliveryKind: context.deliveryKind ?? "final",
      deliveryKey: buildTextDeliveryKey(
        "slack",
        JSON.stringify([context.channelId, context.threadTs]),
        text,
      ),
      idempotencyKey: failedReceipt.idempotencyKey,
      status: "failed",
      summary: failedReceipt.status === "rate_limited"
        ? "Slack text delivery was rate limited."
        : "Slack text delivery failed.",
      detail: {
        textLength: text.length,
        receiptStatus: failedReceipt.status,
        errorCode: failedReceipt.errorCode ?? null,
        errorMessage: failedReceipt.errorMessage ?? null,
        retryAfterMs: failedReceipt.retryAfterMs ?? null,
      },
    })
  }

  const sendFinalText = async (
    text: string,
    kind: "final" | "artifact-fallback",
  ): Promise<{ messageIds: string[]; deliveryReceipts: DeliveryReceipt[]; deliveredText: string } | undefined> => {
    const idempotencyPrefix = textDeliveryIdempotencyPrefix(kind)
    try {
      if (context.responder.sendFinalResponseWithReceipts) {
        const result = await context.responder.sendFinalResponseWithReceipts(text, idempotencyPrefix)
        return {
          messageIds: result.messageIds,
          deliveryReceipts: result.receipts,
          deliveredText: text,
        }
      }
      const messageIds = await context.responder.sendFinalResponse(text)
      return {
        messageIds,
        deliveryReceipts: messageIds.map((messageId, index) => buildSlackSentDeliveryReceipt({
          target: target(),
          idempotencyKey: `${idempotencyPrefix}:part:${index + 1}`,
          messageId,
        })),
        deliveredText: text,
      }
    } catch (error) {
      recordSlackTextDeliveryFailure(error, text, kind)
      context.logError(`Failed to send Slack text delivery: ${slackChunkDeliveryErrorMessage(error)}`)
      return undefined
    }
  }

  const sendFileWithReceipt = async (
    filePath: string,
    idempotencyKey: string,
    caption?: string,
  ): Promise<SlackFileDeliveryResult> => {
    if (context.responder.sendFileWithReceipt) {
      return context.responder.sendFileWithReceipt(filePath, idempotencyKey, caption)
    }
    const messageId = await context.responder.sendFile(filePath, caption)
    return {
      messageId,
      receipt: buildSlackSentDeliveryReceipt({
        target: target(),
        idempotencyKey,
        messageId,
      }),
    }
  }

  return async (chunk: AgentChunk): Promise<ChunkDeliveryReceipt | undefined> => {
    if (chunk.type === "text") {
      if (toolOwnedResponseActive) return
      if (chunk.textSource !== "llm_reviewed") return
      bufferedText += chunk.delta
      return
    }

    if (chunk.type === "tool_start") {
      if (!shouldSendToolStartStatus(chunk.toolName)) return
      const messageId = await context.responder.sendToolStatus(chunk.toolName)
      toolMessageIds.set(chunk.toolName, messageId)
      recordIfRunPresent(messageId, "tool")
      return
    }

    if (chunk.type === "tool_end") {
      const toolMessageId = toolMessageIds.get(chunk.toolName)
      if (toolMessageId) {
        if (chunk.success) {
          await context.responder.clearToolStatus?.(toolMessageId)
        } else {
          await context.responder.updateToolStatus(toolMessageId, chunk.toolName, false)
        }
        toolMessageIds.delete(chunk.toolName)
      } else if (!chunk.success) {
        const failureMessageId = await context.responder.sendToolStatus(chunk.toolName)
        await context.responder.updateToolStatus(failureMessageId, chunk.toolName, false)
        recordIfRunPresent(failureMessageId, "tool")
      }

      const isolatedToolResponse = decideIsolatedToolResponse(chunk)
      if (isolatedToolResponse.kind === "artifact" && isArtifactDeliveryDetails(chunk.details)) {
        const details = chunk.details
        const caption = details.caption
          ? sanitizeCompletionAwaitingUserText(details.caption)
          : undefined
        const receipt = await deliverArtifactOnce({
          artifactStorage: context.artifactStorage,
          runId: context.getRunId(),
          channel: "slack",
          filePath: details.filePath,
          channelTarget: `${context.channelId}:${context.threadTs}`,
          sizeBytes: details.size,
          ...(details.mimeType ? { mimeType: details.mimeType } : {}),
          task: async () => {
            try {
              const sent = await sendFileWithReceipt(
                details.filePath,
                `slack:file:${context.getRunId() ?? "pending"}:${details.filePath}`,
                caption,
              )
              recordIfRunPresent(sent.messageId, "assistant")
              return {
                artifactDeliveries: [
                  {
                    toolName: chunk.toolName,
                    channel: "slack" as const,
                    filePath: details.filePath,
                    ...(sent.permalink ? { url: sent.permalink } : {}),
                    ...(caption ? { caption } : {}),
                    messageId: sent.messageId,
                    deliveryReceipts: [sent.receipt],
                  },
                ],
              }
            } catch (error) {
              const message = slackChunkDeliveryErrorMessage(error)
              context.logError(`Failed to send Slack file: ${message}`)
              const artifact = buildArtifactAccessDescriptor({
                filePath: details.filePath,
                sizeBytes: details.size,
                ...(details.mimeType ? { mimeType: details.mimeType } : {}),
              }, context.artifactStorage)
              const fallbackNotice = buildSlackArtifactFallbackNotice({
                fileName: artifact.fileName,
                downloadUrl: artifact.ok ? artifact.downloadUrl : undefined,
                caption,
                language: context.language,
              })
              const sent = await sendFinalText(fallbackNotice.text, "artifact-fallback")
              if (!sent) throw error
              for (const fallbackMessageId of sent.messageIds) {
                recordIfRunPresent(fallbackMessageId, "assistant")
              }
              return {
                textDeliveries: [
                  {
                    channel: "slack" as const,
                    text: sent.deliveredText,
                    messageIds: sent.messageIds,
                    deliveryReceipts: sent.deliveryReceipts,
                  },
                ],
                ...(artifact.ok && artifact.url
                  ? {
                      artifactDeliveries: [
                        {
                          toolName: chunk.toolName,
                          channel: "slack" as const,
                          filePath: details.filePath,
                          url: artifact.url,
                          ...(artifact.previewUrl ? { previewUrl: artifact.previewUrl } : {}),
                          ...(artifact.downloadUrl ? { downloadUrl: artifact.downloadUrl } : {}),
                          previewable: artifact.previewable,
                          mimeType: artifact.mimeType,
                          sizeBytes: details.size,
                          ...(caption ? { caption } : {}),
                          ...(sent.messageIds[0] !== undefined ? { messageId: sent.messageIds[0] } : {}),
                          deliveryReceipts: sent.deliveryReceipts,
                        },
                      ],
                    }
                  : {}),
              }
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
      return
    }

    if (chunk.type === "done") {
      if (!bufferedText) return
      const deliveredText = bufferedText
      const sent = await sendFinalText(bufferedText, "final")
      if (!sent) {
        bufferedText = ""
        return
      }
      for (const messageId of sent.messageIds) {
        recordIfRunPresent(messageId, "assistant")
      }
      bufferedText = ""
      return {
        textDeliveries: [
          {
            channel: "slack",
            text: deliveredText,
            messageIds: sent.messageIds,
            deliveryReceipts: sent.deliveryReceipts,
            ...(context.deliveryKind ? { deliveryKind: context.deliveryKind } : {}),
            ...(context.parentRunId ? { parentRunId: context.parentRunId } : {}),
            ...(context.subSessionId ? { subSessionId: context.subSessionId } : {}),
            ...(context.agentId ? { agentId: context.agentId } : {}),
          },
        ],
      }
    }

    if (chunk.type === "error") {
      if (toolOwnedResponseActive) return
      const notice = buildChannelChunkErrorNotice({
        provider: "slack",
        reason: redactLogText(chunk.message),
        language: context.language,
      })
      const renderedNotice = await renderChannelNoticeText({
        originalRequest: context.language === "ko" ? "Slack 채널 오류" : "Slack channel error",
        rawText: notice.text,
        ...(context.noticeRendering ? { dependencies: context.noticeRendering } : {}),
      })
      if (renderedNotice.status === "blocked") {
        context.logError(`Skipped Slack chunk error notice delivery: ${renderedNotice.reason}`)
        bufferedText = ""
        return
      }
      const messageId = await context.responder.sendError(renderedNotice.text)
      recordIfRunPresent(messageId, "assistant")
      bufferedText = ""
    }
  }
}
