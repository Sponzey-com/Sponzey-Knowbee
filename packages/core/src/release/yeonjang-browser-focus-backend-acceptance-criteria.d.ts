import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
export type YeonjangBrowserFocusAcceptancePlatform = "macos" | "windows" | "linux";
export type YeonjangBrowserFocusDesktopProfile = "interactive_desktop" | "headless";
export type YeonjangBrowserFocusBackendFamily = "accessibility_api" | "osascript" | "win32_api" | "powershell" | "xdotool" | "wmctrl" | "wayland_portal";
export type YeonjangBrowserFocusBackendPermission = "allow_browser_control" | "macos_accessibility" | "windows_ui_automation" | "linux_desktop_automation";
export type YeonjangBrowserFocusBackendPrecondition = "approval_receipt_required" | "browser_focus_capability_advertised" | "browser_focus_command_backend_ready" | "focused_target_observation_backend_ready" | "interactive_desktop_session_required";
export type YeonjangBrowserFocusBackendSuccessCriterion = "command_accepted" | "focused_target_observation_available" | "focused_target_matches_expected_projection";
export type YeonjangBrowserFocusBackendFailureReasonCode = "side_effect_authorization_required" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "focused_target_mismatch" | "target_observation_required" | "platform_not_macos" | "platform_not_windows" | "platform_not_linux";
export type YeonjangBrowserFocusProhibitedBackendPattern = "system_exec_focus_bypass" | "command_success_as_goal_success" | "raw_automation_script_public_output" | "raw_target_public_output";
export interface YeonjangBrowserFocusBackendAcceptancePlatformCriteria {
    platform: YeonjangBrowserFocusAcceptancePlatform;
    desktopProfile: YeonjangBrowserFocusDesktopProfile;
    acceptedBackendFamilies: YeonjangBrowserFocusBackendFamily[];
    requiredPermissions: YeonjangBrowserFocusBackendPermission[];
    preconditions: YeonjangBrowserFocusBackendPrecondition[];
    successCriteria: YeonjangBrowserFocusBackendSuccessCriterion[];
    failureReasonCodes: YeonjangBrowserFocusBackendFailureReasonCode[];
    auditOnlyFields: string[];
}
export interface YeonjangBrowserFocusBackendAcceptanceCriteria {
    schemaVersion: "yeonjang-browser-focus-backend-acceptance-criteria-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    addProductionBindingNow: false;
    addRustDispatchNow: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    prohibitedPatterns: YeonjangBrowserFocusProhibitedBackendPattern[];
    platforms: YeonjangBrowserFocusBackendAcceptancePlatformCriteria[];
}
export declare function buildYeonjangBrowserFocusBackendAcceptanceCriteria(_input: {
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserFocusBackendAcceptanceCriteria;
//# sourceMappingURL=yeonjang-browser-focus-backend-acceptance-criteria.d.ts.map