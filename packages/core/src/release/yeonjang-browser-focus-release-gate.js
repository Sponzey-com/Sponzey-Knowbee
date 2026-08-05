import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
export const YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD = "input.focused_target";
export const YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS = [
    YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
];
export function evaluateYeonjangBrowserFocusReleaseGate(input) {
    const command = readinessForMethod(input.capabilityReadiness, YEONJANG_BROWSER_FOCUS_CONTRACT.method);
    const observation = readinessForMethod(input.capabilityReadiness, YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD);
    const evidenceRefs = publicEvidenceRefs([command?.evidenceRef, observation?.evidenceRef]);
    if (command?.status !== "passed") {
        return blockedReleaseGate({
            platform: input.platform,
            reasonCode: "release_gate_not_ready",
            blockedMethod: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
            blockedStatus: command?.status ?? "missing",
            evidenceRefs,
        });
    }
    if (observation?.status !== "passed") {
        return blockedReleaseGate({
            platform: input.platform,
            reasonCode: "focused_target_observation_backend_required",
            blockedMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
            blockedStatus: observation?.status ?? "missing",
            evidenceRefs,
        });
    }
    return Object.freeze({
        status: "ready",
        reasonCode: "browser_focus_release_gate_ready",
        platform: input.platform,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        observationMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
        evidenceRefs,
    });
}
function readinessForMethod(readiness, method) {
    return readiness.find((item) => item.method === method);
}
function publicEvidenceRefs(values) {
    return Object.freeze([...new Set(values.map((value) => value?.trim()).filter((value) => Boolean(value)))].sort());
}
function blockedReleaseGate(input) {
    return Object.freeze({
        status: "blocked",
        reasonCode: input.reasonCode,
        platform: input.platform,
        method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
        observationMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
        blockedMethod: input.blockedMethod,
        blockedStatus: input.blockedStatus,
        evidenceRefs: input.evidenceRefs,
    });
}
//# sourceMappingURL=yeonjang-browser-focus-release-gate.js.map