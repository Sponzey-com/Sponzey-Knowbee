import type { ContractValidationIssue } from "./index.js";
import { type RecommendedAction, type ResultSufficiency, type WorkRecordStatus, type WorkStepPlanItem, type WorkStepResult } from "./work-record.js";
export interface ValidatedWorkRecordStateDecision {
    workStatus: WorkRecordStatus;
    requestAction: RecommendedAction;
    stepStatuses: Array<{
        stepId: string;
        status: WorkStepPlanItem["status"];
    }>;
    resultStatuses: Array<{
        stepId: string;
        status: WorkStepResult["status"];
    }>;
    resultSufficiency: ResultSufficiency;
    resultAction: RecommendedAction;
    selectedAction: RecommendedAction;
}
export type WorkRecordStateDecisionResult = {
    status: "decided";
    decision: ValidatedWorkRecordStateDecision;
} | {
    status: "rejected";
    reasonCode: "invalid_structured_record";
    validationIssues: ContractValidationIssue[];
};
/**
 * Produces state truth only after the complete WorkRecord schema passes.
 * Descriptive text, output bodies, errors, logs, and evidence content are not
 * projected and therefore cannot influence the resulting state decision.
 */
export declare function decideValidatedWorkRecordState(value: unknown): WorkRecordStateDecisionResult;
//# sourceMappingURL=work-record-state-decision.d.ts.map