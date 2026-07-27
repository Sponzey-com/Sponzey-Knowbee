import type { YeonjangBrowserActiveTabInfoBackendFamily, YeonjangBrowserActiveTabInfoReadinessObservation, YeonjangBrowserActiveTabInfoReadinessStatus, YeonjangBrowserActiveTabInfoReadinessUserAction } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoReadinessSummaryAudience = "general" | "advanced";
export interface YeonjangBrowserActiveTabInfoPublicReadinessTarget {
    publicTargetName: string;
    platform: "macos" | "windows" | "linux" | "unknown";
    readinessStatus: YeonjangBrowserActiveTabInfoReadinessStatus;
    statusLabel: string;
    userAction: YeonjangBrowserActiveTabInfoReadinessUserAction;
    actionLabel: string;
    reasonLabel: string;
    advancedDiagnostic?: {
        candidateBackendFamilies: YeonjangBrowserActiveTabInfoBackendFamily[];
    } | undefined;
}
export interface YeonjangBrowserActiveTabInfoPublicReadinessSummary {
    schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    audience: YeonjangBrowserActiveTabInfoReadinessSummaryAudience;
    readyCount: number;
    blockedCount: number;
    targets: YeonjangBrowserActiveTabInfoPublicReadinessTarget[];
}
export declare function buildYeonjangBrowserActiveTabInfoPublicReadinessSummary(input: {
    observations: readonly YeonjangBrowserActiveTabInfoReadinessObservation[];
    audience?: YeonjangBrowserActiveTabInfoReadinessSummaryAudience | undefined;
}): YeonjangBrowserActiveTabInfoPublicReadinessSummary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-public-readiness-summary.d.ts.map