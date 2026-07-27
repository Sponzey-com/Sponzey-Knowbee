function normalized(value) {
    return value.trim();
}
function validList(values, allowEmpty) {
    if (!Array.isArray(values) || (!allowEmpty && values.length === 0))
        return false;
    const normalizedValues = values.map(normalized);
    return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length;
}
export function admitDevelopmentChange(input) {
    if (!normalized(input.changeId) ||
        !validList(input.structuralChanges, true) ||
        !validList(input.behavioralChanges, true) ||
        input.structuralChanges.length + input.behavioralChanges.length === 0) {
        return { status: "rejected", reasonCodes: ["change_input_invalid"] };
    }
    const reasonCodes = [];
    const hasStructural = input.structuralChanges.length > 0;
    const hasBehavior = input.behavioralChanges.length > 0;
    if ((input.separationMode === "structural_only" && (!hasStructural || hasBehavior)) ||
        (input.separationMode === "behavior_only" && (hasStructural || !hasBehavior)) ||
        (input.separationMode === "mixed_justified" && (!hasStructural || !hasBehavior))) {
        reasonCodes.push("separation_mode_mismatch");
    }
    if (hasBehavior && !validList(input.redEvidenceRefs, false))
        reasonCodes.push("red_evidence_missing");
    if (!validList(input.completionAssertionRefs, false))
        reasonCodes.push("completion_assertion_missing");
    if (input.separationMode === "mixed_justified" && !normalized(input.mixedChangeReason ?? ""))
        reasonCodes.push("mixed_change_reason_missing");
    if (!validList(input.independentValidationRefs, false))
        reasonCodes.push("independent_validation_missing");
    if (reasonCodes.length > 0)
        return { status: "rejected", reasonCodes };
    return { status: "admitted", changeId: normalized(input.changeId) };
}
//# sourceMappingURL=development-change-admission.js.map