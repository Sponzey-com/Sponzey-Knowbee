import type { ChannelSmokeRunnerOptions, PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
import type { LiveAcceptanceLlmPorts } from "../release/live-acceptance-llm-adapter.js";
import type { LiveAcceptanceRunnerContext, LiveAcceptanceRunnerFailurePolicy, LiveAcceptanceSigningRequestSink } from "../release/live-acceptance-runner.js";
import { type LiveAcceptanceRuntimeSnapshotReaders } from "../release/live-acceptance-runtime-snapshot-adapter.js";
import { type LiveAcceptanceLiveRunIdInput } from "../release/live-acceptance-verified-executor.js";
import type { ExtensionLiveSmokeExecutionInput } from "../runs/extension-live-smoke-runner.js";
import type { WebRetrievalLiveSmokeScenario } from "../runs/web-retrieval-smoke.js";
import type { YeonjangLiveAuditEvent, YeonjangLiveInvokePort } from "../runs/yeonjang-live-transport-adapter.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/types.js";
import type { LiveAcceptanceExecutorFactory } from "./server-runtime-context.js";
export interface LiveAcceptanceRuntimePolicy {
    readonly failurePolicy: LiveAcceptanceRunnerFailurePolicy;
    readonly maxPreflightAgeMs: number;
    readonly maxWebSourceAgeMs: number;
    readonly maxYeonjangSessionAgeMs: number;
    readonly maxEvidenceAgeMs: number;
    readonly maxYeonjangInstanceAgeMs: number;
    readonly webScenarios?: readonly WebRetrievalLiveSmokeScenario[];
}
export type LiveAcceptanceWebContextFactory = (input: {
    readonly runId: string;
    readonly scenario: WebRetrievalLiveSmokeScenario;
    readonly signal: AbortSignal;
}) => ToolContext & {
    readonly allowWebAccess: true;
};
type LiveAcceptanceExtensionBaseRequired = Pick<ToolContext, "artifactStorage" | "sessionId" | "workDir" | "userMessage" | "source" | "onProgress">;
type LiveAcceptanceExtensionBaseOptional = Partial<Pick<ToolContext, "mqttConfig" | "securityConfig" | "searchConfig" | "memoryConfig">>;
export type LiveAcceptanceExtensionBaseContext = LiveAcceptanceExtensionBaseRequired & LiveAcceptanceExtensionBaseOptional & {
    readonly auditId: string;
};
export type LiveAcceptanceExtensionBaseContextFactory = (input: ExtensionLiveSmokeExecutionInput) => LiveAcceptanceExtensionBaseContext;
export interface LiveAcceptanceRuntimeFactoryInput {
    readonly readers: LiveAcceptanceRuntimeSnapshotReaders;
    readonly dispatcher: Pick<ToolDispatcher, "dispatch" | "dispatchAgentScoped">;
    readonly webContextFor: LiveAcceptanceWebContextFactory;
    readonly extensionBaseContextFor: LiveAcceptanceExtensionBaseContextFactory;
    readonly findAuditEventId: (input: {
        readonly runId: string;
        readonly requestGroupId?: string;
        readonly toolName: string;
    }) => string | null;
    readonly llm: Readonly<LiveAcceptanceLlmPorts>;
    readonly invokeYeonjang: YeonjangLiveInvokePort;
    readonly yeonjangTimeoutMs: number;
    readonly createCommandId: () => string;
    readonly createAuditCorrelationId: () => string;
    readonly recordYeonjangAuditEvent: (event: YeonjangLiveAuditEvent) => string | null;
    readonly runChannels: (executor: ChannelSmokeRunnerOptions["executeScenario"], context: LiveAcceptanceRunnerContext) => Promise<PersistedChannelSmokeRunResult>;
    readonly requestSink: LiveAcceptanceSigningRequestSink;
    readonly createRunId: (input: LiveAcceptanceLiveRunIdInput) => string;
    readonly now: () => number;
    readonly policy: Readonly<LiveAcceptanceRuntimePolicy>;
}
export declare function createLiveAcceptanceRuntimeFactory(input: LiveAcceptanceRuntimeFactoryInput): LiveAcceptanceExecutorFactory;
export {};
//# sourceMappingURL=live-acceptance-runtime-factory.d.ts.map