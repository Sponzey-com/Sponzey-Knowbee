import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusReadinessProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangPlatformCapabilityReceipt } from "./yeonjang-platform-acceptance.js";
import { YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD } from "./yeonjang-browser-focus-release-gate.js";
export type YeonjangBrowserFocusBackendReadinessPlatform = "macos" | "windows" | "linux" | "unknown";
export type YeonjangBrowserFocusBackendSourceStatus = "ready" | "permission_required" | "missing" | "unsupported" | "headless_unavailable" | "unknown";
export type YeonjangBrowserFocusBackendEvidenceSource = "rust_dispatch_contract" | "focused_target_observation_contract" | "platform_backend_probe" | "os_permission_probe";
export interface YeonjangBrowserFocusBackendSignalSource {
    status: Exclude<YeonjangBrowserFocusBackendSourceStatus, "permission_required" | "headless_unavailable">;
    evidenceSource: YeonjangBrowserFocusBackendEvidenceSource;
    evidenceRef: string;
    auditOnlyDetails?: Record<string, unknown> | undefined;
}
export interface YeonjangBrowserFocusBackendReadinessSource {
    publicTargetName: string;
    internalInstanceId?: string | undefined;
    platform: YeonjangBrowserFocusBackendReadinessPlatform;
    desktopSession: "available" | "headless" | "unknown";
    browserFocusCapabilityAdvertised: boolean;
    browserControlPermissionGranted: boolean;
    focusedTargetObservationPermissionGranted?: boolean | undefined;
    commandBackend: YeonjangBrowserFocusBackendSignalSource;
    observationBackend: YeonjangBrowserFocusBackendSignalSource;
}
export interface YeonjangBrowserFocusPublicBackendSource {
    publicTargetName: string;
    platform: Exclude<YeonjangBrowserFocusBackendReadinessPlatform, "unknown">;
    desktopSession: "available" | "headless" | "unknown";
    commandBackend: {
        method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
        status: YeonjangBrowserFocusBackendSourceStatus;
        evidenceSource: YeonjangBrowserFocusBackendEvidenceSource;
        evidenceRef: string;
    };
    observationBackend: {
        method: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD;
        status: YeonjangBrowserFocusBackendSourceStatus;
        evidenceSource: YeonjangBrowserFocusBackendEvidenceSource;
        evidenceRef: string;
    };
}
export interface YeonjangBrowserFocusReadinessSourceProjection {
    schemaVersion: "yeonjang-browser-focus-readiness-source-v1";
    publicSources: YeonjangBrowserFocusPublicBackendSource[];
    readinessProjection: YeonjangBrowserFocusReadinessProjection;
    capabilityReceipts: YeonjangPlatformCapabilityReceipt[];
}
export declare function projectYeonjangBrowserFocusBackendReadinessSources(input: {
    sources: readonly YeonjangBrowserFocusBackendReadinessSource[];
    observedAt: number;
}): YeonjangBrowserFocusReadinessSourceProjection;
//# sourceMappingURL=yeonjang-browser-focus-readiness-source.d.ts.map