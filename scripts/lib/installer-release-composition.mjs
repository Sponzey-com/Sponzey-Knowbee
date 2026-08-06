import { createHash } from "node:crypto"

import { verifyUnsignedInstallerManifest } from "../../packages/core/src/release/installer-integrity.js"
import { buildUnsignedInstallerManifestCandidate } from "./installer-archive.mjs"
import { renderPosixInstaller, renderPowerShellInstaller } from "./installer-bootstrap-render.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const SHA256 = /^[a-f0-9]{64}$/u

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

export function prepareInstallerReleaseCandidate(input) {
  const manifest = buildUnsignedInstallerManifestCandidate({
    releaseVersion: input?.releaseVersion,
    artifacts: input?.artifactReceipts,
  })
  if (manifest.status !== "ready") return manifest
  return {
    status: "ready",
    candidateId: `sha256:${createHash("sha256").update(manifest.rawManifestBytes).digest("hex")}`,
    rawManifestBytes: manifest.rawManifestBytes,
    manifest: manifest.manifest,
  }
}

function expectedVerifierName(target) {
  return `knowbee-installer-verify-${target}${target.startsWith("win32-") ? ".exe" : ""}`
}

function validateVerifierReceipts(values) {
  if (!Array.isArray(values)) return reject("installer_release_verifier_receipts_invalid")
  const byTarget = new Map()
  for (const value of values) {
    if (
      typeof value?.target !== "string" ||
      byTarget.has(value.target) ||
      value.name !== expectedVerifierName(value.target) ||
      !Number.isSafeInteger(value.sizeBytes) ||
      value.sizeBytes <= 0 ||
      value.sizeBytes > 64 * 1024 * 1024 ||
      typeof value.sha256 !== "string" ||
      !SHA256.test(value.sha256)
    ) {
      return reject("installer_release_verifier_receipts_invalid")
    }
    byTarget.set(value.target, value)
  }
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    if (!byTarget.has(profile.target)) {
      return blocked(`installer_release_verifier_missing:${profile.target}`)
    }
  }
  if (byTarget.size !== INSTALLER_PLATFORM_PROFILES.length)
    return reject("installer_release_verifier_receipts_invalid")
  return { status: "ready", byTarget }
}

function artifactsByTarget(manifest) {
  return new Map(manifest.artifacts.map((artifact) => [artifact.target, artifact]))
}

function validateTargetEvidence(candidateId, manifest, verifierByTarget, values) {
  if (!Array.isArray(values)) return reject("installer_release_platform_evidence_invalid")
  const byTarget = new Map()
  for (const value of values) {
    if (typeof value?.target !== "string" || byTarget.has(value.target))
      return reject("installer_release_platform_evidence_invalid")
    byTarget.set(value.target, value)
  }
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const value = byTarget.get(profile.target)
    if (!value) return blocked(`installer_release_platform_evidence_missing:${profile.target}`)
    if (value.candidateId !== candidateId)
      return blocked(`installer_release_candidate_mismatch:${profile.target}`)
    if (value.artifactSha256 !== artifactsByTarget(manifest).get(profile.target)?.sha256) {
      return blocked(`installer_release_artifact_mismatch:${profile.target}`)
    }
    if (value.verifierSha256 !== verifierByTarget.get(profile.target)?.sha256) {
      return blocked(`installer_release_verifier_evidence_mismatch:${profile.target}`)
    }
    if (value.status !== "passed")
      return blocked(`installer_release_platform_gate_failed:${profile.target}`)
    if (
      value.originTrust !== "unsigned_origin_unverified" ||
      (profile.os === "linux" &&
        (value.glibcFloor !== "2.28" ||
          value.libstdcxxFloor !== "3.4.25" ||
          (value.verifierGlibcFloor !== "2.28" && value.verifierGlibcFloor !== "static")))
    ) {
      return blocked(`installer_release_platform_gate_failed:${profile.target}`)
    }
  }
  if (byTarget.size !== INSTALLER_PLATFORM_PROFILES.length)
    return reject("installer_release_platform_evidence_invalid")
  return { status: "ready" }
}

