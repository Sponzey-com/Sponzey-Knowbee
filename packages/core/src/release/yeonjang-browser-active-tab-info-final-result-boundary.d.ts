import type { YeonjangBrowserActiveTabInfoObservation } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoVerificationStatus = "verified" | "unverifiable" | "failed";
export interface YeonjangBrowserActiveTabInfoFinalResultProjection {
    schemaVersion: "yeonjang-browser-active-tab-info-final-result-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    publicTargetName: string;
    verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus;
    evidenceRef: string;
    observation: {
        schemaVersion: YeonjangBrowserActiveTabInfoObservation["schemaVersion"];
        method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
        observationStatus: YeonjangBrowserActiveTabInfoObservation["observationStatus"];
        browserName: string;
        titleHash?: string | undefined;
        titleLength?: number | undefined;
        urlScheme?: string | undefined;
        urlHash?: string | undefined;
        urlLength?: number | undefined;
    };
}
export type YeonjangBrowserActiveTabInfoFinalResultProjectionResult = {
    ok: true;
    projection: YeonjangBrowserActiveTabInfoFinalResultProjection;
} | {
    ok: false;
    reasonCode: "final_result_redaction_required" | "evidence_ref_required" | "evidence_ref_unsafe";
};
export interface YeonjangBrowserActiveTabInfoProductLogProjection {
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    evidenceRef: string;
}
export type YeonjangBrowserActiveTabInfoProductLogProjectionResult = {
    ok: true;
    projection: YeonjangBrowserActiveTabInfoProductLogProjection;
} | {
    ok: false;
    reasonCode: "product_log_evidence_ref_only" | "evidence_ref_required" | "evidence_ref_unsafe";
};
export declare function buildYeonjangBrowserActiveTabInfoEvidenceRef(input: {
    publicTargetName: string;
    observation: YeonjangBrowserActiveTabInfoObservation;
}): string;
export declare function isSafeYeonjangBrowserActiveTabInfoEvidenceRef(value: string): boolean;
export declare function buildYeonjangBrowserActiveTabInfoFinalResultProjection(input: {
    publicTargetName: string;
    observation: YeonjangBrowserActiveTabInfoObservation;
    evidenceRef: string;
    verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus;
}): YeonjangBrowserActiveTabInfoFinalResultProjectionResult;
export declare function buildYeonjangBrowserActiveTabInfoProductLogProjection(input: {
    evidenceRef: string;
    fields?: readonly string[] | undefined;
}): YeonjangBrowserActiveTabInfoProductLogProjectionResult;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-result-boundary.d.ts.map