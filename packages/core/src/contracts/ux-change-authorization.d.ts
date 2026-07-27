export declare const UX_CHANGE_INTENTS: readonly ["user_task", "decoration", "implementation_convenience", "feature_showcase"];
export declare const UX_RECOVERY_CAPABILITIES: readonly ["accessibility", "input_recovery", "cancel", "undo", "error_reason", "next_action"];
export type UxChangeIntent = typeof UX_CHANGE_INTENTS[number];
export type UxRecoveryCapability = typeof UX_RECOVERY_CAPABILITIES[number];
export interface UxUserValueReceipt {
    changeId: string;
    intent: UxChangeIntent;
    userTaskId: string;
    metricId: string;
    improvementDirection: "higher" | "lower";
    baselineValue: number;
    projectedValue: number;
    evidenceRef: string;
}
export interface UxCommonFlowReceipt {
    flowId: string;
    frequencyEvidenceRef: string;
    beforeStepCount: number;
    afterStepCount: number;
    stateNames: readonly string[];
    deterministicForSameInput: boolean;
    evidenceRef: string;
}
export interface UxRecoveryCapabilityReceipt {
    capability: UxRecoveryCapability;
    status: "provided" | "not_applicable";
    evidenceRef: string;
    exceptionReason?: string;
    alternativeCapability?: UxRecoveryCapability;
}
export interface UxRecoveryReceipt {
    flowId: string;
    destructive: boolean;
    capabilities: readonly UxRecoveryCapabilityReceipt[];
}
export type UxChangeAuthorizationDecision = {
    status: "authorized";
    changeId: string;
    flowId: string;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "user_value_invalid" | "non_user_intent" | "user_outcome_not_improved" | "common_flow_invalid" | "common_flow_regressed" | "common_flow_state_ambiguous" | "recovery_capability_missing" | "recovery_exception_invalid" | "destructive_recovery_missing";
    capability?: UxRecoveryCapability;
};
export declare function authorizeUxChange(input: {
    value: UxUserValueReceipt;
    flow: UxCommonFlowReceipt;
    recovery: UxRecoveryReceipt;
}): UxChangeAuthorizationDecision;
export declare function publishAuthorizedUxChange<T>(input: {
    decision: UxChangeAuthorizationDecision;
    publish: (authorization: Extract<UxChangeAuthorizationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<UxChangeAuthorizationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=ux-change-authorization.d.ts.map