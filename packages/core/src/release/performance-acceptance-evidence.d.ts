import { type MeasuredRepresentativeFlowSample, type RepresentativeFlowBaselineResult } from "../maintenance/performance-baseline.js";
import type { SelectedPerformanceAcceptanceMatrix } from "./performance-acceptance-authorization.js";
import type { ReleasePerformanceAcceptanceEvidence } from "./performance-gate.js";
export declare function buildPerformanceAcceptanceEvidence(input: {
    selected: SelectedPerformanceAcceptanceMatrix;
    baseline?: Readonly<RepresentativeFlowBaselineResult>;
    samples: readonly MeasuredRepresentativeFlowSample[];
}): ReleasePerformanceAcceptanceEvidence;
//# sourceMappingURL=performance-acceptance-evidence.d.ts.map