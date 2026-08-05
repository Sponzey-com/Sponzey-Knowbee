export declare const BEHAVIOR_POLICY_SUMMARY_CATEGORIES: readonly ["identity", "response_language", "memory_isolation", "delegation", "tool_and_yeonjang_boundary", "prompt_improvement", "final_response"];
export declare const PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES: readonly ["secret", "token", "credential", "private_memory", "internal_path", "personal_data", "security_configuration", "channel_identifier"];
export type BehaviorPolicySummaryCategory = typeof BEHAVIOR_POLICY_SUMMARY_CATEGORIES[number];
export type PromptDisclosureSensitiveCategory = typeof PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES[number];
export interface BehaviorPolicySummaryProjection {
    schemaVersion: 1;
    projection: "behavior_policy_summary";
    categories: BehaviorPolicySummaryCategory[];
    maxRenderedCharacters: number;
}
export interface PromptDisclosureRedactionReceipt {
    schemaVersion: 1;
    receiptId: string;
    sourceFingerprint: string;
    redactedOutputFingerprint: string;
    policyVersion: string;
    scannedCategories: PromptDisclosureSensitiveCategory[];
    residualCategories: PromptDisclosureSensitiveCategory[];
    replacementCount: number;
    scannerSucceeded: boolean;
    verifierRef: string;
    verifiedAt: number;
    expiresAt: number;
}
export type PromptDisclosureRedactionDecision = {
    status: "deliverable";
    receiptId: string;
    redactedOutputFingerprint: string;
} | {
    status: "blocked";
    reasonCode: "redaction_receipt_missing" | "redaction_receipt_expired" | "redaction_scope_mismatch" | "sensitive_scan_incomplete" | "sensitive_content_residual" | "scanner_failed";
};
export declare function createBehaviorPolicySummaryProjection(input: {
    categories: BehaviorPolicySummaryCategory[];
    maxCategories: number;
    maxRenderedCharacters: number;
}): BehaviorPolicySummaryProjection;
export declare function authorizeRedactedPromptDisclosure(input: {
    expectedSourceFingerprint: string;
    expectedRedactedOutputFingerprint: string;
    expectedPolicyVersion: string;
    receipt?: PromptDisclosureRedactionReceipt;
    now: number;
}): PromptDisclosureRedactionDecision;
export declare function deliverVerifiedRedactedPrompt<T>(input: {
    decision: PromptDisclosureRedactionDecision;
    deliver: (decision: Extract<PromptDisclosureRedactionDecision, {
        status: "deliverable";
    }>) => Promise<T>;
}): Promise<{
    status: "delivered";
    result: T;
} | Extract<PromptDisclosureRedactionDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-disclosure-redaction.d.ts.map