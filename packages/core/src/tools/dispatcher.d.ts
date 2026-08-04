import type { KnowbeeConfig } from "../config/types.js";
import type { ProductParameterDefaults } from "../contracts/product-parameters.js";
import type { ApprovalDecision, ApprovalKind } from "../events/index.js";
import { type ResolveApprovalDecisionCommand } from "../runs/approval-decision-command.js";
import type { AnyTool, ToolContext, ToolDispatchOptions, ToolResult } from "./types.js";
export type ToolRuntimeConfigSnapshot = Pick<KnowbeeConfig, "memory" | "mqtt" | "search" | "security">;
export type ToolApprovalDecisionCommandResult = {
    readonly accepted: true;
    readonly wokeLiveWaiter: boolean;
    readonly approvalId: string;
} | {
    readonly accepted: false;
    readonly reasonCode: "approval_not_found" | "approval_run_mismatch" | "approval_already_final" | "approval_decision_rejected" | "approval_consumption_rejected" | "approval_operation_binding_invalid" | "approval_continuation_enqueue_rejected" | "canonical_approval_transition_rejected";
};
export interface ToolDispatcherDependencies {
    config: ToolRuntimeConfigSnapshot;
    productParameters?: ProductParameterDefaults;
    yeonjangBrowserFocusExecutionAdmissionIssuer?: ToolContext["yeonjangBrowserFocusExecutionAdmissionIssuer"];
    yeonjangExecutionAuthorizationIssuer?: ToolContext["yeonjangExecutionAuthorizationIssuer"];
}
export declare function requiresApprovalAtExecutionBoundary(input: {
    tool: Pick<AnyTool, "name" | "requiresApproval" | "riskLevel">;
    approvalMode: "always" | "on-miss" | "off";
    capabilityApprovalRequired: boolean;
    productParameters?: ProductParameterDefaults;
}): boolean;
export interface AgentScopedToolDispatchInput {
    toolName: string;
    params: Record<string, unknown>;
    ctx: ToolContext & {
        agentId: string;
        capabilityPolicy: NonNullable<ToolContext["capabilityPolicy"]>;
        auditId: string;
    };
    capabilityBindingId: string;
    resultSharing: "data_exchange" | "result_report_artifact";
}
export declare class ToolDispatcher {
    private tools;
    private toolEvidenceSourceKinds;
    private toolEvidenceSourceResolvers;
    private pendingInteractionGrants;
    private readonly config;
    private readonly productParameters;
    private readonly yeonjangBrowserFocusExecutionAdmissionIssuer;
    private readonly yeonjangExecutionAuthorizationIssuer;
    private readonly continuationOwnerId;
    private pendingInteractionKinds;
    constructor(dependencies: ToolDispatcherDependencies);
    private getApprovalOwnerKey;
    private clearPendingInteractionsForCompletedRun;
    private recordCanonicalApprovalLifecycle;
    register(tool: AnyTool): void;
    grantRunApprovalScope(runId: string, toolName: string, params?: Record<string, unknown>, authorizationParams?: Record<string, unknown>): void;
    grantRunSingleApproval(runId: string, toolName: string, params?: Record<string, unknown>, authorizationParams?: Record<string, unknown>): void;
    private persistApprovalRegistryGrant;
    registerAll(tools: AnyTool[]): void;
    unregister(name: string): void;
    getAll(options?: {
        includeIsolated?: boolean;
    }): AnyTool[];
    get(name: string): AnyTool | undefined;
    dispatchAgentScoped(input: AgentScopedToolDispatchInput): Promise<ToolResult>;
    isToolAvailableForSource(tool: AnyTool, source: ToolContext["source"]): boolean;
    dispatch(name: string, params: Record<string, unknown>, ctx: ToolContext, options?: ToolDispatchOptions): Promise<ToolResult>;
    private buildEvidenceSourceReceipt;
    private resolveEvidenceSourceKind;
    private getInteractionGuidance;
    private shouldRequireApproval;
    private requestApproval;
    resolvePendingInteraction(runId: string, decision: ApprovalDecision): boolean;
    resolveApprovalDecision(command: ResolveApprovalDecisionCommand): ToolApprovalDecisionCommandResult;
    listPendingInteractions(): Array<{
        approvalId?: string;
        runId: string;
        toolName: string;
        kind: ApprovalKind;
        guidance?: string;
    }>;
    private finishApproval;
    private writeAudit;
}
export type { AgentTool, AnyTool, ToolContext, ToolResult, RiskLevel } from "./types.js";
//# sourceMappingURL=dispatcher.d.ts.map