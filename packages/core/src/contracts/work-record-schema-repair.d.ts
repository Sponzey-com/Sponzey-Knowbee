import type { ContractValidationIssue } from "./index.js";
import { type WorkRecord } from "./work-record.js";
export interface WorkRecordSchemaRepairProviderInput {
    invalidCandidate: unknown;
    validationIssues: ContractValidationIssue[];
    workId: string;
    ownerAgentName: string;
    failedStepId: string;
}
export interface WorkRecordSchemaRepairProvider {
    repairWorkRecord(input: WorkRecordSchemaRepairProviderInput): Promise<unknown> | unknown;
}
export interface ResolveWorkRecordWithOneShotRepairInput {
    provider: WorkRecordSchemaRepairProvider;
    baseline: WorkRecord;
    candidate: unknown;
    failedStepId: string;
}
export type WorkRecordOneShotRepairResult = {
    status: "valid";
    repairAttempted: boolean;
    record: WorkRecord;
} | {
    status: "blocked";
    repairAttempted: true;
    reasonCode: "invalid_structured_record";
    record: WorkRecord;
    validationIssues: ContractValidationIssue[];
};
export declare function resolveWorkRecordWithOneShotRepair(input: ResolveWorkRecordWithOneShotRepairInput): Promise<WorkRecordOneShotRepairResult>;
//# sourceMappingURL=work-record-schema-repair.d.ts.map