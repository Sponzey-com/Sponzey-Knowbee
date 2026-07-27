import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
export function evaluateYeonjangBrowserFocusProductionExposureBoundary(input) {
    const releaseEvidenceReady = input.readinessSource.readinessProjection.readyCount > 0;
    const missingInventory = productionMissingInventory(input);
    if (!releaseEvidenceReady) {
        return blockedProductionExposure("release_evidence_not_ready", false, missingInventory);
    }
    if (missingInventory.includes("rust_dispatch")) {
        return blockedProductionExposure("rust_dispatch_not_registered", true, ["rust_dispatch"]);
    }
    if (missingInventory.includes("tool_mapping")) {
        return blockedProductionExposure("tool_mapping_not_registered", true, missingInventory.filter((item) => item !== "rust_dispatch"));
    }
    if (missingInventory.includes("skill_catalog")) {
        return blockedProductionExposure("skill_catalog_not_registered", true, ["skill_catalog"]);
    }
    return Object.freeze({
        status: "executable",
        reasonCode: "browser_focus_production_exposure_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        releaseEvidenceReady: true,
        executable: true,
        missingInventory: [],
    });
}
function productionMissingInventory(input) {
    const missing = [];
    if (!input.rustDispatchMethods.includes(YEONJANG_BROWSER_FOCUS_CONTRACT.method)) {
        missing.push("rust_dispatch");
    }
    if (!input.mappedMethodIds.includes(YEONJANG_BROWSER_FOCUS_CONTRACT.method) ||
        !input.mappedToolNames.includes("yeonjang_browser_focus")) {
        missing.push("tool_mapping");
    }
    if (!input.skillToolNames.includes("yeonjang_browser_focus"))
        missing.push("skill_catalog");
    return missing;
}
function blockedProductionExposure(reasonCode, releaseEvidenceReady, missingInventory) {
    return Object.freeze({
        status: "not_executable",
        reasonCode,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        releaseEvidenceReady,
        executable: false,
        missingInventory,
    });
}
//# sourceMappingURL=yeonjang-browser-focus-production-exposure.js.map