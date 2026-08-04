const REASON_CODES = {
    llm_output_repairable: [
        "llm_output_schema_invalid",
        "intake_contract_unavailable",
        "analysis_schema_invalid",
        "response_invalid",
    ],
    capability_degraded: [
        "capability_selection_catalog_invalid",
        "capability_selection_rejected",
        "capability_selection_provider_unavailable",
        "capability_selection_snapshot_invalid",
        "capability_selection_context_invalid",
        "capability_selection_provider_failed",
        "capability_selection_timed_out",
        "capability_selection_output_limit_exceeded",
        "capability_selection_invalid_output",
        "capability_unavailable",
        "solution_plan_selected_capability_unavailable",
        "capability_snapshot_degraded",
        "required_method_unavailable",
        "capability_denied",
    ],
    policy_waiting: ["approval_required", "user_input_required", "capability_approval_required"],
    persistence_conflict: ["revision_conflict", "receipt_already_exists", "receipt_already_consumed"],
    adapter_unavailable: [
        "adapter_unavailable",
        "network_unavailable",
        "delivery_unavailable",
        "provider_contract_rejected",
        "provider_unavailable",
        "transport_failed",
        "deadline_exceeded",
    ],
};
function classifyReasonCode(reasonCode) {
    for (const [failureClass, reasonCodes] of Object.entries(REASON_CODES)) {
        if (reasonCodes.includes(reasonCode))
            return failureClass;
    }
    return "invariant_breach";
}
function retryClassFor(failureClass, retryable) {
    switch (failureClass) {
        case "llm_output_repairable":
            return "llm_repair";
        case "capability_degraded":
            return "changed_strategy";
        case "policy_waiting":
            return "wait";
        case "persistence_conflict":
            return "reload_state";
        case "adapter_unavailable":
            return retryable ? "adapter_retry" : "none";
        case "invariant_breach":
            return "none";
    }
}
function isSafeReference(value) {
    if (value.length < 1 || value.length > 160)
        return false;
    for (const character of value) {
        const isLowercaseLetter = character >= "a" && character <= "z";
        const isUppercaseLetter = character >= "A" && character <= "Z";
        const isDigit = character >= "0" && character <= "9";
        if (!isLowercaseLetter &&
            !isUppercaseLetter &&
            !isDigit &&
            character !== ":" &&
            character !== "." &&
            character !== "_" &&
            character !== "-") {
            return false;
        }
    }
    return true;
}
function safeReferenceOrFallback(value, fallback) {
    const normalized = value.trim();
    return isSafeReference(normalized) ? normalized : fallback;
}
export function projectCanonicalContractFailure(input) {
    const failureClass = classifyReasonCode(input.failure.reasonCode);
    const requestId = safeReferenceOrFallback(input.requestId, "request:unknown");
    const auditRef = safeReferenceOrFallback(input.auditRef, `audit:${requestId}`);
    const workId = input.workId ? safeReferenceOrFallback(input.workId, "work:unknown") : undefined;
    const safeEvidenceRefs = [
        ...new Set((input.safeEvidenceRefs ?? []).map((reference) => reference.trim()).filter(isSafeReference)),
    ].sort();
    const expectedRevision = input.expectedRevision !== undefined &&
        Number.isSafeInteger(input.expectedRevision) &&
        input.expectedRevision >= 0
        ? input.expectedRevision
        : undefined;
    return {
        phase: input.failure.phase,
        reasonCode: input.failure.reasonCode,
        failureClass,
        retryClass: retryClassFor(failureClass, input.failure.retryable),
        requestId,
        ...(workId ? { workId } : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        safeEvidenceRefs,
        auditRef,
    };
}
export function resolveExecutionFailure(failure) {
    switch (failure.retryClass) {
        case "llm_repair":
            return {
                kind: "repair",
                retryClass: "llm_repair",
                safeEvidenceRefs: [...failure.safeEvidenceRefs],
            };
        case "changed_strategy":
            return {
                kind: "replan",
                mode: "degraded_capability",
                retryClass: "changed_strategy",
                safeEvidenceRefs: [...failure.safeEvidenceRefs],
            };
        case "wait":
            return { kind: "wait", retryClass: "wait" };
        case "reload_state":
            return failure.expectedRevision !== undefined
                ? {
                    kind: "retry_persistence",
                    retryClass: "reload_state",
                    expectedRevision: failure.expectedRevision,
                }
                : {
                    kind: "internal_fault",
                    retryClass: "none",
                    auditRef: failure.auditRef,
                };
        case "adapter_retry":
            return { kind: "retry_adapter", retryClass: "adapter_retry" };
        case "none":
            return {
                kind: "internal_fault",
                retryClass: "none",
                auditRef: failure.auditRef,
            };
    }
}
export function projectPublicContractFailure(failure) {
    const directive = resolveExecutionFailure(failure);
    switch (directive.kind) {
        case "repair":
            return { status: "retrying", action: "repair" };
        case "replan":
            return { status: "retrying", action: "replan" };
        case "wait":
            return { status: "waiting", action: "wait" };
        case "retry_persistence":
        case "retry_adapter":
            return { status: "retrying", action: "retry" };
        case "internal_fault":
            return { status: "blocked", action: "contact_support" };
    }
}
export function projectAuditContractFailure(failure) {
    return {
        ...failure,
        safeEvidenceRefs: [...failure.safeEvidenceRefs],
    };
}
export function projectContractFailureRetryDirective(input) {
    const directive = resolveExecutionFailure(input.failure);
    if (directive.kind !== "repair" && directive.kind !== "replan")
        return null;
    return {
        kind: "retry_intake",
        summary: directive.kind === "repair"
            ? "분석 계약을 보정하여 다시 확인합니다."
            : "사용 가능한 기능으로 해결 전략을 다시 수립합니다.",
        reason: "A changed analysis strategy is required.",
        message: JSON.stringify({
            kind: "knowbee_intake_reanalysis_v1",
            originalRequest: input.originalRequest,
            failure: {
                phase: input.failure.phase,
                failureClass: input.failure.failureClass,
                retryClass: input.failure.retryClass,
                reasonCode: input.failure.reasonCode,
                safeEvidenceRefs: [...input.failure.safeEvidenceRefs],
            },
            requirements: {
                changedStrategyRequired: true,
                preserveOriginalGoal: true,
            },
        }),
        eventLabel: "canonical_policy_reanalysis_requested",
    };
}
//# sourceMappingURL=contract-failure-resolution.js.map