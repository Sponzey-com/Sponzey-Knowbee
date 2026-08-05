export function detectPrimaryMessageLanguage(text) {
    const hangulUnits = countMatches(text, /[가-힣]+/g);
    const latinUnits = countMatches(text, /[A-Za-z]+/g);
    if (hangulUnits > 0 && latinUnits > 0)
        return hangulUnits >= latinUnits ? "ko" : "en";
    if (hangulUnits > 0)
        return "ko";
    if (latinUnits > 0)
        return "en";
    return "unknown";
}
export function resolveUserFacingMessageLanguage(text) {
    const language = detectPrimaryMessageLanguage(text);
    return language === "ko" ? "ko" : "en";
}
function countMatches(text, pattern) {
    return text.match(pattern)?.length ?? 0;
}
//# sourceMappingURL=language.js.map