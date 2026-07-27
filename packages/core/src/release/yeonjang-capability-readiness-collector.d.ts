import type { ReleaseTargetPlatform } from "./package.js";
import type { YeonjangPlatformCapabilityReceipt } from "./yeonjang-platform-acceptance.js";
export type YeonjangCapabilityToolHealthStatus = "ready" | "permission_disabled" | "unsupported" | "unknown";
export interface YeonjangCapabilityReadinessSummaryEntry {
    supported: boolean;
    permissionEnabled: boolean;
    toolHealthStatus: YeonjangCapabilityToolHealthStatus;
}
export interface YeonjangCapabilityReadinessObservation {
    publicTargetName: string;
    platform: ReleaseTargetPlatform;
    runnableTarget: boolean;
    observedAt: number;
    capabilitySummary: Readonly<Record<string, YeonjangCapabilityReadinessSummaryEntry>>;
}
export interface CollectYeonjangPlatformCapabilityReceiptsInput {
    requiredMethods: readonly string[];
    observations: readonly YeonjangCapabilityReadinessObservation[];
}
export declare function collectYeonjangPlatformCapabilityReceipts(input: CollectYeonjangPlatformCapabilityReceiptsInput): YeonjangPlatformCapabilityReceipt[];
//# sourceMappingURL=yeonjang-capability-readiness-collector.d.ts.map