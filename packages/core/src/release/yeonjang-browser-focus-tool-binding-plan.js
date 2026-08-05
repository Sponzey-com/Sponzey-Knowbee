import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
const REQUIRED_GATES = [
    "tool_descriptor",
    "side_effect_method_contract",
    "target_projection",
    "approval_receipt",
    "pre_dispatch_fixture",
    "macos_executor_bridge",
    "yeonjang_capability_readiness",
    "raw_payload_redaction",
];
export function buildYeonjangBrowserFocusToolBindingPlan(input) {
    if (!isDescriptorShapeValid(input.descriptor)) {
        return blockedToolBindingPlan("descriptor_contract_mismatch");
    }
    if (!input.descriptor.sideEffectMethodContractBound) {
        return blockedToolBindingPlan("side_effect_method_contract_not_bound");
    }
    if (!input.target) {
        return blockedToolBindingPlan("target_identity_required");
    }
    if (!isApprovalReceiptAllowed(input.approvalReceipt)) {
        return blockedToolBindingPlan("side_effect_authorization_required");
    }
    if (!input.preDispatch || input.preDispatch.status !== "dispatch_prepared") {
        return blockedToolBindingPlan("pre_dispatch_not_ready", input.preDispatch?.reasonCode ?? "pre_dispatch_required");
    }
    if (!input.macosBridge || input.macosBridge.status !== "bridge_verified") {
        return blockedToolBindingPlan("macos_bridge_not_verified", input.macosBridge?.reasonCode ?? "macos_bridge_required");
    }
    if (!input.yeonjangCapabilityReady) {
        return blockedToolBindingPlan("yeonjang_capability_not_ready");
    }
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "binding_plan_ready",
        reasonCode: "browser_focus_tool_binding_plan_ready",
        addProductionBindingNow: false,
        registerSkillCatalogNow: false,
        dispatcherRegistrationNow: false,
        invokeNow: false,
        target: projectPublicTargetEvidence(input.target),
        approvalScopeId: input.approvalReceipt.scopeId,
        requiredGates: [...REQUIRED_GATES],
    });
}
function isDescriptorShapeValid(descriptor) {
    return Boolean(descriptor
        && descriptor.toolName === "yeonjang_browser_focus"
        && descriptor.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method
        && descriptor.riskLevel === YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel
        && descriptor.requiresApproval === true
        && descriptor.runtimeHealthMode === "required"
        && descriptor.runtimeMethodIds.includes(YEONJANG_BROWSER_FOCUS_CONTRACT.method)
        && descriptor.requiresPreDispatchFixture === true
        && descriptor.requiresMacosBridgeVerified === true
        && descriptor.rawPayloadVisibility === YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility
        && descriptor.targetSchemaVersion === "yeonjang-browser-focus-target-v1");
}
function isApprovalReceiptAllowed(receipt) {
    return Boolean(receipt
        && receipt.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method
        && receipt.approved
        && (receipt.decision === "allow_once" || receipt.decision === "allow_run")
        && receipt.scopeId.trim().length > 0);
}
function blockedToolBindingPlan(reasonCode, blockedBy) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "binding_plan_blocked",
        reasonCode,
        addProductionBindingNow: false,
        registerSkillCatalogNow: false,
        dispatcherRegistrationNow: false,
        invokeNow: false,
        ...(blockedBy ? { blockedBy } : {}),
    });
}
function projectPublicTargetEvidence(target) {
    return Object.freeze({
        schemaVersion: target.schemaVersion,
        targetKind: target.targetKind,
        ...(target.targetAlias ? { targetAlias: target.targetAlias } : {}),
        displayName: target.displayName,
        ...(target.processName ? { processName: target.processName } : {}),
        ...(target.titleHash ? { titleHash: target.titleHash } : {}),
        ...(typeof target.titleLength === "number" ? { titleLength: target.titleLength } : {}),
        ...(target.urlScheme ? { urlScheme: target.urlScheme } : {}),
        ...(target.urlHash ? { urlHash: target.urlHash } : {}),
        ...(typeof target.urlLength === "number" ? { urlLength: target.urlLength } : {}),
    });
}
//# sourceMappingURL=yeonjang-browser-focus-tool-binding-plan.js.map