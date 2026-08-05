import { runAgent } from "../agent/index.js";
import type { AgentChunk, AgentContextMode } from "../agent/index.js";
import type { AIProvider } from "../ai/index.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { AgentEntityType } from "../contracts/sub-agent-orchestration.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
import type { WebExecutionState } from "../contracts/web-execution-state.js";
export interface ExecutionChunkStreamParams {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    config: KnowbeeConfig;
    userMessage: string;
    requiredToolNames: string[];
    completionConditions?: readonly string[] | undefined;
    admittedCapabilityExecutionScope?: AdmittedCapabilityExecutionScope | undefined;
    webExecutionState: WebExecutionState;
    memorySearchQuery: string;
    scheduleId?: string | undefined;
    includeScheduleMemory?: boolean | undefined;
    sessionId: string;
    runId: string;
    model?: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    workDir: string;
    source: ChannelSource;
    agentId?: string | undefined;
    agentType?: AgentEntityType | undefined;
    signal: AbortSignal;
    toolsEnabled?: boolean | undefined;
    isRootRequest: boolean;
    requestGroupId: string;
    contextMode: AgentContextMode;
}
export interface ExecutionRuntimeDependencies {
    runAgent: typeof runAgent;
}
export declare function createExecutionChunkStream(params: ExecutionChunkStreamParams, dependencies?: ExecutionRuntimeDependencies): AsyncGenerator<AgentChunk>;
//# sourceMappingURL=execution-runtime.d.ts.map