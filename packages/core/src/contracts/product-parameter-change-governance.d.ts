export declare const PRODUCT_PARAMETER_KEYS: readonly ["main_agent_name", "prompt_improvement_approval", "yeonjang_permissions", "sub_agent_delegation", "agent_memory", "general_chat_memory"];
export type ProductParameterKey = typeof PRODUCT_PARAMETER_KEYS[number];
export type ProductParameterDecisionActorType = "user" | "admin";
export interface ProductParameterChangeSourceReceipt {
    sourceRef: string;
    revisionFingerprint: string;
    evidenceRef: string;
}
export interface ProductParameterChangeInput {
    parameterKey: ProductParameterKey;
    previousValueFingerprint: string;
    nextValueFingerprint: string;
    decisionActorType: ProductParameterDecisionActorType;
    decisionActorRef: string;
    approvalRef: string;
    decidedAt: number;
    revisionFingerprint: string;
    productParameterSource: ProductParameterChangeSourceReceipt;
    canonicalPromptSource: ProductParameterChangeSourceReceipt;
    testFixture: ProductParameterChangeSourceReceipt;
    runtimeActivation: "startup_snapshot_only";
}
export interface ProductParameterChangeReceipt extends ProductParameterChangeInput {
    schemaVersion: 1;
    decisionState: "decided";
}
export type ProductParameterChangeReasonCode = "parameter_key_invalid" | "parameter_value_invalid" | "parameter_value_unchanged" | "decision_approval_invalid" | "change_source_invalid" | "canonical_prompt_source_mismatch" | "test_fixture_invalid" | "change_revision_mismatch" | "runtime_activation_invalid";
export type ProductParameterChangeDecision = {
    status: "authorized";
    receipt: ProductParameterChangeReceipt;
} | {
    status: "blocked";
    reasonCode: ProductParameterChangeReasonCode;
};
export declare function authorizeProductParameterChange(input: ProductParameterChangeInput): ProductParameterChangeDecision;
export declare function applyAuthorizedProductParameterChange<T>(input: {
    decision: ProductParameterChangeDecision;
    apply: (receipt: ProductParameterChangeReceipt) => Promise<T> | T;
}): Promise<{
    status: "applied";
    receipt: ProductParameterChangeReceipt;
    result: T;
} | {
    status: "blocked";
    reasonCode: "product_parameter_change_not_authorized";
}>;
//# sourceMappingURL=product-parameter-change-governance.d.ts.map