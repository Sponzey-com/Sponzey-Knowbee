import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
const PUBLIC_FIELDS = [
    "schemaVersion",
    "method",
    "observationStatus",
    "browserName",
    "titleHash",
    "titleLength",
    "urlScheme",
    "urlHash",
    "urlLength",
];
const COMMON_AUDIT_ONLY_FIELDS = [
    "rawTitle",
    "rawUrl",
    "queryToken",
    "profilePath",
    "pid",
    "windowId",
    "tabId",
];
const COMMON_INTERACTIVE_PRECONDITIONS = [
    "approval_receipt_required",
    "browser_active_tab_info_capability_advertised",
    "active_tab_observation_backend_ready",
    "redacted_projection_required",
    "audit_only_raw_evidence_boundary_required",
    "interactive_desktop_session_required",
];
const COMMON_SUCCESS_CRITERIA = [
    "observation_available",
    "redacted_projection_valid",
    "llm_result_diagnosis_input_sanitized",
];
const PROHIBITED_PATTERNS = [
    "system_exec_active_tab_bypass",
    "browser_profile_file_scrape",
    "raw_active_tab_public_output",
    "observation_success_as_goal_success",
];
export function buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria(_input) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-active-tab-info-backend-acceptance-criteria-v1",
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        toolName: "yeonjang_browser_active_tab_info",
        addProductionBindingNow: false,
        addRustDispatchNow: false,
        requiresApproval: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval,
        requiresRedactedProjection: true,
        defaultLiveSmokeAllowed: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.defaultLiveSmokeAllowed,
        postCheckMode: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.postCheckMode,
        prohibitedPatterns: [...PROHIBITED_PATTERNS],
        platforms: [
            interactivePlatform({
                platform: "macos",
                backendFamilies: ["accessibility_api", "browser_extension_bridge"],
                permissions: ["allow_browser_read", "macos_accessibility", "browser_extension_permission"],
                failureReasonCodes: ["permission_required", "observation_backend_required", "platform_not_macos"],
            }),
            interactivePlatform({
                platform: "windows",
                backendFamilies: ["windows_ui_automation", "browser_extension_bridge"],
                permissions: ["allow_browser_read", "windows_ui_automation", "browser_extension_permission"],
                failureReasonCodes: ["permission_required", "observation_backend_required", "platform_not_windows"],
            }),
            interactivePlatform({
                platform: "linux",
                backendFamilies: ["linux_accessibility_api", "browser_extension_bridge", "wayland_portal"],
                permissions: ["allow_browser_read", "linux_desktop_automation", "browser_extension_permission"],
                failureReasonCodes: [
                    "permission_required",
                    "observation_backend_required",
                    "headless_unavailable",
                    "platform_not_linux",
                ],
            }),
            unavailablePlatform({
                platform: "linux",
                reasonCode: "headless_unavailable",
            }),
            unavailablePlatform({
                platform: "unknown",
                reasonCode: "platform_unknown",
            }),
        ],
    });
}
function interactivePlatform(input) {
    const failureReasonCodes = [
        ...input.failureReasonCodes,
        "redaction_required",
    ];
    return Object.freeze({
        platform: input.platform,
        desktopProfile: "interactive_desktop",
        acceptedBackendFamilies: [...input.backendFamilies],
        requiredPermissions: [...input.permissions],
        preconditions: [...COMMON_INTERACTIVE_PRECONDITIONS],
        successCriteria: [...COMMON_SUCCESS_CRITERIA],
        failureReasonCodes,
        publicFields: [...PUBLIC_FIELDS],
        auditOnlyFields: [...COMMON_AUDIT_ONLY_FIELDS],
    });
}
function unavailablePlatform(input) {
    const requiredPermissions = ["allow_browser_read"];
    const preconditions = input.platform === "linux" ? ["interactive_desktop_session_required"] : [];
    const failureReasonCodes = [input.reasonCode];
    return Object.freeze({
        platform: input.platform,
        desktopProfile: "headless",
        acceptedBackendFamilies: [],
        requiredPermissions,
        preconditions,
        successCriteria: [],
        failureReasonCodes,
        publicFields: [...PUBLIC_FIELDS],
        auditOnlyFields: [...COMMON_AUDIT_ONLY_FIELDS],
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-backend-acceptance-criteria.js.map