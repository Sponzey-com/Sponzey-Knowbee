import type { YeonjangCapabilityItem } from "./yeonjang-capability-projection.js";
import type { YeonjangPlatform } from "./yeonjang-platform-support.js";
export interface YeonjangPlatformProbeContext {
    readonly platform: Exclude<YeonjangPlatform, "unknown">;
    readonly supportProfile: YeonjangCapabilityItem["supportProfile"];
    readonly deadlineAt: number;
}
export interface YeonjangPlatformProbeObservation {
    platform: Exclude<YeonjangPlatform, "unknown">;
    packageReady: boolean;
    processReady: boolean;
    trayWindowState: "ready" | "limited" | "unsupported";
    permissionState: YeonjangCapabilityItem["permissionState"];
    observedAt: number;
}
export interface YeonjangPlatformProbeReceipt {
    platform: Exclude<YeonjangPlatform, "unknown">;
    status: "passed" | "failed" | "cancelled";
    reasonCodes: string[];
    observedAt: number | null;
}
export type YeonjangPlatformProbeLogLevel = "product" | "field_debug" | "development";
export declare function projectYeonjangPlatformProbeLog(input: {
    level: YeonjangPlatformProbeLogLevel;
    receipt: YeonjangPlatformProbeReceipt;
    displayName: string;
    durationMs: number;
}): Readonly<Record<string, unknown>>;
export type YeonjangPlatformProbePort = (context: YeonjangPlatformProbeContext, signal: AbortSignal) => Promise<YeonjangPlatformProbeObservation | null>;
export declare function executeYeonjangPlatformProbe(input: {
    context: YeonjangPlatformProbeContext;
    now(): number;
    probe: YeonjangPlatformProbePort;
    wait?: (intervalMs: number, signal: AbortSignal) => Promise<void>;
}, signal: AbortSignal): Promise<YeonjangPlatformProbeReceipt>;
//# sourceMappingURL=yeonjang-platform-probe.d.ts.map