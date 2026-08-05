import type { ExhaustionSummary, NodeResultOutput, WorkOrder } from "../contracts/enterprise-topology.js";
import type { NodeRecoveryControllerResult } from "./recovery-controller.js";
import type { SolutionPathExhaustionAssessment } from "./solution-path-exhaustion.js";
export interface CheckFinalFailureExhaustionInput {
    workOrder: WorkOrder;
    outputs: NodeResultOutput[];
    recoveryReview: NodeRecoveryControllerResult;
    solutionPathAssessment: SolutionPathExhaustionAssessment;
}
export interface NodeExhaustionCheckResult {
    exhaustionSummary: ExhaustionSummary;
    complete: boolean;
    canFinalizeFailure: boolean;
    successCriteriaStillNotMet: boolean;
    unmetSuccessCriteriaIds: string[];
    untriedOptions: string[];
    blockingUntriedOptions: string[];
    reasonCodes: string[];
    solutionPathAssessment: SolutionPathExhaustionAssessment;
}
export declare function checkFinalFailureExhaustion(input: CheckFinalFailureExhaustionInput): NodeExhaustionCheckResult;
//# sourceMappingURL=exhaustion-checker.d.ts.map