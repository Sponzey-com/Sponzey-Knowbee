import type { AgentRelationship, MemoryPolicy, OwnerScope, PermissionProfile, SkillMcpAllowlist, SubAgentConfig } from "../contracts/sub-agent-orchestration.js";
export type SubAgentSettingsSource = "beginner" | "advanced" | "system";
export type SubAgentLifecycleState = "draft" | "saved" | "runtime_active" | "runtime_drift" | "degraded" | "archived";
export type SubAgentReadinessState = "ready" | "needs_attention" | "blocked" | "idle";
export type SubAgentReadinessDimension = "identity" | "model" | "skill_mcp" | "memory" | "permission" | "delegation" | "monitoring";
export type SubAgentStateLabel = "draft_only" | "unsaved_changes" | "pending_runtime_activation" | "runtime_drift" | "running" | "saved" | "archived";
export interface SubAgentRootRef {
    agentId: string;
    displayName: string;
    nickname?: string | undefined;
}
export interface SubAgentRuntimeProjectionInput {
    activeAgentIds?: string[];
    lastSeenAtByAgentId?: Record<string, number>;
    activeVersionByAgentId?: Record<string, number>;
}
export interface SubAgentSettingsCatalogs {
    skillIds?: string[];
    mcpServerIds?: string[];
    availableSkillIds?: string[];
    availableMcpServerIds?: string[];
    modelIds?: string[];
    enabledProviderIds?: string[];
    capabilityIds?: string[];
    dangerousCapabilityIds?: string[];
}
export interface SubAgentSettingsValidationContext {
    rootAgent: SubAgentRootRef;
    agents: SubAgentConfig[];
    relationships: AgentRelationship[];
    catalogs?: SubAgentSettingsCatalogs;
}
export interface SubAgentReadinessItem {
    dimension: SubAgentReadinessDimension;
    state: SubAgentReadinessState;
    label: string;
    reasonCodes: string[];
}
export interface SubAgentReadinessView {
    state: SubAgentReadinessState;
    items: SubAgentReadinessItem[];
    warningCount: number;
    blockedCount: number;
    reasonCodes: string[];
}
export interface SubAgentSummaryView {
    id: string;
    displayName: string;
    nickname?: string | undefined;
    displayLabel: string;
    attributionLabel: string;
    role: string;
    description: string;
    parentDisplayName?: string | undefined;
    childCount: number;
    isTopLevel: boolean;
    lifecycleState: SubAgentLifecycleState;
    readinessState: SubAgentReadinessState;
    lastPublishedAt?: number | undefined;
    lastRuntimeSeenAt?: number | undefined;
    readiness: SubAgentReadinessView;
}
export interface BeginnerSubAgentCardView extends SubAgentSummaryView {
    safePermissionState: "safe" | "needs_review" | "blocked";
    skillMcpSummary: string;
    lastStateLabel: SubAgentStateLabel;
}
export interface BeginnerSubAgentSetupView {
    orchestrationMode: "single_nobie" | "orchestration";
    summary: {
        rootDisplayName: string;
        topLevelAgentCount: number;
        totalAgentCount: number;
        readyAgentCount: number;
        needsAttentionCount: number;
        blockedAgentCount: number;
    };
    cards: BeginnerSubAgentCardView[];
    primaryAction: "create_first_sub_agent" | "review_attention" | "publish_changes" | "manage_agents";
    status: "empty" | "ready" | "needs_attention" | "blocked";
}
export interface AdvancedSubAgentRowView extends SubAgentSummaryView {
    warningCount: number;
    blockedCount: number;
}
export interface AdvancedSubAgentDetailView {
    summary: SubAgentSummaryView;
    identity: {
        agentId: string;
        displayName: string;
        nickname?: string | undefined;
        displayLabel: string;
        attributionLabel: string;
        role: string;
        description: string;
        specialtyTags: string[];
        avoidTasks: string[];
    };
    model: {
        mode: "inherit" | "override";
        providerId?: string | undefined;
        modelId?: string | undefined;
        fallbackModelId?: string | undefined;
        effort?: string | undefined;
        maxOutputTokens?: number | undefined;
        costBudget?: number | undefined;
    };
    skillMcp: SkillMcpAllowlist & {
        missingSkillIds: string[];
        missingMcpServerIds: string[];
    };
    memory: {
        ownerType: OwnerScope["ownerType"];
        ownerId: string;
        visibility: MemoryPolicy["visibility"];
        readScopes: OwnerScope[];
        writeScope: OwnerScope;
        retentionPolicy: MemoryPolicy["retentionPolicy"];
        writebackReviewRequired: boolean;
    };
    capability: {
        permissionProfile: PermissionProfile;
        riskCeiling: PermissionProfile["riskCeiling"];
        approvalRequiredFrom: PermissionProfile["approvalRequiredFrom"];
        enabledSkillIds: string[];
        enabledMcpServerIds: string[];
        enabledToolNames: string[];
        disabledToolNames: string[];
        maxConcurrentCalls: number;
        maxCallsPerMinute?: number | undefined;
    };
    delegation: {
        canDelegate: boolean;
        directChildOnly: true;
        maxParallelSessions: number;
        directChildAgentIds: string[];
        allowedChildAgentIds: string[];
        resultReviewRequired: boolean;
        redelegationAllowed: boolean;
    };
    monitoring: {
        lifecycleState: SubAgentLifecycleState;
        readiness: SubAgentReadinessView;
        lastRuntimeSeenAt?: number | undefined;
        activeVersion?: number | undefined;
        driftFromSaved: boolean;
    };
}
export interface AdvancedSubAgentSettingsView {
    orchestrationSummary: BeginnerSubAgentSetupView["summary"];
    agents: AdvancedSubAgentRowView[];
    selectedAgent?: AdvancedSubAgentDetailView | undefined;
}
export interface BuildSubAgentSettingsViewInput {
    rootAgent: SubAgentRootRef;
    savedAgents: SubAgentConfig[];
    relationships: AgentRelationship[];
    catalogs?: SubAgentSettingsCatalogs;
    runtime?: SubAgentRuntimeProjectionInput;
    now?: number;
}
export interface BuildAdvancedSubAgentSettingsViewInput extends BuildSubAgentSettingsViewInput {
    selectedAgentId?: string;
}
export interface SubAgentStateProjectionInput {
    rootAgent: SubAgentRootRef;
    draftAgent?: SubAgentConfig;
    savedAgent?: SubAgentConfig;
    runtimeActiveAgent?: SubAgentConfig;
    relationships: AgentRelationship[];
    catalogs?: SubAgentSettingsCatalogs;
    runtime?: SubAgentRuntimeProjectionInput;
    now?: number;
}
export interface SubAgentStateSnapshotView extends SubAgentSummaryView {
    source: "draft" | "saved" | "runtime_active";
    driftFromSaved: boolean;
}
export interface SubAgentStateProjection {
    agentId: string;
    stateLabel: SubAgentStateLabel;
    draft?: SubAgentStateSnapshotView | undefined;
    saved?: SubAgentStateSnapshotView | undefined;
    runtimeActive?: SubAgentStateSnapshotView | undefined;
}
export interface CreateSubAgentBasicCommand {
    kind: "create_basic";
    source: Extract<SubAgentSettingsSource, "beginner" | "advanced">;
    parentAgentId: string;
    displayName: string;
    nickname?: string | undefined;
    role: string;
    description: string;
    initialLifecycleState: "draft" | "saved";
    safeDefaultPolicy: boolean;
}
export interface UpdateSubAgentIdentityCommand {
    kind: "update_identity";
    source: SubAgentSettingsSource;
    agentId: string;
    displayName: string;
    nickname?: string | undefined;
    role: string;
    description: string;
    attributionLabel?: string | undefined;
}
export interface UpdateSubAgentModelPolicyCommand {
    kind: "update_model_policy";
    source: SubAgentSettingsSource;
    agentId: string;
    mode: "inherit" | "override";
    providerId?: string | undefined;
    modelId?: string | undefined;
    fallbackModelId?: string | undefined;
    effort?: string | undefined;
    maxOutputTokens?: number | undefined;
    costBudget?: number | undefined;
}
export interface UpdateSubAgentSkillMcpBindingsCommand {
    kind: "update_skill_mcp_bindings";
    source: SubAgentSettingsSource;
    agentId: string;
    enabledSkillIds: string[];
    enabledMcpServerIds: string[];
    enabledToolNames: string[];
    disabledToolNames: string[];
    secretScopeId?: string | undefined;
}
export interface UpdateSubAgentMemoryPolicyCommand {
    kind: "update_memory_policy";
    source: SubAgentSettingsSource;
    agentId: string;
    owner: OwnerScope;
    readScopes: OwnerScope[];
    writeScope: OwnerScope;
    compactThreshold: number;
    capsuleMode: "session_compaction" | "rolling_summary";
    isolationLevel: MemoryPolicy["visibility"];
}
export interface UpdateSubAgentCapabilityPolicyCommand {
    kind: "update_capability_policy";
    source: SubAgentSettingsSource;
    agentId: string;
    allowedCapabilityIds: string[];
    deniedCapabilityIds: string[];
    approvalRequiredCapabilityIds: string[];
    osSensitiveCapabilityIds: string[];
}
export interface UpdateSubAgentDelegationPolicyCommand {
    kind: "update_delegation_policy";
    source: SubAgentSettingsSource;
    agentId: string;
    canDelegate: boolean;
    directChildOnly: boolean;
    allowedChildAgentIds: string[];
    resultReviewRequired: boolean;
    redelegationAllowed: boolean;
}
export interface PublishSubAgentTopologyCommand {
    kind: "publish_topology";
    source: SubAgentSettingsSource;
    agentIds: string[];
    expectedSavedVersionByAgentId: Record<string, number>;
}
export interface ArchiveSubAgentCommand {
    kind: "archive_agent";
    source: Extract<SubAgentSettingsSource, "advanced" | "system">;
    agentId: string;
    replacementAgentId?: string | undefined;
}
export type SubAgentSettingsCommand = CreateSubAgentBasicCommand | UpdateSubAgentIdentityCommand | UpdateSubAgentModelPolicyCommand | UpdateSubAgentSkillMcpBindingsCommand | UpdateSubAgentMemoryPolicyCommand | UpdateSubAgentCapabilityPolicyCommand | UpdateSubAgentDelegationPolicyCommand | PublishSubAgentTopologyCommand | ArchiveSubAgentCommand;
export type SubAgentSettingsValidationCode = "agent_missing" | "parent_missing" | "display_name_required" | "attribution_label_required" | "nickname_duplicate" | "reserved_nobie_name" | "catalog_id_missing" | "catalog_item_unavailable" | "model_id_missing" | "model_provider_unavailable" | "fallback_model_same_as_primary" | "archived_agent_not_editable" | "memory_owner_scope_mismatch" | "permission_escalation_requires_advanced" | "delegation_target_not_direct_child" | "delegation_target_self" | "delegation_target_unavailable" | "direct_child_only_required" | "invalid_numeric_limit" | "archive_requires_replacement_or_no_children";
export interface SubAgentSettingsValidationIssue {
    path: string;
    code: SubAgentSettingsValidationCode;
    message: string;
}
export interface SubAgentSettingsValidationResult {
    ok: boolean;
    command: SubAgentSettingsCommand;
    issues: SubAgentSettingsValidationIssue[];
}
export declare function buildBeginnerSubAgentSetupView(input: BuildSubAgentSettingsViewInput): BeginnerSubAgentSetupView;
export declare function buildAdvancedSubAgentSettingsView(input: BuildAdvancedSubAgentSettingsViewInput): AdvancedSubAgentSettingsView;
export declare function buildSubAgentStateProjection(input: SubAgentStateProjectionInput): SubAgentStateProjection;
export declare function validateSubAgentSettingsCommand(command: SubAgentSettingsCommand, context: SubAgentSettingsValidationContext): SubAgentSettingsValidationResult;
//# sourceMappingURL=sub-agent-settings.d.ts.map