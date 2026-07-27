import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
import { type ExtensionLiveSmokeExecutePort } from "../runs/extension-live-smoke-runner.js";
import type { WebRetrievalLiveFetchPort, WebRetrievalLiveSearchPort } from "../runs/web-retrieval-live-runner.js";
import { type WebRetrievalLiveSmokeScenario } from "../runs/web-retrieval-smoke.js";
import { type YeonjangLiveSmokeExecutePort, type YeonjangLiveSmokeSelection } from "../runs/yeonjang-live-smoke-runner.js";
import type { LiveAcceptanceLlmPorts } from "./live-acceptance-llm-adapter.js";
import type { LiveAcceptanceVerifiedExecutor } from "./live-acceptance-preflighted-executor.js";
import type { LiveAcceptanceRunnerContext, LiveAcceptanceRunnerFailurePolicy, LiveAcceptanceSigningRequestSink } from "./live-acceptance-runner.js";
export type LiveAcceptanceLiveRunStage = "web" | "extensions" | "yeonjang";
export interface LiveAcceptanceLiveRunIdInput {
    readonly stage: LiveAcceptanceLiveRunStage;
    readonly scenarioId?: string;
}
export interface VerifiedLiveAcceptanceExecutorInput {
    readonly channels: (context: LiveAcceptanceRunnerContext) => Promise<PersistedChannelSmokeRunResult>;
    readonly web: Readonly<{
        search: WebRetrievalLiveSearchPort;
        fetch: WebRetrievalLiveFetchPort;
    }>;
    readonly extensions: ExtensionLiveSmokeExecutePort;
    readonly yeonjang: YeonjangLiveSmokeExecutePort;
    readonly llm: Readonly<LiveAcceptanceLlmPorts>;
    readonly requestSink: LiveAcceptanceSigningRequestSink;
    readonly createRunId: (input: LiveAcceptanceLiveRunIdInput) => string;
    readonly webScenarios?: readonly WebRetrievalLiveSmokeScenario[];
    readonly failurePolicy: LiveAcceptanceRunnerFailurePolicy;
    readonly maxPreflightAgeMs: number;
    readonly maxWebSourceAgeMs: number;
    readonly maxYeonjangSessionAgeMs: number;
    readonly maxEvidenceAgeMs: number;
    readonly maxYeonjangInstanceAgeMs: number;
}
export declare function expandYeonjangLiveAcceptanceSelections(selection: YeonjangLiveSmokeSelection): readonly YeonjangLiveSmokeSelection[];
export declare function createVerifiedLiveAcceptanceExecutor(input: VerifiedLiveAcceptanceExecutorInput): LiveAcceptanceVerifiedExecutor;
//# sourceMappingURL=live-acceptance-verified-executor.d.ts.map