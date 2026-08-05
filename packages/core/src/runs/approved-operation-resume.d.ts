import type { ApprovalOperationBinding, ApprovalRegistryRow } from "./approval-registry.js";
export interface ApprovedOperationResumeCommand {
    readonly schemaVersion: 1;
    readonly approvalId: string;
    readonly runId: string;
    readonly requestGroupId: string | null;
    readonly toolName: string;
    readonly decision: "allow_once" | "allow_run";
    readonly operationId: string;
    readonly operationBindingHash: `sha256:${string}`;
    readonly continuationSchemaVersion: 1;
}
export type ApprovedOperationResumeCommandResult = {
    readonly status: "ready";
    readonly command: ApprovedOperationResumeCommand;
} | {
    readonly status: "rejected";
    readonly reasonCode: "approval_not_consumed" | "approval_operation_binding_invalid" | "approval_operation_binding_mismatch";
};
export declare function buildApprovedOperationResumeCommand(input: {
    row: ApprovalRegistryRow;
    decision: "allow_once" | "allow_run";
    expectedBinding?: ApprovalOperationBinding;
}): ApprovedOperationResumeCommandResult;
//# sourceMappingURL=approved-operation-resume.d.ts.map