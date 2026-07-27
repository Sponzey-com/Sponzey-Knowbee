export type YeonjangCapabilityStatus = "ready" | "unavailable" | "inactive" | "permission_required" | "stale";
export type YeonjangCapabilityGroup = "applications" | "browser" | "disk" | "files" | "input" | "process" | "screen" | "system";
export interface YeonjangProjectionSource {
    instanceId: string;
    displayName: string;
    instanceAlias: string;
    location: "local" | "remote";
    platform: string | null;
    supportProfile: "desktop_interactive" | "desktop_limited" | "headless_managed";
    state: string;
    lastSeenAt: number | null;
    lastHeartbeatAgeMs: number | null;
    runnableTarget: boolean;
    trustState: string;
    scopeAccess: string;
    duplicateLiveSessionDetected: boolean;
    supportedMethods: readonly string[];
}
export interface YeonjangCapabilityItem {
    yeonjangRef: string;
    displayName: string;
    location: "local" | "remote";
    platform: "linux" | "windows" | "macos" | "unknown";
    supportProfile: YeonjangProjectionSource["supportProfile"];
    status: YeonjangCapabilityStatus;
    permissionState: "ready" | "required" | "restricted" | "unknown";
    lastSeenAt: number | null;
    lastSeenAgeMs: number | null;
    stale: boolean;
    runnable: boolean;
    capabilityGroups: YeonjangCapabilityGroup[];
    actionableIssue: "yeonjang_duplicate_instance" | "yeonjang_stale" | "yeonjang_permission_required" | "yeonjang_update_required" | "yeonjang_unavailable" | "yeonjang_restricted" | null;
}
export interface YeonjangCapabilityProjection {
    items: YeonjangCapabilityItem[];
    summary: {
        total: number;
        ready: number;
        local: number;
        remote: number;
        permissionRequired: number;
        stale: number;
        duplicateInstanceDetected: boolean;
        knowbeeFallbackAvailable: true;
        computerControlAvailable: boolean;
    };
    observedAt: number;
}
export declare function buildYeonjangCapabilityProjection(input: {
    instances: readonly YeonjangProjectionSource[];
    now: number;
    staleAfterMs?: number;
    duplicateLocalDetected?: boolean;
    publicRefForInstanceId(id: string): string;
}): YeonjangCapabilityProjection;
//# sourceMappingURL=yeonjang-capability-projection.d.ts.map