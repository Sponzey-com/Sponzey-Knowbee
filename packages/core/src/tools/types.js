export function isArtifactDeliveryResultDetails(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return (candidate.kind === "artifact_delivery" &&
        typeof candidate.channel === "string" &&
        (typeof candidate.filePath === "string" ||
            typeof candidate.artifactRef === "string") &&
        typeof candidate.size === "number" &&
        typeof candidate.source === "string");
}
export function canonicalToolOperationParams(input) {
    return input.contract?.canonicalOperation?.(input.params, input.ctx) ?? input.params;
}
//# sourceMappingURL=types.js.map