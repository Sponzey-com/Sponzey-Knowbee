import { type ProductParameterDefaults } from "../contracts/product-parameters.js";
export type ProductMemoryWriteTrigger = "explicit_user_save_request" | "general_chat" | "trusted_setting" | "parent_review_accepted" | "learning_event_approved" | "admin_review_approved";
export type ProductMemoryWriteDecisionKind = "long_term_allowed" | "short_term_only";
export interface ProductMemoryWritePolicyInput {
    trigger: ProductMemoryWriteTrigger;
    runtimeLongTermRetentionConfigured?: boolean;
    defaults?: ProductParameterDefaults;
}
export interface ProductMemoryWritePolicyDecision {
    decision: ProductMemoryWriteDecisionKind;
    longTermAllowed: boolean;
    reasonCode: "explicit_user_save_request" | "general_chat_requires_explicit_save_request" | "runtime_long_term_retention_configured" | "runtime_long_term_retention_missing" | "product_parameter_defaults_invalid";
    notes: string[];
}
export declare function decideProductMemoryWritePolicy(input: ProductMemoryWritePolicyInput): ProductMemoryWritePolicyDecision;
//# sourceMappingURL=product-parameter-policy.d.ts.map