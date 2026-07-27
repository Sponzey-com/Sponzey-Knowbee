export declare const SYSTEM_PROMPT_SEGMENT_KINDS: readonly ["heading", "instruction", "product_name_literal", "user_input_example_literal"];
export type SystemPromptSegmentKind = typeof SYSTEM_PROMPT_SEGMENT_KINDS[number];
export interface SystemPromptSourceSegment {
    segmentId: string;
    kind: SystemPromptSegmentKind;
    content: string;
    fingerprint: string;
    literalPurpose?: "korean_product_name" | "korean_user_input_example";
    surroundingInstructionSegmentId?: string;
}
export interface SystemPromptLanguageSource {
    sourceId: string;
    sourceClassification: "system_prompt" | "user_data" | "runtime_evidence";
    version: string;
    expectedChecksum: string;
    actualChecksum: string;
    segments: SystemPromptSourceSegment[];
}
export type SystemPromptLanguageDecision = {
    status: "eligible";
    sourceId: string;
    version: string;
    checksum: string;
} | {
    status: "not_applicable";
    sourceId: string;
} | {
    status: "blocked";
    reasonCode: "checksum_mismatch" | "segment_missing" | "segment_duplicate" | "segment_unclassified" | "instruction_empty" | "korean_instruction" | "non_english_instruction" | "literal_purpose_invalid" | "literal_binding_invalid" | "product_name_literal_invalid";
};
export declare function validateSystemPromptLanguageSource(source: SystemPromptLanguageSource): SystemPromptLanguageDecision;
export declare function registerLanguageEligibleSystemPrompt<T>(input: {
    decision: SystemPromptLanguageDecision;
    register: (decision: Extract<SystemPromptLanguageDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "registered";
    result: T;
} | Exclude<SystemPromptLanguageDecision, {
    status: "eligible";
}>>;
//# sourceMappingURL=system-prompt-language-boundary.d.ts.map