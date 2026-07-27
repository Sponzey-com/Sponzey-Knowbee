import { type ArtifactStorageContext } from "../../artifacts/lifecycle.js";
import { type RunChunkDeliveryHandler } from "../../runs/delivery.js";
import { type MessageLedgerDeliveryKind } from "../../runs/message-ledger.js";
import { type ChannelNoticeRenderDependencies } from "../notice-rendering.js";
import { type SlackFileDeliveryResult, type SlackTextPartsDeliveryResult } from "./message-delivery.js";
export interface SlackChunkResponder {
    sendToolStatus(toolName: string): Promise<string>;
    updateToolStatus(messageId: string, toolName: string, success: boolean): Promise<void>;
    clearToolStatus?(messageId: string): Promise<void>;
    sendFile(filePath: string, caption?: string): Promise<string>;
    sendFileWithReceipt?(filePath: string, idempotencyKey: string, caption?: string): Promise<SlackFileDeliveryResult>;
    sendFinalResponse(text: string): Promise<string[]>;
    sendFinalResponseWithReceipts?(text: string, idempotencyKeyPrefix: string): Promise<SlackTextPartsDeliveryResult>;
    sendError(message: string): Promise<string>;
}
export interface SlackChunkDeliveryContext {
    artifactStorage: ArtifactStorageContext;
    responder: SlackChunkResponder;
    sessionId: string;
    channelId: string;
    threadTs: string;
    language?: SlackChunkFallbackLanguage | undefined;
    getRunId: () => string | undefined;
    deliveryKind?: MessageLedgerDeliveryKind;
    parentRunId?: string;
    subSessionId?: string;
    agentId?: string;
    noticeRendering?: ChannelNoticeRenderDependencies | undefined;
    recordOutgoingMessageRef: (params: {
        sessionId: string;
        runId: string;
        channelId: string;
        threadTs: string;
        messageId: string;
        role: "assistant" | "tool";
    }) => void;
    logError: (message: string) => void;
}
export type SlackChunkFallbackLanguage = "ko" | "en";
export type SlackChunkFallbackReason = "artifact_upload_failed";
export interface SlackChunkFallbackNotice {
    kind: "slack_chunk_fallback";
    reason: SlackChunkFallbackReason;
    language: SlackChunkFallbackLanguage;
    text: string;
    deliveryMode: "diagnostic";
    textSource: "slack_chunk_fallback_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildSlackArtifactFallbackNotice(input: {
    fileName: string;
    downloadUrl?: string | undefined;
    caption?: string | undefined;
    language?: SlackChunkFallbackLanguage | undefined;
}): SlackChunkFallbackNotice;
export declare function createSlackChunkDeliveryHandler(context: SlackChunkDeliveryContext): RunChunkDeliveryHandler;
//# sourceMappingURL=chunk-delivery.d.ts.map