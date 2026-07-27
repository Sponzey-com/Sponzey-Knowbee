import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
export function projectYeonjangBrowserFocusReadinessReceipts(input) {
    return input.projection.targets.flatMap((target) => {
        const platform = normalizeReceiptPlatform(target.platform);
        if (!platform)
            return [];
        return [{
                platform,
                method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
                ...receiptStatusFromReadiness(target.readinessStatus),
                observedAt: input.observedAt,
                evidenceRef: `capability:${platform}:browser-focus:${slugify(target.publicTargetName) || "target"}`,
            }];
    });
}
function receiptStatusFromReadiness(status) {
    switch (status) {
        case "ready":
            return { supported: true, permissionEnabled: true, toolHealthStatus: "ready" };
        case "permission_required":
            return { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" };
        case "unsupported":
        case "headless_unavailable":
            return { supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" };
        case "target_identity_required":
        case "command_backend_required":
        case "observation_backend_required":
            return { supported: false, permissionEnabled: false, toolHealthStatus: "unknown" };
    }
}
function normalizeReceiptPlatform(platform) {
    return platform === "unknown" ? null : platform;
}
function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/giu, "-")
        .replace(/^-+|-+$/gu, "");
}
//# sourceMappingURL=yeonjang-browser-focus-readiness-adapter.js.map