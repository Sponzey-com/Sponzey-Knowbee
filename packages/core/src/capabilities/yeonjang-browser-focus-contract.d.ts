export declare const YEONJANG_BROWSER_FOCUS_CONTRACT: {
    readonly method: "browser.focus";
    readonly group: "browser";
    readonly riskLevel: "moderate";
    readonly sideEffectClass: "process_control";
    readonly permissionSetting: "allow_browser_control";
    readonly requiresApproval: true;
    readonly requiresInteractiveDesktop: true;
    readonly defaultLiveSmokeAllowed: false;
    readonly rawPayloadVisibility: "audit_only";
    readonly postCheckMode: "focused_target_observation_required";
};
export interface YeonjangBrowserFocusTargetInput {
    targetAlias?: string | undefined;
    processName?: string | undefined;
    title?: string | undefined;
    url?: string | undefined;
    pid?: number | undefined;
    windowId?: string | undefined;
    tabId?: string | undefined;
}
export interface YeonjangBrowserFocusTargetProjection {
    schemaVersion: "yeonjang-browser-focus-target-v1";
    targetKind: "browser_window_or_tab";
    targetAlias?: string | undefined;
    displayName: string;
    processName?: string | undefined;
    titleHash?: string | undefined;
    titleLength?: number | undefined;
    urlScheme?: "http" | "https" | undefined;
    urlHash?: string | undefined;
    urlLength?: number | undefined;
    publicEvidenceFields: string[];
    auditOnlyFields: string[];
}
export type YeonjangBrowserFocusTargetProjectionResult = {
    ok: true;
    projection: YeonjangBrowserFocusTargetProjection;
} | {
    ok: false;
    reasonCode: "target_identity_missing" | "target_alias_invalid" | "process_name_invalid" | "title_invalid" | "url_invalid";
};
export type YeonjangBrowserFocusPostCheckDecision = {
    state: "VERIFIED";
    reasonCode: "focused_target_matched";
    evidence: YeonjangBrowserFocusPostCheckEvidence;
} | {
    state: "MANUAL_INTERVENTION";
    reasonCode: "target_observation_required" | "focused_target_mismatch";
    evidence: YeonjangBrowserFocusPostCheckEvidence;
} | {
    state: "FAILED";
    reasonCode: "browser_focus_command_failed";
    evidence: YeonjangBrowserFocusPostCheckEvidence;
};
export interface YeonjangBrowserFocusPostCheckEvidence {
    commandAccepted: boolean;
    expectedTarget: YeonjangBrowserFocusTargetProjection;
    observedFocusedTarget?: YeonjangBrowserFocusTargetProjection | undefined;
}
export type YeonjangBrowserFocusPreflightDecision = {
    status: "blocked";
    reasonCode: "capability_not_supported" | "side_effect_authorization_required";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    target: YeonjangBrowserFocusTargetProjection;
} | {
    status: "ready";
    reasonCode: "browser_focus_preflight_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    target: YeonjangBrowserFocusTargetProjection;
};
export type YeonjangFocusedBrowserObservationStatus = "available" | "permission_required" | "unsupported" | "headless_unavailable" | "unknown";
export type YeonjangBrowserFocusReadinessPlatform = "macos" | "windows" | "linux" | "unknown";
export type YeonjangBrowserFocusReadinessStatus = "ready" | "target_identity_required" | "unsupported" | "permission_required" | "command_backend_required" | "observation_backend_required" | "headless_unavailable";
export type YeonjangBrowserFocusMissingRequirement = "public_target_name" | "browser_focus_capability" | "browser_control_permission" | "browser_focus_command_backend" | "focused_target_observation_backend" | "interactive_desktop_session";
export type YeonjangBrowserFocusReadinessUserAction = "ready_to_request_focus_approval" | "select_exact_yeonjang_target" | "install_supported_yeonjang" | "enable_browser_control_permission" | "update_or_reinstall_yeonjang" | "start_interactive_desktop_session";
export interface YeonjangBrowserFocusReadinessObservation {
    publicTargetName: string;
    internalInstanceId?: string | undefined;
    platform: YeonjangBrowserFocusReadinessPlatform;
    desktopSession: "available" | "headless" | "unknown";
    capabilitySupported: boolean;
    permissionGranted: boolean;
    commandBackendAvailable: boolean;
    observationBackendAvailable: boolean;
    rawFocusedTarget?: YeonjangBrowserFocusTargetInput | undefined;
}
export interface YeonjangBrowserFocusReadinessTargetProjection {
    publicTargetName: string;
    platform: YeonjangBrowserFocusReadinessPlatform;
    readinessStatus: YeonjangBrowserFocusReadinessStatus;
    missingRequirementCount: number;
    missingRequirements: YeonjangBrowserFocusMissingRequirement[];
    userAction: YeonjangBrowserFocusReadinessUserAction;
}
export interface YeonjangBrowserFocusReadinessProjection {
    schemaVersion: "yeonjang-browser-focus-readiness-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting;
    requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval;
    requiresInteractiveDesktop: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresInteractiveDesktop;
    readyCount: number;
    blockedCount: number;
    targets: YeonjangBrowserFocusReadinessTargetProjection[];
}
export interface YeonjangBrowserFocusReadyTarget {
    publicTargetName: string;
    platform: YeonjangBrowserFocusReadinessPlatform;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval;
    permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting;
}
export type YeonjangBrowserFocusToolAdmissionDecision = {
    status: "blocked";
    reasonCode: "target_not_selectable" | "side_effect_authorization_required" | "capability_not_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    publicCandidateCount: number;
} | {
    status: "admitted";
    reasonCode: "browser_focus_admission_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    publicCandidateCount: number;
    selectableTargets: YeonjangBrowserFocusReadyTarget[];
};
export type YeonjangBrowserFocusCommandContractDecision = {
    status: "blocked";
    reasonCode: "admission_not_ready" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "platform_unsupported";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: YeonjangBrowserFocusReadinessPlatform;
    requiresFocusedTargetObservation: true;
} | {
    status: "accepted";
    reasonCode: "browser_focus_command_contract_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: Exclude<YeonjangBrowserFocusReadinessPlatform, "unknown">;
    requiresFocusedTargetObservation: true;
    target: YeonjangBrowserFocusTargetProjection;
};
export type YeonjangBrowserFocusLedgerBridgeReasonCode = "side_effect_authorization_required" | "capability_not_ready" | "target_not_selectable" | "admission_not_ready" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "platform_unsupported" | "browser_focus_command_failed" | "target_observation_required";
export type YeonjangBrowserFocusLedgerBridgeResult = {
    success: false;
    error: "SIDE_EFFECT_OPERATION_BLOCKED";
    invokeAllowed: false;
    details: {
        kind: "browser_focus_ledger_bridge";
        reasonCode: Exclude<YeonjangBrowserFocusLedgerBridgeReasonCode, "browser_focus_command_failed" | "target_observation_required">;
        method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    };
} | {
    success: false;
    error: "SIDE_EFFECT_MANUAL_INTERVENTION";
    invokeAllowed: true;
    details: {
        kind: "browser_focus_ledger_bridge";
        reasonCode: "browser_focus_command_failed" | "target_observation_required";
        method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
        goalValidationCandidate: false;
    };
};
export type YeonjangBrowserFocusBindingGate = "readiness_projection" | "side_effect_method_contract" | "approval_preflight" | "tool_admission" | "command_contract" | "focused_target_observation_backend";
export type YeonjangBrowserFocusBindingReadinessReasonCode = "browser_focus_binding_ready" | "target_not_selectable" | "side_effect_method_contract_missing" | "side_effect_authorization_required" | "capability_not_ready" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "platform_unsupported" | "admission_not_ready";
export type YeonjangBrowserFocusBindingReadinessDecision = {
    status: "ready_for_binding";
    reasonCode: "browser_focus_binding_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    publicCandidateCount: number;
    requiredGates: YeonjangBrowserFocusBindingGate[];
} | {
    status: "binding_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusBindingReadinessReasonCode, "browser_focus_binding_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    publicCandidateCount: number;
    requiredGates: YeonjangBrowserFocusBindingGate[];
};
export type YeonjangBrowserFocusProductionBindingStep = "rust_dispatch" | "tool_descriptor" | "tool_mapping" | "skill_catalog" | "dispatcher_integration";
export type YeonjangBrowserFocusProductionBindingIntegrationTest = "dispatch_without_approval_blocks_before_invoke" | "dispatch_without_ready_capability_blocks_before_invoke" | "accepted_without_focused_observation_stays_manual" | "focused_observation_mismatch_stays_manual" | "focused_observation_match_verifies" | "raw_target_and_automation_internals_not_exposed";
export type YeonjangBrowserFocusProductionBindingDesignReasonCode = "browser_focus_binding_design_ready" | "release_gate_not_ready" | "rust_dispatch_not_ready" | "focused_target_observation_backend_required" | "binding_readiness_not_ready";
export type YeonjangBrowserFocusProductionBindingDesign = {
    status: "binding_design_ready";
    reasonCode: "browser_focus_binding_design_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    addProductionBindingNow: false;
    bindingOrder: YeonjangBrowserFocusProductionBindingStep[];
    requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
} | {
    status: "binding_design_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusProductionBindingDesignReasonCode, "browser_focus_binding_design_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    addProductionBindingNow: false;
    bindingOrder: YeonjangBrowserFocusProductionBindingStep[];
    requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
};
export interface YeonjangFocusedBrowserObservationInput {
    platform: "macos" | "windows" | "linux" | "unknown";
    desktopSession: "available" | "headless" | "unknown";
    permissionGranted: boolean;
    rawTarget?: YeonjangBrowserFocusTargetInput | undefined;
    backendAvailable: boolean;
}
export type YeonjangFocusedBrowserObservationResult = {
    status: "available";
    platform: YeonjangFocusedBrowserObservationInput["platform"];
    focusedTarget: YeonjangBrowserFocusTargetProjection;
} | {
    status: Exclude<YeonjangFocusedBrowserObservationStatus, "available">;
    platform: YeonjangFocusedBrowserObservationInput["platform"];
    reasonCode: "desktop_session_headless" | "browser_focus_observation_permission_required" | "browser_focus_observation_unsupported" | "browser_focus_observation_unknown" | "browser_focus_target_unavailable";
};
export declare function projectYeonjangBrowserFocusTarget(input: YeonjangBrowserFocusTargetInput): YeonjangBrowserFocusTargetProjectionResult;
export declare function evaluateYeonjangBrowserFocusPostCheck(input: {
    commandAccepted: boolean;
    expectedTarget: YeonjangBrowserFocusTargetProjection;
    observedFocusedTarget?: YeonjangBrowserFocusTargetProjection | undefined;
}): YeonjangBrowserFocusPostCheckDecision;
export declare function evaluateYeonjangBrowserFocusPreflight(input: {
    capabilitySupported: boolean;
    approvalGranted: boolean;
    target: YeonjangBrowserFocusTargetProjection;
}): YeonjangBrowserFocusPreflightDecision;
export declare function observeYeonjangFocusedBrowserTargetContract(input: YeonjangFocusedBrowserObservationInput): YeonjangFocusedBrowserObservationResult;
export declare function buildYeonjangBrowserFocusReadinessProjection(input: {
    observations: readonly YeonjangBrowserFocusReadinessObservation[];
}): YeonjangBrowserFocusReadinessProjection;
export declare function selectYeonjangBrowserFocusReadyTargets(projection: YeonjangBrowserFocusReadinessProjection): YeonjangBrowserFocusReadyTarget[];
export declare function evaluateYeonjangBrowserFocusToolAdmission(input: {
    readyTargets: readonly YeonjangBrowserFocusReadyTarget[];
    approvalGranted: boolean;
    preflight: YeonjangBrowserFocusPreflightDecision;
}): YeonjangBrowserFocusToolAdmissionDecision;
export declare function buildYeonjangBrowserFocusCommandContract(input: {
    platform: YeonjangBrowserFocusReadinessPlatform;
    desktopSession: "available" | "headless" | "unknown";
    commandBackendAvailable: boolean;
    observationBackendAvailable: boolean;
    admission: YeonjangBrowserFocusToolAdmissionDecision;
    target: YeonjangBrowserFocusTargetProjection;
    automationPlan?: string | undefined;
}): YeonjangBrowserFocusCommandContractDecision;
export declare function buildYeonjangBrowserFocusLedgerBridgeResult(input: {
    approvalGranted: boolean;
    preflight: YeonjangBrowserFocusPreflightDecision;
    admission: YeonjangBrowserFocusToolAdmissionDecision;
    commandContract: YeonjangBrowserFocusCommandContractDecision;
    commandAccepted: boolean;
}): YeonjangBrowserFocusLedgerBridgeResult;
export declare function evaluateYeonjangBrowserFocusBindingReadiness(input: {
    readiness: YeonjangBrowserFocusReadinessProjection;
    sideEffectMethodContractReady: boolean;
    preflight: YeonjangBrowserFocusPreflightDecision;
    admission: YeonjangBrowserFocusToolAdmissionDecision;
    commandContract: YeonjangBrowserFocusCommandContractDecision;
    observationBackendReady: boolean;
}): YeonjangBrowserFocusBindingReadinessDecision;
export declare function buildYeonjangBrowserFocusProductionBindingDesign(input: {
    bindingReadiness: YeonjangBrowserFocusBindingReadinessDecision;
    releaseGateReady: boolean;
    rustDispatchReady: boolean;
    focusedTargetObservationBackendReady: boolean;
}): YeonjangBrowserFocusProductionBindingDesign;
//# sourceMappingURL=yeonjang-browser-focus-contract.d.ts.map