const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
export function buildApprovedOperationResumeCommand(input) {
    if (input.row.status !== "consumed") {
        return Object.freeze({
            status: "rejected",
            reasonCode: "approval_not_consumed",
        });
    }
    if (!input.row.operation_id?.trim()
        || !input.row.operation_binding_hash
        || !HASH_PATTERN.test(input.row.operation_binding_hash)
        || input.row.continuation_schema_version !== 1) {
        return Object.freeze({
            status: "rejected",
            reasonCode: "approval_operation_binding_invalid",
        });
    }
    if (input.expectedBinding
        && (input.row.operation_id !== input.expectedBinding.operationId
            || input.row.operation_binding_hash
                !== input.expectedBinding.operationBindingHash
            || input.row.continuation_schema_version
                !== input.expectedBinding.continuationSchemaVersion)) {
        return Object.freeze({
            status: "rejected",
            reasonCode: "approval_operation_binding_mismatch",
        });
    }
    return Object.freeze({
        status: "ready",
        command: Object.freeze({
            schemaVersion: 1,
            approvalId: input.row.id,
            runId: input.row.run_id,
            requestGroupId: input.row.request_group_id,
            toolName: input.row.tool_name,
            decision: input.decision,
            operationId: input.row.operation_id,
            operationBindingHash: input.row.operation_binding_hash,
            continuationSchemaVersion: 1,
        }),
    });
}
//# sourceMappingURL=approved-operation-resume.js.map