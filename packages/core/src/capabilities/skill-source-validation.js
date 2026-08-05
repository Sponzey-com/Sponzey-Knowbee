const REASON_ORDER = [
    "skill_name_missing", "skill_name_duplicated", "skill_path_missing", "skill_path_null_byte",
    "skill_path_traversal", "skill_path_not_found", "skill_path_outside_root", "skill_symlink_escape",
    "skill_path_unsupported_type", "skill_path_unreadable", "skill_owner_mismatch", "skill_manifest_missing",
];
export function evaluateSkillSourceValidation(input) {
    const displayName = input.displayName.trim();
    const reasons = new Set(input.evidenceReasonCodes ?? []);
    if (!displayName)
        reasons.add("skill_name_missing");
    if (displayName && input.existingNames.some((name) => name.trim().toLocaleLowerCase() === displayName.toLocaleLowerCase())) {
        reasons.add("skill_name_duplicated");
    }
    if (input.sourceKind === "local" && input.evidenceReasonCodes === undefined)
        reasons.add("skill_path_missing");
    const reasonCodes = REASON_ORDER.filter((reason) => reasons.has(reason));
    return { ready: reasonCodes.length === 0, displayName, sourceKind: input.sourceKind, reasonCodes };
}
//# sourceMappingURL=skill-source-validation.js.map