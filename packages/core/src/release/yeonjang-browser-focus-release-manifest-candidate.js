import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
export function buildYeonjangBrowserFocusReleaseManifestCandidate(input) {
    const requiredIntegrationTests = [...input.bindingDesign.requiredIntegrationTests];
    const passedIntegrationTests = requiredIntegrationTests.filter((testName) => input.passedIntegrationTests.includes(testName));
    const missingIntegrationTests = requiredIntegrationTests.filter((testName) => !input.passedIntegrationTests.includes(testName));
    if (input.bindingDesign.status !== "binding_design_ready") {
        return blockedReleaseManifestCandidate({
            reasonCode: "binding_design_not_ready",
            requiredIntegrationTests,
            passedIntegrationTests,
            missingIntegrationTests,
        });
    }
    if (missingIntegrationTests.length > 0) {
        return blockedReleaseManifestCandidate({
            reasonCode: "integration_tests_missing",
            requiredIntegrationTests,
            passedIntegrationTests,
            missingIntegrationTests,
        });
    }
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-release-manifest-candidate-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "release_candidate_ready",
        reasonCode: "browser_focus_release_manifest_candidate_ready",
        addProductionBindingNow: false,
        requiredIntegrationTests,
        passedIntegrationTests,
        missingIntegrationTests: [],
    });
}
function blockedReleaseManifestCandidate(input) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-release-manifest-candidate-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "release_candidate_blocked",
        reasonCode: input.reasonCode,
        addProductionBindingNow: false,
        requiredIntegrationTests: input.requiredIntegrationTests,
        passedIntegrationTests: input.passedIntegrationTests,
        missingIntegrationTests: input.missingIntegrationTests,
    });
}
//# sourceMappingURL=yeonjang-browser-focus-release-manifest-candidate.js.map