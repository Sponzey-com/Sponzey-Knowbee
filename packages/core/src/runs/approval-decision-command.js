import { buildApprovedOperationResumeCommand, } from "./approved-operation-resume.js";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function operationBindingFromRow(row) {
    const hasAnyBinding = row.operation_id !== null
        || row.operation_binding_hash !== null
        || row.continuation_schema_version !== null;
    if (!hasAnyBinding)
        return null;
    if (!row.operation_id?.trim()
        || !row.operation_binding_hash
        || !HASH_PATTERN.test(row.operation_binding_hash)
        || row.continuation_schema_version !== 1) {
        return "invalid";
    }
    return Object.freeze({
        operationId: row.operation_id,
        operationBindingHash: row.operation_binding_hash,
        continuationSchemaVersion: 1,
    });
}
export function resolveApprovalDecisionCommand(command, dependencies) {
    const current = dependencies.loadApproval(command.approvalId);
    if (!current)
        return { accepted: false, reasonCode: "approval_not_found" };
    if (current.run_id !== command.runId) {
        return { accepted: false, reasonCode: "approval_run_mismatch" };
    }
    if (current.status !== "requested") {
        return { accepted: false, reasonCode: "approval_already_final" };
    }
    const operationBinding = operationBindingFromRow(current);
    if (operationBinding === "invalid") {
        return {
            accepted: false,
            reasonCode: "approval_operation_binding_invalid",
        };
    }
    const resolved = dependencies.resolveDecision({
        approvalId: command.approvalId,
        decision: command.decision,
        decisionBy: command.decisionBy,
        decisionSource: command.decisionSource,
        ...(command.now === undefined ? {} : { now: command.now }),
    });
    if (!resolved.accepted || !resolved.row) {
        return { accepted: false, reasonCode: "approval_decision_rejected" };
    }
    let row = resolved.row;
    let resumeCommand;
    let continuationId;
    if (command.decision !== "deny") {
        const consumed = dependencies.consumeDecision(command.approvalId, command.now);
        if (!consumed.accepted || !consumed.row) {
            return { accepted: false, reasonCode: "approval_consumption_rejected" };
        }
        row = consumed.row;
        if (operationBinding) {
            const built = buildApprovedOperationResumeCommand({
                row,
                decision: command.decision,
                expectedBinding: operationBinding,
            });
            if (built.status === "rejected") {
                return {
                    accepted: false,
                    reasonCode: "approval_operation_binding_invalid",
                };
            }
            resumeCommand = built.command;
            const queued = dependencies.enqueueContinuation(resumeCommand, command.now);
            if (queued.status === "rejected") {
                return {
                    accepted: false,
                    reasonCode: "approval_continuation_enqueue_rejected",
                };
            }
            continuationId = queued.continuation.continuationId;
        }
    }
    const canonicalEvent = command.decision === "deny"
        ? "APPROVAL_DENIED_OR_EXPIRED"
        : "APPROVAL_CONSUMED";
    const canonical = operationBinding
        ? dependencies.recordCanonicalLifecycle({
            runId: command.runId,
            approvalId: command.approvalId,
            event: canonicalEvent,
            operationBinding,
        })
        : "compatibility";
    if (canonical === "failed") {
        return {
            accepted: false,
            reasonCode: "canonical_approval_transition_rejected",
        };
    }
    return {
        accepted: true,
        row,
        decision: command.decision,
        ...(resumeCommand ? { resumeCommand } : {}),
        ...(continuationId ? { continuationId } : {}),
        canonicalOwned: canonical === "applied",
    };
}
//# sourceMappingURL=approval-decision-command.js.map