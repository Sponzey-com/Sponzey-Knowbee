import { YEONJANG_BROWSER_FOCUS_CONTRACT, evaluateYeonjangBrowserFocusPostCheck, } from "../capabilities/yeonjang-browser-focus-contract.js";
export function bridgeYeonjangBrowserFocusMacosExecutorResult(input) {
    if (input.skeleton.status !== "skeleton_ready") {
        return Object.freeze({
            schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
            method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
            toolName: "yeonjang_browser_focus",
            platform: "macos",
            status: "bridge_blocked",
            reasonCode: "command_skeleton_not_ready",
            postCheckState: "BLOCKED",
            executorReasonCode: "not_invoked",
            commandAccepted: false,
            goalSuccess: false,
            addProductionBindingNow: false,
            dispatcherRegistrationNow: false,
        });
    }
    const postCheck = evaluateYeonjangBrowserFocusPostCheck({
        commandAccepted: input.executorResult.commandAccepted,
        expectedTarget: input.skeleton.target,
        ...(input.observedFocusedTarget ? { observedFocusedTarget: input.observedFocusedTarget } : {}),
    });
    return projectPostCheck({
        postCheck,
        executorReasonCode: input.executorResult.reasonCode,
    });
}
function projectPostCheck(input) {
    if (input.postCheck.state === "VERIFIED") {
        return Object.freeze({
            schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
            method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
            toolName: "yeonjang_browser_focus",
            platform: "macos",
            status: "bridge_verified",
            reasonCode: input.postCheck.reasonCode,
            postCheckState: input.postCheck.state,
            executorReasonCode: input.executorReasonCode,
            commandAccepted: true,
            goalSuccess: true,
            addProductionBindingNow: false,
            dispatcherRegistrationNow: false,
            expectedTarget: projectPublicTargetEvidence(input.postCheck.evidence.expectedTarget),
            observedFocusedTarget: projectPublicTargetEvidence(input.postCheck.evidence.observedFocusedTarget),
        });
    }
    if (input.postCheck.state === "MANUAL_INTERVENTION") {
        return Object.freeze({
            schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
            method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
            toolName: "yeonjang_browser_focus",
            platform: "macos",
            status: "bridge_manual_intervention",
            reasonCode: input.postCheck.reasonCode,
            postCheckState: input.postCheck.state,
            executorReasonCode: input.executorReasonCode,
            commandAccepted: true,
            goalSuccess: false,
            addProductionBindingNow: false,
            dispatcherRegistrationNow: false,
            expectedTarget: projectPublicTargetEvidence(input.postCheck.evidence.expectedTarget),
            ...(input.postCheck.evidence.observedFocusedTarget
                ? { observedFocusedTarget: projectPublicTargetEvidence(input.postCheck.evidence.observedFocusedTarget) }
                : {}),
        });
    }
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        toolName: "yeonjang_browser_focus",
        platform: "macos",
        status: "bridge_failed",
        reasonCode: input.postCheck.reasonCode,
        postCheckState: input.postCheck.state,
        executorReasonCode: input.executorReasonCode,
        commandAccepted: false,
        goalSuccess: false,
        addProductionBindingNow: false,
        dispatcherRegistrationNow: false,
        expectedTarget: projectPublicTargetEvidence(input.postCheck.evidence.expectedTarget),
        ...(input.postCheck.evidence.observedFocusedTarget
            ? { observedFocusedTarget: projectPublicTargetEvidence(input.postCheck.evidence.observedFocusedTarget) }
            : {}),
    });
}
function projectPublicTargetEvidence(target) {
    return Object.freeze({
        schemaVersion: target.schemaVersion,
        targetKind: target.targetKind,
        ...(target.targetAlias ? { targetAlias: target.targetAlias } : {}),
        displayName: target.displayName,
        ...(target.processName ? { processName: target.processName } : {}),
        ...(target.titleHash ? { titleHash: target.titleHash } : {}),
        ...(typeof target.titleLength === "number" ? { titleLength: target.titleLength } : {}),
        ...(target.urlScheme ? { urlScheme: target.urlScheme } : {}),
        ...(target.urlHash ? { urlHash: target.urlHash } : {}),
        ...(typeof target.urlLength === "number" ? { urlLength: target.urlLength } : {}),
    });
}
//# sourceMappingURL=yeonjang-browser-focus-macos-executor-release-bridge.js.map