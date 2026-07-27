import { CANONICAL_EVENT_RECEIPT_KINDS, validateCanonicalWorkReceipt, } from "../contracts/canonical-work-receipt.js";
const TERMINAL_CAUSE_EVENT_OUTCOMES = Object.freeze({
    INPUT_REQUIRED: "input_required",
    POLICY_BLOCKED: "policy_block",
    RESULT_BLOCKED: "blocked",
    PATHS_EXHAUSTED: "exhausted",
    USER_CANCELLED: "cancelled",
});
function terminalTransition(aggregate) {
    return [...aggregate.transitions]
        .reverse()
        .find((transition) => Object.prototype.hasOwnProperty.call(TERMINAL_CAUSE_EVENT_OUTCOMES, transition.event));
}
export function createCanonicalTerminalEvidencePort(dependencies) {
    return Object.freeze({
        read(workId) {
            const aggregate = dependencies.loadAggregate(workId);
            if (!aggregate) {
                return {
                    status: "evidence_missing",
                    reasonCode: "canonical_terminal_aggregate_missing",
                };
            }
            const transition = terminalTransition(aggregate);
            if (!transition) {
                return {
                    status: "evidence_missing",
                    reasonCode: "canonical_terminal_transition_missing",
                };
            }
            let receipt;
            try {
                receipt = dependencies.loadReceipt(transition.receiptRef);
            }
            catch {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_corrupt",
                };
            }
            if (!receipt) {
                return {
                    status: "evidence_missing",
                    reasonCode: "canonical_terminal_receipt_missing",
                };
            }
            if (!validateCanonicalWorkReceipt(receipt).ok) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_corrupt",
                };
            }
            if (receipt.receiptId !== transition.receiptRef) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_ref_mismatch",
                };
            }
            if (receipt.workId !== aggregate.workId) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_scope_mismatch",
                };
            }
            if (receipt.kind !== CANONICAL_EVENT_RECEIPT_KINDS[transition.event]) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_kind_mismatch",
                };
            }
            if (receipt.consumedRevision !== transition.revision) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_receipt_revision_mismatch",
                };
            }
            if (!receipt.terminalCause) {
                return {
                    status: "evidence_missing",
                    reasonCode: "canonical_terminal_cause_missing",
                };
            }
            const event = transition.event;
            if (receipt.terminalCause.outcomeKind !== TERMINAL_CAUSE_EVENT_OUTCOMES[event]) {
                return {
                    status: "evidence_invalid",
                    reasonCode: "canonical_terminal_cause_outcome_mismatch",
                };
            }
            return {
                status: "available",
                workId: aggregate.workId,
                rootRunId: aggregate.rootRunId,
                terminalState: transition.nextState,
                transition: {
                    revision: transition.revision,
                    event,
                    receiptRef: transition.receiptRef,
                },
                cause: receipt.terminalCause,
                evidenceFingerprint: receipt.evidenceFingerprint,
                evidenceRefs: [...receipt.evidenceRefs],
            };
        },
    });
}
//# sourceMappingURL=canonical-terminal-evidence.js.map