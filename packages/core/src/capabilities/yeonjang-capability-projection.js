function platform(value) {
    switch (value?.trim().toLowerCase()) {
        case "darwin":
        case "macos":
            return "macos";
        case "win32":
        case "windows":
            return "windows";
        case "linux":
            return "linux";
        default:
            return "unknown";
    }
}
function capabilityGroups(methods) {
    const groups = new Set();
    for (const method of methods) {
        const value = method.trim().toLowerCase();
        if (/^(app|window)[._:]/u.test(value))
            groups.add("applications");
        if (/^browser[._:]/u.test(value))
            groups.add("browser");
        if (/^disk[._:]/u.test(value))
            groups.add("disk");
        if (/^(file|filesystem|clipboard)[._:]/u.test(value))
            groups.add("files");
        if (/^(keyboard|mouse|input)[._:]/u.test(value))
            groups.add("input");
        if (/^process[._:]/u.test(value))
            groups.add("process");
        if (/^(screen|camera)[._:]/u.test(value))
            groups.add("screen");
        if (/^(system|status|permission|node)[._:]/u.test(value))
            groups.add("system");
    }
    return [...groups].sort();
}
function lastSeenAge(source, now) {
    if (source.lastHeartbeatAgeMs !== null)
        return Math.max(0, Math.floor(source.lastHeartbeatAgeMs));
    if (source.lastSeenAt === null)
        return null;
    return Math.max(0, now - source.lastSeenAt);
}
function permissionState(source) {
    if (source.state === "permission_required")
        return "required";
    if (source.trustState !== "trusted" || source.scopeAccess !== "allowed")
        return "restricted";
    if (source.state === "discovered")
        return "unknown";
    return "ready";
}
function projectItem(input) {
    const age = lastSeenAge(input.source, input.now);
    const stale = age !== null && age > input.staleAfterMs;
    const duplicate = input.source.duplicateLiveSessionDetected ||
        (input.duplicateLocalDetected && input.source.location === "local");
    const permission = permissionState(input.source);
    let status = "unavailable";
    if (stale)
        status = "stale";
    else if (permission === "required")
        status = "permission_required";
    else if (input.source.state === "discovered")
        status = "inactive";
    else if (input.source.state === "online" && permission === "ready" && !duplicate)
        status = "ready";
    let actionableIssue = null;
    if (duplicate)
        actionableIssue = "yeonjang_duplicate_instance";
    else if (stale)
        actionableIssue = "yeonjang_stale";
    else if (permission === "required")
        actionableIssue = "yeonjang_permission_required";
    else if (permission === "restricted")
        actionableIssue = "yeonjang_restricted";
    else if (input.source.state === "update_required")
        actionableIssue = "yeonjang_update_required";
    else if (status === "unavailable")
        actionableIssue = "yeonjang_unavailable";
    return Object.freeze({
        yeonjangRef: input.publicRefForInstanceId(input.source.instanceId),
        displayName: input.source.displayName.trim() || input.source.instanceAlias.trim() || "Yeonjang",
        location: input.source.location,
        platform: platform(input.source.platform),
        supportProfile: input.source.supportProfile,
        status,
        permissionState: permission,
        lastSeenAt: input.source.lastSeenAt,
        lastSeenAgeMs: age,
        stale,
        runnable: status === "ready" && input.source.runnableTarget && !duplicate,
        capabilityGroups: Object.freeze(capabilityGroups(input.source.supportedMethods)),
        actionableIssue,
    });
}
export function buildYeonjangCapabilityProjection(input) {
    const staleAfterMs = Math.max(1, input.staleAfterMs ?? 30_000);
    const duplicateLocalDetected = input.duplicateLocalDetected === true;
    const items = input.instances
        .map((source) => projectItem({
        source,
        now: input.now,
        staleAfterMs,
        duplicateLocalDetected,
        publicRefForInstanceId: input.publicRefForInstanceId,
    }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName) ||
        left.yeonjangRef.localeCompare(right.yeonjangRef));
    return Object.freeze({
        items: Object.freeze(items),
        summary: Object.freeze({
            total: items.length,
            ready: items.filter((item) => item.status === "ready").length,
            local: items.filter((item) => item.location === "local").length,
            remote: items.filter((item) => item.location === "remote").length,
            permissionRequired: items.filter((item) => item.status === "permission_required").length,
            stale: items.filter((item) => item.status === "stale").length,
            duplicateInstanceDetected: duplicateLocalDetected || input.instances.some((item) => item.duplicateLiveSessionDetected),
            knowbeeFallbackAvailable: true,
            computerControlAvailable: items.some((item) => item.runnable),
        }),
        observedAt: input.now,
    });
}
//# sourceMappingURL=yeonjang-capability-projection.js.map