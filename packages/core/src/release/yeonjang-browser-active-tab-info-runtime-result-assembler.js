import { projectYeonjangBrowserActiveTabInfo } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { buildYeonjangBrowserActiveTabInfoEvidenceRef, buildYeonjangBrowserActiveTabInfoFinalResultProjection, buildYeonjangBrowserActiveTabInfoProductLogProjection, } from "./yeonjang-browser-active-tab-info-final-result-boundary.js";
export function assembleYeonjangBrowserActiveTabInfoRuntimeResult(input) {
    const observationResult = projectYeonjangBrowserActiveTabInfo({
        browserName: readString(input.rawDetails, "browserName"),
        title: readString(input.rawDetails, "title"),
        url: readString(input.rawDetails, "url"),
        profileName: readString(input.rawDetails, "profileName"),
        profilePath: readString(input.rawDetails, "profilePath"),
        pid: readNumber(input.rawDetails, "pid"),
        windowId: readString(input.rawDetails, "windowId"),
        tabId: readString(input.rawDetails, "tabId"),
        observationStatus: observationStatusFromToolHealth(input.toolHealthStatus),
    });
    if (!observationResult.ok)
        return blocked(observationResult.reasonCode);
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
        publicTargetName: input.publicTargetName,
        observation: observationResult.observation,
    });
    const finalResult = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
        publicTargetName: input.publicTargetName,
        observation: observationResult.observation,
        evidenceRef,
        verificationStatus: input.verificationStatus,
    });
    if (!finalResult.ok)
        return blocked(finalResult.reasonCode);
    const productLog = buildYeonjangBrowserActiveTabInfoProductLogProjection({ evidenceRef });
    if (!productLog.ok)
        return blocked(productLog.reasonCode);
    return {
        ok: true,
        evidenceRef,
        finalProjection: finalResult.projection,
        productLogProjection: productLog.projection,
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
    };
}
function blocked(reasonCode) {
    return {
        ok: false,
        reasonCode,
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
    };
}
function readString(record, key) {
    const value = record?.[key];
    return typeof value === "string" ? value : undefined;
}
function readNumber(record, key) {
    const value = record?.[key];
    return typeof value === "number" ? value : undefined;
}
function observationStatusFromToolHealth(status) {
    switch (status) {
        case "ready":
            return "available";
        case "permission_disabled":
            return "permission_required";
        case "unsupported":
            return "unsupported";
        default:
            return "unknown";
    }
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-result-assembler.js.map