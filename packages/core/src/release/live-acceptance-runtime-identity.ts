export interface LiveAcceptanceRuntimeIdentitySnapshot {
  readonly buildId: string
  readonly bundleSha256: string
  readonly processStartedAt: string
  readonly artifactBuiltAt: string
  readonly buildRequired: boolean
  readonly restartRequired: boolean
  readonly manifestMatchesArtifact: boolean
  readonly activeBundleMatchesArtifact: boolean
}

export interface LiveAcceptanceRuntimeIdentityReceipt {
  readonly buildId: string
  readonly bundleSha256: `sha256:${string}`
  readonly processStartedAt: string
  readonly artifactBuiltAt: string
  readonly buildRequired: false
  readonly restartRequired: false
}

export type LiveAcceptanceRuntimeIdentityAdmission =
  | Readonly<{
      status: "verified"
      receipt: Readonly<LiveAcceptanceRuntimeIdentityReceipt>
    }>
  | Readonly<{
      status: "blocked"
      reasonCode:
        | "live_acceptance_runtime_build_required"
        | "live_acceptance_runtime_restart_required"
        | "live_acceptance_runtime_bundle_identity_mismatch"
        | "live_acceptance_runtime_identity_invalid"
    }>

const BUILD_ID_PATTERN = /^[A-Za-z0-9._:+-]{1,128}$/u
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u

function validIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false
  return Number.isFinite(Date.parse(value))
}

function blocked(
  reasonCode: Extract<LiveAcceptanceRuntimeIdentityAdmission, { status: "blocked" }>["reasonCode"],
): LiveAcceptanceRuntimeIdentityAdmission {
  return Object.freeze({ status: "blocked", reasonCode })
}

export function admitLiveAcceptanceRuntimeIdentity(
  snapshot: Readonly<LiveAcceptanceRuntimeIdentitySnapshot>,
): LiveAcceptanceRuntimeIdentityAdmission {
  if (
    !BUILD_ID_PATTERN.test(snapshot.buildId)
    || !SHA256_PATTERN.test(snapshot.bundleSha256)
    || !validIsoTimestamp(snapshot.processStartedAt)
    || !validIsoTimestamp(snapshot.artifactBuiltAt)
  ) {
    return blocked("live_acceptance_runtime_identity_invalid")
  }
  if (snapshot.buildRequired) return blocked("live_acceptance_runtime_build_required")
  if (
    snapshot.restartRequired
    || Date.parse(snapshot.processStartedAt) < Date.parse(snapshot.artifactBuiltAt)
  ) {
    return blocked("live_acceptance_runtime_restart_required")
  }
  if (!snapshot.manifestMatchesArtifact || !snapshot.activeBundleMatchesArtifact) {
    return blocked("live_acceptance_runtime_bundle_identity_mismatch")
  }

  const receipt: LiveAcceptanceRuntimeIdentityReceipt = Object.freeze({
    buildId: snapshot.buildId,
    bundleSha256: snapshot.bundleSha256 as `sha256:${string}`,
    processStartedAt: snapshot.processStartedAt,
    artifactBuiltAt: snapshot.artifactBuiltAt,
    buildRequired: false,
    restartRequired: false,
  })
  return Object.freeze({ status: "verified", receipt })
}
