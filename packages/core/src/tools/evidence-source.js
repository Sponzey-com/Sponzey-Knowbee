export function resolveLocalOrYeonjangEvidenceSourceKind(result) {
    if (!result.details || typeof result.details !== "object")
        return "tool";
    return result.details.via === "yeonjang" ? "yeonjang" : "tool";
}
//# sourceMappingURL=evidence-source.js.map