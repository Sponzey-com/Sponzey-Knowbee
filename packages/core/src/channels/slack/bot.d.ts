import type { SlackConfig } from "../../config/types.js";
import type { ArtifactStorageContext } from "../../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../../memory/journal.js";
import type { AgentHierarchyStorage } from "../../orchestration/hierarchy.js";
import type { RootRun } from "../../runs/types.js";
import { type ChannelNoticeRenderDependencies } from "../notice-rendering.js";
import { type SlackResponderLanguage } from "./responder.js";
import type { ChannelPendingResponseDeliveryInput } from "../pending-response-delivery.js";
export declare function resolveSlackInboundMessageLanguage(text: string): SlackResponderLanguage;
export declare function findSlackReplyTaskRef(params: {
    channelId: string;
    messageTs: string;
    threadTs: string;
}): import("../../db/index.js").DbChannelMessageRef | undefined;
export interface SlackLiveSmokeIngressReceipt {
    requestId: string;
    runId: string;
    requestGroupId: string;
    threadTs: string;
    finished: Promise<RootRun | undefined>;
}
export declare class SlackChannel {
    private config;
    private artifactStorage;
    private noticeRendering?;
    private memoryJournal?;
    private hierarchyStorage?;
    private socket;
    private runningRuns;
    private sessionIds;
    private seenInboundEvents;
    private liveSmokeSequence;
    private liveSmokeStartObservers;
    constructor(config: SlackConfig, artifactStorage: ArtifactStorageContext, noticeRendering?: ChannelNoticeRenderDependencies | undefined, memoryJournal?: MemoryJournalRepository | undefined, hierarchyStorage?: AgentHierarchyStorage | undefined);
    start(): Promise<void>;
    stop(): void;
    acceptLiveSmokeRequest(input: {
        request: string;
        target: {
            channelId: string;
            userId: string;
            threadTs?: string;
        };
    }): Promise<SlackLiveSmokeIngressReceipt>;
    createPendingResponseDeliveryHandler(input: ChannelPendingResponseDeliveryInput): import("../../runs/delivery.js").RunChunkDeliveryHandler;
    private addSessionRun;
    private removeSessionRun;
    private isAllowedUser;
    private isAllowedChannel;
    private markInboundEventSeen;
    private recordOutgoingMessageRef;
    private handleSocketMessage;
    private handleBlockActions;
}
//# sourceMappingURL=bot.d.ts.map