const UNSAFE_DETAIL_PATTERN = /(?:https?:\/\/|\/Users\/|token=|raw title|raw url|tabId|windowId)/giu;
function sanitizedValue(value) {
    return value.replace(UNSAFE_DETAIL_PATTERN, "[redacted]").trim();
}
function hasText(value) {
    return sanitizedValue(value).length > 0;
}
export function buildYeonjangBrowserActiveTabInfoActivationRequest(input) {
    const blockingReasonCodes = [];
    if (input.prerequisiteProjection.status !== "ready_for_explicit_enable_task") {
        blockingReasonCodes.push("activation_request_prerequisites_not_ready");
    }
    if (!hasText(input.manualApprovalReference)) {
        blockingReasonCodes.push("activation_request_manual_approval_reference_required");
    }
    if (!hasText(input.targetPlatform)) {
        blockingReasonCodes.push("activation_request_target_platform_required");
    }
    if (!hasText(input.operatorIdentityProof)) {
        blockingReasonCodes.push("activation_request_operator_identity_proof_required");
    }
    if (!hasText(input.rollbackRequirement)) {
        blockingReasonCodes.push("activation_request_rollback_requirement_required");
    }
    if (input.explicitEnableScope.length === 0) {
        blockingReasonCodes.push("activation_request_explicit_enable_scope_required");
    }
    const base = {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1",
        method: "browser.active_tab_info",
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    };
    if (blockingReasonCodes.length > 0) {
        return Object.freeze({
            ...base,
            status: "blocked",
            blockingReasonCodes: Object.freeze([...blockingReasonCodes]),
        });
    }
    return Object.freeze({
        ...base,
        status: "activation_request_ready",
        blockingReasonCodes: Object.freeze([]),
        activationRequest: Object.freeze({
            manualApprovalReference: sanitizedValue(input.manualApprovalReference),
            targetPlatform: input.targetPlatform,
            operatorIdentityProof: sanitizedValue(input.operatorIdentityProof),
            rollbackRequirement: sanitizedValue(input.rollbackRequirement),
            explicitEnableScope: Object.freeze([...input.explicitEnableScope]),
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-activation-request.js.map