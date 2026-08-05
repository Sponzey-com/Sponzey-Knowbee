import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js";
export type RuntimeInspectorTypedTraceStage = "not_started" | "request" | "analysis" | "execution" | "evidence" | "review" | "recovery" | "finalization" | "unknown";
export interface RuntimeInspectorTypedTraceProjection {
    status: "ready" | "not_recorded" | "unavailable";
    currentStage: RuntimeInspectorTypedTraceStage;
    eventCount: number;
    terminal: boolean;
    issueCount: number;
    verification: "not_started" | "evidence_recorded" | "reviewed" | "unknown";
    recoveryCount: number;
    blocker: "none" | "policy" | "exhausted" | "cancelled" | "unknown";
}
export declare function buildRuntimeInspectorTypedTrace(input: {
    repository: TypedObservabilityEventRepository;
    run: {
        id: string;
        requestGroupId: string;
        lineageRootRunId: string;
    };
}): RuntimeInspectorTypedTraceProjection;
//# sourceMappingURL=runtime-inspector-typed-trace.d.ts.map