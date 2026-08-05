function nonEmptyString(value) {
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().replace(/\s+/gu, " ");
    return normalized || undefined;
}
export function canonicalizeLegacyTeamIdentity(input) {
    const displayName = nonEmptyString(input.displayName) ?? nonEmptyString(input.nickname);
    const output = { ...input };
    Reflect.deleteProperty(output, "nickname");
    Reflect.deleteProperty(output, "normalizedNickname");
    if (displayName)
        output.displayName = displayName;
    return output;
}
//# sourceMappingURL=legacy-team-identity.js.map