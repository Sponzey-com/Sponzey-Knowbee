export function collectYeonjangPlatformCapabilityReceipts(input) {
    const requiredMethods = [...new Set(input.requiredMethods.map(normalizeMethod).filter(Boolean))];
    const receipts = [];
    for (const observation of input.observations) {
        const targetSlug = slugify(observation.publicTargetName) || "target";
        for (const method of requiredMethods) {
            const summary = observation.capabilitySummary[method];
            const nonRunnableFallback = {
                supported: false,
                permissionEnabled: false,
                toolHealthStatus: "unknown",
            };
            const effective = observation.runnableTarget
                ? summary ?? nonRunnableFallback
                : summary?.toolHealthStatus === "unsupported"
                    ? summary
                    : nonRunnableFallback;
            receipts.push(Object.freeze({
                platform: observation.platform,
                method,
                supported: effective.supported,
                permissionEnabled: effective.permissionEnabled,
                toolHealthStatus: effective.toolHealthStatus,
                observedAt: observation.observedAt,
                evidenceRef: `capability:${observation.platform}:${method.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "")}:${targetSlug}`,
            }));
        }
    }
    return receipts;
}
function normalizeMethod(value) {
    return value.trim();
}
function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/giu, "-")
        .replace(/^-+|-+$/gu, "");
}
//# sourceMappingURL=yeonjang-capability-readiness-collector.js.map