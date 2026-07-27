export declare const REQUIRED_REPRESENTATIVE_FLOW_IDS: readonly ["direct_answer", "current_fact_read", "tool_write", "child_delegation", "cancel"];
export type RepresentativeFlowId = (typeof REQUIRED_REPRESENTATIVE_FLOW_IDS)[number];
export type PerformanceSampleSourceKind = "deterministic_fixture" | "live_runtime";
export interface RepresentativeFlowSample {
    flowId: RepresentativeFlowId;
    sampleId: string;
    durationMs: number;
    llmCallCount: number;
    inputTokens: number;
    outputTokens: number;
    costEstimateUsd: number;
    attemptCount: number;
    queueWaitMs: number;
    eventBytes: number;
    evidenceBytes: number;
}
export interface PerformanceBaselineDiagnostic {
    code: "required_flow_missing" | "unknown_flow" | "sample_metric_invalid";
    flowId: string;
    metric: string | null;
}
interface MetricTotals {
    llmCallCount: number;
    inputTokens: number;
    outputTokens: number;
    costEstimateUsd: number;
    attemptCount: number;
    queueWaitMs: number;
    eventBytes: number;
    evidenceBytes: number;
}
export interface RepresentativeFlowBaselineResult {
    schemaVersion: 1;
    fixtureVersion: string;
    sourceKind: PerformanceSampleSourceKind;
    complete: boolean;
    counts: {
        requiredFlows: number;
        coveredFlows: number;
        samples: number;
    };
    flows: Array<MetricTotals & {
        flowId: RepresentativeFlowId;
        sampleCount: number;
        latencyP50Ms: number;
        latencyP95Ms: number;
    }>;
    aggregate: MetricTotals & {
        sampleCount: number;
        latencyP50Ms: number;
        latencyP95Ms: number;
    };
    diagnostics: PerformanceBaselineDiagnostic[];
}
export interface MeasuredFlowStageSummary {
    stage: string;
    llmCallCount: number;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
}
export interface MeasuredRepresentativeFlowSample {
    flowId: RepresentativeFlowId;
    sampleId: string;
    sourceKind: "live_runtime";
    durationMs: number;
    llmCallCount: number;
    inputTokens: number | null;
    outputTokens: number | null;
    costEstimateUsd: number | null;
    attemptCount: number;
    queueWaitMs: number;
    eventBytes: number;
    evidenceBytes: number;
    stages: MeasuredFlowStageSummary[];
    complete: boolean;
    diagnostics: string[];
}
export type PerformanceAcceptanceStatus = "baseline_only" | "accepted" | "rejected";
export interface PerformanceAcceptanceThresholds {
    maxLatencyRegressionRatio: number;
    maxLlmCallIncrease: number;
    maxAttemptIncrease: number;
}
export type PerformanceReferenceFlow = Pick<RepresentativeFlowBaselineResult["flows"][number], "flowId" | "latencyP95Ms" | "llmCallCount" | "attemptCount">;
export declare function buildMeasuredRepresentativeFlowSample(input: {
    flowId: RepresentativeFlowId;
    sampleId: string;
    startedAt: number;
    finishedAt: number;
    llmReceipts: ReadonlyArray<{
        invocationId: string;
        phase: "started" | "completed" | "failed" | "cancelled";
        at: number;
        context: {
            stage: string;
        };
        durationMs?: number | undefined;
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
    }>;
    costEstimateUsd: number | null;
    attemptCount: number;
    queueWaitMs: number;
    eventBytes: number;
    evidenceBytes: number;
}): MeasuredRepresentativeFlowSample;
export declare function compareMeasuredFlowToBaseline(input: {
    reference: PerformanceReferenceFlow;
    live: MeasuredRepresentativeFlowSample;
    thresholds?: PerformanceAcceptanceThresholds | undefined;
}): {
    status: PerformanceAcceptanceStatus;
    latencyRegressionRatio: number;
    llmCallIncrease: number;
    attemptIncrease: number;
    reasonCodes: string[];
};
export declare function auditRepresentativeFlowBaseline(input: {
    fixtureVersion: string;
    sourceKind: PerformanceSampleSourceKind;
    samples: readonly RepresentativeFlowSample[];
}): RepresentativeFlowBaselineResult;
export {};
//# sourceMappingURL=performance-baseline.d.ts.map