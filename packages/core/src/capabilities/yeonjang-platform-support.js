function item(status, ...reasonCodes) {
    return Object.freeze({ status, reasonCodes: Object.freeze(reasonCodes) });
}
function desktopCapability(input) {
    if (input.profile === "headless_managed")
        return item("unsupported", "headless_desktop_absent");
    if (input.permissionState !== "ready")
        return item("permission_required", input.permissionState === "restricted"
            ? "platform_permission_restricted"
            : "platform_permission_required");
    if (input.profile === "desktop_limited")
        return item("limited", "desktop_profile_limited");
    return item("supported");
}
export function projectYeonjangPlatformSupport(input) {
    if (input.platform === "unknown") {
        const unsupported = item("unsupported", "platform_unknown");
        return Object.freeze({
            platform: input.platform,
            supportProfile: input.supportProfile,
            capabilities: Object.freeze({
                applications: unsupported,
                browser: unsupported,
                disk: unsupported,
                files: unsupported,
                input: unsupported,
                process: unsupported,
                screen: unsupported,
                system: unsupported,
            }),
            processControl: unsupported,
            trayWindow: unsupported,
            packageSmoke: unsupported,
            runnableCapabilityGroups: Object.freeze([]),
        });
    }
    const desktop = desktopCapability({
        profile: input.supportProfile,
        permissionState: input.permissionState,
    });
    const supported = item("supported");
    const capabilities = Object.freeze({
        applications: supported,
        browser: supported,
        disk: supported,
        files: supported,
        input: desktop,
        process: supported,
        screen: desktop,
        system: supported,
    });
    const trayWindow = input.supportProfile === "headless_managed"
        ? item("unsupported", "headless_profile_no_tray")
        : input.platform === "linux"
            ? item("limited", "linux_desktop_environment_varies")
            : item("supported");
    const platformEligibleGroups = Object.entries(capabilities)
        .filter(([, support]) => support.status === "supported" || support.status === "limited")
        .map(([group]) => group);
    const reportedGroups = new Set(input.reportedCapabilityGroups ?? platformEligibleGroups);
    const runnableCapabilityGroups = platformEligibleGroups
        .filter((group) => reportedGroups.has(group))
        .sort();
    return Object.freeze({
        platform: input.platform,
        supportProfile: input.supportProfile,
        capabilities,
        processControl: supported,
        trayWindow,
        packageSmoke: supported,
        runnableCapabilityGroups: Object.freeze(runnableCapabilityGroups),
    });
}
//# sourceMappingURL=yeonjang-platform-support.js.map