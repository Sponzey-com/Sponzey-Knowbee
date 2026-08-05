export declare const PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST: {
    readonly product: readonly ["event", "state", "approvalRequired", "changeApplied", "activationState", "rollbackState", "finalResult"];
    readonly field_debug: readonly ["event", "sourceDiscovery", "checksumRef", "selectedTests", "transition", "retryCount", "blockedReason"];
    readonly development: readonly ["event", "diffRef", "fixtureNames", "fakeResponseRefs", "modelEvaluationRefs", "schemaPaths"];
};
export type PromptImprovementLogPurpose = keyof typeof PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST;
export type PromptImprovementRuntimeMode = "production" | "development" | "test";
export type PromptImprovementLogProjectionDecision = {
    status: "authorized";
    purpose: PromptImprovementLogPurpose;
    fields: Record<string, unknown>;
} | {
    status: "blocked";
    reasonCode: "development_log_forbidden" | "log_payload_unsafe" | "log_fields_missing";
};
export declare function authorizePromptImprovementLogProjection(input: {
    runtimeMode: PromptImprovementRuntimeMode;
    purpose: PromptImprovementLogPurpose;
    fields: Record<string, unknown>;
}): PromptImprovementLogProjectionDecision;
export declare function writeAuthorizedPromptImprovementLog<T>(input: {
    decision: PromptImprovementLogProjectionDecision;
    write: (projection: Extract<PromptImprovementLogProjectionDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<PromptImprovementLogProjectionDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-improvement-log-projection.d.ts.map