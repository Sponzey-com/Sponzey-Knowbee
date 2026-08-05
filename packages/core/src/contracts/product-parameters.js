import { DEFAULT_MAIN_AGENT_NAME_EN, DEFAULT_MAIN_AGENT_NAME_KO, } from "./product-identity.js";
export const PRODUCT_PARAMETER_SCHEMA_VERSION = 1;
export const YEONJANG_SENSITIVE_OPERATIONS = [
    "file_change",
    "app_execution",
    "terminal_command",
    "screen_control",
    "keyboard_input",
    "mouse_input",
    "external_network_call",
];
export function buildSafeProductParameterDefaults(overrides = {}) {
    return {
        schemaVersion: PRODUCT_PARAMETER_SCHEMA_VERSION,
        decisionState: "undecided_safe_default",
        mainAgentName: {
            setupRequirement: "optional",
            defaultAgentName: {
                en: DEFAULT_MAIN_AGENT_NAME_EN,
                ko: DEFAULT_MAIN_AGENT_NAME_KO,
            },
            userFacingNameSource: "configured_agent_name_or_default",
        },
        promptImprovementApproval: [
            {
                riskLevel: "low",
                approval: "not_required",
                approvers: [],
                requiresExplicitApproval: false,
                requiresPassingTests: true,
                requiresRollbackPath: true,
            },
            {
                riskLevel: "medium",
                approval: "required",
                approvers: ["user", "admin"],
                requiresExplicitApproval: false,
                requiresPassingTests: true,
                requiresRollbackPath: true,
            },
            {
                riskLevel: "high",
                approval: "required",
                approvers: ["user", "admin"],
                requiresExplicitApproval: true,
                requiresPassingTests: true,
                requiresRollbackPath: true,
            },
        ],
        yeonjangPermissions: YEONJANG_SENSITIVE_OPERATIONS.map((operation) => ({
            operation,
            approval: "approval_required",
        })),
        subAgentDelegation: {
            childSubAgentPolicy: "preconfigured_direct_children_only",
            canCreateChildSubAgentsAtRuntime: false,
        },
        agentMemory: {
            shortTermMemory: "enabled",
            shortTermCompactionThresholdSource: "runtime_configuration_only",
            longTermMemoryWhenRuntimeConfigMissing: "disabled",
            longTermRetentionSource: "runtime_configuration_only",
        },
        generalChatMemory: {
            longTermWritePolicy: "explicit_user_save_request_only",
        },
        ...overrides,
    };
}
function addIssue(issues, code, path, message) {
    issues.push({ code, path, message });
}
function byRisk(defaults, riskLevel) {
    return defaults.promptImprovementApproval.find((item) => item.riskLevel === riskLevel);
}
function hasUserOrAdminApprover(item) {
    return !!item && item.approvers.includes("user") && item.approvers.includes("admin");
}
export function validateProductParameterDefaults(defaults) {
    const issues = [];
    if (defaults.mainAgentName.setupRequirement !== "optional" ||
        defaults.mainAgentName.defaultAgentName.en !== DEFAULT_MAIN_AGENT_NAME_EN ||
        defaults.mainAgentName.defaultAgentName.ko !== DEFAULT_MAIN_AGENT_NAME_KO ||
        defaults.mainAgentName.userFacingNameSource !== "configured_agent_name_or_default") {
        addIssue(issues, "main_agent_name_default_invalid", "mainAgentName", "MainAgent agent_name must be optional by default and fall back to Knowbee / 노비.");
    }
    const low = byRisk(defaults, "low");
    if (!low) {
        addIssue(issues, "prompt_risk_default_missing", "promptImprovementApproval.low", "Low-risk prompt approval default is required.");
    }
    else if (low.approval !== "not_required" ||
        low.requiresExplicitApproval ||
        !low.requiresPassingTests ||
        !low.requiresRollbackPath) {
        addIssue(issues, "prompt_low_risk_guard_missing", "promptImprovementApproval.low", "Low-risk prompt changes may skip approval only when tests and rollback path are required.");
    }
    const medium = byRisk(defaults, "medium");
    if (!medium) {
        addIssue(issues, "prompt_risk_default_missing", "promptImprovementApproval.medium", "Medium-risk prompt approval default is required.");
    }
    else if (medium.approval !== "required" ||
        !hasUserOrAdminApprover(medium) ||
        !medium.requiresPassingTests ||
        !medium.requiresRollbackPath) {
        addIssue(issues, "prompt_medium_risk_approval_missing", "promptImprovementApproval.medium", "Medium-risk prompt changes require user or admin approval, passing tests, and rollback path.");
    }
    const high = byRisk(defaults, "high");
    if (!high) {
        addIssue(issues, "prompt_risk_default_missing", "promptImprovementApproval.high", "High-risk prompt approval default is required.");
    }
    else if (high.approval !== "required" ||
        !high.requiresExplicitApproval ||
        !hasUserOrAdminApprover(high) ||
        !high.requiresPassingTests ||
        !high.requiresRollbackPath) {
        addIssue(issues, "prompt_high_risk_explicit_approval_missing", "promptImprovementApproval.high", "High-risk prompt changes always require explicit approval, passing tests, and rollback path.");
    }
    const yeonjangPermissionByOperation = new Map(defaults.yeonjangPermissions.map((item) => [item.operation, item.approval]));
    for (const operation of YEONJANG_SENSITIVE_OPERATIONS) {
        const approval = yeonjangPermissionByOperation.get(operation);
        if (!approval) {
            addIssue(issues, "yeonjang_sensitive_operation_missing", `yeonjangPermissions.${operation}`, `${operation} Yeonjang permission default is required.`);
            continue;
        }
        if (approval !== "approval_required") {
            addIssue(issues, "yeonjang_sensitive_operation_not_approval_required", `yeonjangPermissions.${operation}`, `${operation} must require approval by default.`);
        }
    }
    if (defaults.subAgentDelegation.childSubAgentPolicy !== "preconfigured_direct_children_only" ||
        defaults.subAgentDelegation.canCreateChildSubAgentsAtRuntime) {
        addIssue(issues, "sub_agent_runtime_child_creation_allowed", "subAgentDelegation", "Sub-agents must use preconfigured direct child sub-agents by default.");
    }
    if (defaults.agentMemory.shortTermMemory !== "enabled") {
        addIssue(issues, "memory_short_term_disabled", "agentMemory.shortTermMemory", "Short-term memory must remain enabled by default.");
    }
    if (defaults.agentMemory.longTermMemoryWhenRuntimeConfigMissing !== "disabled") {
        addIssue(issues, "memory_long_term_enabled_without_runtime_config", "agentMemory.longTermMemoryWhenRuntimeConfigMissing", "Long-term memory must be disabled when runtime configuration does not define it.");
    }
    if (defaults.generalChatMemory.longTermWritePolicy !== "explicit_user_save_request_only") {
        addIssue(issues, "general_chat_auto_long_term_memory_enabled", "generalChatMemory.longTermWritePolicy", "General chat may enter long-term memory only after an explicit user save request.");
    }
    return {
        ok: issues.length === 0,
        issues,
    };
}
//# sourceMappingURL=product-parameters.js.map