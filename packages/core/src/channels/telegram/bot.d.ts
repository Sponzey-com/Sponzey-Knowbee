import type { ArtifactStorageContext } from "../../artifacts/lifecycle.js";
import type { TelegramConfig } from "../../config/types.js";
import type { MemoryJournalRepository } from "../../memory/journal.js";
import type { AgentHierarchyStorage } from "../../orchestration/hierarchy.js";
import type { RootRun } from "../../runs/types.js";
import { type ChannelNoticeRenderDependencies } from "../notice-rendering.js";
import type { ChannelPendingResponseDeliveryInput } from "../pending-response-delivery.js";
import { type TelegramAttachmentNoticeLanguage } from "./attachment-notice.js";
import { type TelegramResponderLanguage } from "./responder.js";
export declare function resolveTelegramInboundMessageLanguage(text: string): TelegramResponderLanguage;
export declare function resolveTelegramAttachmentFailureLanguage(caption: string | undefined, languageCode: string | undefined): TelegramAttachmentNoticeLanguage;
export declare function findTelegramReplyTaskRef(params: {
    chatId: number;
    replyToMessageId?: number | undefined;
    threadId?: number | undefined;
}): import("../../db/index.js").DbChannelMessageRef | undefined;
export interface SessionStatus {
    sessionId: string | undefined;
    runId: string | undefined;
    running: boolean;
}
export interface TelegramLiveSmokeIngressReceipt {
    requestId: string;
    runId: string;
    requestGroupId: string;
    finished: Promise<RootRun | undefined>;
}
export declare class TelegramChannel {
    private config;
    private artifactStorage;
    private noticeRendering?;
    private memoryJournal?;
    private hierarchyStorage?;
    private bot;
    private runningRuns;
    private sessionIds;
    private fileHandler;
    private pollingTask;
    private liveSmokeSequence;
    private liveSmokeStartObservers;
    constructor(config: TelegramConfig, artifactStorage: ArtifactStorageContext, noticeRendering?: ChannelNoticeRenderDependencies | undefined, memoryJournal?: MemoryJournalRepository | undefined, hierarchyStorage?: AgentHierarchyStorage | undefined);
    getSessionKey(chatId: number, threadId?: number | undefined): string;
    newSession(sessionKey: string): void;
    abortSession(sessionKey: string): boolean;
    getRunningCount(): number;
    getSessionStatus(sessionKey: string): SessionStatus;
    createPendingResponseDeliveryHandler(input: ChannelPendingResponseDeliveryInput): import("../../runs/delivery.js").RunChunkDeliveryHandler;
    acceptLiveSmokeRequest(input: {
        request: string;
        target: {
            chatId: number;
            userId: number;
            threadId?: number;
        };
    }): Promise<TelegramLiveSmokeIngressReceipt>;
    private addSessionRun;
    private removeSessionRun;
    private recordOutgoingMessageRef;
    private _registerHandlers;
    start(): Promise<void>;
    stop(): void;
    sendTextToSession(sessionId: string, text: string): Promise<number[]>;
    sendFileToSession(sessionId: string, filePath: string, caption?: string | undefined): Promise<number>;
}
//# sourceMappingURL=bot.d.ts.map