function validateDryRuns(candidateId, manifest, values) {
  if (!Array.isArray(values)) return reject("installer_release_dry_run_invalid")
  const byTarget = new Map()
  for (const value of values) {
    if (typeof value?.target !== "string" || byTarget.has(value.target)) {
      return reject("installer_release_dry_run_invalid")
    }
    byTarget.set(value.target, value)
  }
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const value = byTarget.get(profile.target)
    if (!value) return blocked(`installer_release_dry_run_missing:${profile.target}`)
    if (value.candidateId !== candidateId || value.status !== "passed")
      return blocked(`installer_release_dry_run_failed:${profile.target}`)
    if (value.artifactSha256 !== artifactsByTarget(manifest).get(profile.target)?.sha256) {
      return blocked(`installer_release_dry_run_artifact_mismatch:${profile.target}`)
    }
  }
  return byTarget.size === INSTALLER_PLATFORM_PROFILES.length
    ? { status: "ready" }
    : reject("installer_release_dry_run_invalid")
}

function prepareNativeReadyInstaller(input, invalidReasonCode) {
  if (
    !(input?.rawManifestBytes instanceof Uint8Array) ||
    typeof input.posixTemplate !== "string" ||
    typeof input.powershellTemplate !== "string"
  ) {
    return reject(invalidReasonCode)
  }
  const unsigned = verifyUnsignedInstallerManifest({ rawManifestBytes: input.rawManifestBytes })
  if (unsigned.status !== "verified") return blocked(unsigned.reasonCode)
  const candidateId = unsigned.manifestSha256

  const verifiers = validateVerifierReceipts(input.verifierReceipts)
  if (verifiers.status !== "ready") return verifiers
  const platforms = validateTargetEvidence(
    candidateId,
    unsigned.manifest,
    verifiers.byTarget,
    input.platformEvidence,
  )
  if (platforms.status !== "ready") return platforms

  const verifierSha256ByTarget = Object.fromEntries(
    [...verifiers.byTarget].map(([target, value]) => [target, value.sha256]),
  )
  let installSh
  let installPs1
  try {
    installSh = renderPosixInstaller({
      template: input.posixTemplate,
      verifierSha256ByTarget,
    })
    installPs1 = renderPowerShellInstaller({
      template: input.powershellTemplate,
      verifierSha256ByTarget,
    })
  } catch {
    return blocked("installer_release_bootstrap_render_failed")
  }
  return {
    status: "ready",
    candidateId,
    manifest: unsigned.manifest,
    rawManifestBytes: Buffer.from(input.rawManifestBytes),
    installSh,
    installPs1,
    originTrust: unsigned.originTrust,
  }
}

export function prepareInstallerReleaseRehearsal(input) {
  const prepared = prepareNativeReadyInstaller(input, "installer_release_rehearsal_input_invalid")
  if (prepared.status !== "ready") return prepared
  return {
    ...prepared,
    rehearsalGate: Object.freeze({
      status: "native_ready",
      candidateId: prepared.candidateId,
      targetCount: INSTALLER_PLATFORM_PROFILES.length,
    }),
  }
}

export function finalizeInstallerReleaseCandidate(input) {
  const prepared = prepareNativeReadyInstaller(input, "installer_release_finalize_input_invalid")
  if (prepared.status !== "ready") return prepared
  const dryRuns = validateDryRuns(prepared.candidateId, prepared.manifest, input.dryRunReceipts)
  if (dryRuns.status !== "ready") return dryRuns
  if (
    input.rollbackReceipt?.kind !== "knowbee.installer.rollback_matrix_receipt" ||
    input.rollbackReceipt.schemaVersion !== 1 ||
    input.rollbackReceipt.status !== "passed" ||
    input.rollbackReceipt.targetCount !== INSTALLER_PLATFORM_PROFILES.length ||
    Object.keys(input.rollbackReceipt).length !== 5
  ) {
    return blocked("installer_release_rollback_gate_failed")
  }
  if (input.rollbackReceipt.candidateId !== prepared.candidateId)
    return blocked("installer_release_rollback_candidate_mismatch")
  return {
    status: "ready",
    candidateId: prepared.candidateId,
    manifest: prepared.manifest,
    rawManifestBytes: prepared.rawManifestBytes,
    installSh: prepared.installSh,
    installPs1: prepared.installPs1,
    releaseGate: Object.freeze({
      status: "passed",
      candidateId: prepared.candidateId,
      originTrust: prepared.originTrust,
      targetCount: INSTALLER_PLATFORM_PROFILES.length,
      rollback: "passed",
    }),
  }
}
