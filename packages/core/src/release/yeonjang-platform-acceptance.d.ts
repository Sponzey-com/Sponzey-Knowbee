import type { YeonjangPlatform } from "../capabilities/yeonjang-platform-support.js";
import type { YeonjangLiveSmokeSummary } from "../runs/yeonjang-live-smoke.js";
type SupportedPlatform = Exclude<YeonjangPlatform, "unknown">;
export type YeonjangPlatformAcceptanceStatus = "not_run" | "passed" | "failed" | "unavailable";
export type YeonjangPlatformCapabilityReadinessStatus = "passed" | "missing" | "failed" | "unsupported" | "permission_disabled" | "stale";
export interface YeonjangPlatformDeterministicReceipt {
    platform: SupportedPlatform;
    status: "passed" | "failed";
    reasonCodes: string[];
}
export interface YeonjangPlatformLiveRecord {
    platform: SupportedPlatform;
    buildRevision: string;
    run: YeonjangLiveSmokeSummary;
}
export interface YeonjangPlatformCapabilityReceipt {
    platform: SupportedPlatform;
    method: string;
    supported: boolean;
    permissionEnabled: boolean;
    toolHealthStatus: "ready" | "permission_disabled" | "unsupported" | "unknown";
    observedAt: number;
    evidenceRef: string;
}
export interface YeonjangPlatformCapabilityReadiness {
    method: string;
    status: YeonjangPlatformCapabilityReadinessStatus;
    observedAt?: number;
    evidenceRef?: string;
}
export interface YeonjangPlatformAcceptanceRow {
    platform: SupportedPlatform;
    required: boolean;
    available: boolean;
    deterministic: "not_run" | "passed" | "failed";
    live: YeonjangPlatformAcceptanceStatus;
    reasonCodes: string[];
    buildRevision?: string;
    publicTargetName?: string;
    executedAt?: number;
    evidenceRefs: string[];
    capabilityReadiness: YeonjangPlatformCapabilityReadiness[];
}
export interface YeonjangPlatformAcceptanceMatrix {
    platforms: YeonjangPlatformAcceptanceRow[];
    deterministicReady: boolean;
    availableLiveReady: boolean;
    capabilityReady: boolean;
    publicReleaseReady: boolean;
}
export declare function buildYeonjangPlatformAcceptanceMatrix(input: {
    requiredPlatforms: readonly SupportedPlatform[];
    availablePlatforms: readonly SupportedPlatform[];
    deterministicReceipts: readonly YeonjangPlatformDeterministicReceipt[];
    liveRecords: readonly YeonjangPlatformLiveRecord[];
    requiredCapabilityMethods?: readonly string[];
    capabilityReceipts?: readonly YeonjangPlatformCapabilityReceipt[];
    now: number;
    maxSessionAgeMs: number;
}): YeonjangPlatformAcceptanceMatrix;
export {};
//# sourceMappingURL=yeonjang-platform-acceptance.d.ts.map