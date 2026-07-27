import { type FastResponseHealthSnapshot, type LatencyMetricName, type LatencyMetricRecord, type LatencyMetricStatus } from "../observability/latency.js";
export type ReleasePerformanceGateStatus = "passed" | "warning" | "failed";
export type ReleasePerformanceTargetKind = "latency" | "counter";
export interface ReleasePerformanceAcceptanceEvidence {
    status: "baseline_only" | "accepted" | "rejected";
    matrixId: string | null;
    matrixVersion: number | null;
    baselineVersion: string | null;
    authorizationId: string | null;
    reasonCodes: string[];
}
export interface ReleasePerformanceTarget {
    id: string;
    kind: ReleasePerformanceTargetKind;
    title: string;
    requiredForPublicRelease: boolean;
    metricName?: LatencyMetricName;
    budgetMs?: number;
    budgetPurpose?: "operational_health";
    targetDescription: string;
}
export interface ReleasePerformanceMetricResult {
    targetId: string;
    title: string;
    kind: ReleasePerformanceTargetKind;
    metricName?: LatencyMetricName;
    budgetMs: number | null;
    count: number;
    p95Ms: number | null;
    lastMs: number | null;
    status: LatencyMetricStatus | "missing";
    warning: string | null;
}
export interface ReleasePerformanceCounterResult {
    id: "delivery_dedupe_count" | "concurrency_blocked_count";
    count: number;
    status: "ok" | "warning";
    warning: string | null;
}
export interface ReleasePerformanceSummary {
    kind: "knowbee.release.performance";
    generatedAt: string;
    windowMs: number;
    gateStatus: ReleasePerformanceGateStatus;
    operationalStatus: ReleasePerformanceGateStatus;
    fastResponseHealth: FastResponseHealthSnapshot;
    targets: ReleasePerformanceTarget[];
    metrics: ReleasePerformanceMetricResult[];
    counters: ReleasePerformanceCounterResult[];
    missingRequiredMetrics: string[];
    warnings: string[];
    blockingFailures: string[];
    acceptance: ReleasePerformanceAcceptanceEvidence;
}
export declare const RELEASE_PERFORMANCE_TARGETS: ReleasePerformanceTarget[];
export declare function buildReleasePerformanceSummary(input?: {
    now?: Date;
    windowMs?: number;
    metrics?: LatencyMetricRecord[];
    deliveryDedupeCount?: number;
    concurrencyBlockedCount?: number;
    acceptanceEvidence?: ReleasePerformanceAcceptanceEvidence;
}): ReleasePerformanceSummary;
//# sourceMappingURL=performance-gate.d.ts.map