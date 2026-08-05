import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
const REQUIRED_PRECONDITIONS = [
    "release_gate",
    "production_exposure",
    "binding_readiness",
    "binding_design",
];
export function evaluateYeonjangBrowserFocusRegistrationPrecondition(input) {
    const base = preconditionStatusBase(input);
    if (input.releaseGate.status !== "ready") {
        return blockedRegistrationPrecondition({
            ...base,
            reasonCode: "release_gate_not_ready",
            blockedBy: input.releaseGate.reasonCode,
        });
    }
    if (input.exposure.status !== "executable") {
        return blockedRegistrationPrecondition({
            ...base,
            reasonCode: "production_exposure_not_executable",
            blockedBy: input.exposure.reasonCode,
        });
    }
    if (input.bindingReadiness.status !== "ready_for_binding") {
        return blockedRegistrationPrecondition({
            ...base,
            reasonCode: "binding_readiness_not_ready",
            blockedBy: input.bindingReadiness.reasonCode,
        });
    }
    if (input.bindingDesign.status !== "binding_design_ready") {
        return blockedRegistrationPrecondition({
            ...base,
            reasonCode: "binding_design_not_ready",
            blockedBy: input.bindingDesign.reasonCode,
        });
    }
    return Object.freeze({
        status: "registration_ready",
        reasonCode: "browser_focus_dispatcher_registration_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        registerDispatcherNow: false,
        releaseGateStatus: "ready",
        exposureStatus: "executable",
        bindingReadinessStatus: "ready_for_binding",
        bindingDesignStatus: "binding_design_ready",
        requiredPreconditions: [...REQUIRED_PRECONDITIONS],
    });
}
function preconditionStatusBase(input) {
    return {
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        registerDispatcherNow: false,
        releaseGateStatus: input.releaseGate.status,
        exposureStatus: input.exposure.status,
        bindingReadinessStatus: input.bindingReadiness.status,
        bindingDesignStatus: input.bindingDesign.status,
    };
}
function blockedRegistrationPrecondition(input) {
    return Object.freeze({
        status: "registration_blocked",
        ...input,
    });
}
//# sourceMappingURL=yeonjang-browser-focus-registration-precondition.js.map