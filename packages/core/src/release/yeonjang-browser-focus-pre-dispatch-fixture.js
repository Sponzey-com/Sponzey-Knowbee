import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
export function prepareYeonjangBrowserFocusPreDispatch(input) {
    if (!input.target) {
        return blockedPreDispatch("target_identity_required");
    }
    if (!isApprovalReceiptAllowed(input.approvalReceipt)) {
        return blockedPreDispatch("side_effect_authorization_required");
    }
    if (input.registrationPrecondition.status !== "registration_ready") {
        return blockedPreDispatch("readiness_not_ready", input.registrationPrecondition.blockedBy ?? input.registrationPrecondition.reasonCode);
    }
    if (input.macosBridge.status !== "bridge_verified") {
        return blockedPreDispatch("macos_bridge_not_verified", input.macosBridge.reasonCode);
    }
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        platform: "macos",
        status: "dispatch_prepared",
        reasonCode: "browser_focus_dispatch_prepared",
        invokeNow: false,
        addProductionBindingNow: false,
        dispatcherRegistrationNow: false,
        target: projectPublicTargetEvidence(input.target),
        approvalScopeId: input.approvalReceipt.scopeId,
        macosBridgeStatus: "bridge_verified",
    });
}
function isApprovalReceiptAllowed(receipt) {
    return Boolean(receipt
        && receipt.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method
        && receipt.approved
        && (receipt.decision === "allow_once" || receipt.decision === "allow_run")
        && receipt.scopeId.trim().length > 0);
}
function blockedPreDispatch(reasonCode, blockedBy) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        platform: "macos",
        status: "dispatch_blocked",
        reasonCode,
        invokeNow: false,
        addProductionBindingNow: false,
        dispatcherRegistrationNow: false,
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
//# sourceMappingURL=yeonjang-browser-focus-pre-dispatch-fixture.js.map