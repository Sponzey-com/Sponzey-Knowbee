import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
import type { RootRun } from "../runs/types.js";
import type { LiveSmokeDecisionReceiptReader, LiveSmokeDecisionReceiptRefs } from "./live-smoke-decision-receipts.js";
import type { LiveSmokeFirstResponseLatencyEvidence, LiveSmokeFirstResponseLatencyReader } from "./live-smoke-latency-evidence.js";
export declare const DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS = 240000;
export interface LiveSmokeLatencyEvidence extends LiveSmokeFirstResponseLatencyEvidence {
    terminalResponseLatencyMs: number;
    completedAt: number;
}
export interface LiveSmokeStartedIdentity {
    requestId: string;
    runId: string;
    requestGroupId: string;
}
export interface LiveSmokeTerminalProjection extends LiveSmokeStartedIdentity, LiveSmokeDecisionReceiptRefs {
    terminalStatus: "completed" | "failed" | "cancelled" | "interrupted" | "timed_out";
    typedTraceStatus: "ready" | "not_recorded" | "unavailable";
    typedTraceTerminal: boolean;
    typedTraceIssueCount: number;
    analysisCompleted: boolean;
    evidenceRecorded: boolean;
    reviewCompleted: boolean;
    finalizationCompleted: boolean;
    rootOwnerFinalized: boolean;
    finalAnswerCount: number;
    topologyRunCount: number;
    auditEventId?: string;
    resultReviewReasonCodes: readonly string[];
    executionOutcome?: RequestExecutionOutcome;
    latencyEvidence?: LiveSmokeLatencyEvidence;
}
export interface ObserveLiveSmokeTerminalInput {
    started: LiveSmokeStartedIdentity;
    completion: Promise<RootRun | undefined> | undefined;
    observabilityRepository: Pick<TypedObservabilityEventRepository, "list">;
    listTopologyRunsForRootRun(rootRunId: string): readonly unknown[];
    readExecutionOutcome?(runId: string): RequestExecutionOutcome | undefined;
    readDecisionReceiptRefs?: LiveSmokeDecisionReceiptReader;
    readFirstResponseLatency?: LiveSmokeFirstResponseLatencyReader;
    startedAt?: number;
    now?: () => number;
    timeoutMs: number;
    signal?: AbortSignal;
    completionRejection: "interrupted" | "throw";
}
export interface ObserveLiveSmokeTerminalResult {
    projection: LiveSmokeTerminalProjection;
    run?: RootRun;
}
export declare function observeLiveSmokeTerminal(input: ObserveLiveSmokeTerminalInput): Promise<ObserveLiveSmokeTerminalResult>;
export declare function unavailableLiveSmokeTerminal(started: LiveSmokeStartedIdentity, status: "interrupted" | "timed_out"): LiveSmokeTerminalProjection;
//# sourceMappingURL=live-smoke-terminal-observer.d.ts.map