import type { ChannelSmokeScenario, ChannelSmokeTrace } from "./smoke-runner.js";
export interface StartedCanonicalSlackSmokeRequest {
    requestId: string;
    runId: string;
    requestGroupId: string;
    targetFingerprint: string;
}
export interface CanonicalSlackSmokeObservation extends StartedCanonicalSlackSmokeRequest {
    terminalStatus: "completed" | "failed" | "cancelled" | "interrupted" | "timed_out";
    typedTraceStatus: "ready" | "not_recorded" | "unavailable";
    typedTraceTerminal: boolean;
    typedTraceIssueCount: number;
    analysisCompleted: boolean;
    evidenceRecorded: boolean;
    reviewCompleted: boolean;
    finalizationCompleted: boolean;
    topologyRunCount: number;
    auditEventId?: string;
    providerDeliveryReceipted: boolean;
    targetMatched: boolean;
    userReportDelivered: boolean;
}
export interface SlackLiveSmokeExecutorPorts {
    startRequest(input: {
        request: string;
        source: "slack";
    }): Promise<StartedCanonicalSlackSmokeRequest> | StartedCanonicalSlackSmokeRequest;
    observeTerminal(input: {
        started: StartedCanonicalSlackSmokeRequest;
        signal?: AbortSignal;
    }): Promise<CanonicalSlackSmokeObservation>;
}
export declare function createSlackLiveSmokeExecutor(ports: SlackLiveSmokeExecutorPorts): (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>;
//# sourceMappingURL=slack-live-smoke-executor.d.ts.map