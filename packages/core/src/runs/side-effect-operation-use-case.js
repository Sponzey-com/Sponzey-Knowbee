import { transitionSideEffectOperation, validateSideEffectOperationReceipt, } from "../contracts/side-effect-operation.js";
function sameIdentity(left, right) {
    return (left.operationId === right.operationId &&
        left.scopeId === right.scopeId &&
        left.runId === right.runId &&
        left.workId === right.workId &&
        left.stepKey === right.stepKey &&
        left.adapterId === right.adapterId &&
        left.targetFingerprint === right.targetFingerprint &&
        left.paramsFingerprint === right.paramsFingerprint);
}
export function reserveSideEffectOperation(input) {
    const current = input.repository.loadByScope(input.identity.scopeId);
    if (current) {
        return sameIdentity(current.identity, input.identity)
            ? { status: "existing", aggregate: current }
            : { status: "rejected", reasonCode: "operation_scope_params_conflict" };
    }
    const aggregate = {
        identity: input.identity,
        state: "RESERVED",
        revision: 0,
        transitions: [],
    };
    const created = input.repository.create(aggregate);
    if (created.created)
        return { status: "reserved", aggregate };
    const raced = input.repository.loadByScope(input.identity.scopeId);
    if (!raced)
        return { status: "rejected", reasonCode: "operation_scope_persistence_conflict" };
    return sameIdentity(raced.identity, input.identity)
        ? { status: "existing", aggregate: raced }
        : { status: "rejected", reasonCode: "operation_scope_params_conflict" };
}
export function transitionReservedSideEffectOperation(input) {
    const current = input.repository.loadByScope(input.scopeId);
    if (!current)
        return { status: "rejected", reasonCode: "operation_not_found" };
    if (current.identity.operationId !== input.operationId) {
        return { status: "rejected", reasonCode: "operation_identity_mismatch" };
    }
    if (current.revision === input.expectedRevision + 1) {
        const last = current.transitions.at(-1);
        const persisted = input.repository.loadReceipt(input.receipt.receiptId);
        if (last?.event === input.event && last.receiptRef === input.receipt.receiptId) {
            return persisted && JSON.stringify(persisted) === JSON.stringify(input.receipt)
                ? { status: "applied", aggregate: current }
                : { status: "rejected", reasonCode: "receipt_conflict" };
        }
    }
    if (current.revision !== input.expectedRevision) {
        return { status: "rejected", reasonCode: "stale_revision", currentRevision: current.revision };
    }
    const revision = current.revision + 1;
    const receiptValidation = validateSideEffectOperationReceipt({
        receipt: input.receipt,
        identity: current.identity,
        event: input.event,
        operationRevision: revision,
    });
    if (!receiptValidation.ok)
        return { status: "rejected", reasonCode: "receipt_invalid" };
    const decision = transitionSideEffectOperation({
        state: current.state,
        event: input.event,
        receiptRef: input.receipt.receiptId,
    });
    if (!decision.accepted)
        return { status: "rejected", reasonCode: decision.reasonCode };
    const aggregate = {
        ...current,
        state: decision.nextState,
        revision,
        transitions: [
            ...current.transitions,
            {
                revision,
                previousState: decision.previousState,
                event: decision.event,
                nextState: decision.nextState,
                receiptRef: decision.receiptRef,
            },
        ],
    };
    const saved = input.repository.saveTransition({
        aggregate,
        expectedRevision: input.expectedRevision,
        receipt: input.receipt,
    });
    return saved.saved
        ? { status: "applied", aggregate }
        : { status: "rejected", reasonCode: saved.reasonCode, currentRevision: saved.currentRevision };
}
//# sourceMappingURL=side-effect-operation-use-case.js.map