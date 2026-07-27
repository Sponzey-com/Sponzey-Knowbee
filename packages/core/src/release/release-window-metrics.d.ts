export type ReleaseMetricStage = "request_total" | "analysis" | "execution" | "approval_wait" | "llm_execution" | "tool_execution" | "review" | "final_response" | "canonical_delivery" | "terminal_projection" | "queue_wait";
export type ReleaseMetricObservation = "measured" | "not_observed" | "not_configured" | "authorization_required";
export type ReleaseMetricCounter = "llm_invocation" | "tool_invocation" | "recovery" | "queue_retry" | "delivery_duplicate" | "delivery_failure";
export interface ReleaseMetricWindow {
    windowId: string;
    startAt: number;
    endAt: number;
}
export interface ReleaseMetricSample {
    sampleId: string;
    runId: string;
    stage: ReleaseMetricStage;
    durationMs: number;
    observedAt: number;
}
export interface ReleaseMetricCounterReceipt {
    receiptId: string;
    runId: string;
    counter: ReleaseMetricCounter;
    amount: number;
    observedAt: number;
}
export interface ReleaseMetricSourceIssue {
    code: "source_record_invalid" | "stored_event_invalid" | "window_limit_reached";
    count: number;
}
export interface ReleaseMetricSourceSnapshot {
    samples: readonly ReleaseMetricSample[];
    counters: readonly ReleaseMetricCounterReceipt[];
    measuredCounters: readonly ReleaseMetricCounter[];
    runCount: number;
    terminalRunCount: number;
    issues: readonly ReleaseMetricSourceIssue[];
}
export interface ReleaseMetricStageLimit {
    p95MaxMs: number;
    maxMs?: number | undefined;
}
export interface ReleaseMetricBaseline {
    baselineId: string;
    approvedAt: number;
    stageLimits: Partial<Record<ReleaseMetricStage, ReleaseMetricStageLimit>>;
}
export interface ReleaseMetricAggregate {
    stage: ReleaseMetricStage;
    required: boolean;
    observation: ReleaseMetricObservation;
    count: number;
    p50Ms: number | null;
    p95Ms: number | null;
    maxMs: number | null;
}
export interface ReleaseMetricCounterAggregate {
    counter: ReleaseMetricCounter;
    observation: ReleaseMetricObservation;
    count: number | null;
}
export type ReleaseMetricBlockerCategory = "metric_coverage" | "baseline_required" | "product_regression" | "external_input";
export interface ReleaseMetricBlocker {
    category: ReleaseMetricBlockerCategory;
    code: "required_metric_not_observed" | "required_metric_not_configured" | "required_counter_not_observed" | "required_counter_not_configured" | "authorization_required" | "approved_baseline_missing" | "stage_baseline_missing" | "p95_limit_exceeded" | "max_limit_exceeded";
    stage?: ReleaseMetricStage | undefined;
    counter?: ReleaseMetricCounter | undefined;
}
export type ReleaseMetricAdmissionState = "collecting" | "coverage_evaluated" | "baseline_evaluated" | "admitted" | "rejected" | "blocked_external_input";
export interface ReleaseMetricAdmission {
    status: "admitted" | "rejected" | "blocked_external_input";
    state: ReleaseMetricAdmissionState;
    blockers: readonly ReleaseMetricBlocker[];
}
export interface ReleaseMetricReport {
    kind: "knowbee.release.window_metrics";
    window: ReleaseMetricWindow;
    sourceRunCount: number;
    terminalRunCount: number;
    sampleCount: number;
    sourceIssues: readonly ReleaseMetricSourceIssue[];
    metrics: readonly ReleaseMetricAggregate[];
    counters: readonly ReleaseMetricCounterAggregate[];
    baselineId: string | null;
    admission: ReleaseMetricAdmission;
}
export declare function buildReleaseWindowMetricReport(input: {
    window: ReleaseMetricWindow;
    source: ReleaseMetricSourceSnapshot;
    requiredStages: readonly ReleaseMetricStage[];
    configuredStages: readonly ReleaseMetricStage[];
    authorizationRequiredStages?: readonly ReleaseMetricStage[] | undefined;
    requiredCounters?: readonly ReleaseMetricCounter[] | undefined;
    configuredCounters?: readonly ReleaseMetricCounter[] | undefined;
    authorizationRequiredCounters?: readonly ReleaseMetricCounter[] | undefined;
    baseline: ReleaseMetricBaseline | null;
}): ReleaseMetricReport;
export declare function projectReleaseMetricProductLog(report: ReleaseMetricReport): {
    windowId: string;
    sampleCount: number;
    runCount: number;
    admissionStatus: ReleaseMetricAdmission["status"];
    blockerCategoryCounts: Partial<Record<ReleaseMetricBlockerCategory, number>>;
};
export declare function projectReleaseMetricFieldDebugLog(report: ReleaseMetricReport): {
    windowId: string;
    metrics: readonly ReleaseMetricAggregate[];
    counters: ReleaseMetricReport["counters"];
    sourceIssues: readonly ReleaseMetricSourceIssue[];
};
//# sourceMappingURL=release-window-metrics.d.ts.map