import type { YeonjangCapabilityGroup, YeonjangCapabilityItem } from "./yeonjang-capability-projection.js";
export type YeonjangPlatform = "linux" | "windows" | "macos" | "unknown";
export type YeonjangPlatformSupportStatus = "supported" | "limited" | "unsupported" | "permission_required";
export interface YeonjangPlatformSupportItem {
    status: YeonjangPlatformSupportStatus;
    reasonCodes: readonly string[];
}
export interface YeonjangPlatformSupportProjection {
    platform: YeonjangPlatform;
    supportProfile: YeonjangCapabilityItem["supportProfile"];
    capabilities: Record<YeonjangCapabilityGroup, YeonjangPlatformSupportItem>;
    processControl: YeonjangPlatformSupportItem;
    trayWindow: YeonjangPlatformSupportItem;
    packageSmoke: YeonjangPlatformSupportItem;
    runnableCapabilityGroups: readonly YeonjangCapabilityGroup[];
}
export declare function projectYeonjangPlatformSupport(input: {
    platform: YeonjangPlatform;
    supportProfile: YeonjangCapabilityItem["supportProfile"];
    permissionState: YeonjangCapabilityItem["permissionState"];
    reportedCapabilityGroups?: readonly YeonjangCapabilityGroup[];
}): YeonjangPlatformSupportProjection;
//# sourceMappingURL=yeonjang-platform-support.d.ts.map