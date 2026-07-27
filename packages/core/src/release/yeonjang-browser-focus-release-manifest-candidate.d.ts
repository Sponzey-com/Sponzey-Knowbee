import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusProductionBindingDesign, type YeonjangBrowserFocusProductionBindingIntegrationTest } from "../capabilities/yeonjang-browser-focus-contract.js";
export type YeonjangBrowserFocusReleaseManifestCandidateReasonCode = "browser_focus_release_manifest_candidate_ready" | "binding_design_not_ready" | "integration_tests_missing";
export type YeonjangBrowserFocusReleaseManifestCandidate = {
    schemaVersion: "yeonjang-browser-focus-release-manifest-candidate-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "release_candidate_ready";
    reasonCode: "browser_focus_release_manifest_candidate_ready";
    addProductionBindingNow: false;
    requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
    passedIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
    missingIntegrationTests: [];
} | {
    schemaVersion: "yeonjang-browser-focus-release-manifest-candidate-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "release_candidate_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusReleaseManifestCandidateReasonCode, "browser_focus_release_manifest_candidate_ready">;
    addProductionBindingNow: false;
    requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
    passedIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
    missingIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[];
};
export declare function buildYeonjangBrowserFocusReleaseManifestCandidate(input: {
    bindingDesign: YeonjangBrowserFocusProductionBindingDesign;
    passedIntegrationTests: readonly YeonjangBrowserFocusProductionBindingIntegrationTest[];
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserFocusReleaseManifestCandidate;
//# sourceMappingURL=yeonjang-browser-focus-release-manifest-candidate.d.ts.map