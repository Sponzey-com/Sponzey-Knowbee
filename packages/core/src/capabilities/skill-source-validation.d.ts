export type SkillSourceKind = "builtin" | "local";
export type SkillSourceValidationReasonCode = "skill_name_missing" | "skill_name_duplicated" | "skill_path_missing" | "skill_path_null_byte" | "skill_path_traversal" | "skill_path_not_found" | "skill_path_outside_root" | "skill_symlink_escape" | "skill_path_unsupported_type" | "skill_path_unreadable" | "skill_owner_mismatch" | "skill_manifest_missing";
export interface SkillSourceInspection {
    reasonCodes: SkillSourceValidationReasonCode[];
    canonicalPath?: string;
}
export declare function evaluateSkillSourceValidation(input: {
    displayName: string;
    sourceKind: SkillSourceKind;
    existingNames: readonly string[];
    evidenceReasonCodes?: readonly SkillSourceValidationReasonCode[];
}): {
    ready: boolean;
    displayName: string;
    sourceKind: SkillSourceKind;
    reasonCodes: SkillSourceValidationReasonCode[];
};
//# sourceMappingURL=skill-source-validation.d.ts.map