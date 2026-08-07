import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildInstallerCleanMachineEvidence } from "../scripts/lib/installer-clean-machine-evidence.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"

const candidateId = `sha256:${"f".repeat(64)}`
const requiredChecks = [
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
] as const

function fixture() {
  const artifacts = INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
    target: profile.target,
    sha256: String.fromCharCode(97 + index).repeat(64),
  }))
  const platformEvidence = INSTALLER_PLATFORM_PROFILES.map((profile) => ({
    target: profile.target,
    candidateId,
    artifactSha256: artifacts.find((value) => value.target === profile.target)?.sha256,
    verifierSha256: "1".repeat(64),
    originTrust: "unsigned_origin_unverified",
    status: "passed",
  }))
  const receipts = INSTALLER_PLATFORM_PROFILES.map((profile) => ({
    kind: "knowbee.installer.clean_machine_receipt",
    schemaVersion: 1,
    target: profile.target,
    candidateId,
    artifactSha256: artifacts.find((value) => value.target === profile.target)?.sha256,
    originTrust: "unsigned_origin_unverified",
    status: "passed",
    interaction: { commandCount: 1, confirmationCount: 0, followUpCommandCount: 0 },
    osWarning: { observed: true, acknowledged: true },
    checks: Object.fromEntries(requiredChecks.map((check) => [check, true])),
  }))
  return { artifacts, platformEvidence, receipts }
}

describe("task021 installer clean-machine evidence", () => {
  it("derives the clean-machine candidate ID from exact manifest bytes", () => {
    const workflow = readFileSync(".github/workflows/installer-clean-machine-evidence.yml", "utf8")
    expect(workflow).toContain('sha256sum release/candidate/prepared/installer-manifest.json')
    expect(workflow).not.toContain("manifestSha256)' release/candidate/prepared/installer-manifest.json")
  })

  it("requires every target, unsigned disclosure, OS-warning acknowledgement, one-shot budget and every user-goal post-check", () => {
    const input = fixture()
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...input })).toEqual({
      status: "ready",
      platformEvidence: input.platformEvidence,
      cleanMachineReceipts: input.receipts,
      dryRunReceipts: INSTALLER_PLATFORM_PROFILES.map((profile) => ({
        target: profile.target,
        candidateId,
        artifactSha256: input.artifacts.find((value) => value.target === profile.target)?.sha256,
        status: "passed",
      })),
      rollbackReceipt: {
        kind: "knowbee.installer.rollback_matrix_receipt",
        schemaVersion: 1,
        candidateId,
        status: "passed",
        targetCount: 5,
      },
    })
  })

  it("blocks stale origin/warning, a stale candidate, extra confirmation, missing reboot or partial target set", () => {
    const origin = fixture()
    origin.receipts[0] = { ...origin.receipts[0], originTrust: "publisher_authenticated" }
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...origin })).toEqual({
      status: "rejected",
      reasonCode: "installer_clean_receipts_invalid",
    })

    const warning = fixture()
    warning.receipts[1] = {
      ...warning.receipts[1],
      osWarning: { observed: true, acknowledged: false },
    }
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...warning })).toEqual({
      status: "rejected",
      reasonCode: "installer_clean_receipts_invalid",
    })

    const stale = fixture()
    stale.receipts[0] = { ...stale.receipts[0], candidateId: `sha256:${"e".repeat(64)}` }
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...stale })).toEqual({
      status: "blocked",
      reasonCode: "installer_clean_candidate_mismatch:darwin-arm64",
    })

    const prompts = fixture()
    prompts.receipts[1] = {
      ...prompts.receipts[1],
      interaction: { commandCount: 1, confirmationCount: 2, followUpCommandCount: 0 },
    }
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...prompts })).toEqual({
      status: "blocked",
      reasonCode: "installer_clean_interaction_budget_failed:darwin-x64",
    })

    const reboot = fixture()
    reboot.receipts[2] = {
      ...reboot.receipts[2],
      checks: { ...reboot.receipts[2].checks, rebootRecovery: false },
    }
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...reboot })).toEqual({
      status: "blocked",
      reasonCode: "installer_clean_goal_check_failed:linux-x64:rebootRecovery",
    })

    const partial = fixture()
    partial.receipts.pop()
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...partial })).toEqual({
      status: "rejected",
      reasonCode: "installer_clean_receipts_invalid",
    })

    const leaking = fixture()
    leaking.receipts[0] = {
      ...leaking.receipts[0],
      rawPath: "/private/runner/work",
    } as (typeof leaking.receipts)[number]
    expect(buildInstallerCleanMachineEvidence({ candidateId, ...leaking })).toEqual({
      status: "rejected",
      reasonCode: "installer_clean_receipts_invalid",
    })
  })
})
