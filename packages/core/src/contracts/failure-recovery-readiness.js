import { validateWorkRecord } from "./work-record.js";
function normalized(value) {
    return value.trim();
}
function normalizedSet(values) {
    return [...new Set(values.map(normalized).filter(Boolean))].sort();
}
function exactSet(claimed, expected) {
    const normalizedClaimed = normalizedSet(claimed);
    const normalizedExpected = normalizedSet(expected);
    return (normalizedClaimed.length === claimed.length &&
        normalizedClaimed.length === normalizedExpected.length &&
        normalizedClaimed.every((value, index) => value === normalizedExpected[index]));
}
function candidateBinding(decision) {
    const metadata = decision.selectedCandidate?.metadata;
    const capabilityId = typeof metadata?.capabilityId === "string" ? normalized(metadata.capabilityId) : "";
    const targetId = typeof metadata?.targetId === "string" ? normalized(metadata.targetId) : "";
    const strategyFingerprint = typeof metadata?.strategyFingerprint === "string"
        ? normalized(metadata.strategyFingerprint)
        : "";
    if (!capabilityId || !targetId || !strategyFingerprint)
        return undefined;
    return { capabilityId, targetId };
}
export function decideFailureRecoveryReadiness(input) {
    const reasonCodes = [];
    const workId = normalized(input.workId);
    const recordValidation = validateWorkRecord(input.workRecord);
    if (!recordValidation.ok)
        reasonCodes.push("work_record_invalid");
    if (!workId ||
        normalized(input.workRecord.work_id) !== workId ||
        normalized(input.diagnosis.workId) !== workId) {
        reasonCodes.push("work_scope_mismatch");
    }
    const unsatisfiedStepIds = input.workRecord.step_plan
        .filter((step) => step.status !== "completed" && step.status !== "skipped")
        .map((step) => step.step_id);
    if (!exactSet(input.diagnosis.unsatisfiedStepIds, unsatisfiedStepIds)) {
        reasonCodes.push("unsatisfied_steps_mismatch");
    }
    const obtainedResultStepIds = input.workRecord.step_results.map((result) => result.step_id);
    if (!exactSet(input.diagnosis.obtainedResultStepIds, obtainedResultStepIds)) {
        reasonCodes.push("obtained_results_mismatch");
    }
    const obtainedEvidenceRefs = input.workRecord.step_results.flatMap((result) => result.evidence_refs);
    if (!exactSet(input.diagnosis.obtainedEvidenceRefs, obtainedEvidenceRefs)) {
        reasonCodes.push("obtained_evidence_mismatch");
    }
    const recoveryReady = input.recoveryDecision.state === "retry_ready" &&
        (input.recoveryDecision.outcome === "retry" ||
            input.recoveryDecision.outcome === "redelegate") &&
        Boolean(normalized(input.recoveryDecision.receiptId)) &&
        Boolean(input.recoveryDecision.selectedCandidate) &&
        input.recoveryDecision.evidenceRefs.length > 0;
    if (!recoveryReady)
        reasonCodes.push("recovery_decision_not_ready");
    if (!exactSet(input.recoveryDecision.unresolvedScope, unsatisfiedStepIds)) {
        reasonCodes.push("recovery_scope_mismatch");
    }
    if (input.cancellationRequested)
        reasonCodes.push("recovery_cancelled");
    if (input.capabilityAdmission.status !== "allowed") {
        reasonCodes.push("next_action_not_executable");
    }
    const expectedBinding = candidateBinding(input.recoveryDecision);
    const selectedBinding = input.capabilityAdmission.status === "allowed"
        ? input.capabilityAdmission.selectedBinding
        : undefined;
    const capabilityReceiptId = input.capabilityAdmission.status === "allowed"
        ? normalized(input.capabilityAdmission.receiptId)
        : "";
    if (!expectedBinding ||
        !selectedBinding ||
        normalized(selectedBinding.capabilityId) !== expectedBinding.capabilityId ||
        normalized(selectedBinding.targetId) !== expectedBinding.targetId) {
        if (input.capabilityAdmission.status === "allowed") {
            reasonCodes.push("next_action_binding_mismatch");
        }
    }
    if (reasonCodes.length > 0 || !selectedBinding || !capabilityReceiptId) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: "ready",
        workId,
        unsatisfiedStepIds: normalizedSet(unsatisfiedStepIds),
        obtainedResultStepIds: normalizedSet(obtainedResultStepIds),
        obtainedEvidenceRefs: normalizedSet(obtainedEvidenceRefs),
        recoveryReceiptId: input.recoveryDecision.receiptId,
        capabilityReceiptId,
        selectedBinding,
    };
}
//# sourceMappingURL=failure-recovery-readiness.js.map