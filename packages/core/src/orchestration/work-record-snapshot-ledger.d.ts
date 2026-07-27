import type { ContractValidationIssue } from "../contracts/index.js";
import { type ChildWorkResult, type WorkHandoffPackage } from "../contracts/work-record.js";
export type WorkRecordSnapshotKind = "work_handoff_package" | "child_work_result";
export type WorkRecordSnapshotStage = "pre_dispatch_handoff" | "post_review_child_result";
export type WorkRecordSnapshotValidationStatus = "valid";
export type RuntimeWorkRecordSnapshotInput = {
    snapshotKind: "work_handoff_package";
    stage: "pre_dispatch_handoff";
    record: WorkHandoffPackage;
    parentRunId: string;
    subSessionId: string;
    agentId: string;
    taskId: string;
    source: string;
} | {
    snapshotKind: "child_work_result";
    stage: "post_review_child_result";
    record: ChildWorkResult;
    parentRunId: string;
    subSessionId: string;
    agentId: string;
    resultReportId: string;
    source: string;
};
export interface RuntimeWorkRecordSnapshotResult {
    recorded: boolean;
    reasonCode?: "invalid_snapshot" | "ledger_write_failed";
    validationIssues?: ContractValidationIssue[];
}
export declare function recordRuntimeWorkRecordSnapshotSafely(input: RuntimeWorkRecordSnapshotInput): RuntimeWorkRecordSnapshotResult;
//# sourceMappingURL=work-record-snapshot-ledger.d.ts.map