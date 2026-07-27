export type YeonjangBrowserActiveTabInfoRustSourceDriftSection = "methods_inventory" | "dispatch" | "capability_matrix" | "method_classification" | "tool_health" | "method_metadata" | "permission_setting_allow_browser_read" | "requires_approval_true" | "requires_interactive_desktop_true" | "broadcast_safe_false" | "default_target_policy_exact_instance" | "risk_level_moderate" | "side_effect_class_read_local" | "raw_payload_visibility_audit_only" | "audit_only_raw_details_schema";
export type YeonjangBrowserActiveTabInfoRustSourceDriftResult = {
    status: "fail_closed";
    reasonCode: "browser_active_tab_info_inventory_not_present";
    missingSections: [];
} | {
    status: "drift_detected";
    reasonCode: "browser_active_tab_info_inventory_incomplete";
    missingSections: YeonjangBrowserActiveTabInfoRustSourceDriftSection[];
} | {
    status: "inventory_open_dispatch_closed";
    reasonCode: "browser_active_tab_info_inventory_ready_dispatch_not_registered";
    missingSections: ["dispatch"];
} | {
    status: "complete";
    reasonCode: "browser_active_tab_info_inventory_complete";
    missingSections: [];
};
export declare function validateYeonjangBrowserActiveTabInfoRustSourceDrift(input: {
    source: string;
}): YeonjangBrowserActiveTabInfoRustSourceDriftResult;
export declare function hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure(source: string): boolean;
//# sourceMappingURL=yeonjang-browser-active-tab-info-rust-source-drift-guard.d.ts.map