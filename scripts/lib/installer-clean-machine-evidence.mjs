import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const CANDIDATE_ID = /^sha256:[a-f0-9]{64}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const REQUIRED_CHECKS = Object.freeze([
  "dryRun",
  "onlineInstall",
  "offlineInstall",
  "serviceIdentity",
  "healthIdentity",
  "webuiReachable",
  "noService",
  "noStart",
  "noBrowser",
  "pathAfterLogin",
  "sameVersion",
  "upgrade",
  "forcedRollback",
  "reinstall",
  "uninstallPreservedState",
  "rebootRecovery",
])

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

function mapExactTargets(values, reasonCode, validate) {
  if (!Array.isArray(values)) return reject(reasonCode)
  const byTarget = new Map()
  for (const value of values) {
    if (typeof value?.target !== "string" || byTarget.has(value.target) || !validate(value)) {
      return reject(reasonCode)
    }
    byTarget.set(value.target, value)
  }
  const targets = new Set(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target))
  if (
    byTarget.size !== targets.size ||
    [...byTarget.keys()].some((target) => !targets.has(target))
  ) {
    return reject(reasonCode)
  }
  return { status: "ready", byTarget }
}

export function buildInstallerCleanMachineEvidence(input) {
  if (typeof input?.candidateId !== "string" || !CANDIDATE_ID.test(input.candidateId)) {
    return reject("installer_clean_input_invalid")
  }
  const artifacts = mapExactTargets(
    input.artifacts,
    "installer_clean_artifacts_invalid",
    (value) => typeof value.sha256 === "string" && SHA256.test(value.sha256),
  )
  if (artifacts.status !== "ready") return artifacts
  const platforms = mapExactTargets(
    input.platformEvidence,
    "installer_clean_platform_evidence_invalid",
    (value) =>
      value.status === "passed" &&
      value.originTrust === "unsigned_origin_unverified" &&
      typeof value.candidateId === "string" &&
      CANDIDATE_ID.test(value.candidateId) &&
      typeof value.artifactSha256 === "string" &&
      SHA256.test(value.artifactSha256),
  )
  if (platforms.status !== "ready") return platforms
  const receipts = mapExactTargets(
    input.receipts,
    "installer_clean_receipts_invalid",
    (value) =>
      Object.keys(value).length === 10 &&
      value.kind === "knowbee.installer.clean_machine_receipt" &&
      value.schemaVersion === 1 &&
      value.status === "passed" &&
      typeof value.candidateId === "string" &&
      CANDIDATE_ID.test(value.candidateId) &&
      typeof value.artifactSha256 === "string" &&
      SHA256.test(value.artifactSha256) &&
      value.originTrust === "unsigned_origin_unverified" &&
      typeof value.interaction === "object" &&
      value.interaction !== null &&
      Object.keys(value.interaction).length === 3 &&
      typeof value.osWarning === "object" &&
      value.osWarning !== null &&
      Object.keys(value.osWarning).length === 2 &&
      value.osWarning.observed === true &&
      value.osWarning.acknowledged === true &&
      typeof value.checks === "object" &&
      value.checks !== null,
  )
  if (receipts.status !== "ready") return receipts

  const cleanMachineReceipts = []
  const dryRunReceipts = []
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const artifact = artifacts.byTarget.get(profile.target)
    const platform = platforms.byTarget.get(profile.target)
    const receipt = receipts.byTarget.get(profile.target)
    if (platform.candidateId !== input.candidateId) {
      return blocked(`installer_clean_native_candidate_mismatch:${profile.target}`)
    }
    if (platform.artifactSha256 !== artifact.sha256 || receipt.artifactSha256 !== artifact.sha256) {
      return blocked(`installer_clean_artifact_mismatch:${profile.target}`)
    }
    if (receipt.candidateId !== input.candidateId) {
      return blocked(`installer_clean_candidate_mismatch:${profile.target}`)
    }
    if (
      receipt.interaction.commandCount !== 1 ||
      !Number.isSafeInteger(receipt.interaction.confirmationCount) ||
      receipt.interaction.confirmationCount < 0 ||
      receipt.interaction.confirmationCount > 1 ||
      receipt.interaction.followUpCommandCount !== 0
    ) {
      return blocked(`installer_clean_interaction_budget_failed:${profile.target}`)
    }
    if (
      Object.keys(receipt.checks).length !== REQUIRED_CHECKS.length ||
      REQUIRED_CHECKS.some((check) => receipt.checks[check] !== true)
    ) {
      const failed = REQUIRED_CHECKS.find((check) => receipt.checks[check] !== true) ?? "unknown"
      return blocked(`installer_clean_goal_check_failed:${profile.target}:${failed}`)
    }
    cleanMachineReceipts.push(receipt)
    dryRunReceipts.push({
      target: profile.target,
      candidateId: input.candidateId,
      artifactSha256: artifact.sha256,
      status: "passed",
    })
  }
  return {
    status: "ready",
    platformEvidence: INSTALLER_PLATFORM_PROFILES.map((profile) =>
      platforms.byTarget.get(profile.target),
    ),
    cleanMachineReceipts: Object.freeze(cleanMachineReceipts),
    dryRunReceipts: Object.freeze(dryRunReceipts),
    rollbackReceipt: Object.freeze({
      kind: "knowbee.installer.rollback_matrix_receipt",
      schemaVersion: 1,
      candidateId: input.candidateId,
      status: "passed",
      targetCount: INSTALLER_PLATFORM_PROFILES.length,
    }),
  }
}
