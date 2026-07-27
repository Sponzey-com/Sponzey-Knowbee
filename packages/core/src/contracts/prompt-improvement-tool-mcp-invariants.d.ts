import type { CapabilityRiskLevel } from "./sub-agent-orchestration.js";
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
export declare const EXTERNAL_EFFECT_APPROVAL_KINDS: readonly ["tool", "mcp", "yeonjang", "filesystem", "network", "external_service"];
export type ExternalEffectApprovalKind = (typeof EXTERNAL_EFFECT_APPROVAL_KINDS)[number];
export type PromptApprovalGateLevel = "none" | "policy" | "explicit";
export type PromptCapabilityCatalogKind = "skill" | "mcp_server";
export type PromptCapabilityStatus = "enabled" | "disabled" | "archived";
export interface PromptCapabilityCatalogEntry {
    catalogId: string;
    status: PromptCapabilityStatus;
    toolNames: string[];
}
export interface PromptCapabilityCatalogSnapshot {
    schemaVersion: 1;
    fingerprint: string;
    skills: PromptCapabilityCatalogEntry[];
    mcpServers: PromptCapabilityCatalogEntry[];
}
export interface PromptCapabilityBindingSnapshot {
    bindingId: string;
    ownerAgentId: string;
    catalogKind: PromptCapabilityCatalogKind;
    catalogId: string;
    status: PromptCapabilityStatus;
    enabledToolNames: string[];
    disabledToolNames: string[];
    secretScopeId?: string;
    permissionProfileId: string;
    riskCeiling: CapabilityRiskLevel;
    approvalRequiredFrom: CapabilityRiskLevel;
    approvalGates: Record<ExternalEffectApprovalKind, PromptApprovalGateLevel>;
}
export interface PromptCapabilityStateSnapshot {
    schemaVersion: 1;
    stateKind: "baseline" | "proposed";
    catalogFingerprint: string;
    activeAgentIds: string[];
    bindings: PromptCapabilityBindingSnapshot[];
}
export interface PromptImprovementToolMcpInvariantReceipt {
    schemaVersion: 1;
    invariant: "tool_boundary";
    decision: "preserved";
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    catalogFingerprint: string;
    activeAgentIds: string[];
    reviewedBindingCount: number;
    approvalKinds: ExternalEffectApprovalKind[];
}
export type PromptImprovementToolMcpInvariantReasonCode = "catalog_snapshot_invalid" | "catalog_policy_changed" | "catalog_lineage_mismatch" | "capability_state_invalid" | "active_agent_scope_changed" | "binding_identity_shared" | "binding_owner_mismatch" | "binding_scope_changed" | "binding_catalog_reference_invalid" | "secret_scope_shared" | "capability_binding_added" | "capability_binding_reactivated" | "tool_access_expanded" | "disabled_tool_reactivated" | "risk_ceiling_expanded" | "approval_threshold_weakened" | "approval_gate_weakened" | "tool_mcp_review_lineage_invalid";
export type PromptImprovementToolMcpInvariantDecision = {
    status: "authorized";
    receipt: PromptImprovementToolMcpInvariantReceipt;
} | {
    status: "blocked";
    reasonCode: PromptImprovementToolMcpInvariantReasonCode;
};
export type ToolMcpBoundaryInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "tool_mcp_review_receipt_invalid" | "tool_mcp_review_expired" | "tool_mcp_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function authorizePromptImprovementToolMcpInvariant(input: {
    baselineCatalog: PromptCapabilityCatalogSnapshot;
    proposedCatalog: PromptCapabilityCatalogSnapshot;
    baseline: PromptCapabilityStateSnapshot;
    proposed: PromptCapabilityStateSnapshot;
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptImprovementToolMcpInvariantDecision;
export declare function projectToolMcpBoundaryInvariantReview(input: {
    receipt: PromptImprovementToolMcpInvariantReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): ToolMcpBoundaryInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-tool-mcp-invariants.d.ts.map