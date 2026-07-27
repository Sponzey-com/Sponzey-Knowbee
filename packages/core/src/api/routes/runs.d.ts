import type { FastifyInstance } from "fastify";
import { type ArtifactStorageContext } from "../../artifacts/lifecycle.js";
import type { ChannelSource } from "../../channels/contracts.js";
import type { KnowbeeConfig } from "../../config/index.js";
import { type ControlExportAudience } from "../../control-plane/timeline.js";
import type { MemoryJournalRepository } from "../../memory/journal.js";
import { type FocusResolveSuccess } from "../../orchestration/command-workspace.js";
import { type AgentHierarchyStorage } from "../../orchestration/hierarchy.js";
import type { RequestExecutionOutcome } from "../../runs/flow-contract.js";
import type { RootRun } from "../../runs/types.js";
export type WebUiClientRequestIdResolution = {
    ok: true;
    clientRequestId: string | undefined;
} | {
    ok: false;
    reasonCode: "invalid_client_request_id";
};
export declare function resolveWebUiClientRequestId(value: unknown): WebUiClientRequestIdResolution;
export declare function buildWebUiTransportIdentity(input: {
    runId: string;
    sessionId: string;
    clientRequestId?: string | undefined;
}): {
    source: "webui";
    channelEventId: string;
    externalChatId: string;
    externalThreadId: string;
    externalMessageId: string;
};
export declare function buildRunExecutionOutcomes(runs: readonly Pick<RootRun, "id">[], readOutcome?: (runId: string) => RequestExecutionOutcome | undefined): Record<string, RequestExecutionOutcome>;
export type RunTimelineExposureContext = "public" | "audit";
export declare function resolveRunTimelineAudience(value: string | undefined, exposureContext: RunTimelineExposureContext): ControlExportAudience;
export declare function startLocalRun(params: {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    hierarchyStorage: AgentHierarchyStorage;
    message: string;
    sessionId: string | undefined;
    model: string | undefined;
    source: ChannelSource;
    config: KnowbeeConfig;
    clientRequestId?: string | undefined;
    focusResolution?: FocusResolveSuccess | undefined;
}): Promise<{
    focus?: {
        binding: import("../../orchestration/command-workspace.js").FocusBinding;
        plannerTarget: {
            kind: "explicit_agent" | "explicit_team";
            id: string;
            sourceTarget: import("../../orchestration/command-workspace.js").FocusTarget;
        };
        enforcement: {
            directChildVisibility: "checked";
            permissionVisibility: "checked";
            finalAnswerOwnerUnchanged: true;
            memoryIsolationUnchanged: true;
            reasonCodes: string[];
        };
    };
    requestId: string;
    runId: string;
    sessionId: string;
    source: ChannelSource;
    status: "started";
    acknowledgement: import("../../index.js").IntakeAcknowledgementControl;
}>;
export declare function startCanonicalLocalRun(params: {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    hierarchyStorage: AgentHierarchyStorage;
    message: string;
    sessionId: string | undefined;
    model: string | undefined;
    source: ChannelSource;
    config: KnowbeeConfig;
    clientRequestId?: string | undefined;
    focusResolution?: FocusResolveSuccess | undefined;
}): import("../../runs/ingress.js").StartedIngressRun;
export declare function registerRunsRoute(app: FastifyInstance, memoryJournal: MemoryJournalRepository): void;
//# sourceMappingURL=runs.d.ts.map