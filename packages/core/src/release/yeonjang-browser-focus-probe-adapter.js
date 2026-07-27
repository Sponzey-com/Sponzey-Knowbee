export function assembleYeonjangBrowserFocusReadinessSourcesFromProbes(input) {
    return input.records.map((record) => Object.freeze({
        publicTargetName: normalizePublicName(record.publicTargetName),
        ...(record.internalInstanceId?.trim() ? { internalInstanceId: record.internalInstanceId.trim() } : {}),
        platform: record.platform,
        desktopSession: record.desktopSessionProbe.status,
        browserFocusCapabilityAdvertised: record.commandBackendProbe.status !== "unsupported",
        browserControlPermissionGranted: record.browserControlPermissionProbe.status === "granted",
        focusedTargetObservationPermissionGranted: record.focusedTargetObservationPermissionProbe
            ? record.focusedTargetObservationPermissionProbe.status === "granted"
            : undefined,
        commandBackend: backendSignalSource(record.commandBackendProbe),
        observationBackend: backendSignalSource(record.focusedTargetObservationBackendProbe),
    }));
}
function backendSignalSource(probe) {
    return Object.freeze({
        status: probe.status,
        evidenceSource: "platform_backend_probe",
        evidenceRef: normalizeEvidenceRef(probe.evidenceRef),
        ...(probe.rawDetails ? { auditOnlyDetails: probe.rawDetails } : {}),
    });
}
function normalizePublicName(value) {
    const normalized = value.trim().replace(/\s+/gu, " ");
    return normalized || "Yeonjang target";
}
function normalizeEvidenceRef(value) {
    const normalized = value.trim().replace(/\s+/gu, "-");
    return normalized || "probe:evidence:missing";
}
//# sourceMappingURL=yeonjang-browser-focus-probe-adapter.js.map