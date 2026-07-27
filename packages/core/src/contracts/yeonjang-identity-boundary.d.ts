export type YeonjangIdentityKind = "knowbee_runtime" | "yeonjang_instance" | "computer" | "operating_system";
export type YeonjangInstanceLocality = "local" | "remote";
export type YeonjangObservedOsFamily = "macos" | "windows" | "linux" | "other" | "unknown";
export interface KnowbeeRuntimeIdentitySnapshot {
    kind: "knowbee_runtime";
    runtimeId: string;
    hostComputerId: string;
    observedAt: number;
}
export interface YeonjangInstanceIdentitySnapshot {
    kind: "yeonjang_instance";
    instanceId: string;
    label: string;
    instanceAlias: string;
    callNames: string[];
    locality: YeonjangInstanceLocality;
    computerId: string;
    connectionState: "online" | "degraded" | "offline";
    trustState: "trusted" | "pending" | "revoked" | "quarantined";
    capabilitySnapshotRef: string;
    permissionSnapshotRef: string;
    capabilityIds: string[];
    observedAt: number;
}
export interface ComputerIdentitySnapshot {
    kind: "computer";
    computerId: string;
    label: string;
    operatingSystemId: string;
    observedAt: number;
}
export interface OperatingSystemIdentitySnapshot {
    kind: "operating_system";
    operatingSystemId: string;
    family: YeonjangObservedOsFamily;
    version: string | null;
    architecture: string | null;
    observedAt: number;
}
export interface YeonjangIdentityBoundarySnapshot {
    schemaVersion: 1;
    runtime: KnowbeeRuntimeIdentitySnapshot;
    instances: YeonjangInstanceIdentitySnapshot[];
    computers: ComputerIdentitySnapshot[];
    operatingSystems: OperatingSystemIdentitySnapshot[];
    capturedAt: number;
}
export interface YeonjangUserFacingInstanceIdentity {
    label: string;
    locality: YeonjangInstanceLocality;
    connectionState: YeonjangInstanceIdentitySnapshot["connectionState"];
    computerName: string;
    operatingSystem: {
        family: YeonjangObservedOsFamily;
        version: string | null;
        architecture: string | null;
    };
    capabilityCount: number;
}
export declare function validateYeonjangIdentityBoundarySnapshot(input: {
    snapshot: YeonjangIdentityBoundarySnapshot;
    maxAgeMs: number;
}): YeonjangIdentityBoundarySnapshot;
export declare function projectYeonjangUserFacingIdentities(snapshot: YeonjangIdentityBoundarySnapshot): YeonjangUserFacingInstanceIdentity[];
//# sourceMappingURL=yeonjang-identity-boundary.d.ts.map