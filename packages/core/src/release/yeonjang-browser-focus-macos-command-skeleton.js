import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
const MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
    "rawWindowTitle",
    "rawUrl",
    "queryToken",
    "pid",
    "windowId",
    "tabId",
    "automationScriptText",
];
export function buildYeonjangBrowserFocusMacosCommandSkeleton(input) {
    if (input.preflight.reasonCode === "side_effect_authorization_required") {
        return blockedMacosCommandSkeleton("side_effect_authorization_required");
    }
    if (input.preflight.status !== "ready") {
        return blockedMacosCommandSkeleton("preflight_not_ready");
    }
    if (input.commandContract.platform !== "macos") {
        return blockedMacosCommandSkeleton("platform_not_macos");
    }
    if (input.commandContract.status !== "accepted") {
        return blockedMacosCommandSkeleton("command_contract_not_ready");
    }
    return Object.freeze({
        status: "skeleton_ready",
        reasonCode: "macos_browser_focus_command_skeleton_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "macos",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        target: input.target,
        auditOnlyFields: [...MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
function blockedMacosCommandSkeleton(reasonCode) {
    return Object.freeze({
        status: "skeleton_blocked",
        reasonCode,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "macos",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        auditOnlyFields: [...MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
//# sourceMappingURL=yeonjang-browser-focus-macos-command-skeleton.js.map