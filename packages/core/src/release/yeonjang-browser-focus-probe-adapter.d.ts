import type { YeonjangBrowserFocusBackendReadinessPlatform, YeonjangBrowserFocusBackendReadinessSource } from "./yeonjang-browser-focus-readiness-source.js";
export type YeonjangBrowserFocusDesktopProbeStatus = "available" | "headless" | "unknown";
export type YeonjangBrowserFocusBackendProbeStatus = "ready" | "missing" | "unsupported" | "unknown";
export type YeonjangBrowserFocusPermissionProbeStatus = "granted" | "denied" | "unknown";
export interface YeonjangBrowserFocusProbeSignal<TStatus extends string> {
    status: TStatus;
    evidenceRef: string;
    rawDetails?: Record<string, unknown> | undefined;
}
export interface YeonjangBrowserFocusBackendProbeRecord {
    publicTargetName: string;
    internalInstanceId?: string | undefined;
    platform: YeonjangBrowserFocusBackendReadinessPlatform;
    desktopSessionProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusDesktopProbeStatus>;
    commandBackendProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusBackendProbeStatus>;
    focusedTargetObservationBackendProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusBackendProbeStatus>;
    browserControlPermissionProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusPermissionProbeStatus>;
    focusedTargetObservationPermissionProbe?: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusPermissionProbeStatus> | undefined;
}
export declare function assembleYeonjangBrowserFocusReadinessSourcesFromProbes(input: {
    records: readonly YeonjangBrowserFocusBackendProbeRecord[];
}): YeonjangBrowserFocusBackendReadinessSource[];
//# sourceMappingURL=yeonjang-browser-focus-probe-adapter.d.ts.map