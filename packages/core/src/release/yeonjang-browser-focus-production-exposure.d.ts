import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusReadinessSourceProjection } from "./yeonjang-browser-focus-readiness-source.js";
export type YeonjangBrowserFocusProductionInventoryItem = "rust_dispatch" | "tool_mapping" | "skill_catalog";
export type YeonjangBrowserFocusProductionExposureReasonCode = "browser_focus_production_exposure_ready" | "release_evidence_not_ready" | "rust_dispatch_not_registered" | "tool_mapping_not_registered" | "skill_catalog_not_registered";
export type YeonjangBrowserFocusProductionExposureDecision = {
    status: "executable";
    reasonCode: "browser_focus_production_exposure_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    releaseEvidenceReady: true;
    executable: true;
    missingInventory: [];
} | {
    status: "not_executable";
    reasonCode: Exclude<YeonjangBrowserFocusProductionExposureReasonCode, "browser_focus_production_exposure_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    releaseEvidenceReady: boolean;
    executable: false;
    missingInventory: YeonjangBrowserFocusProductionInventoryItem[];
};
export declare function evaluateYeonjangBrowserFocusProductionExposureBoundary(input: {
    readinessSource: YeonjangBrowserFocusReadinessSourceProjection;
    rustDispatchMethods: readonly string[];
    mappedMethodIds: readonly string[];
    mappedToolNames: readonly string[];
    skillToolNames: readonly string[];
}): YeonjangBrowserFocusProductionExposureDecision;
//# sourceMappingURL=yeonjang-browser-focus-production-exposure.d.ts.map