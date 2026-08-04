import { buildArtifactAccessDescriptor, resolveArtifactReference, } from "../../artifacts/lifecycle.js";
import { deliverArtifactOnce, } from "../../runs/delivery.js";
import { sanitizeCompletionAwaitingUserText } from "../../runs/completion-application.js";
import { decideIsolatedToolResponse } from "../../runs/isolated-tool-response.js";
import { buildTextDeliveryKey, recordMessageLedgerEvent, } from "../../runs/message-ledger.js";
import { isArtifactDeliveryResultDetails, } from "../../tools/types.js";
import { buildChannelChunkErrorNotice } from "../chunk-error-notice.js";
import { renderChannelNoticeText } from "../notice-rendering.js";
import { redactLogText } from "../../logger/index.js";
import { buildTelegramFailedDeliveryReceipt, buildTelegramSentDeliveryReceipt, } from "./message-delivery.js";
import { splitMessage } from "./markdown.js";
function telegramChunkDeliveryErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
const DEFAULT_MAX_TEXT_CHUNKS = 20;
const FALLBACK_PREVIEW_LENGTH = 1200;
export function resolveTelegramChunkFallbackLanguage(languageCode) {
    const normalized = languageCode?.toLowerCase();
    if (normalized?.startsWith("en"))
        return "en";
    return "ko";
}
function isArtifactDeliveryDetails(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return (isArtifactDeliveryResultDetails(value) &&
        candidate.channel === "telegram" &&
        typeof candidate.size === "number");
}
export function buildTelegramArtifactFallbackNotice(input) {
    const language = input.language ?? "ko";
    const title = input.caption?.trim() || input.fileName;
    const text = input.downloadUrl
        ? language === "en"
            ? `File upload failed, so a download link is provided in this chat instead.\n- File: ${title}\n- Download: ${input.downloadUrl}`
            : `파일 업로드가 실패해 같은 대화에 다운로드 링크로 대신 전달합니다.\n- 파일: ${title}\n- 다운로드: ${input.downloadUrl}`
        : language === "en"
            ? `File upload failed. No safe download link could be created in this chat.\n- File: ${title}`
            : `파일 업로드가 실패했습니다. 안전한 다운로드 링크도 만들 수 없어 같은 대화에서 완료할 수 없습니다.\n- 파일: ${title}`;
    return {
        kind: "telegram_chunk_fallback",
        reason: "artifact_upload_failed",
        language,
        text,
        deliveryMode: "diagnostic",
        textSource: "telegram_chunk_fallback_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function shouldSendToolStartStatus(toolName) {
    return toolName !== "shell_exec";
}
export function buildTelegramTooManyChunksFallbackText(input) {
    return buildTelegramTooManyChunksFallbackNotice(input).text;
}
export function buildTelegramTooManyChunksFallbackNotice(input) {
    const language = input.language ?? "ko";
    const preview = input.text.trim().slice(0, FALLBACK_PREVIEW_LENGTH);
    const suffix = input.text.trim().length > FALLBACK_PREVIEW_LENGTH ? "\n\n...[truncated]" : "";
    const lines = language === "en"
        ? [
            `The result is too long and could be split into ${input.estimatedChunks} Telegram messages, so automatic split delivery was stopped.`,
            `Maximum allowed chunks: ${input.maxChunks}`,
            "Check the full result in the WebUI run detail or generated artifact.",
            "",
            preview + suffix,
        ]
        : [
            `결과가 너무 길어 Telegram 메시지 ${input.estimatedChunks}개로 나뉠 수 있어 자동 분할 전송을 중단했습니다.`,
            `최대 허용 분할 수: ${input.maxChunks}`,
            "전체 결과는 WebUI 실행 상세 또는 생성된 artifact에서 확인해 주세요.",
            "",
            preview + suffix,
        ];
    return {
        kind: "telegram_chunk_fallback",
        reason: "too_many_chunks",
        language,
        text: lines.join("\n"),
        deliveryMode: "diagnostic",
        textSource: "telegram_chunk_fallback_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
export function createTelegramChunkDeliveryHandler(context) {
    let bufferedText = "";
    let toolOwnedResponseActive = false;
    let canonicalFinalDelivered = false;
    const toolMessageIds = new Map();
    const recordIfRunPresent = (messageId, role) => {
        const runId = context.getRunId();
        if (!runId)
            return;
        context.recordOutgoingMessageRef({
            sessionId: context.sessionId,
            runId,
            chatId: context.chatId,
            ...(context.threadId !== undefined ? { threadId: context.threadId } : {}),
            messageId,
            role,
        });
    };
    const target = () => ({
        chatId: context.chatId,
        ...(context.threadId !== undefined ? { threadId: context.threadId } : {}),
    });
    const textDeliveryIdempotencyPrefix = (kind) => {
        return `telegram:${kind}:${context.getRunId() ?? "pending"}:${context.chatId}:${context.threadId ?? "main"}`;
    };
    const sendFinalText = async (text, kind) => {
        const estimatedChunks = splitMessage(text).length;
        const maxChunks = context.maxTextChunks ?? DEFAULT_MAX_TEXT_CHUNKS;
        const deliveredText = estimatedChunks > maxChunks
            ? buildTelegramTooManyChunksFallbackText({ text, estimatedChunks, maxChunks, language: context.language })
            : text;
        const idempotencyPrefix = textDeliveryIdempotencyPrefix(kind);
        try {
            if (context.responder.sendFinalResponseWithReceipts) {
                const result = await context.responder.sendFinalResponseWithReceipts(deliveredText, idempotencyPrefix);
                return {
                    messageIds: result.messageIds,
                    deliveryReceipts: result.receipts,
                    deliveredText,
                };
            }
            const messageIds = await context.responder.sendFinalResponse(deliveredText);
            return {
                messageIds,
                deliveryReceipts: messageIds.map((messageId, index) => buildTelegramSentDeliveryReceipt({
                    target: target(),
                    idempotencyKey: `${idempotencyPrefix}:part:${index + 1}`,
                    messageId,
                })),
                deliveredText,
            };
        }
        catch (error) {
            recordTelegramTextDeliveryFailure(error, deliveredText, kind);
            context.logError(`Failed to send Telegram text delivery: ${telegramChunkDeliveryErrorMessage(error)}`);
            return undefined;
        }
    };
    const recordTelegramTextDeliveryFailure = (error, text, kind) => {
        const runId = context.getRunId();
        if (!runId)
            return;
        const failedReceipt = buildTelegramFailedDeliveryReceipt({
            target: target(),
            idempotencyKey: `${textDeliveryIdempotencyPrefix(kind)}:failed`,
            error,
        });
        recordMessageLedgerEvent({
            runId,
            channel: "telegram",
            eventKind: "text_delivery_failed",
            deliveryKind: context.deliveryKind ?? "final",
            deliveryKey: buildTextDeliveryKey("telegram", JSON.stringify([context.chatId, context.threadId ?? "main"]), text),
            idempotencyKey: failedReceipt.idempotencyKey,
            status: "failed",
            summary: "Telegram text delivery failed.",
            detail: {
                textLength: text.length,
                receiptStatus: failedReceipt.status,
                errorCode: failedReceipt.errorCode ?? null,
                errorMessage: failedReceipt.errorMessage ?? null,
            },
        });
    };
    const sendFileWithReceipt = async (filePath, idempotencyKey, caption) => {
        if (context.responder.sendFileWithReceipt) {
            return context.responder.sendFileWithReceipt(filePath, idempotencyKey, caption);
        }
        const messageId = await context.responder.sendFile(filePath, caption);
        return {
            messageId,
            receipt: buildTelegramSentDeliveryReceipt({
                target: target(),
                idempotencyKey,
                messageId,
            }),
        };
    };
    return async (chunk) => {
        if (chunk.type === "text") {
            if (canonicalFinalDelivered)
                return;
            if (chunk.textSource !== "llm_reviewed")
                return;
            bufferedText += chunk.delta;
            return;
        }
        if (chunk.type === "tool_start") {
            if (!shouldSendToolStartStatus(chunk.toolName))
                return;
            const msgId = await context.responder.sendToolStatus(chunk.toolName);
            toolMessageIds.set(chunk.toolName, msgId);
            recordIfRunPresent(msgId, "tool");
            return;
        }
        if (chunk.type === "tool_end") {
            const msgId = toolMessageIds.get(chunk.toolName);
            if (msgId !== undefined) {
                if (chunk.success) {
                    await context.responder.clearToolStatus?.(msgId);
                }
                else {
                    await context.responder.updateToolStatus(msgId, chunk.toolName, false);
                }
                toolMessageIds.delete(chunk.toolName);
            }
            else if (!chunk.success) {
                const failureMessageId = await context.responder.sendToolStatus(chunk.toolName);
                await context.responder.updateToolStatus(failureMessageId, chunk.toolName, false);
                recordIfRunPresent(failureMessageId, "tool");
            }
            const isolatedToolResponse = decideIsolatedToolResponse(chunk);
            if (isolatedToolResponse.kind === "artifact" && isArtifactDeliveryDetails(chunk.details)) {
                const details = chunk.details;
                const runId = context.getRunId();
                const artifactRef = "artifactRef" in details ? details.artifactRef : undefined;
                if (!details.filePath && !artifactRef)
                    return undefined;
                const resolvedArtifact = "filePath" in details && details.filePath
                    ? {
                        ok: true,
                        filePath: details.filePath,
                        mimeType: details.mimeType,
                        sizeBytes: details.size,
                    }
                    : resolveArtifactReference({
                        artifactRef: artifactRef,
                        ...(runId ? { runId } : {}),
                    }, context.artifactStorage);
                if (!resolvedArtifact.ok)
                    return undefined;
                const filePath = resolvedArtifact.filePath;
                const mimeType = details.mimeType ?? resolvedArtifact.mimeType;
                const sizeBytes = details.size || resolvedArtifact.sizeBytes;
                const caption = details.caption
                    ? sanitizeCompletionAwaitingUserText(details.caption)
                    : undefined;
                const receipt = await deliverArtifactOnce({
                    artifactStorage: context.artifactStorage,
                    runId,
                    channel: "telegram",
                    filePath,
                    channelTarget: `${context.chatId}${context.threadId !== undefined ? `:${context.threadId}` : ""}`,
                    sizeBytes,
                    ...(mimeType ? { mimeType } : {}),
                    isVerifiedDelivery: (result) => Boolean(result.artifactDeliveries?.some((delivery) => delivery.channel === "telegram"
                        && delivery.filePath === filePath)),
                    task: async () => {
                        try {
                            const sent = await sendFileWithReceipt(filePath, `telegram:file:${runId ?? "pending"}:${filePath}`, caption);
                            recordIfRunPresent(sent.messageId, "assistant");
                            return {
                                artifactDeliveries: [
                                    {
                                        toolName: chunk.toolName,
                                        channel: "telegram",
                                        filePath,
                                        ...(caption ? { caption } : {}),
                                        messageId: sent.messageId,
                                        deliveryReceipts: [sent.receipt],
                                    },
                                ],
                            };
                        }
                        catch (error) {
                            const message = telegramChunkDeliveryErrorMessage(error);
                            context.logError(`Failed to send file: ${message}`);
                            const artifact = buildArtifactAccessDescriptor({
                                filePath,
                                sizeBytes,
                                ...(mimeType ? { mimeType } : {}),
                            }, context.artifactStorage);
                            const fallbackText = buildTelegramArtifactFallbackNotice({
                                fileName: artifact.fileName,
                                downloadUrl: artifact.ok ? artifact.downloadUrl : undefined,
                                caption,
                                language: context.language,
                            }).text;
                            const sent = await sendFinalText(fallbackText, "artifact-fallback");
                            if (!sent)
                                throw error;
                            for (const fallbackMessageId of sent.messageIds) {
                                recordIfRunPresent(fallbackMessageId, "assistant");
                            }
                            return {
                                textDeliveries: [
                                    {
                                        channel: "telegram",
                                        text: sent.deliveredText,
                                        messageIds: sent.messageIds,
                                        deliveryReceipts: sent.deliveryReceipts,
                                    },
                                ],
                            };
                        }
                    },
                });
                if (receipt) {
                    toolOwnedResponseActive = true;
                    bufferedText = "";
                    return receipt;
                }
            }
            if (isolatedToolResponse.kind === "text" && isolatedToolResponse.text) {
                toolOwnedResponseActive = true;
                bufferedText = sanitizeCompletionAwaitingUserText(isolatedToolResponse.text);
            }
            return;
        }
        if (chunk.type === "done") {
            if (canonicalFinalDelivered)
                return;
            if (!bufferedText)
                return;
            const deliveredText = bufferedText;
            const sent = await sendFinalText(bufferedText, "final");
            if (!sent) {
                bufferedText = "";
                return;
            }
            canonicalFinalDelivered = true;
            for (const messageId of sent.messageIds) {
                recordIfRunPresent(messageId, "assistant");
            }
            bufferedText = "";
            return {
                textDeliveries: [
                    {
                        channel: "telegram",
                        text: sent.deliveredText,
                        messageIds: sent.messageIds,
                        deliveryReceipts: sent.deliveryReceipts,
                        ...(sent.deliveredText !== deliveredText ? { deliveryKind: "diagnostic" } : {}),
                        ...(context.deliveryKind ? { deliveryKind: context.deliveryKind } : {}),
                        ...(context.parentRunId ? { parentRunId: context.parentRunId } : {}),
                        ...(context.subSessionId ? { subSessionId: context.subSessionId } : {}),
                        ...(context.agentId ? { agentId: context.agentId } : {}),
                    },
                ],
            };
        }
        if (chunk.type === "error") {
            if (toolOwnedResponseActive) {
                return;
            }
            const notice = buildChannelChunkErrorNotice({
                provider: "telegram",
                language: context.language,
                reason: redactLogText(chunk.message),
            });
            const renderedNotice = await renderChannelNoticeText({
                originalRequest: context.language === "ko" ? "Telegram 채널 오류" : "Telegram channel error",
                rawText: notice.text,
                ...(context.noticeRendering ? { dependencies: context.noticeRendering } : {}),
            });
            if (renderedNotice.status === "blocked") {
                context.logError(`Skipped Telegram chunk error notice delivery: ${renderedNotice.reason}`);
                bufferedText = "";
                return;
            }
            const errorMessageId = await context.responder.sendError(renderedNotice.text);
            recordIfRunPresent(errorMessageId, "assistant");
            bufferedText = "";
        }
    };
}
//# sourceMappingURL=chunk-delivery.js.map