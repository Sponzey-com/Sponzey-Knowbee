import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
import type { ExtensionLiveSmokeSummary } from "../runs/extension-live-smoke.js";
import type { WebRetrievalLiveSmokeSummary } from "../runs/web-retrieval-smoke.js";
import type { YeonjangLiveSmokeSummary } from "../runs/yeonjang-live-smoke.js";
import type { LiveAcceptanceBundleApproval, LiveAcceptanceBundleCandidate } from "./live-acceptance-bundle.js";
import type { LiveAcceptanceRunnerContext, LiveAcceptanceRunnerPort, LiveAcceptanceRunnerStage } from "./live-acceptance-runner.js";
import { type LiveAcceptanceRunnerFailurePolicy, type LiveAcceptanceRunnerResult, type LiveAcceptanceSigningRequestSink } from "./live-acceptance-runner.js";
export type LiveAcceptanceRuntimeStageReadiness = {
    status: "ready";
} | {
    status: "unavailable";
    reasonCode: string;
};
export interface LiveAcceptanceRuntimePreflightSnapshot {
    capturedAt: number;
    stages: Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRuntimeStageReadiness>>;
}
export interface LiveAcceptanceRuntimeExecutors {
    channels(context: LiveAcceptanceRunnerContext): Promise<PersistedChannelSmokeRunResult>;
    web(context: LiveAcceptanceRunnerContext): Promise<WebRetrievalLiveSmokeSummary>;
    extensions(context: LiveAcceptanceRunnerContext): Promise<ExtensionLiveSmokeSummary>;
    yeonjang(context: LiveAcceptanceRunnerContext): Promise<YeonjangLiveSmokeSummary>;
}
export declare function createLiveAcceptanceRuntimePorts(input: {
    preflight: LiveAcceptanceRuntimePreflightSnapshot;
    executors: LiveAcceptanceRuntimeExecutors;
    maxWebSourceAgeMs: number;
    maxYeonjangSessionAgeMs: number;
    maxPreflightAgeMs: number;
}): Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRunnerPort>>;
export declare function runProductionLiveAcceptance(input: {
    candidate: LiveAcceptanceBundleCandidate;
    approval: LiveAcceptanceBundleApproval;
    preflight: LiveAcceptanceRuntimePreflightSnapshot;
    executors: LiveAcceptanceRuntimeExecutors;
    maxPreflightAgeMs: number;
    maxWebSourceAgeMs: number;
    maxYeonjangSessionAgeMs: number;
    maxEvidenceAgeMs: number;
    failurePolicy: LiveAcceptanceRunnerFailurePolicy;
    requestedKeyId: string;
    requestSink: LiveAcceptanceSigningRequestSink;
    now: number;
    isCancelled: () => boolean;
}): Promise<LiveAcceptanceRunnerResult>;
//# sourceMappingURL=live-acceptance-runtime-ports.d.ts.map