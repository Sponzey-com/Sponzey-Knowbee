import type { AIProvider } from "../ai/types.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolResult } from "../tools/types.js";
import { projectWebFetchResultForAgent, projectWebSearchResultForAgent } from "./web-evidence-agent-bridge.js";
import { type AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
export interface CanonicalWebEvidenceSearchInput {
    readonly requestGoal: string;
    readonly requiredFactKeys: readonly string[];
    readonly modelContextTokens: number;
    readonly systemToolText: string;
    readonly conversationText: string;
    readonly searchResult: Parameters<typeof projectWebSearchResultForAgent>[0]["searchResult"];
    readonly freshnessPolicy: "normal" | "latest_approximate" | "strict_timestamp";
    readonly signal: AbortSignal;
}
export interface CanonicalWebEvidenceFetchInput {
    readonly requestGoal: string;
    readonly requiredFactKeys: readonly string[];
    readonly modelContextTokens: number;
    readonly systemToolText: string;
    readonly conversationText: string;
    readonly documentResult: Parameters<typeof projectWebFetchResultForAgent>[0]["documentResult"];
    readonly signal: AbortSignal;
}
export interface CanonicalWebEvidenceRuntime {
    projectSearchResult(input: CanonicalWebEvidenceSearchInput): ReturnType<typeof projectWebSearchResultForAgent>;
    projectFetchResult(input: CanonicalWebEvidenceFetchInput): ReturnType<typeof projectWebFetchResultForAgent>;
}
export interface CanonicalWebEvidenceTraceObserver {
    onInternalFetchStarted(input: Readonly<{
        actionReceiptId: string;
        candidateRef: string;
        strategyFingerprint: `sha256:${string}`;
    }>): void;
    onInternalFetchFinished(input: Readonly<{
        actionReceiptId: string;
        candidateRef: string;
        strategyFingerprint: `sha256:${string}`;
        result: ToolResult;
    }>): void;
    onVerificationFinished(input: Readonly<{
        success: boolean;
        reasonCode: string | null;
    }>): void;
}
export declare function createCanonicalWebEvidenceRuntime(input: Readonly<{
    provider: AIProvider;
    model: string;
    workDir: string;
    context: ToolContext & {
        allowWebAccess: true;
    };
    scope: AdmittedCapabilityExecutionScope;
    ownerAgentId: string;
    dispatcher: Pick<ToolDispatcher, "dispatch" | "get">;
    traceObserver?: CanonicalWebEvidenceTraceObserver;
    observabilityContext?: Readonly<{
        runId: string;
        requestGroupId?: string;
        sessionId?: string;
    }>;
}>): CanonicalWebEvidenceRuntime;
//# sourceMappingURL=web-evidence-runtime-composition.d.ts.map