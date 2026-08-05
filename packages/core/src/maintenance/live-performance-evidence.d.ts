import type { LlmInvocationReceipt } from "../observability/llm-invocation-receipt.js";
import { type MeasuredRepresentativeFlowSample } from "./performance-baseline.js";
export interface LivePerformanceEvidenceRecords {
    run: {
        status: string;
        startedAt: number;
        finishedAt: number;
    };
    llmReceipts: readonly LlmInvocationReceipt[];
    events: ReadonlyArray<{
        eventKind: string;
        payloadBytes: number;
    }>;
    queueTransitions: ReadonlyArray<{
        sequence: number;
        at: number;
        queueName: string;
        eventKind: string;
        recoveryKey: string | null;
    }>;
}
export type LivePerformanceEvidenceReadResult = {
    status: "ready";
    records: LivePerformanceEvidenceRecords;
} | {
    status: "rejected";
    reasonCode: string;
};
export interface LivePerformanceEvidenceSource {
    read(runId: string): LivePerformanceEvidenceReadResult;
}
export type CollectLivePerformanceEvidenceResult = {
    status: "ready";
    sample: MeasuredRepresentativeFlowSample;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function collectLivePerformanceEvidence(input: {
    source: LivePerformanceEvidenceSource;
    runId: string;
    flowId: string;
}): CollectLivePerformanceEvidenceResult;
//# sourceMappingURL=live-performance-evidence.d.ts.map