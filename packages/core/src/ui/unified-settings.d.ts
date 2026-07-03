export type UnifiedSettingsMode = "single_knowbee" | "orchestration";
export type UnifiedSettingsMonitoringState = "idle" | "loaded" | "stale" | "partial" | "failed";
export type UnifiedSettingsMonitoringTone = "info" | "warning" | "success" | "error";
export type UnifiedSettingsLifecycleState = "empty" | "drafting" | "validating" | "ready_to_save" | "saving" | "saved" | "activating" | "active" | "needs_attention" | "failed" | "cancelled";
export type UnifiedSettingsLifecycleEvent = {
    type: "draft_started";
} | {
    type: "field_changed";
} | {
    type: "validation_requested";
} | {
    type: "validation_succeeded";
} | {
    type: "validation_failed";
    reasonCode?: string;
} | {
    type: "save_requested";
} | {
    type: "save_succeeded";
} | {
    type: "save_failed";
    reasonCode?: string;
} | {
    type: "activation_requested";
} | {
    type: "activation_succeeded";
} | {
    type: "activation_failed";
    reasonCode?: string;
} | {
    type: "attention_acknowledged";
} | {
    type: "cancel_requested";
};
export interface UnifiedSettingsTransitionResult {
    state: UnifiedSettingsLifecycleState;
    reasonCode?: string;
}
export interface UnifiedSettingsRootAgentInput {
    id: string;
    displayName: string;
    nickname?: string | undefined;
}
export interface UnifiedSettingsAgentDetailInput {
    model?: {
        mode?: "inherit" | "override" | undefined;
        providerLabel?: string | undefined;
        modelLabel?: string | undefined;
        fallbackModelLabel?: string | undefined;
    } | undefined;
    skillMcp?: {
        enabledSkillCount?: number | undefined;
        enabledMcpServerCount?: number | undefined;
        enabledToolCount?: number | undefined;
    } | undefined;
    memory?: {
        rawWindowSize?: number | undefined;
        compactThreshold?: number | undefined;
        capsuleMode?: string | undefined;
        handoffCapsuleAllowed?: boolean | undefined;
    } | undefined;
    permissions?: {
        permissionProfile?: string | undefined;
        allowedCount?: number | undefined;
        deniedCount?: number | undefined;
        approvalRequiredCount?: number | undefined;
        osSensitiveCount?: number | undefined;
    } | undefined;
    delegation?: {
        canDelegate?: boolean | undefined;
        directChildOnly?: boolean | undefined;
        allowedChildCount?: number | undefined;
        resultReviewRequired?: boolean | undefined;
        redelegationAllowed?: boolean | undefined;
        maxParallelSessions?: number | undefined;
    } | undefined;
    monitoring?: {
        logLevel?: string | undefined;
        eventCount?: number | undefined;
        activeRunCount?: number | undefined;
        stale?: boolean | undefined;
        state?: UnifiedSettingsMonitoringState | undefined;
        treePaths?: string[] | undefined;
        traceItems?: UnifiedSettingsMonitoringTraceInput[] | undefined;
        reviewSummary?: string | undefined;
        latestResultSummary?: string | undefined;
    } | undefined;
}
export interface UnifiedSettingsMonitoringTraceInput {
    actorLabel: string;
    targetLabel?: string | undefined;
    kind: string;
    status: string;
    summary?: string | undefined;
    reason?: string | undefined;
    reviewStatus?: string | undefined;
    quality?: string | undefined;
    latestResultSummary?: string | undefined;
    redelegationSummary?: string | undefined;
    atLabel?: string | undefined;
}
export interface UnifiedSettingsAgentInput {
    id: string;
    displayName: string;
    nickname?: string | undefined;
    role?: string | undefined;
    workDescription?: string | undefined;
    parentId?: string | undefined;
    detail?: UnifiedSettingsAgentDetailInput | undefined;
}
export type UnifiedSettingsReadinessStatus = "ready" | "skipped" | "needs_attention" | "blocked";
export type UnifiedSettingsReadinessSeverity = "attention" | "blocked";
export type UnifiedSettingsReadinessIssueCode = "sub_agent_required" | "display_name_required" | "role_required" | "work_description_required" | "display_name_duplicate" | "nickname_duplicate" | "reserved_root_name";
export interface UnifiedSettingsReadinessIssue {
    code: UnifiedSettingsReadinessIssueCode;
    severity: UnifiedSettingsReadinessSeverity;
    agentId?: string | undefined;
    field?: "displayName" | "nickname" | "role" | "workDescription" | undefined;
}
export interface EvaluateUnifiedSettingsReadinessInput {
    mode: UnifiedSettingsMode;
    rootAgent: UnifiedSettingsRootAgentInput;
    agents: UnifiedSettingsAgentInput[];
}
export interface UnifiedSettingsReadinessResult {
    status: UnifiedSettingsReadinessStatus;
    issues: UnifiedSettingsReadinessIssue[];
    reasonCodes: string[];
}
export declare function transitionUnifiedSettingsState(state: UnifiedSettingsLifecycleState, event: UnifiedSettingsLifecycleEvent): UnifiedSettingsTransitionResult;
export declare function evaluateUnifiedSettingsReadiness(input: EvaluateUnifiedSettingsReadinessInput): UnifiedSettingsReadinessResult;
export type UnifiedSettingsLocale = "ko" | "en";
export type UnifiedSettingsSectionId = "required_setup" | "sub_agents" | "monitoring" | "diagnostics";
export type UnifiedSettingsSectionStatus = UnifiedSettingsReadinessStatus | "idle";
export type UnifiedSettingsDetailSectionId = "model" | "skill_mcp" | "memory" | "permissions" | "delegation" | "monitoring";
export type UnifiedSettingsActionId = "create_first_sub_agent" | "review_issues" | "save_settings" | "activate_settings" | "select_agent";
export interface UnifiedSettingsActionView {
    id: UnifiedSettingsActionId;
    label: string;
    disabled: boolean;
    disabledReason?: "readiness_blocked" | "not_ready_to_save" | "not_saved" | "no_sub_agents_configured" | undefined;
    payload?: {
        agentId?: string | undefined;
    } | undefined;
}
export interface UnifiedSettingsSectionView {
    id: UnifiedSettingsSectionId;
    title: string;
    status: UnifiedSettingsSectionStatus;
    itemCount: number;
}
export interface UnifiedSettingsAgentView {
    label: string;
    description: string;
    role: string;
    status: UnifiedSettingsReadinessStatus;
    statusLabel: string;
    parentLabel?: string | undefined;
    childCount: number;
    action: UnifiedSettingsActionView;
}
export interface UnifiedSettingsDetailSectionView {
    id: UnifiedSettingsDetailSectionId;
    title: string;
    status: UnifiedSettingsSectionStatus;
    summary: string;
    itemCount: number;
}
export interface UnifiedSettingsMonitoringTraceView {
    actorLabel: string;
    targetLabel: string;
    kind: string;
    kindLabel: string;
    status: string;
    statusLabel: string;
    tone: UnifiedSettingsMonitoringTone;
    summary: string;
    reason: string;
    reviewStatus: string;
    quality: string;
    qualityLabel: string;
    latestResultSummary: string;
    redelegationSummary: string;
    atLabel: string;
}
export interface UnifiedSettingsMonitoringView {
    state: UnifiedSettingsMonitoringState;
    statusLabel: string;
    activeRunCount: number;
    eventCount: number;
    treePaths: string[];
    traceItems: UnifiedSettingsMonitoringTraceView[];
    reviewSummary: string;
    latestResultSummary: string;
}
export interface UnifiedSettingsSelectedAgentDetailView {
    label: string;
    sections: UnifiedSettingsDetailSectionView[];
    monitoring?: UnifiedSettingsMonitoringView | undefined;
}
export interface UnifiedSettingsGraphNodeView {
    label: string;
    statusLabel: string;
}
export interface UnifiedSettingsGraphEdgeView {
    sourceLabel: string;
    targetLabel: string;
}
export interface UnifiedSettingsViewModel {
    title: string;
    summary: {
        productName: string;
        mode: UnifiedSettingsMode;
        lifecycleState: UnifiedSettingsLifecycleState;
        status: UnifiedSettingsReadinessStatus;
        statusLabel: string;
        totalAgentCount: number;
        issueCount: number;
        primaryAction: UnifiedSettingsActionView;
    };
    sections: UnifiedSettingsSectionView[];
    actions: UnifiedSettingsActionView[];
    agents: UnifiedSettingsAgentView[];
    selectedAgent?: UnifiedSettingsAgentView | undefined;
    selectedAgentDetail?: UnifiedSettingsSelectedAgentDetailView | undefined;
    graph: {
        nodes: UnifiedSettingsGraphNodeView[];
        edges: UnifiedSettingsGraphEdgeView[];
    };
    diagnostics: {
        issueCount: number;
        blockedCount: number;
        reasonCodes: string[];
        redactedFieldCount: number;
    };
}
export interface BuildUnifiedSettingsViewModelInput extends EvaluateUnifiedSettingsReadinessInput {
    locale: UnifiedSettingsLocale;
    productName: string;
    lifecycleState: UnifiedSettingsLifecycleState;
    selectedAgentId?: string | undefined;
}
export declare function buildUnifiedSettingsViewModel(input: BuildUnifiedSettingsViewModelInput): UnifiedSettingsViewModel;
//# sourceMappingURL=unified-settings.d.ts.map