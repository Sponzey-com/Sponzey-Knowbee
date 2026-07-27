export declare const PROMPT_ROLLBACK_SOURCE_TYPES: readonly ["source_control_revision", "prompt_registry_version", "timestamped_backup_file", "reverse_patch", "release_artifact_version"];
export type PromptImprovementRollbackSourceType = typeof PROMPT_ROLLBACK_SOURCE_TYPES[number];
export interface PromptImprovementRollbackSource {
    sourceType: PromptImprovementRollbackSourceType;
    sourceRef: string;
}
export interface PromptRollbackSourceManifestEntry {
    sourceType: PromptImprovementRollbackSourceType;
    exactReferencePattern: RegExp;
    example: string;
}
export declare const PROMPT_ROLLBACK_SOURCE_MANIFEST: readonly PromptRollbackSourceManifestEntry[];
export type PromptRollbackSourceIssueCode = "rollback_source_type_invalid" | "rollback_source_ref_missing" | "rollback_source_ref_invalid";
export interface PromptRollbackSourceIssue {
    code: PromptRollbackSourceIssueCode;
    path: string;
    message: string;
}
export interface PromptImprovementRollbackSourceValidationResult {
    ok: boolean;
    issues: PromptRollbackSourceIssue[];
}
export declare function validatePromptImprovementRollbackSource(source: Partial<PromptImprovementRollbackSource>, pathPrefix?: string): PromptImprovementRollbackSourceValidationResult;
//# sourceMappingURL=prompt-rollback-source-policy.d.ts.map