import type { YeonjangBrowserActiveTabInfoObservation, YeonjangBrowserActiveTabInfoProjectionResult, YeonjangBrowserActiveTabInfoDesktopSession, YeonjangBrowserActiveTabInfoReadinessObservation, YeonjangBrowserActiveTabInfoReadinessPlatform } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoToolHealthStatus = "ready" | "permission_disabled" | "unsupported" | "unknown" | "error";
export interface YeonjangBrowserActiveTabInfoToolHealthRecord {
    status?: YeonjangBrowserActiveTabInfoToolHealthStatus | undefined;
    reasonCode?: string | undefined;
    candidateBackendFamilies?: readonly unknown[] | undefined;
    rawDetails?: Record<string, unknown> | undefined;
}
export interface YeonjangBrowserActiveTabInfoRegistryRecord {
    publicTargetName: string;
    internalInstanceId?: string | undefined;
    sessionId?: string | undefined;
    clientId?: string | undefined;
    platform: YeonjangBrowserActiveTabInfoReadinessPlatform;
    desktopSession: YeonjangBrowserActiveTabInfoDesktopSession;
    methods: readonly string[];
    permissions: {
        allow_browser_read?: boolean | undefined;
        [key: string]: unknown;
    };
    toolHealth: {
        "browser.active_tab_info"?: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined;
        [key: string]: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined;
    };
    rawMqttPayload?: Record<string, unknown> | undefined;
}
export type YeonjangBrowserActiveTabInfoRedactedObservationSourceResult = {
    ok: true;
    observation: YeonjangBrowserActiveTabInfoObservation;
} | {
    ok: false;
    reasonCode: "active_tab_info_redacted_source_missing" | "active_tab_info_redacted_source_ambiguous" | Extract<YeonjangBrowserActiveTabInfoProjectionResult, {
        ok: false;
    }>["reasonCode"];
};
export declare function assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry(input: {
    records: readonly YeonjangBrowserActiveTabInfoRegistryRecord[];
}): YeonjangBrowserActiveTabInfoReadinessObservation[];
export declare function selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry(input: {
    publicTargetName: string;
    records: readonly YeonjangBrowserActiveTabInfoRegistryRecord[];
}): YeonjangBrowserActiveTabInfoRedactedObservationSourceResult;
//# sourceMappingURL=yeonjang-browser-active-tab-info-readiness-source-adapter.d.ts.map