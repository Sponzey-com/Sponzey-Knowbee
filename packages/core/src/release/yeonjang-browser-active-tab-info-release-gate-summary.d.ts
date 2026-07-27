import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoReleaseGateId = "readiness_projection" | "pre_dispatch_bridge" | "rust_inventory_contract" | "audit_evidence_boundary" | "runtime_result_assembler" | "llm_review_admission" | "review_ready_bundle" | "final_projection_boundary" | "safe_evidence_ref";
export type YeonjangBrowserActiveTabInfoReleaseGateStatus = "ready_for_manual_live_integration_review" | "blocked";
export interface YeonjangBrowserActiveTabInfoReleaseGateSummaryInput {
    readinessProjectionReady: boolean;
    preDispatchBridgeReady: boolean;
    rustInventoryContractReady: boolean;
    auditEvidenceBoundaryReady: boolean;
    runtimeAssemblerReady: boolean;
    llmReviewAdmissionReady: boolean;
    reviewReadyBundleReady: boolean;
    finalProjectionBoundaryReady: boolean;
    safeEvidenceRefReady: boolean;
    publicRawLeakDetected: boolean;
    reviewBypassDetected: boolean;
    unsafeEvidenceRefDetected: boolean;
    defaultLiveSmokeEnabled: boolean;
    rustLiveHandlerEnabled: boolean;
    skillMappingEnabled: boolean;
    productionBindingEnabled: boolean;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateSummary {
    schemaVersion: "yeonjang-browser-active-tab-info-release-gate-summary-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    gateStatus: YeonjangBrowserActiveTabInfoReleaseGateStatus;
    missingGateIds: YeonjangBrowserActiveTabInfoReleaseGateId[];
    blockingReasonCodes: string[];
    requiredGateIds: YeonjangBrowserActiveTabInfoReleaseGateId[];
    liveIntegrationState: {
        rustLiveHandlerEnabled: boolean;
        skillMappingEnabled: boolean;
        productionBindingEnabled: boolean;
        defaultLiveSmokeEnabled: boolean;
    };
    addRustDispatchNow: false;
    addProductionBindingNow: false;
    enableSkillMappingNow: false;
    enableDefaultLiveSmokeNow: false;
}
export declare function buildYeonjangBrowserActiveTabInfoReleaseGateSummary(input: YeonjangBrowserActiveTabInfoReleaseGateSummaryInput): YeonjangBrowserActiveTabInfoReleaseGateSummary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-gate-summary.d.ts.map