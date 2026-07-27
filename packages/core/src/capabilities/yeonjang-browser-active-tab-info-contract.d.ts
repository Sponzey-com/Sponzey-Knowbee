export declare const YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT: {
    readonly method: "browser.active_tab_info";
    readonly group: "browser";
    readonly riskLevel: "moderate";
    readonly sideEffectClass: "read_local";
    readonly permissionSetting: "allow_browser_read";
    readonly requiresApproval: true;
    readonly requiresInteractiveDesktop: true;
    readonly defaultLiveSmokeAllowed: false;
    readonly rawPayloadVisibility: "audit_only";
    readonly postCheckMode: "observation_schema_required";
};
export declare const YEONJANG_BROWSER_ACTIVE_TAB_INFO_REQUIRED_GATES: readonly ["os_active_tab_observation_backend", "browser_read_permission", "explicit_approval_receipt", "redacted_public_projection", "audit_only_raw_evidence_boundary", "llm_result_diagnosis_input_sanitizer", "default_live_smoke_exclusion", "system_exec_bypass_prohibited"];
export type YeonjangBrowserActiveTabObservationStatus = "available" | "permission_required" | "unsupported" | "headless_unavailable" | "unknown";
export type YeonjangBrowserActiveTabInfoReadinessPlatform = "macos" | "windows" | "linux" | "unknown";
export type YeonjangBrowserActiveTabInfoDesktopSession = "available" | "headless" | "unknown";
export type YeonjangBrowserActiveTabInfoReadinessStatus = "ready" | "permission_required" | "observation_backend_required" | "headless_unavailable" | "unsupported" | "unknown";
export type YeonjangBrowserActiveTabInfoMissingRequirement = "browser_active_tab_info_capability" | "browser_read_permission" | "active_tab_observation_backend" | "interactive_desktop_session" | "supported_platform";
export type YeonjangBrowserActiveTabInfoReadinessUserAction = "ready_to_request_active_tab_approval" | "enable_browser_read_permission" | "update_or_reinstall_yeonjang" | "start_interactive_desktop_session" | "install_supported_yeonjang" | "select_supported_platform";
export type YeonjangBrowserActiveTabInfoReadinessDiagnosticReason = "active_tab_observation_backend_ready" | "active_tab_observation_backend_missing" | "browser_read_permission_disabled" | "interactive_desktop_required" | "unknown";
export type YeonjangBrowserActiveTabInfoBackendFamily = "accessibility_api" | "browser_extension_bridge" | "windows_ui_automation" | "linux_accessibility_api" | "wayland_portal";
export interface YeonjangBrowserActiveTabInfoReadinessDiagnostic {
    reasonCode: YeonjangBrowserActiveTabInfoReadinessDiagnosticReason;
    candidateBackendFamilies: YeonjangBrowserActiveTabInfoBackendFamily[];
}
export interface YeonjangBrowserActiveTabInfoReadinessObservation {
    publicTargetName: string;
    internalInstanceId?: string | undefined;
    platform: YeonjangBrowserActiveTabInfoReadinessPlatform;
    desktopSession: YeonjangBrowserActiveTabInfoDesktopSession;
    capabilityAdvertised: boolean;
    permissionGranted: boolean;
    observationBackendAvailable: boolean;
    diagnostic?: YeonjangBrowserActiveTabInfoReadinessDiagnostic | undefined;
    rawActiveTab?: Record<string, unknown> | undefined;
}
export interface YeonjangBrowserActiveTabInfoReadinessTargetProjection {
    publicTargetName: string;
    platform: YeonjangBrowserActiveTabInfoReadinessPlatform;
    readinessStatus: YeonjangBrowserActiveTabInfoReadinessStatus;
    missingRequirementCount: number;
    missingRequirements: YeonjangBrowserActiveTabInfoMissingRequirement[];
    userAction: YeonjangBrowserActiveTabInfoReadinessUserAction;
}
export interface YeonjangBrowserActiveTabInfoReadinessProjection {
    schemaVersion: "yeonjang-browser-active-tab-info-readiness-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    permissionSetting: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting;
    requiresApproval: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval;
    readyCount: number;
    blockedCount: number;
    targets: YeonjangBrowserActiveTabInfoReadinessTargetProjection[];
}
export interface YeonjangBrowserActiveTabInfoReadyTarget {
    publicTargetName: string;
    platform: YeonjangBrowserActiveTabInfoReadinessPlatform;
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    requiresApproval: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval;
    permissionSetting: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting;
}
export interface YeonjangBrowserActiveTabInfoInput {
    browserName?: string | undefined;
    title?: string | undefined;
    url?: string | undefined;
    profileName?: string | undefined;
    profilePath?: string | undefined;
    pid?: number | undefined;
    windowId?: string | undefined;
    tabId?: string | undefined;
    observationStatus: YeonjangBrowserActiveTabObservationStatus;
}
export interface YeonjangBrowserActiveTabInfoObservation {
    schemaVersion: "yeonjang-browser-active-tab-info-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    observationStatus: YeonjangBrowserActiveTabObservationStatus;
    browserName: string;
    titleHash?: string | undefined;
    titleLength?: number | undefined;
    urlScheme?: string | undefined;
    urlHash?: string | undefined;
    urlLength?: number | undefined;
    publicEvidenceFields: string[];
    auditOnlyFields: string[];
}
export type YeonjangBrowserActiveTabInfoProjectionResult = {
    ok: true;
    observation: YeonjangBrowserActiveTabInfoObservation;
} | {
    ok: false;
    reasonCode: "browser_name_required" | "browser_name_invalid" | "title_invalid" | "url_invalid" | "profile_name_invalid" | "profile_path_invalid" | "pid_invalid" | "window_id_invalid" | "tab_id_invalid";
};
export declare function projectYeonjangBrowserActiveTabInfo(input: YeonjangBrowserActiveTabInfoInput): YeonjangBrowserActiveTabInfoProjectionResult;
export declare function projectYeonjangBrowserActiveTabInfoReadiness(observations: readonly YeonjangBrowserActiveTabInfoReadinessObservation[]): YeonjangBrowserActiveTabInfoReadinessProjection;
export declare function selectReadyYeonjangBrowserActiveTabInfoTargets(projection: YeonjangBrowserActiveTabInfoReadinessProjection): YeonjangBrowserActiveTabInfoReadyTarget[];
//# sourceMappingURL=yeonjang-browser-active-tab-info-contract.d.ts.map