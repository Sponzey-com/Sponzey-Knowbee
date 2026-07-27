function normalized(value) {
    return value.trim();
}
function validTextList(values, allowEmpty = false) {
    if (!Array.isArray(values) || (!allowEmpty && values.length === 0))
        return false;
    const normalizedValues = values.map(normalized);
    return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length;
}
function sameSet(left, right) {
    if (!validTextList(left, true) || !validTextList(right, true))
        return false;
    const leftValues = left.map(normalized).sort();
    const rightValues = right.map(normalized).sort();
    return (leftValues.length === rightValues.length &&
        leftValues.every((value, index) => value === rightValues[index]));
}
function sameEffectScope(effect, value) {
    return (normalized(effect.effectId) === normalized(value.effectId) &&
        normalized(effect.target) === normalized(value.target) &&
        sameSet(effect.scope, value.scope));
}
export function authorizeSideEffect(input) {
    if (!Number.isSafeInteger(input.now) ||
        !normalized(input.workId) ||
        !normalized(input.effect.effectId) ||
        !normalized(input.effect.target) ||
        !validTextList(input.effect.scope) ||
        !normalized(input.effect.plannerActorId) ||
        !normalized(input.effect.executorActorId) ||
        !normalized(input.policyReceipt.receiptId))
        return { status: "rejected", reasonCodes: ["effect_authorization_invalid"] };
    const reasonCodes = [];
    if (!sameEffectScope(input.effect, input.policyReceipt)) {
        reasonCodes.push("effect_policy_scope_mismatch");
    }
    if (input.policyReceipt.decision === "denied")
        reasonCodes.push("effect_policy_denied");
    if (input.policyReceipt.issuedAt > input.now ||
        input.policyReceipt.expiresAt < input.now ||
        input.policyReceipt.expiresAt <= input.policyReceipt.issuedAt)
        reasonCodes.push("effect_policy_stale");
    if (input.policyReceipt.decision === "approval_required") {
        const approval = input.approvalReceipt;
        if (!approval) {
            reasonCodes.push("effect_approval_missing");
        }
        else {
            if (!sameEffectScope(input.effect, approval)) {
                reasonCodes.push("effect_approval_scope_mismatch");
            }
            if (!normalized(approval.receiptId) ||
                approval.status !== "approved" ||
                approval.issuedAt < input.policyReceipt.issuedAt ||
                approval.issuedAt > input.now)
                reasonCodes.push("effect_approval_invalid");
            if (normalized(approval.approverActorId) === normalized(input.effect.plannerActorId) ||
                normalized(approval.approverActorId) === normalized(input.effect.executorActorId))
                reasonCodes.push("effect_self_approval_forbidden");
        }
    }
    if (reasonCodes.length > 0) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: "authorized",
        workId: normalized(input.workId),
        effectId: normalized(input.effect.effectId),
        policyReceiptId: input.policyReceipt.receiptId,
        ...(input.approvalReceipt ? { approvalReceiptId: input.approvalReceipt.receiptId } : {}),
    };
}
const RELIABILITY_RANK = { low: 0, medium: 1, high: 2 };
const DIRECTNESS_RANK = { indirect: 0, direct: 1 };
function dominates(selected, other) {
    const values = [
        [selected.observedAt, other.observedAt],
        [RELIABILITY_RANK[selected.reliability], RELIABILITY_RANK[other.reliability]],
        [DIRECTNESS_RANK[selected.directness], DIRECTNESS_RANK[other.directness]],
    ];
    return (values.every(([left, right]) => (left ?? -1) >= (right ?? -1)) &&
        values.some(([left, right]) => (left ?? -1) > (right ?? -1)));
}
export function reviewHighRiskEvidence(input) {
    if (!normalized(input.workId) ||
        !validTextList(input.verification.evidenceRefs) ||
        input.sources.length === 0 ||
        !validTextList(input.sources.map((source) => source.sourceRef)) ||
        !input.sources.every((source) => normalized(source.claimFingerprint) && Number.isSafeInteger(source.observedAt)) ||
        !normalized(input.comparison.reason))
        return { status: "rejected", reasonCodes: ["high_risk_review_invalid"] };
    const reasonCodes = [];
    if (!input.verification.passed)
        reasonCodes.push("high_risk_verification_failed");
    if (input.effect.risk === "high" && input.verification.kind === "independent_review") {
        const verifier = normalized(input.verification.verifierActorId ?? "");
        if (!verifier ||
            verifier === normalized(input.effect.plannerActorId) ||
            verifier === normalized(input.effect.executorActorId))
            reasonCodes.push("high_risk_self_verification_forbidden");
    }
    const sourceRefs = input.sources.map((source) => source.sourceRef);
    if (!sameSet(input.comparison.sourceRefs, sourceRefs)) {
        reasonCodes.push("evidence_source_set_mismatch");
    }
    const claimsConflict = new Set(input.sources.map((source) => source.claimFingerprint)).size > 1;
    if (input.comparison.outcome === "unresolved") {
        if (input.comparison.selectedSourceRef !== null ||
            !normalized(input.comparison.uncertainty ?? "")) {
            reasonCodes.push("unresolved_uncertainty_missing");
        }
        if (reasonCodes.length > 0) {
            return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
        }
        return {
            status: "uncertain",
            workId: normalized(input.workId),
            sourceRefs: [...sourceRefs],
            uncertainty: normalized(input.comparison.uncertainty ?? ""),
        };
    }
    const selected = input.sources.find((source) => normalized(source.sourceRef) === normalized(input.comparison.selectedSourceRef ?? ""));
    if (!selected ||
        (claimsConflict &&
            !input.sources
                .filter((source) => source.sourceRef !== selected.sourceRef)
                .every((source) => dominates(selected, source))))
        reasonCodes.push("conflicting_evidence_not_resolved");
    if (reasonCodes.length > 0 || !selected) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: "verified",
        workId: normalized(input.workId),
        selectedSourceRef: selected.sourceRef,
        evidenceRefs: [...input.verification.evidenceRefs],
    };
}
//# sourceMappingURL=side-effect-evidence-gate.js.map