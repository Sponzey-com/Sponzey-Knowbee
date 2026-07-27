import { type LivePerformanceEvidenceSource } from "../maintenance/live-performance-evidence.js";
import { type RepresentativeFlowId } from "../maintenance/performance-baseline.js";
import { type PerformanceAcceptanceAuthorizationRepository, type PerformanceAcceptanceMatrixSelector } from "./performance-acceptance-authorization.js";
import type { ReleasePerformanceAcceptanceEvidence } from "./performance-gate.js";
export interface LivePerformanceAcceptanceRunSelector {
    flowId: RepresentativeFlowId;
    runId: string;
}
export declare function collectLivePerformanceAcceptanceEvidence(input: {
    selector: PerformanceAcceptanceMatrixSelector;
    repository: PerformanceAcceptanceAuthorizationRepository;
    source: LivePerformanceEvidenceSource;
    runs: readonly LivePerformanceAcceptanceRunSelector[];
}): ReleasePerformanceAcceptanceEvidence;
//# sourceMappingURL=live-performance-acceptance-collection.d.ts.map