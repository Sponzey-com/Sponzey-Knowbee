import { type ProductParameterDefaults, type YeonjangSensitiveOperation } from "../contracts/product-parameters.js";
import type { AgentExecutionPermissionPolicy, AgentExecutionRiskBoundaryKind, AgentExecutionRiskPolicy } from "./execution-decision-contract.js";
export type ProductSubAgentDelegationAction = "use_preconfigured_direct_child" | "create_runtime_child_sub_agent";
export type ProductSubAgentDelegationStatus = "allowed" | "selected_executor_not_direct_child" | "runtime_child_creation_disallowed";
export interface ProductSubAgentDelegationPolicy {
    childSubAgentPolicy: ProductParameterDefaults["subAgentDelegation"]["childSubAgentPolicy"];
    canCreateChildSubAgentsAtRuntime: false;
    notes: string[];
}
export interface ProductSubAgentDelegationPolicyDecision {
    ok: boolean;
    status: ProductSubAgentDelegationStatus;
    notes: string[];
}
export declare const BASE_AGENT_EXECUTION_APPROVAL_RISK_KINDS: readonly AgentExecutionRiskBoundaryKind[];
export declare const YEONJANG_OPERATION_RISK_KINDS: Record<YeonjangSensitiveOperation, readonly AgentExecutionRiskBoundaryKind[]>;
export declare const YEONJANG_SENSITIVE_TOOL_OPERATIONS: Readonly<Record<string, YeonjangSensitiveOperation>>;
export declare function productParameterYeonjangOperationRequiresApproval(operation: YeonjangSensitiveOperation, defaults?: ProductParameterDefaults): boolean;
export declare function getYeonjangSensitiveOperationForTool(toolName: string): YeonjangSensitiveOperation | null;
export declare function requiresDefaultYeonjangToolApproval(toolName: string, defaults?: ProductParameterDefaults): boolean;
export declare function executionRiskKindsForYeonjangOperation(operation: YeonjangSensitiveOperation): AgentExecutionRiskBoundaryKind[];
export declare function productParameterRuntimeChildSubAgentCreationAllowed(defaults?: ProductParameterDefaults): boolean;
export declare function buildDefaultSubAgentDelegationPolicy(defaults?: ProductParameterDefaults): ProductSubAgentDelegationPolicy;
export declare function decideProductSubAgentDelegationPolicy(input: {
    action: ProductSubAgentDelegationAction;
    selectedExecutorIsPreconfiguredDirectChild?: boolean;
    defaults?: ProductParameterDefaults;
}): ProductSubAgentDelegationPolicyDecision;
export declare function buildDefaultAgentExecutionRiskPolicy(defaults?: ProductParameterDefaults): AgentExecutionRiskPolicy;
export declare function buildDefaultAgentExecutionPermissionPolicy(defaults?: ProductParameterDefaults): AgentExecutionPermissionPolicy;
//# sourceMappingURL=product-parameter-policy.d.ts.map