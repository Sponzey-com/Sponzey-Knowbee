const REQUIRED_SECTIONS = [
    { section: "methods_inventory", pattern: /"name"\s*:\s*"browser\.active_tab_info"/u },
    { section: "dispatch", pattern: /"browser\.active_tab_info"\s*=>\s*dispatch_browser_active_tab_info_request/u },
    { section: "capability_matrix", pattern: /"browser\.active_tab_info"\s*:\s*capability_entry/u },
    { section: "method_classification", pattern: /"browser\.active_tab_info"\s*=>\s*CapabilityMethodClassification/u },
    {
        section: "tool_health",
        pattern: /"browser\.active_tab_info"\s*:\s*(tool_health_entry|browser_active_tab_info_tool_health_entry)/u,
    },
    { section: "method_metadata", pattern: /"browser\.active_tab_info"\s*=>\s*CapabilityMethodMetadata/u },
    { section: "permission_setting_allow_browser_read", pattern: /Some\("allow_browser_read"\)/u },
    {
        section: "requires_approval_true",
        pattern: /capability_entry\(\s*"browser\.active_tab_info",\s*[^,]+,\s*true,/u,
    },
    { section: "requires_interactive_desktop_true", pattern: /requires_interactive_desktop:\s*true/u },
    { section: "broadcast_safe_false", pattern: /broadcast_safe:\s*false/u },
    { section: "default_target_policy_exact_instance", pattern: /default_target_policy:\s*"exact_instance"/u },
    { section: "risk_level_moderate", pattern: /risk_level:\s*"moderate"/u },
    { section: "side_effect_class_read_local", pattern: /side_effect_class:\s*"read_local"/u },
    {
        section: "raw_payload_visibility_audit_only",
        pattern: /raw_payload_visibility:\s*"audit_only"|raw_payload_visibility\s*=\s*if method == "browser\.active_tab_info"\s*\{\s*"audit_only"/u,
    },
    {
        section: "audit_only_raw_details_schema",
        pattern: /"rawDetailsSchema"[\s\S]*"visibility"\s*:\s*"audit_only"[\s\S]*"required"\s*:\s*\[[\s\S]*"browserName"[\s\S]*\][\s\S]*"optional"\s*:\s*\[[\s\S]*"title"[\s\S]*"url"[\s\S]*"profileName"[\s\S]*"profilePath"[\s\S]*"pid"[\s\S]*"windowId"[\s\S]*"tabId"[\s\S]*\]/u,
    },
];
export function validateYeonjangBrowserActiveTabInfoRustSourceDrift(input) {
    const implementationSource = stripRustTestModule(input.source);
    if (!hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure(implementationSource)) {
        return {
            status: "fail_closed",
            reasonCode: "browser_active_tab_info_inventory_not_present",
            missingSections: [],
        };
    }
    const missingSections = REQUIRED_SECTIONS
        .filter((requirement) => !requirement.pattern.test(implementationSource))
        .map((requirement) => requirement.section);
    if (missingSections.length > 0) {
        if (missingSections.length === 1 && missingSections[0] === "dispatch") {
            return {
                status: "inventory_open_dispatch_closed",
                reasonCode: "browser_active_tab_info_inventory_ready_dispatch_not_registered",
                missingSections: ["dispatch"],
            };
        }
        return {
            status: "drift_detected",
            reasonCode: "browser_active_tab_info_inventory_incomplete",
            missingSections,
        };
    }
    return {
        status: "complete",
        reasonCode: "browser_active_tab_info_inventory_complete",
        missingSections: [],
    };
}
function stripRustTestModule(source) {
    return source.split("#[cfg(test)]")[0] ?? source;
}
export function hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure(source) {
    return (/"name"\s*:\s*"browser\.active_tab_info"/u.test(source) ||
        source
            .split(/\r?\n/u)
            .some((line) => (/"browser\.active_tab_info"\s*=>/u.test(line) &&
            !line.includes("CapabilityMethodClassification") &&
            !line.includes("CapabilityMethodMetadata"))) ||
        /"browser\.active_tab_info"\s*:\s*capability_entry/u.test(source) ||
        /"browser\.active_tab_info"\s*:\s*(tool_health_entry|browser_active_tab_info_tool_health_entry)/u.test(source));
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-rust-source-drift-guard.js.map