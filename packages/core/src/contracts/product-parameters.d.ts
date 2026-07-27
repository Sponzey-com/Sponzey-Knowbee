export declare const PRODUCT_PARAMETER_SCHEMA_VERSION: 1;
export type ProductParameterDecisionState = "undecided_safe_default" | "decided";
export type ProductParameterApprovalState = "not_required" | "required";
export type ProductParameterApprover = "user" | "admin";
export type PromptImprovementRiskLevel = "low" | "medium" | "high";
export type YeonjangSensitiveOperation = "file_change" | "app_execution" | "terminal_command" | "screen_control" | "keyboard_input" | "mouse_input" | "external_network_call";
export interface MainAgentNameProductParameter {
    setupRequirement: "optional" | "required";
    defaultAgentName: {
        en: "Knowbee";
        ko: "노비";
    };
    userFacingNameSource: "configured_agent_name_or_default";
}
export interface PromptImprovementApprovalProductParameter {
    riskLevel: PromptImprovementRiskLevel;
    approval: ProductParameterApprovalState;
    approvers: ProductParameterApprover[];
    requiresExplicitApproval: boolean;
    requiresPassingTests: boolean;
    requiresRollbackPath: boolean;
}
export interface YeonjangPermissionProductParameter {
    operation: YeonjangSensitiveOperation;
    approval: "approval_required";
}
export interface SubAgentDelegationProductParameter {
    childSubAgentPolicy: "preconfigured_direct_children_only";
    canCreateChildSubAgentsAtRuntime: false;
}
export interface AgentMemoryProductParameter {
    shortTermMemory: "enabled";
    shortTermCompactionThresholdSource: "runtime_configuration_only";
    longTermMemoryWhenRuntimeConfigMissing: "disabled";
    longTermRetentionSource: "runtime_configuration_only";
}
export interface GeneralChatMemoryProductParameter {
    longTermWritePolicy: "explicit_user_save_request_only";
}
export interface ProductParameterDefaults {
    schemaVersion: typeof PRODUCT_PARAMETER_SCHEMA_VERSION;
    decisionState: ProductParameterDecisionState;
    mainAgentName: MainAgentNameProductParameter;
    promptImprovementApproval: PromptImprovementApprovalProductParameter[];
    yeonjangPermissions: YeonjangPermissionProductParameter[];
    subAgentDelegation: SubAgentDelegationProductParameter;
    agentMemory: AgentMemoryProductParameter;
    generalChatMemory: GeneralChatMemoryProductParameter;
}
export type ProductParameterIssueCode = "main_agent_name_default_invalid" | "prompt_low_risk_guard_missing" | "prompt_medium_risk_approval_missing" | "prompt_high_risk_explicit_approval_missing" | "prompt_risk_default_missing" | "yeonjang_sensitive_operation_missing" | "yeonjang_sensitive_operation_not_approval_required" | "sub_agent_runtime_child_creation_allowed" | "memory_long_term_enabled_without_runtime_config" | "memory_short_term_disabled" | "general_chat_auto_long_term_memory_enabled";
export interface ProductParameterIssue {
    code: ProductParameterIssueCode;
    path: string;
    message: string;
}
export interface ProductParameterValidationResult {
    ok: boolean;
    issues: ProductParameterIssue[];
}
export declare const YEONJANG_SENSITIVE_OPERATIONS: readonly YeonjangSensitiveOperation[];
export declare function buildSafeProductParameterDefaults(overrides?: Partial<ProductParameterDefaults>): ProductParameterDefaults;
export declare function validateProductParameterDefaults(defaults: ProductParameterDefaults): ProductParameterValidationResult;
//# sourceMappingURL=product-parameters.d.ts.map