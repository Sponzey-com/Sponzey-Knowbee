import type { LatencyMetricRecord, LatencyMetricStatus } from "../observability/latency.js";
export interface LiveSmokeFirstResponseLatencyEvidence {
    metricId: string;
    runId: string;
    requestGroupId: string;
    durationMs: number;
    budgetMs: number;
    status: LatencyMetricStatus;
}
export type LiveSmokeFirstResponseLatencyReader = (runId: string, requestGroupId: string) => LiveSmokeFirstResponseLatencyEvidence | undefined;
export declare function createLiveSmokeFirstResponseLatencyReader(repository: Readonly<{
    list(): readonly LatencyMetricRecord[];
}>): LiveSmokeFirstResponseLatencyReader;
//# sourceMappingURL=live-smoke-latency-evidence.d.ts.map