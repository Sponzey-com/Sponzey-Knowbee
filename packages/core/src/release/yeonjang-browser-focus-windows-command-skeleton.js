import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
const WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
    "rawWindowTitle",
    "rawUrl",
    "queryToken",
    "pid",
    "windowId",
    "tabId",
    "powershellScriptText",
    "win32WindowHandle",
];
export function buildYeonjangBrowserFocusWindowsCommandSkeleton(input) {
    if (input.preflight.reasonCode === "side_effect_authorization_required") {
        return blockedWindowsCommandSkeleton("side_effect_authorization_required");
    }
    if (input.preflight.status !== "ready") {
        return blockedWindowsCommandSkeleton("preflight_not_ready");
    }
    if (input.commandContract.platform !== "windows") {
        return blockedWindowsCommandSkeleton("platform_not_windows");
    }
    if (input.commandContract.status !== "accepted") {
        return blockedWindowsCommandSkeleton(windowsReasonFromCommandContract(input.commandContract.reasonCode));
    }
    return Object.freeze({
        status: "skeleton_ready",
        reasonCode: "windows_browser_focus_command_skeleton_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "windows",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        target: input.target,
        auditOnlyFields: [...WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
function windowsReasonFromCommandContract(reasonCode) {
    if (reasonCode === "command_backend_required")
        return "command_backend_required";
    if (reasonCode === "focused_target_observation_backend_required") {
        return "focused_target_observation_backend_required";
    }
    if (reasonCode === "headless_unavailable")
        return "headless_unavailable";
    return "preflight_not_ready";
}
function blockedWindowsCommandSkeleton(reasonCode) {
    return Object.freeze({
        status: "skeleton_blocked",
        reasonCode,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "windows",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        auditOnlyFields: [...WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
//# sourceMappingURL=yeonjang-browser-focus-windows-command-skeleton.js.map