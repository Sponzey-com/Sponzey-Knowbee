import { type ArtifactStorageContext } from "../../artifacts/lifecycle.js";
import { type RunChunkDeliveryHandler } from "../../runs/delivery.js";
import { type MessageLedgerDeliveryKind } from "../../runs/message-ledger.js";
import { type ChannelNoticeRenderDependencies } from "../notice-rendering.js";
import { type TelegramFileDeliveryResult, type TelegramTextPartsDeliveryResult } from "./message-delivery.js";
export interface TelegramChunkResponder {
    sendToolStatus(toolName: string): Promise<number>;
    updateToolStatus(messageId: number, toolName: string, success: boolean): Promise<void>;
    clearToolStatus?(messageId: number): Promise<void>;
    sendFile(filePath: string, caption?: string | undefined): Promise<number>;
    sendFileWithReceipt?(filePath: string, idempotencyKey: string, caption?: string | undefined): Promise<TelegramFileDeliveryResult>;
    sendFinalResponse(text: string): Promise<number[]>;
    sendFinalResponseWithReceipts?(text: string, idempotencyKeyPrefix: string): Promise<TelegramTextPartsDeliveryResult>;
    sendError(message: string): Promise<number>;
}
export interface TelegramChunkDeliveryContext {
    artifactStorage: ArtifactStorageContext;
    responder: TelegramChunkResponder;
    sessionId: string;
    chatId: number;
    language?: TelegramChunkFallbackLanguage | undefined;
    threadId?: number;
    getRunId: () => string | undefined;
    deliveryKind?: MessageLedgerDeliveryKind;
    parentRunId?: string;
    subSessionId?: string;
    agentId?: string;
    maxTextChunks?: number;
    noticeRendering?: ChannelNoticeRenderDependencies | undefined;
    recordOutgoingMessageRef: (params: {
        sessionId: string;
        runId: string;
        chatId: number;
        threadId?: number;
        messageId: number;
        role: "assistant" | "tool";
    }) => void;
    logError: (message: string) => void;
}
export type TelegramChunkFallbackLanguage = "ko" | "en";
export type TelegramChunkFallbackReason = "artifact_upload_failed" | "too_many_chunks";
export interface TelegramChunkFallbackNotice {
    kind: "telegram_chunk_fallback";
    reason: TelegramChunkFallbackReason;
    language: TelegramChunkFallbackLanguage;
    text: string;
    deliveryMode: "diagnostic";
    textSource: "telegram_chunk_fallback_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function resolveTelegramChunkFallbackLanguage(languageCode: string | undefined): TelegramChunkFallbackLanguage;
export declare function buildTelegramArtifactFallbackNotice(input: {
    fileName: string;
    downloadUrl?: string | undefined;
    caption?: string | undefined;
    language?: TelegramChunkFallbackLanguage | undefined;
}): TelegramChunkFallbackNotice;
export declare function buildTelegramTooManyChunksFallbackText(input: {
    text: string;
    estimatedChunks: number;
    maxChunks: number;
    language?: TelegramChunkFallbackLanguage | undefined;
}): string;
export declare function buildTelegramTooManyChunksFallbackNotice(input: {
    text: string;
    estimatedChunks: number;
    maxChunks: number;
    language?: TelegramChunkFallbackLanguage | undefined;
}): TelegramChunkFallbackNotice;
export declare function createTelegramChunkDeliveryHandler(context: TelegramChunkDeliveryContext): RunChunkDeliveryHandler;
//# sourceMappingURL=chunk-delivery.d.ts.map