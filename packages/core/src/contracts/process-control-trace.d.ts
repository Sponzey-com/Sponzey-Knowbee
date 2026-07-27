import type { StructuredWorkLifecycleTraceEvent } from "./structured-work-lifecycle.js";
export type ProcessControlMode = "linear" | "state_machine";
export interface ProcessControlSignals {
    recursivePromptImprovement: boolean;
    delegation: boolean;
    longRunning: boolean;
    approvalRequired: boolean;
}
export interface ProcessControlDecision {
    mode: ProcessControlMode;
    reasonCodes: string[];
    stateStorageRequired: boolean;
}
export declare function decideProcessControlMode(signals: ProcessControlSignals): ProcessControlDecision;
export declare function assertProcessControlMode(signals: ProcessControlSignals, requestedMode: ProcessControlMode): ProcessControlDecision;
export type StructuredTraceLogPurpose = "product" | "field_debug" | "development";
export type StructuredTraceStatus = "running" | "completed" | "partial" | "blocked" | "failed";
export interface ProductTraceLogProjection {
    purpose: "product";
    workId: string;
    status: StructuredTraceStatus;
    reasonCode: string;
}
export interface FieldDebugTraceLogProjection extends Omit<ProductTraceLogProjection, "purpose"> {
    purpose: "field_debug";
    retryCount: number;
    transitions: Array<{
        phase: StructuredWorkLifecycleTraceEvent["phase"];
        reasonCode: string;
        stepIds: string[];
        referenceIds: string[];
    }>;
}
export interface DevelopmentTraceLogProjection extends Omit<FieldDebugTraceLogProjection, "purpose"> {
    purpose: "development";
    developmentIssues: string[];
}
export type StructuredTraceLogProjection = ProductTraceLogProjection | FieldDebugTraceLogProjection | DevelopmentTraceLogProjection;
export declare function projectStructuredTraceLog(input: {
    purpose: StructuredTraceLogPurpose;
    workId: string;
    status: StructuredTraceStatus;
    reasonCode: string;
    trace: StructuredWorkLifecycleTraceEvent[];
    retryCount: number;
    developmentIssues: string[];
}): StructuredTraceLogProjection;
export interface UserTraceSummaryProjection {
    workId: string;
    status: StructuredTraceStatus;
    reasonCode: string;
    completedScopeRefs: string[];
    unresolvedScopeRefs: string[];
    nextActionRefs: string[];
    finalResponseLlmRequired: true;
}
export declare function projectUserTraceSummary(input: Omit<UserTraceSummaryProjection, "finalResponseLlmRequired">): UserTraceSummaryProjection;
//# sourceMappingURL=process-control-trace.d.ts.map