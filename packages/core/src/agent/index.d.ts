import { type AIProvider } from "../ai/index.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { AgentEntityType } from "../contracts/sub-agent-orchestration.js";
import type { WebExecutionState } from "../contracts/web-execution-state.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import type { UserFacingTextSource } from "../runs/loop-directive.js";
import { type AdmittedCapabilityExecutionScope } from "../runs/run-scoped-tool-admission.js";
import type { ToolEvidenceSourceReceipt } from "../tools/types.js";
import { type AgentTerminalFailureNotice } from "./terminal-failure-notice.js";
export type AgentChunk = {
    type: "text";
    delta: string;
    textSource?: UserFacingTextSource;
    notice?: AgentTerminalFailureNotice;
} | {
    type: "tool_start";
    toolName: string;
    params: unknown;
} | {
    type: "tool_end";
    toolName: string;
    success: boolean;
    output: string;
    details?: unknown;
    evidenceSource?: Readonly<ToolEvidenceSourceReceipt>;
} | {
    type: "execution_recovery";
    toolNames: string[];
    summary: string;
    reason: string;
} | {
    type: "ai_recovery";
    summary: string;
    reason: string;
    message: string;
} | {
    type: "done";
    totalTokens: number;
} | {
    type: "error";
    message: string;
};
export type AgentContextMode = "full" | "isolated" | "request_group" | "handoff";
export interface RunAgentParams {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    userMessage: string;
    requiredToolNames?: string[] | undefined;
    completionConditions?: readonly string[] | undefined;
    admittedCapabilityExecutionScope?: AdmittedCapabilityExecutionScope | undefined;
    webExecutionState?: WebExecutionState | undefined;
    memorySearchQuery?: string | undefined;
    sessionId?: string | undefined;
    requestGroupId?: string | undefined;
    runId?: string | undefined;
    scheduleId?: string | undefined;
    includeScheduleMemory?: boolean | undefined;
    model?: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: KnowbeeConfig;
    workDir?: string | undefined;
    source?: ChannelSource | undefined;
    agentId?: string | undefined;
    agentType?: AgentEntityType | undefined;
    signal?: AbortSignal | undefined;
    toolsEnabled?: boolean | undefined;
    contextMode?: AgentContextMode | undefined;
}
export declare function runAgent(params: RunAgentParams): AsyncGenerator<AgentChunk>;
//# sourceMappingURL=index.d.ts.map