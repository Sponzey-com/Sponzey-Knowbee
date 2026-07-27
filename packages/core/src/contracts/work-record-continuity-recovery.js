import { mergeStructuredChildResultIntoParent, } from "./evidence-delegation.js";
import { canTransitionWorkRecordStatus, decideWorkRecordRecoveryReentry, isDeclaredWorkRecordStatusTransition, validateRecoveryCandidateAgainstFailure, validateWorkRecord, } from "./work-record.js";
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
}
export function createWorkRecoverySignature(candidate) {
    return canonicalize({
        action: candidate.action_type,
        changedDimensions: [...candidate.changed_dimensions].sort(),
        changedInputOrStrategy: candidate.changed_input_or_strategy.trim().replace(/\s+/g, " ").toLowerCase(),
        metadata: candidate.metadata ?? null,
    });
}
function sameRecoveryCandidate(left, right) {
    return canonicalize(left) === canonicalize(right);
}
function rejected(reasonCode, issuePaths = []) {
    return { status: "rejected", reasonCode, issuePaths: [...new Set(issuePaths)] };
}
export function decideWorkRecordContinuityRecoveryAcceptance(input) {
    const parentValidation = validateWorkRecord(input.parentRecord);
    if (!parentValidation.ok) {
        return rejected("invalid_parent_record", parentValidation.issues.map((item) => item.path));
    }
    const parent = parentValidation.value;
    if (!isDeclaredWorkRecordStatusTransition(parent.status, input.targetParentStatus)) {
        return rejected("transition_not_allowed", ["$.targetParentStatus"]);
    }
    const merge = mergeStructuredChildResultIntoParent({
        parentRecord: parent,
        handoff: input.handoff,
        childResult: input.childResult,
        mergedAt: input.mergedAt,
    });
    if (!merge.ok)
        return rejected(merge.reasonCode, merge.issues.map((item) => item.path));
    let transitionCandidate = structuredClone(merge.record);
    const recoveryRequired = input.targetParentStatus === "failed" || input.targetParentStatus === "partial";
    let recovery = null;
    if (recoveryRequired) {
        const selected = input.selectedRecoveryAction;
        if (!selected)
            return rejected("recovery_action_required", ["$.selectedRecoveryAction"]);
        if (!transitionCandidate.failure_diagnosis ||
            !transitionCandidate.recovery_candidates?.some((candidate) => sameRecoveryCandidate(candidate, selected))) {
            return rejected("recovery_action_invalid", ["$.selectedRecoveryAction"]);
        }
        const candidateValidation = validateRecoveryCandidateAgainstFailure(transitionCandidate.failure_diagnosis, selected);
        if (!candidateValidation.ok) {
            return rejected("recovery_action_invalid", candidateValidation.issues.map((item) => item.path));
        }
        const signature = createWorkRecoverySignature(selected);
        if (input.previousRecoverySignatures.includes(signature)) {
            return rejected("recovery_signature_repeated", ["$.previousRecoverySignatures"]);
        }
        transitionCandidate = {
            ...transitionCandidate,
            selected_recovery_action: structuredClone(selected),
        };
        recovery = {
            action: selected.action_type,
            targetStatus: "planned",
            signature,
            changedDimensions: [...selected.changed_dimensions],
        };
    }
    const transition = canTransitionWorkRecordStatus(transitionCandidate, input.targetParentStatus);
    if (!transition.ok) {
        return rejected(transition.reasonCode === "transition_not_allowed"
            ? "transition_not_allowed"
            : transition.reasonCode === "recovery_action_required"
                ? "recovery_action_required"
                : transition.reasonCode === "recovery_action_invalid"
                    ? "recovery_action_invalid"
                    : "invalid_structured_record", ["$.targetParentStatus"]);
    }
    const transitioned = { ...transitionCandidate, status: input.targetParentStatus };
    const transitionedValidation = validateWorkRecord(transitioned);
    if (!transitionedValidation.ok) {
        return rejected("invalid_structured_record", transitionedValidation.issues.map((item) => item.path));
    }
    if (recoveryRequired) {
        const reentry = decideWorkRecordRecoveryReentry(transitionedValidation.value);
        if (reentry.status !== "resume_planned" || reentry.reasonCode !== "changed_recovery_selected") {
            return rejected("recovery_reentry_rejected", ["$.selectedRecoveryAction"]);
        }
    }
    return {
        status: "accepted",
        parentWorkId: merge.parentWorkId,
        childWorkId: merge.childWorkId,
        parentStepId: merge.parentStepId,
        targetAgentName: input.handoff.target_agent_name,
        transition: { fromStatus: parent.status, toStatus: input.targetParentStatus },
        evidenceRefs: [...input.childResult.evidence],
        recovery,
        record: transitionedValidation.value,
    };
}
//# sourceMappingURL=work-record-continuity-recovery.js.map