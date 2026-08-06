import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const SHA256 = /^[a-f0-9]{64}$/u
const CANDIDATE_ID = /^sha256:[a-f0-9]{64}$/u

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

export function compareNativeVersion(left, right) {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function maxVersion(values) {
  return values.length === 0
    ? undefined
    : values.reduce((highest, value) =>
        compareNativeVersion(value, highest) > 0 ? value : highest,
      )
}

export function parseElfVersionRequirements(value) {
  if (typeof value !== "string" || value.length > 16 * 1024 * 1024) {
    return reject("installer_elf_version_output_invalid")
  }
  const glibc = [...value.matchAll(/\bGLIBC_(\d+(?:\.\d+)+)\b/gu)].map((match) => match[1])
  const glibcxx = [...value.matchAll(/\bGLIBCXX_(\d+(?:\.\d+)+)\b/gu)].map((match) => match[1])
  return { maxGlibc: maxVersion(glibc), maxGlibcxx: maxVersion(glibcxx) }
}

function mapExactReceipts(values, reasonCode) {
  if (!Array.isArray(values)) return reject(reasonCode)
  const byTarget = new Map()
  for (const value of values) {
    if (
      typeof value?.target !== "string" ||
      byTarget.has(value.target) ||
      typeof value.sha256 !== "string" ||
      !SHA256.test(value.sha256)
    ) {
      return reject(reasonCode)
    }
    byTarget.set(value.target, value)
  }
  const supported = new Set(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target))
  if (
    byTarget.size !== supported.size ||
    [...byTarget.keys()].some((target) => !supported.has(target))
  ) {
    return reject(reasonCode)
  }
  return { status: "ready", byTarget }
}

function linuxPassed(value) {
  return (
    typeof value.maxGlibc === "string" &&
    compareNativeVersion(value.maxGlibc, "2.28") <= 0 &&
    (value.maxGlibcxx === undefined ||
      (typeof value.maxGlibcxx === "string" &&
        compareNativeVersion(value.maxGlibcxx, "3.4.25") <= 0)) &&
    (value.verifierLinkage === "static" ||
      (typeof value.verifierMaxGlibc === "string" &&
        compareNativeVersion(value.verifierMaxGlibc, "2.28") <= 0))
  )
}

export function buildInstallerNativePlatformEvidence(input) {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.candidateId !== "string" ||
    !CANDIDATE_ID.test(input.candidateId)
  ) {
    return reject("installer_native_evidence_input_invalid")
  }
  const artifacts = mapExactReceipts(input.artifacts, "installer_native_artifact_receipts_invalid")
  if (artifacts.status !== "ready") return artifacts
  const verifiers = mapExactReceipts(input.verifiers, "installer_native_verifier_receipts_invalid")
  if (verifiers.status !== "ready") return verifiers
  if (!Array.isArray(input.attestations)) return reject("installer_native_attestations_invalid")
  const attestations = new Map()
  for (const value of input.attestations) {
    if (
      value?.kind !== "knowbee.installer.native_attestation" ||
      value.schemaVersion !== 1 ||
      typeof value.target !== "string" ||
      attestations.has(value.target)
    ) {
      return reject("installer_native_attestations_invalid")
    }
    attestations.set(value.target, value)
  }
  if (attestations.size !== INSTALLER_PLATFORM_PROFILES.length) {
    return reject("installer_native_attestations_invalid")
  }

  const evidence = []
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const attestation = attestations.get(profile.target)
    if (!attestation) return reject("installer_native_attestations_invalid")
    if (attestation.candidateId !== input.candidateId) {
      return blocked(`installer_native_candidate_mismatch:${profile.target}`)
    }
    if (attestation.artifactSha256 !== artifacts.byTarget.get(profile.target).sha256) {
      return blocked(`installer_native_artifact_mismatch:${profile.target}`)
    }
    if (attestation.verifierSha256 !== verifiers.byTarget.get(profile.target).sha256) {
      return blocked(`installer_native_verifier_mismatch:${profile.target}`)
    }
    if (
      attestation.status !== "passed" ||
      attestation.originTrust !== "unsigned_origin_unverified" ||
      !Number.isSafeInteger(attestation.nativeFileCount) ||
      attestation.nativeFileCount <= 0 ||
      (profile.os === "linux" && !linuxPassed(attestation))
    ) {
      return blocked(`installer_native_platform_gate_failed:${profile.target}`)
    }
    evidence.push({
      target: profile.target,
      candidateId: input.candidateId,
      artifactSha256: attestation.artifactSha256,
      verifierSha256: attestation.verifierSha256,
      status: "passed",
      originTrust: "unsigned_origin_unverified",
      nativeFileCount: attestation.nativeFileCount,
      ...(profile.os === "linux"
        ? {
              glibcFloor: "2.28",
              libstdcxxFloor: "3.4.25",
              verifierGlibcFloor: attestation.verifierLinkage === "static" ? "static" : "2.28",
          }
        : {}),
    })
  }
  return { status: "ready", evidence: Object.freeze(evidence) }
}
