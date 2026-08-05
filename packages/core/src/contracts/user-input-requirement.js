export const USER_INPUT_RESOLUTION_KINDS = [
    "provide_value",
    "choose_option",
    "confirm_scope",
];
export function parseUserInputRequirement(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const candidate = value;
    if (typeof candidate.resolutionKind !== "string"
        || !USER_INPUT_RESOLUTION_KINDS.includes(candidate.resolutionKind)
        || !Array.isArray(candidate.missingFields)) {
        return null;
    }
    const missingFields = candidate.missingFields
        .filter((field) => typeof field === "string")
        .map((field) => field.trim())
        .filter(Boolean);
    const uniqueMissingFields = [...new Set(missingFields)];
    if (uniqueMissingFields.length === 0
        || uniqueMissingFields.length !== candidate.missingFields.length
        || uniqueMissingFields.length !== missingFields.length
        || uniqueMissingFields.length > 8
        || uniqueMissingFields.some((field) => field.length > 64)) {
        return null;
    }
    return {
        resolutionKind: candidate.resolutionKind,
        missingFields: uniqueMissingFields,
    };
}
//# sourceMappingURL=user-input-requirement.js.map