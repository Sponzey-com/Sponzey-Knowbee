import type { ContractValidationResult } from "./index.js";
import type { CommandRequest } from "./sub-agent-orchestration.js";
import { type LlmRequestDiagnosisRecord, type WorkHandoffPackage, type WorkStepPlanItem } from "./work-record.js";
export interface RuntimeWorkHandoffProjectionInput {
    command: Pick<CommandRequest, "commandRequestId" | "subSessionId" | "targetAgentId" | "targetAgentNameSnapshot" | "taskScope" | "contextPackageIds">;
    parentWorkId: string;
    parentStepId: string;
    parentAgentName: string;
    targetAgentName?: string;
    userRequestSummary: string;
    requestDiagnosis: LlmRequestDiagnosisRecord;
    stepPlan?: WorkStepPlanItem[];
    currentStepId?: string;
    context?: string[];
    allowedTools?: string[];
    disallowedActions?: string[];
    qualityCriteria?: string[];
    validationMethod?: string;
    retryLimit: number;
    stopCondition: string;
    failureRecoveryPolicy?: string;
    deadlineOrBudget?: string;
    memoryVisibility?: string;
    returnFormat?: string;
}
export declare function buildRuntimeWorkHandoffPackage(input: RuntimeWorkHandoffProjectionInput): ContractValidationResult<WorkHandoffPackage>;
//# sourceMappingURL=work-handoff-projection.d.ts.map