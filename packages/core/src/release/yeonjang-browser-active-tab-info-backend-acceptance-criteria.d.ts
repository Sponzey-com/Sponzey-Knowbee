import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoAcceptancePlatform = "macos" | "windows" | "linux" | "unknown";
export type YeonjangBrowserActiveTabInfoDesktopProfile = "interactive_desktop" | "headless";
export type YeonjangBrowserActiveTabInfoBackendFamily = "accessibility_api" | "windows_ui_automation" | "linux_accessibility_api" | "browser_extension_bridge" | "wayland_portal";
export type YeonjangBrowserActiveTabInfoBackendPermission = "allow_browser_read" | "macos_accessibility" | "windows_ui_automation" | "linux_desktop_automation" | "browser_extension_permission";
export type YeonjangBrowserActiveTabInfoBackendPrecondition = "approval_receipt_required" | "browser_active_tab_info_capability_advertised" | "active_tab_observation_backend_ready" | "redacted_projection_required" | "audit_only_raw_evidence_boundary_required" | "interactive_desktop_session_required";
export type YeonjangBrowserActiveTabInfoBackendSuccessCriterion = "observation_available" | "redacted_projection_valid" | "llm_result_diagnosis_input_sanitized";
export type YeonjangBrowserActiveTabInfoBackendFailureReasonCode = "permission_required" | "observation_backend_required" | "redaction_required" | "headless_unavailable" | "platform_unknown" | "platform_not_macos" | "platform_not_windows" | "platform_not_linux";
export type YeonjangBrowserActiveTabInfoProhibitedBackendPattern = "system_exec_active_tab_bypass" | "browser_profile_file_scrape" | "raw_active_tab_public_output" | "observation_success_as_goal_success";
export interface YeonjangBrowserActiveTabInfoBackendAcceptancePlatformCriteria {
    platform: YeonjangBrowserActiveTabInfoAcceptancePlatform;
    desktopProfile: YeonjangBrowserActiveTabInfoDesktopProfile;
    acceptedBackendFamilies: YeonjangBrowserActiveTabInfoBackendFamily[];
    requiredPermissions: YeonjangBrowserActiveTabInfoBackendPermission[];
    preconditions: YeonjangBrowserActiveTabInfoBackendPrecondition[];
    successCriteria: YeonjangBrowserActiveTabInfoBackendSuccessCriterion[];
    failureReasonCodes: YeonjangBrowserActiveTabInfoBackendFailureReasonCode[];
    publicFields: string[];
    auditOnlyFields: string[];
}
export interface YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria {
    schemaVersion: "yeonjang-browser-active-tab-info-backend-acceptance-criteria-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    toolName: "yeonjang_browser_active_tab_info";
    addProductionBindingNow: false;
    addRustDispatchNow: false;
    requiresApproval: true;
    requiresRedactedProjection: true;
    defaultLiveSmokeAllowed: false;
    postCheckMode: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.postCheckMode;
    prohibitedPatterns: YeonjangBrowserActiveTabInfoProhibitedBackendPattern[];
    platforms: YeonjangBrowserActiveTabInfoBackendAcceptancePlatformCriteria[];
}
export declare function buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria(_input: {
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria;
//# sourceMappingURL=yeonjang-browser-active-tab-info-backend-acceptance-criteria.d.ts.map