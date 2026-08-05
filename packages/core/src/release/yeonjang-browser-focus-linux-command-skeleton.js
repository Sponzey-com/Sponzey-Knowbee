import { YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
const LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
    "rawWindowTitle",
    "rawUrl",
    "queryToken",
    "pid",
    "windowId",
    "tabId",
    "xdotoolScriptText",
    "wmctrlScriptText",
    "waylandPortalRequest",
];
export function buildYeonjangBrowserFocusLinuxCommandSkeleton(input) {
    if (input.preflight.reasonCode === "side_effect_authorization_required") {
        return blockedLinuxCommandSkeleton("side_effect_authorization_required");
    }
    if (input.preflight.status !== "ready") {
        return blockedLinuxCommandSkeleton("preflight_not_ready");
    }
    if (input.commandContract.platform !== "linux") {
        return blockedLinuxCommandSkeleton("platform_not_linux");
    }
    if (input.commandContract.status !== "accepted") {
        return blockedLinuxCommandSkeleton(linuxReasonFromCommandContract(input.commandContract.reasonCode));
    }
    return Object.freeze({
        status: "skeleton_ready",
        reasonCode: "linux_browser_focus_command_skeleton_ready",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "linux",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        target: input.target,
        auditOnlyFields: [...LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
function linuxReasonFromCommandContract(reasonCode) {
    if (reasonCode === "command_backend_required")
        return "command_backend_required";
    if (reasonCode === "focused_target_observation_backend_required") {
        return "focused_target_observation_backend_required";
    }
    if (reasonCode === "headless_unavailable")
        return "headless_unavailable";
    return "preflight_not_ready";
}
function blockedLinuxCommandSkeleton(reasonCode) {
    return Object.freeze({
        status: "skeleton_blocked",
        reasonCode,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        platform: "linux",
        executeOsFocusNow: false,
        commandAccepted: false,
        requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
        requiresFocusedTargetObservation: true,
        postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
        auditOnlyFields: [...LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
    });
}
//# sourceMappingURL=yeonjang-browser-focus-linux-command-skeleton.js.map