import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
export function aggregateYeonjangBrowserFocusCommandSkeletons(input) {
    const platforms = input.skeletons.map(projectSkeletonPlatform);
    const readyCount = platforms.filter((item) => item.status === "ready").length;
    const blockedCount = platforms.filter((item) => item.status === "blocked").length;
    const productionExposure = projectProductionExposure(input.productionExposure);
    if (platforms.length === 0) {
        return blockedAggregate({
            reasonCode: "command_skeleton_required",
            readyCount,
            blockedCount,
            platforms,
            productionExposure,
        });
    }
    if (input.productionExposure.status !== "executable") {
        return blockedAggregate({
            reasonCode: "production_exposure_not_executable",
            readyCount,
            blockedCount,
            platforms,
            productionExposure,
        });
    }
    if (blockedCount > 0) {
        return blockedAggregate({
            reasonCode: "command_skeleton_blocked",
            readyCount,
            blockedCount,
            platforms,
            productionExposure,
        });
    }
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-command-skeleton-aggregate-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "aggregate_ready",
        reasonCode: "browser_focus_command_skeleton_aggregate_ready",
        executable: false,
        addProductionBindingNow: false,
        readyCount,
        blockedCount: 0,
        platforms,
        productionExposure,
    });
}
function projectSkeletonPlatform(input) {
    return Object.freeze({
        publicTargetName: input.publicTargetName,
        platform: input.platform,
        status: input.skeleton.status === "skeleton_ready" ? "ready" : "blocked",
        reasonCode: input.skeleton.reasonCode,
        commandAccepted: false,
        executeOsFocusNow: false,
    });
}
function projectProductionExposure(exposure) {
    return Object.freeze({
        status: exposure.status,
        reasonCode: exposure.reasonCode,
        missingInventory: [...exposure.missingInventory],
    });
}
function blockedAggregate(input) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-command-skeleton-aggregate-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        status: "aggregate_blocked",
        reasonCode: input.reasonCode,
        executable: false,
        addProductionBindingNow: false,
        readyCount: input.readyCount,
        blockedCount: input.blockedCount,
        platforms: input.platforms,
        productionExposure: input.productionExposure,
    });
}
//# sourceMappingURL=yeonjang-browser-focus-command-skeleton-aggregate.js.map