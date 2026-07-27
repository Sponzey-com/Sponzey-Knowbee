export type PromptSourceQualityIssueCode = "ambiguous_wording" | "line_too_long" | "duplicate_rule_line";
export interface PromptSourceQualityIssue {
    code: PromptSourceQualityIssueCode;
    line: number;
    detail: string;
}
export interface PromptSourceQualityResult {
    ok: boolean;
    issues: PromptSourceQualityIssue[];
}
export declare function validatePromptSourceContentQuality(input: {
    sourceId: string;
    content: string;
}): PromptSourceQualityResult;
export declare class PromptSourceContentQualityError extends Error {
    readonly issues: PromptSourceQualityIssue[];
    constructor(issues: PromptSourceQualityIssue[]);
}
//# sourceMappingURL=prompt-source-quality.d.ts.map