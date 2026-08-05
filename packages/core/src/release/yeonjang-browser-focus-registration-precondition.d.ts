import type { YeonjangBrowserFocusBindingReadinessDecision, YeonjangBrowserFocusProductionBindingDesign } from "../capabilities/yeonjang-browser-focus-contract.js";
import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusProductionExposureDecision } from "./yeonjang-browser-focus-production-exposure.js";
import type { YeonjangBrowserFocusReleaseGateDecision } from "./yeonjang-browser-focus-release-gate.js";
export type YeonjangBrowserFocusRegistrationPrecondition = "release_gate" | "production_exposure" | "binding_readiness" | "binding_design";
export type YeonjangBrowserFocusRegistrationPreconditionReasonCode = "browser_focus_dispatcher_registration_ready" | "release_gate_not_ready" | "production_exposure_not_executable" | "binding_readiness_not_ready" | "binding_design_not_ready";
export type YeonjangBrowserFocusRegistrationPreconditionDecision = {
    status: "registration_ready";
    reasonCode: "browser_focus_dispatcher_registration_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    registerDispatcherNow: false;
    releaseGateStatus: "ready";
    exposureStatus: "executable";
    bindingReadinessStatus: "ready_for_binding";
    bindingDesignStatus: "binding_design_ready";
    requiredPreconditions: YeonjangBrowserFocusRegistrationPrecondition[];
} | {
    status: "registration_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusRegistrationPreconditionReasonCode, "browser_focus_dispatcher_registration_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    registerDispatcherNow: false;
    releaseGateStatus: YeonjangBrowserFocusReleaseGateDecision["status"];
    exposureStatus: YeonjangBrowserFocusProductionExposureDecision["status"];
    bindingReadinessStatus: YeonjangBrowserFocusBindingReadinessDecision["status"];
    bindingDesignStatus: YeonjangBrowserFocusProductionBindingDesign["status"];
    blockedBy: string;
};
export declare function evaluateYeonjangBrowserFocusRegistrationPrecondition(input: {
    releaseGate: YeonjangBrowserFocusReleaseGateDecision;
    exposure: YeonjangBrowserFocusProductionExposureDecision;
    bindingReadiness: YeonjangBrowserFocusBindingReadinessDecision;
    bindingDesign: YeonjangBrowserFocusProductionBindingDesign;
}): YeonjangBrowserFocusRegistrationPreconditionDecision;
//# sourceMappingURL=yeonjang-browser-focus-registration-precondition.d.ts.map