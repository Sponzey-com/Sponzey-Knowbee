import type { AgentContextMode } from "../agent/index.js";
import type { TaskExecutionSemantics, TaskIntentEnvelope, TaskStructuredRequest } from "../agent/intake.js";
import type { AIProvider, ProviderAuditTrace } from "../ai/index.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { OrchestrationMode } from "../contracts/sub-agent-orchestration.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import type { AgentExecutionDecision, AgentExecutionDecisionTraceSnapshot } from "../orchestration/execution-decision-contract.js";
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js";
import type { OrchestrationPlannerIntent } from "../orchestration/planner.js";
import type { RunChunkDeliveryHandler } from "./delivery.js";
import { type FinalResponseIdentityContext } from "./final-response-renderer.js";
import { type StandaloneAssistantMessageResponseContext } from "./finalization.js";
import type { InboundMessageRecord } from "./request-isolation.js";
import type { RootRun, TaskProfile } from "./types.js";
import type { WorkerRuntimeTarget } from "./worker-runtime.js";
export interface StartRootRunParams {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    hierarchyStorage: AgentHierarchyStorage;
    runId?: string | undefined;
    targetRunId?: string | undefined;
    message: string;
    sessionId: string | undefined;
    requestGroupId?: string | undefined;
    lineageRootRunId?: string | undefined;
    parentRunId?: string | undefined;
    originRunId?: string | undefined;
    originRequestGroupId?: string | undefined;
    forceRequestGroupReuse?: boolean | undefined;
    model: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: KnowbeeConfig;
    providerTrace?: ProviderAuditTrace | undefined;
    targetId?: string | undefined;
    targetLabel?: string | undefined;
    workerRuntime?: WorkerRuntimeTarget | undefined;
    orchestrationPlannerIntent?: OrchestrationPlannerIntent | undefined;
    agentExecutionDecision?: AgentExecutionDecision | undefined;
    agentExecutionDecisionTrace?: AgentExecutionDecisionTraceSnapshot | undefined;
    workDir?: string | undefined;
    source: ChannelSource;
    skipIntake?: boolean | undefined;
    toolsEnabled?: boolean | undefined;
    contextMode?: AgentContextMode | undefined;
    taskProfile?: TaskProfile | undefined;
    runScope?: "root" | "child" | "analysis" | undefined;
    handoffSummary?: string | undefined;
    originalRequest?: string | undefined;
    executionSemantics?: TaskExecutionSemantics | undefined;
    structuredRequest?: TaskStructuredRequest | undefined;
    intentEnvelope?: TaskIntentEnvelope | undefined;
    immediateCompletionText?: string | undefined;
    onChunk?: RunChunkDeliveryHandler;
    inboundMessage?: InboundMessageRecord | undefined;
    firstResponseReceivedAtMs?: number | undefined;
    scheduleId?: string | undefined;
    includeScheduleMemory?: boolean | undefined;
    memorySearchQuery?: string | undefined;
    responseLanguageMode?: TaskStructuredRequest["response_language_mode"] | undefined;
}
export interface StartedRootRun {
    runId: string;
    sessionId: string;
    status: "started";
    finished: Promise<RootRun | undefined>;
}
export declare function shouldDispatchPreAnalyzedRootDelegation(input: {
    isRootRequest: boolean;
    hasParentRun: boolean;
    runScope?: "root" | "child" | "analysis" | undefined;
    skipIntake: boolean;
    orchestrationMode: OrchestrationMode;
    delegatedTaskCount: number;
}): boolean;
export declare function resolveStartResponseRuntime(params: {
    requestedModel?: string | undefined;
    requestedProviderId?: string | undefined;
    providerTrace?: ProviderAuditTrace | undefined;
}): {
    model?: string;
    providerId?: string;
};
export declare function buildStartPreflightResponseContext(params: {
    originalRequest: string;
    responseLanguageMode?: TaskStructuredRequest["response_language_mode"];
    model?: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: KnowbeeConfig;
    workDir: string;
    identityContext?: FinalResponseIdentityContext | undefined;
}): StandaloneAssistantMessageResponseContext | undefined;
export declare function startRootRun(params: StartRootRunParams): StartedRootRun;
//# sourceMappingURL=start.d.ts.map