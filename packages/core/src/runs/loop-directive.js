export function combineUserFacingTextSources(sources) {
    const first = sources[0];
    if (!first)
        return "runtime_deterministic";
    return sources.every((source) => source === first) ? first : "mixed";
}
export function userFacingTextSourceRequiresFinalResponseReview(source) {
    return source === "runtime_deterministic" ||
        source === "mixed" ||
        source === "llm_generated" ||
        source === "user_supplied_literal";
}
//# sourceMappingURL=loop-directive.js.map