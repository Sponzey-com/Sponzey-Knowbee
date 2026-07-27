import type { PerformanceAcceptanceAuthorizationPort, PerformanceAcceptanceAuthorizationReceipt, PerformanceAcceptanceMatrixCandidate } from "../maintenance/performance-acceptance-matrix.js";
import type { ReleaseAdministratorPrincipal } from "./release-administrator.js";
export interface PerformanceAcceptanceAuthorizationRecord extends PerformanceAcceptanceAuthorizationReceipt {
    authenticationId: string;
}
export interface PerformanceAcceptanceAuthorizationBinding {
    scope: "performance_release_gate";
    matrixId: string;
    matrixVersion: number;
    baselineVersion: string;
}
export interface PerformanceAcceptanceAuthorizationRepository {
    append(record: Readonly<PerformanceAcceptanceAuthorizationRecord>): {
        status: "stored" | "duplicate_id";
    };
    findLatest(binding: Readonly<PerformanceAcceptanceAuthorizationBinding>): Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined;
}
export interface PerformanceAcceptanceMatrixSelector {
    matrixId: string;
    matrixVersion: number;
    baselineVersion: string;
}
export type SelectedPerformanceAcceptanceMatrix = {
    status: "selected";
    candidate: Readonly<PerformanceAcceptanceMatrixCandidate>;
    authorizationPort: PerformanceAcceptanceAuthorizationPort;
};
export declare function selectPerformanceAcceptanceMatrix(input: {
    selector: PerformanceAcceptanceMatrixSelector;
    repository: PerformanceAcceptanceAuthorizationRepository;
}): SelectedPerformanceAcceptanceMatrix | {
    status: "baseline_only";
    reasonCodes: string[];
};
export declare function authorizePerformanceAcceptanceMatrix(input: {
    candidate: PerformanceAcceptanceMatrixCandidate;
    decision: PerformanceAcceptanceAuthorizationRecord["decision"];
    principal: ReleaseAdministratorPrincipal;
    authorizationId: string;
    decidedAt: number;
    repository: PerformanceAcceptanceAuthorizationRepository;
}): {
    status: "recorded";
    record: Readonly<PerformanceAcceptanceAuthorizationRecord>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function createPerformanceAcceptanceAuthorizationPort(repository: PerformanceAcceptanceAuthorizationRepository): PerformanceAcceptanceAuthorizationPort;
//# sourceMappingURL=performance-acceptance-authorization.d.ts.map