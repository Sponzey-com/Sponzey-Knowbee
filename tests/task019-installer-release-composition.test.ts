import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  finalizeInstallerReleaseCandidate,
  prepareInstallerReleaseCandidate,
  prepareInstallerReleaseRehearsal,
} from "../scripts/lib/installer-release-composition.mjs"

const targets = [
  ["darwin-arm64", "tar.gz"],
  ["darwin-x64", "tar.gz"],
  ["linux-x64", "tar.gz"],
  ["win32-arm64", "zip"],
  ["win32-x64", "zip"],
] as const

function artifactReceipts() {
  return targets.map(([target, archive], index) => ({
    target,
    archive,
    name: `knowbee-9.8.7-${target}.${archive}`,
    sizeBytes: 10_000 + index,
    sha256: String.fromCharCode(97 + index).repeat(64),
    entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee",
    nodeModuleAbi: 137,
    ...(target === "linux-x64" ? { libc: "glibc" } : {}),
  }))
}

function fixture() {
  const prepared = prepareInstallerReleaseCandidate({
    releaseVersion: "9.8.7",
    artifactReceipts: artifactReceipts(),
  })
  expect(prepared.status).toBe("ready")
  if (prepared.status !== "ready") throw new Error(prepared.reasonCode)
  const verifierReceipts = targets.map(([target]) => ({
    target,
    name: `knowbee-installer-verify-${target}${target.startsWith("win32-") ? ".exe" : ""}`,
    sizeBytes: 50_000,
    sha256: createHash("sha256").update(`verifier:${target}`).digest("hex"),
  }))
  const platformEvidence = targets.map(([target]) => ({
    target,
    candidateId: prepared.candidateId,
    artifactSha256: artifactReceipts().find((receipt) => receipt.target === target)?.sha256,
    verifierSha256: verifierReceipts.find((receipt) => receipt.target === target)?.sha256,
    status: "passed",
    originTrust: "unsigned_origin_unverified",
    ...(target === "linux-x64"
      ? {
          glibcFloor: "2.28",
          libstdcxxFloor: "3.4.25",
          verifierGlibcFloor: "static",
        }
      : {}),
  }))
  return { prepared, verifierReceipts, platformEvidence }
}

describe("task019 installer release composition", () => {
  it("prepares deterministic raw unsigned v2 manifest bytes without a signing request", () => {
    const input = fixture()
    const repeated = prepareInstallerReleaseCandidate({
      releaseVersion: "9.8.7",
      artifactReceipts: artifactReceipts().reverse(),
    })
    expect(repeated).toMatchObject({
      status: "ready",
      candidateId: input.prepared.candidateId,
    })
    expect(Buffer.from(repeated.rawManifestBytes)).toEqual(input.prepared.rawManifestBytes)
    expect(repeated).not.toHaveProperty("signingRequest")
  })

  it("finalizes rendered scripts only when unsigned five-target gates, dry-runs and rollback agree", () => {
    const input = fixture()
    const finalized = finalizeInstallerReleaseCandidate({
      ...input,
      rawManifestBytes: input.prepared.rawManifestBytes,
      posixTemplate: readFileSync("installer/install.sh", "utf8"),
      powershellTemplate: readFileSync("installer/install.ps1", "utf8"),
      dryRunReceipts: targets.map(([target]) => ({
        target,
        status: "passed",
        candidateId: input.prepared.candidateId,
        artifactSha256: artifactReceipts().find((receipt) => receipt.target === target)?.sha256,
      })),
      rollbackReceipt: {
        kind: "knowbee.installer.rollback_matrix_receipt",
        schemaVersion: 1,
        status: "passed",
        candidateId: input.prepared.candidateId,
        targetCount: 5,
      },
    })
    expect(finalized.status).toBe("ready")
    if (finalized.status !== "ready") return
    expect(finalized.candidateId).toBe(input.prepared.candidateId)
    expect(finalized.installSh).not.toMatch(/@@[A-Z0-9_]+@@/u)
    expect(finalized.installPs1).not.toMatch(/@@[A-Z0-9_]+@@/u)
    expect(finalized).not.toHaveProperty("signatureBytes")
    expect(finalized.releaseGate).toMatchObject({
      status: "passed",
      targetCount: 5,
      originTrust: "unsigned_origin_unverified",
    })
  })

  it("renders prerelease rehearsal bootstraps after unsigned native gates without claiming release completion", () => {
    const input = fixture()
    const rehearsal = prepareInstallerReleaseRehearsal({
      ...input,
      rawManifestBytes: input.prepared.rawManifestBytes,
      posixTemplate: readFileSync("installer/install.sh", "utf8"),
      powershellTemplate: readFileSync("installer/install.ps1", "utf8"),
    })
    expect(rehearsal).toMatchObject({
      status: "ready",
      candidateId: input.prepared.candidateId,
      rehearsalGate: { status: "native_ready", targetCount: 5 },
    })
    expect(rehearsal).not.toHaveProperty("releaseGate")
    expect(rehearsal.installSh).toContain('download_asset "installer-manifest.json"')
    expect(rehearsal.installPs1).not.toContain('"installer-manifest.sig"')

    expect(
      prepareInstallerReleaseRehearsal({
        ...input,
        rawManifestBytes: input.prepared.rawManifestBytes,
        platformEvidence: input.platformEvidence.slice(1),
        posixTemplate: readFileSync("installer/install.sh", "utf8"),
        powershellTemplate: readFileSync("installer/install.ps1", "utf8"),
      }),
    ).toEqual({
      status: "blocked",
      reasonCode: "installer_release_platform_evidence_missing:darwin-arm64",
    })
  })

  it("blocks finalization when a platform gate is missing or belongs to another candidate", () => {
    const input = fixture()
    const base = {
      ...input,
      rawManifestBytes: input.prepared.rawManifestBytes,
      posixTemplate: readFileSync("installer/install.sh", "utf8"),
      powershellTemplate: readFileSync("installer/install.ps1", "utf8"),
      dryRunReceipts: targets.map(([target]) => ({
        target,
        status: "passed",
        candidateId: input.prepared.candidateId,
        artifactSha256: artifactReceipts().find((receipt) => receipt.target === target)?.sha256,
      })),
      rollbackReceipt: {
        kind: "knowbee.installer.rollback_matrix_receipt",
        schemaVersion: 1,
        status: "passed",
        candidateId: input.prepared.candidateId,
        targetCount: 5,
      },
    }
    expect(
      finalizeInstallerReleaseCandidate({
        ...base,
        platformEvidence: input.platformEvidence.slice(1),
      }),
    ).toEqual({
      status: "blocked",
      reasonCode: "installer_release_platform_evidence_missing:darwin-arm64",
    })
    expect(
      finalizeInstallerReleaseCandidate({
        ...base,
        platformEvidence: input.platformEvidence.map((value, index) =>
          index === 0 ? { ...value, candidateId: `sha256:${"f".repeat(64)}` } : value,
        ),
      }),
    ).toEqual({
      status: "blocked",
      reasonCode: "installer_release_candidate_mismatch:darwin-arm64",
    })
    expect(
      finalizeInstallerReleaseCandidate({
        ...base,
        dryRunReceipts: [...base.dryRunReceipts, { ...base.dryRunReceipts[0] }],
      }),
    ).toEqual({
      status: "rejected",
      reasonCode: "installer_release_dry_run_invalid",
    })
  })
})
