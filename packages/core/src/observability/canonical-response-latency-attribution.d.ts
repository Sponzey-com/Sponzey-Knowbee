import type { LlmInvocationReceipt } from "./llm-invocation-receipt.js";
import type { LatencyMetricRecord, LatencyMetricStatus } from "./latency.js";
export declare const CANONICAL_RESPONSE_LATENCY_STAGES: readonly ["task_intake", "execution_decision", "tool_transport", "completion_review", "final_response", "delivery"];
export type CanonicalResponseLatencyStage = (typeof CANONICAL_RESPONSE_LATENCY_STAGES)[number];
export interface CanonicalResponseLatencyStageAttribution {
    stage: CanonicalResponseLatencyStage;
    durationMs: number;
    invocationCount: number;
    status: LatencyMetricStatus;
    reasonCodes: string[];
    evidenceRefs: string[];
}
export interface CanonicalResponseLatencyAttribution {
    status: "complete" | "incomplete";
    runId: string;
    requestGroupId: string;
    stages: CanonicalResponseLatencyStageAttribution[];
    missingStages: CanonicalResponseLatencyStage[];
    longestStages: CanonicalResponseLatencyStageAttribution[];
}
export declare function buildCanonicalResponseLatencyAttribution(input: {
    runId: string;
    requestGroupId: string;
    llmReceipts: readonly LlmInvocationReceipt[];
    latencyMetrics: readonly LatencyMetricRecord[];
}): CanonicalResponseLatencyAttribution;
//# sourceMappingURL=canonical-response-latency-attribution.d.ts.map