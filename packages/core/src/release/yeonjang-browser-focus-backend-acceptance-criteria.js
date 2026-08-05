import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
const COMMON_INTERACTIVE_PRECONDITIONS = [
    "approval_receipt_required",
    "browser_focus_capability_advertised",
    "browser_focus_command_backend_ready",
    "focused_target_observation_backend_ready",
    "interactive_desktop_session_required",
];
const COMMON_SUCCESS_CRITERIA = [
    "command_accepted",
    "focused_target_observation_available",
    "focused_target_matches_expected_projection",
];
const COMMON_AUDIT_ONLY_FIELDS = [
    "rawWindowTitle",
    "rawUrl",
    "queryToken",
    "pid",
    "windowId",
    "tabId",
];
const PROHIBITED_PATTERNS = [
    "system_exec_focus_bypass",
    "command_success_as_goal_success",
    "raw_automation_script_public_output",
    "raw_target_public_output",
];
export function buildYeonjangBrowserFocusBackendAcceptanceCriteria(_input) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-backend-acceptance-criteria-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        addProductionBindingNow: false,
        addRustDispatchNow: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        prohibitedPatterns: [...PROHIBITED_PATTERNS],
        platforms: [
            interactivePlatform({
                platform: "macos",
                backendFamilies: ["accessibility_api", "osascript"],
                permissions: ["allow_browser_control", "macos_accessibility"],
                failureReasonCodes: [
                    "side_effect_authorization_required",
                    "command_backend_required",
                    "focused_target_observation_backend_required",
                    "focused_target_mismatch",
                    "target_observation_required",
                    "platform_not_macos",
                ],
                auditOnlyFields: ["automationScriptText"],
            }),
            interactivePlatform({
                platform: "windows",
                backendFamilies: ["win32_api", "powershell"],
                permissions: ["allow_browser_control", "windows_ui_automation"],
                failureReasonCodes: [
                    "side_effect_authorization_required",
                    "command_backend_required",
                    "focused_target_observation_backend_required",
                    "headless_unavailable",
                    "focused_target_mismatch",
                    "target_observation_required",
                    "platform_not_windows",
                ],
                auditOnlyFields: ["powershellScriptText", "win32WindowHandle"],
            }),
            interactivePlatform({
                platform: "linux",
                backendFamilies: ["xdotool", "wmctrl", "wayland_portal"],
                permissions: ["allow_browser_control", "linux_desktop_automation"],
                failureReasonCodes: [
                    "side_effect_authorization_required",
                    "command_backend_required",
                    "focused_target_observation_backend_required",
                    "headless_unavailable",
                    "focused_target_mismatch",
                    "target_observation_required",
                    "platform_not_linux",
                ],
                auditOnlyFields: ["xdotoolScriptText", "wmctrlScriptText", "waylandPortalRequest"],
            }),
            linuxHeadlessPlatform(),
        ],
    });
}
function linuxHeadlessPlatform() {
    const acceptedBackendFamilies = [];
    const requiredPermissions = ["allow_browser_control"];
    const preconditions = ["interactive_desktop_session_required"];
    const successCriteria = [];
    const failureReasonCodes = ["headless_unavailable"];
    return Object.freeze({
        platform: "linux",
        desktopProfile: "headless",
        acceptedBackendFamilies,
        requiredPermissions,
        preconditions,
        successCriteria,
        failureReasonCodes,
        auditOnlyFields: [],
    });
}
function interactivePlatform(input) {
    return Object.freeze({
        platform: input.platform,
        desktopProfile: "interactive_desktop",
        acceptedBackendFamilies: [...input.backendFamilies],
        requiredPermissions: [...input.permissions],
        preconditions: [...COMMON_INTERACTIVE_PRECONDITIONS],
        successCriteria: [...COMMON_SUCCESS_CRITERIA],
        failureReasonCodes: [...input.failureReasonCodes],
        auditOnlyFields: [
            ...COMMON_AUDIT_ONLY_FIELDS,
            ...input.auditOnlyFields,
        ],
    });
}
//# sourceMappingURL=yeonjang-browser-focus-backend-acceptance-criteria.js.map