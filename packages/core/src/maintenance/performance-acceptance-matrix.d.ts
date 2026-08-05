import type { MeasuredRepresentativeFlowSample, PerformanceAcceptanceThresholds, PerformanceReferenceFlow, RepresentativeFlowId } from "./performance-baseline.js";
export interface PerformanceAcceptanceMatrixCandidate {
    schemaVersion: 1;
    matrixId: string;
    matrixVersion: number;
    baselineVersion: string;
    baselineSnapshot: PerformanceAcceptanceBaselineSnapshot;
    thresholds: Partial<Record<RepresentativeFlowId, PerformanceAcceptanceThresholds>>;
}
export interface PerformanceAcceptanceBaselineFlowSnapshot {
    flowId: RepresentativeFlowId;
    latencyP95Ms: number;
    llmCallCount: number;
    attemptCount: number;
}
export interface PerformanceAcceptanceBaselineSnapshot {
    schemaVersion: 1;
    baselineVersion: string;
    flows: readonly PerformanceAcceptanceBaselineFlowSnapshot[];
}
export interface PerformanceAcceptanceAuthorizationReceipt {
    schemaVersion: 1;
    authorizationId: string;
    decision: "approved" | "denied" | "revoked";
    actorType: "administrator" | "system";
    actorId: string;
    scope: "performance_release_gate";
    matrixId: string;
    matrixVersion: number;
    baselineVersion: string;
    thresholdSnapshot: PerformanceAcceptanceMatrixCandidate["thresholds"];
    baselineSnapshot: PerformanceAcceptanceBaselineSnapshot;
    approvedAt: number;
}
export interface PerformanceAcceptanceAuthorizationPort {
    resolve(candidate: Readonly<PerformanceAcceptanceMatrixCandidate>): PerformanceAcceptanceAuthorizationReceipt | undefined;
}
export type PerformanceAcceptanceMatrixValidationResult = {
    status: "valid";
    candidate: Readonly<PerformanceAcceptanceMatrixCandidate>;
} | {
    status: "baseline_only";
    reasonCodes: string[];
};
export interface ActivePerformanceAcceptanceMatrix {
    readonly candidate: Readonly<PerformanceAcceptanceMatrixCandidate>;
    readonly authorization: Readonly<PerformanceAcceptanceAuthorizationReceipt>;
}
export declare function validatePerformanceAcceptanceMatrix(candidate: PerformanceAcceptanceMatrixCandidate): PerformanceAcceptanceMatrixValidationResult;
export declare function activatePerformanceAcceptanceMatrix(input: {
    candidate: PerformanceAcceptanceMatrixCandidate;
    authorizationPort: PerformanceAcceptanceAuthorizationPort;
}): {
    status: "active";
    matrix: ActivePerformanceAcceptanceMatrix;
} | {
    status: "baseline_only";
    reasonCodes: string[];
};
export declare function evaluateMeasuredFlowWithAcceptanceMatrix(input: {
    candidate: PerformanceAcceptanceMatrixCandidate;
    authorizationPort: PerformanceAcceptanceAuthorizationPort;
    referenceBaselineVersion: string;
    reference: PerformanceReferenceFlow;
    live: MeasuredRepresentativeFlowSample;
}): {
    status: "baseline_only" | "accepted" | "rejected";
    reasonCodes: string[];
};
//# sourceMappingURL=performance-acceptance-matrix.d.ts.map