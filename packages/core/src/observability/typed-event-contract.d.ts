export type ObservabilityLogPurpose = "product" | "field_debug" | "development";
export type TypedObservabilityEventKind = "request_received" | "analysis_started" | "analysis_completed" | "execution_started" | "execution_completed" | "evidence_recorded" | "review_completed" | "recovery_started" | "recovery_completed" | "finalization_completed";
export interface ObservabilityCorrelationContext {
    requestId: string;
    requestGroupId: string;
    rootRunId: string;
    runId: string;
    parentRunId?: string | undefined;
    workId?: string | undefined;
    attemptId?: string | undefined;
    evidenceId?: string | undefined;
    reviewId?: string | undefined;
    recoveryId?: string | undefined;
}
export type ObservabilityAttributeValue = string | number | boolean | null;
export interface TypedObservabilityEvent {
    eventId: string;
    kind: TypedObservabilityEventKind;
    purpose: ObservabilityLogPurpose;
    at: number;
    correlation: Readonly<ObservabilityCorrelationContext>;
    reasonCode: string;
    summary: string;
    attributes?: Readonly<Record<string, ObservabilityAttributeValue>> | undefined;
}
export type TypedObservabilityEventRejectionReason = "event_id_required" | "invalid_timestamp" | "correlation_id_required" | "work_id_required" | "attempt_id_required" | "evidence_id_required" | "review_id_required" | "recovery_id_required" | "reason_code_invalid" | "summary_invalid" | "unsafe_summary" | "unsafe_attribute_key" | "unsafe_attribute_value";
export type BuildTypedObservabilityEventResult = {
    status: "ready";
    event: TypedObservabilityEvent;
} | {
    status: "rejected";
    reasonCode: TypedObservabilityEventRejectionReason;
};
export interface TypedObservabilityTraceIssue {
    code: "cross_request_link" | "stage_regression" | "duplicate_finalization" | "correlation_mismatch" | "missing_parent_run" | "evidence_review_mismatch" | "unknown_review";
    eventId: string;
}
export interface TypedObservabilityTraceProjection {
    requestId: string | null;
    events: readonly TypedObservabilityEvent[];
    issues: readonly TypedObservabilityTraceIssue[];
    terminal: boolean;
}
export declare function buildTypedObservabilityEvent(input: TypedObservabilityEvent): BuildTypedObservabilityEventResult;
export declare function projectTypedObservabilityTrace(input: readonly TypedObservabilityEvent[]): TypedObservabilityTraceProjection;
//# sourceMappingURL=typed-event-contract.d.ts.map