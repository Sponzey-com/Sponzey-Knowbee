export declare const RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES: readonly ["prompt_review_or_improvement", "administrator_debug", "security_or_audit_validation"];
export type RawSystemPromptDisclosurePurpose = typeof RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES[number];
export type SystemPromptDisclosureSurface = "ordinary_conversation" | "ordinary_ui" | "ordinary_execution_report" | "authorized_workflow";
export interface SystemPromptDisclosureAuthorizationReceipt {
    schemaVersion: 1;
    authorizationId: string;
    requestId: string;
    actorRef: string;
    actorCapability: "prompt_reviewer" | "administrator" | "security_auditor";
    audienceRef: string;
    purpose: RawSystemPromptDisclosurePurpose;
    targetSourceRefs: string[];
    sourceSetFingerprint: string;
    redactionMode: "redacted" | "raw_authorized";
    maxBytes: number;
    maxSegments: number;
    decision: "approved" | "denied";
    issuedAt: number;
    expiresAt: number;
}
export type SystemPromptDisclosureDecision = {
    status: "summary_only";
    projection: "behavior_policy_summary";
} | {
    status: "authorized";
    authorizationId: string;
    targetSourceRefs: string[];
    sourceSetFingerprint: string;
    redactionMode: "redacted" | "raw_authorized";
    maxBytes: number;
    maxSegments: number;
} | {
    status: "blocked";
    reasonCode: "authorization_missing" | "authorization_denied" | "authorization_expired" | "authorization_scope_mismatch" | "actor_capability_mismatch" | "target_invalid" | "delivery_limit_invalid" | "raw_disclosure_not_authorized";
};
export declare function authorizeSystemPromptDisclosure(input: {
    surface: SystemPromptDisclosureSurface;
    requestId: string;
    actorRef: string;
    audienceRef: string;
    requestedPurpose?: RawSystemPromptDisclosurePurpose;
    requestedSourceRefs?: string[];
    expectedSourceSetFingerprint?: string;
    receipt?: SystemPromptDisclosureAuthorizationReceipt;
    now: number;
}): SystemPromptDisclosureDecision;
export declare function deliverAuthorizedSystemPrompt<T>(input: {
    decision: SystemPromptDisclosureDecision;
    actualSourceSetFingerprint: string;
    contentBytes: number;
    contentSegments: number;
    deliver: (decision: Extract<SystemPromptDisclosureDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "delivered";
    result: T;
} | Exclude<SystemPromptDisclosureDecision, {
    status: "authorized";
}>>;
export declare const ORDINARY_UI_ALLOWED_FIELDS: readonly ["agentName", "statusLabel", "actionableReason", "nextAction"];
export type OrdinaryUiAllowedField = typeof ORDINARY_UI_ALLOWED_FIELDS[number];
export interface OrdinaryUiProjection {
    agentName: string;
    statusLabel: string;
    actionableReason?: string;
    nextAction?: string;
}
export declare function projectOrdinaryUi(input: Record<string, unknown>): {
    status: "projected";
    projection: OrdinaryUiProjection;
} | {
    status: "rejected";
    reasonCode: "ordinary_ui_forbidden_field" | "ordinary_ui_required_field_missing";
};
export type RestrictedDisclosureSurface = "admin_prompt_review" | "field_debug" | "prompt_improvement_review";
export type RestrictedDisclosureContentKind = "system_prompt" | "agent_persona";
export interface RestrictedUiDisclosureRequest {
    surface: RestrictedDisclosureSurface | "ordinary_ui";
    contentKind: RestrictedDisclosureContentKind;
    requestId: string;
    actorRef: string;
    audienceRef: string;
    requestedPurpose: RawSystemPromptDisclosurePurpose;
    requestedSourceRefs: string[];
    expectedSourceSetFingerprint: string;
    requestedAgentRef?: string;
    receipt?: SystemPromptDisclosureAuthorizationReceipt & {
        surface?: RestrictedDisclosureSurface;
        contentKind?: RestrictedDisclosureContentKind;
        targetAgentRef?: string;
    };
    now: number;
}
export declare function authorizeRestrictedUiDisclosure(input: RestrictedUiDisclosureRequest): SystemPromptDisclosureDecision;
//# sourceMappingURL=system-prompt-disclosure-boundary.d.ts.map