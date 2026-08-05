import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
const REQUIRED_GATES = [
    "tool_descriptor",
    "side_effect_method_contract",
    "approval_preflight",
    "registration_precondition",
    "command_skeleton",
    "focused_target_observation_backend",
    "raw_payload_redaction",
];
export function evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton(input) {
    if (!input.descriptor) {
        return blockedToolDescriptorIntegration("tool_not_registered", "missing_tool_descriptor");
    }
    if (!descriptorMatchesBrowserFocusContract(input.descriptor)) {
        return blockedToolDescriptorIntegration("descriptor_contract_mismatch", "tool_descriptor");
    }
    if (!input.sideEffectMethodContractBound) {
        return blockedToolDescriptorIntegration("side_effect_method_contract_not_bound", "side_effect_method_contract");
    }
    if (input.registrationPrecondition.status !== "registration_ready") {
        return blockedToolDescriptorIntegration("production_exposure_not_executable", input.registrationPrecondition.reasonCode === "production_exposure_not_executable"
            ? input.registrationPrecondition.blockedBy
            : input.registrationPrecondition.reasonCode);
    }
    if (input.preflight.reasonCode === "side_effect_authorization_required") {
        return blockedToolDescriptorIntegration("side_effect_authorization_required", "approval_preflight");
    }
    if (input.preflight.status !== "ready") {
        return blockedToolDescriptorIntegration("preflight_not_ready", input.preflight.reasonCode);
    }
    if (input.commandSkeleton.status !== "skeleton_ready") {
        return blockedToolDescriptorIntegration("command_skeleton_not_ready", input.commandSkeleton.reasonCode);
    }
    if (!input.focusedTargetObservationBackendReady) {
        return blockedToolDescriptorIntegration("focused_target_observation_backend_required", "focused_target_observation_backend");
    }
    return Object.freeze({
        status: "integration_skeleton_ready",
        reasonCode: "browser_focus_tool_descriptor_integration_skeleton_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        addProductionBindingNow: false,
        executable: false,
        dispatcherIntegrationNow: false,
        descriptor: input.descriptor,
        requiredGates: [...REQUIRED_GATES],
    });
}
function descriptorMatchesBrowserFocusContract(descriptor) {
    return descriptor.toolName === "yeonjang_browser_focus" &&
        descriptor.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method &&
        descriptor.riskLevel === YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel &&
        descriptor.sideEffectClass === YEONJANG_BROWSER_FOCUS_CONTRACT.sideEffectClass &&
        descriptor.permissionSetting === YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting &&
        descriptor.requiresApproval === YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval &&
        descriptor.runtimeHealthMode === "required" &&
        descriptor.postCheckMode === YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode &&
        descriptor.rawPayloadVisibility === YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility &&
        descriptor.defaultLiveSmokeAllowed === YEONJANG_BROWSER_FOCUS_CONTRACT.defaultLiveSmokeAllowed;
}
function blockedToolDescriptorIntegration(reasonCode, blockedBy) {
    return Object.freeze({
        status: "integration_blocked",
        reasonCode,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        addProductionBindingNow: false,
        executable: false,
        dispatcherIntegrationNow: false,
        blockedBy,
        requiredGates: [...REQUIRED_GATES],
    });
}
//# sourceMappingURL=yeonjang-browser-focus-tool-descriptor-integration-skeleton.js.map