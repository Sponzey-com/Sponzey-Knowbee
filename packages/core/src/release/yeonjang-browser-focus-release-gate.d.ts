import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangPlatformCapabilityReadiness } from "./yeonjang-platform-acceptance.js";
export declare const YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD: "input.focused_target";
export declare const YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS: readonly ["browser.focus", "input.focused_target"];
export type YeonjangBrowserFocusReleaseGatePlatform = "macos" | "windows" | "linux";
export type YeonjangBrowserFocusReleaseGateReasonCode = "browser_focus_release_gate_ready" | "release_gate_not_ready" | "focused_target_observation_backend_required";
export type YeonjangBrowserFocusReleaseGateDecision = {
    status: "ready";
    reasonCode: "browser_focus_release_gate_ready";
    platform: YeonjangBrowserFocusReleaseGatePlatform;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    observationMethod: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: Exclude<YeonjangBrowserFocusReleaseGateReasonCode, "browser_focus_release_gate_ready">;
    platform: YeonjangBrowserFocusReleaseGatePlatform;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    observationMethod: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD;
    blockedMethod: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method | typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD;
    blockedStatus: YeonjangPlatformCapabilityReadiness["status"];
    evidenceRefs: string[];
};
export declare function evaluateYeonjangBrowserFocusReleaseGate(input: {
    platform: YeonjangBrowserFocusReleaseGatePlatform;
    capabilityReadiness: readonly YeonjangPlatformCapabilityReadiness[];
}): YeonjangBrowserFocusReleaseGateDecision;
//# sourceMappingURL=yeonjang-browser-focus-release-gate.d.ts.map