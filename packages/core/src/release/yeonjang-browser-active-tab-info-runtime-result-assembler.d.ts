import type { YeonjangBrowserActiveTabInfoProjectionResult } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import type { YeonjangBrowserActiveTabInfoToolHealthStatus } from "./yeonjang-browser-active-tab-info-readiness-source-adapter.js";
import type { YeonjangBrowserActiveTabInfoFinalResultProjection, YeonjangBrowserActiveTabInfoProductLogProjection, YeonjangBrowserActiveTabInfoVerificationStatus } from "./yeonjang-browser-active-tab-info-final-result-boundary.js";
export type YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult = {
    ok: true;
    evidenceRef: string;
    finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection;
    productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection;
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
} | {
    ok: false;
    reasonCode: Extract<YeonjangBrowserActiveTabInfoProjectionResult, {
        ok: false;
    }>["reasonCode"] | "final_result_redaction_required" | "evidence_ref_required" | "evidence_ref_unsafe" | "product_log_evidence_ref_only";
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
};
export declare function assembleYeonjangBrowserActiveTabInfoRuntimeResult(input: {
    publicTargetName: string;
    toolHealthStatus: YeonjangBrowserActiveTabInfoToolHealthStatus;
    rawDetails: Record<string, unknown> | undefined;
    verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus;
    internalInstanceId?: string | undefined;
    sessionId?: string | undefined;
    clientId?: string | undefined;
}): YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult;
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-result-assembler.d.ts.map