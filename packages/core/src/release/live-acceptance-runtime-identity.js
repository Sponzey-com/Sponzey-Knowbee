const BUILD_ID_PATTERN = /^[A-Za-z0-9._:+-]{1,128}$/u;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function validIsoTimestamp(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
        return false;
    return Number.isFinite(Date.parse(value));
}
function blocked(reasonCode) {
    return Object.freeze({ status: "blocked", reasonCode });
}
export function admitLiveAcceptanceRuntimeIdentity(snapshot) {
    if (!BUILD_ID_PATTERN.test(snapshot.buildId)
        || !SHA256_PATTERN.test(snapshot.bundleSha256)
        || !validIsoTimestamp(snapshot.processStartedAt)
        || !validIsoTimestamp(snapshot.artifactBuiltAt)) {
        return blocked("live_acceptance_runtime_identity_invalid");
    }
    if (snapshot.buildRequired)
        return blocked("live_acceptance_runtime_build_required");
    if (snapshot.restartRequired
        || Date.parse(snapshot.processStartedAt) < Date.parse(snapshot.artifactBuiltAt)) {
        return blocked("live_acceptance_runtime_restart_required");
    }
    if (!snapshot.manifestMatchesArtifact || !snapshot.activeBundleMatchesArtifact) {
        return blocked("live_acceptance_runtime_bundle_identity_mismatch");
    }
    const receipt = Object.freeze({
        buildId: snapshot.buildId,
        bundleSha256: snapshot.bundleSha256,
        processStartedAt: snapshot.processStartedAt,
        artifactBuiltAt: snapshot.artifactBuiltAt,
        buildRequired: false,
        restartRequired: false,
    });
    return Object.freeze({ status: "verified", receipt });
}
//# sourceMappingURL=live-acceptance-runtime-identity.js.map