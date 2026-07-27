import { SqliteSideEffectOperationRepository } from "../db/side-effect-operation-repository.js";
export function loadYeonjangSideEffectGoalValidationCandidate(input) {
    const operationId = input.operationId.trim();
    if (!operationId)
        return { status: "not_ready", reasonCode: "operation_id_missing" };
    const row = input.db
        .prepare("SELECT operation_id, scope_id FROM side_effect_operations WHERE operation_id = ?")
        .get(operationId);
    if (!row)
        return { status: "not_ready", reasonCode: "operation_not_found" };
    const repository = new SqliteSideEffectOperationRepository(input.db, input.now ?? (() => Date.now()));
    const operation = repository.loadByScope(row.scope_id);
    if (!operation || operation.identity.operationId !== row.operation_id) {
        return { status: "not_ready", reasonCode: "operation_not_found" };
    }
    if (operation.identity.runId !== input.expectedRunId) {
        return { status: "not_ready", reasonCode: "operation_run_scope_mismatch" };
    }
    if (input.expectedWorkId && operation.identity.workId !== input.expectedWorkId) {
        return { status: "not_ready", reasonCode: "operation_work_scope_mismatch" };
    }
    if (operation.state !== "MANUAL_INTERVENTION") {
        return { status: "not_ready", reasonCode: "operation_not_manual" };
    }
    return {
        status: "ready",
        operation,
        loadReceipt: (receiptId) => repository.loadReceipt(receiptId),
        publicSummary: {
            operationId: operation.identity.operationId,
            runId: operation.identity.runId,
            workId: operation.identity.workId,
            adapterId: operation.identity.adapterId,
            state: "MANUAL_INTERVENTION",
            revision: operation.revision,
            transitionCount: operation.transitions.length,
        },
    };
}
//# sourceMappingURL=side-effect-goal-validation-adapter.js.map