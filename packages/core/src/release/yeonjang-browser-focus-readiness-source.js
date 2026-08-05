import { buildYeonjangBrowserFocusReadinessProjection, YEONJANG_BROWSER_FOCUS_CONTRACT, } from "../capabilities/yeonjang-browser-focus-contract.js";
import { YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD } from "./yeonjang-browser-focus-release-gate.js";
export function projectYeonjangBrowserFocusBackendReadinessSources(input) {
    const publicSources = input.sources.flatMap(projectPublicSource);
    const readinessProjection = buildYeonjangBrowserFocusReadinessProjection({
        observations: publicSources.map((source) => ({
            publicTargetName: source.publicTargetName,
            platform: source.platform,
            desktopSession: source.desktopSession,
            capabilitySupported: source.commandBackend.status !== "unsupported" &&
                source.commandBackend.status !== "missing" &&
                source.commandBackend.status !== "unknown",
            permissionGranted: source.commandBackend.status !== "permission_required" &&
                source.observationBackend.status !== "permission_required",
            commandBackendAvailable: source.commandBackend.status === "ready",
            observationBackendAvailable: source.observationBackend.status === "ready",
        })),
    });
    return Object.freeze({
        schemaVersion: "yeonjang-browser-focus-readiness-source-v1",
        publicSources: Object.freeze(publicSources),
        readinessProjection,
        capabilityReceipts: Object.freeze(publicSources.flatMap((source) => capabilityReceiptsFromPublicSource(source, input.observedAt))),
    });
}
function projectPublicSource(source) {
    if (source.platform === "unknown")
        return [];
    const publicTargetName = normalizePublicName(source.publicTargetName);
    const commandStatus = normalizeBackendStatus({
        backendStatus: source.commandBackend.status,
        desktopSession: source.desktopSession,
        permissionGranted: source.browserControlPermissionGranted,
        capabilityAdvertised: source.browserFocusCapabilityAdvertised,
    });
    const observationStatus = normalizeBackendStatus({
        backendStatus: source.observationBackend.status,
        desktopSession: source.desktopSession,
        permissionGranted: source.focusedTargetObservationPermissionGranted ?? true,
        capabilityAdvertised: true,
    });
    return [Object.freeze({
            publicTargetName,
            platform: source.platform,
            desktopSession: source.desktopSession,
            commandBackend: Object.freeze({
                method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
                status: commandStatus,
                evidenceSource: source.commandBackend.evidenceSource,
                evidenceRef: normalizeEvidenceRef(source.commandBackend.evidenceRef),
            }),
            observationBackend: Object.freeze({
                method: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
                status: observationStatus,
                evidenceSource: source.observationBackend.evidenceSource,
                evidenceRef: normalizeEvidenceRef(source.observationBackend.evidenceRef),
            }),
        })];
}
function normalizeBackendStatus(input) {
    if (input.desktopSession === "headless")
        return "headless_unavailable";
    if (!input.capabilityAdvertised)
        return "unsupported";
    if (!input.permissionGranted)
        return "permission_required";
    return input.backendStatus;
}
function capabilityReceiptsFromPublicSource(source, observedAt) {
    return [
        receiptFromBackend({
            platform: source.platform,
            method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
            status: source.commandBackend.status,
            evidenceRef: source.commandBackend.evidenceRef,
            observedAt,
        }),
        receiptFromBackend({
            platform: source.platform,
            method: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
            status: source.observationBackend.status,
            evidenceRef: source.observationBackend.evidenceRef,
            observedAt,
        }),
    ];
}
function receiptFromBackend(input) {
    const status = receiptHealthFromBackendStatus(input.status);
    return Object.freeze({
        platform: input.platform,
        method: input.method,
        ...status,
        observedAt: input.observedAt,
        evidenceRef: input.evidenceRef,
    });
}
function receiptHealthFromBackendStatus(status) {
    switch (status) {
        case "ready":
            return { supported: true, permissionEnabled: true, toolHealthStatus: "ready" };
        case "permission_required":
            return { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" };
        case "unsupported":
        case "headless_unavailable":
            return { supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" };
        case "missing":
        case "unknown":
            return { supported: false, permissionEnabled: false, toolHealthStatus: "unknown" };
    }
}
function normalizePublicName(value) {
    const normalized = value.trim().replace(/\s+/gu, " ");
    return normalized || "Yeonjang target";
}
function normalizeEvidenceRef(value) {
    const normalized = value.trim().replace(/\s+/gu, "-");
    return normalized || "capability:evidence:missing";
}
//# sourceMappingURL=yeonjang-browser-focus-readiness-source.js.map