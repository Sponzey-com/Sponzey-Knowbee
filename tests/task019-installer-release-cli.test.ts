import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runInstallerReleaseCli } from "../scripts/compose-installer-release.mjs"

const directories: string[] = []
const targets = [
  ["darwin-arm64", "tar.gz"],
  ["darwin-x64", "tar.gz"],
  ["linux-x64", "tar.gz"],
  ["win32-arm64", "zip"],
  ["win32-x64", "zip"],
] as const

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" })
}

function receipts() {
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

function verifierReceipts() {
  return targets.map(([target]) => ({
    target,
    name: `knowbee-installer-verify-${target}${target.startsWith("win32-") ? ".exe" : ""}`,
    sizeBytes: 50_000,
    sha256: createHash("sha256").update(target).digest("hex"),
  }))
}

function platformEvidence(candidateId: string) {
  return targets.map(([target]) => ({
    target,
    candidateId,
    artifactSha256: receipts().find((receipt) => receipt.target === target)?.sha256,
    verifierSha256: verifierReceipts().find((receipt) => receipt.target === target)?.sha256,
    status: "passed",
    originTrust: "unsigned_origin_unverified",
    ...(target === "linux-x64"
      ? { glibcFloor: "2.28", libstdcxxFloor: "3.4.25", verifierGlibcFloor: "static" }
      : {}),
  }))
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task019 installer release CLI", () => {
  it("writes only a raw unsigned v2 manifest during prepare", async () => {
    const root = temporaryDirectory("knowbee-release-prepare-")
    const artifactsPath = join(root, "artifacts.json")
    const outputDirectory = join(root, "prepared")
    writeJson(artifactsPath, receipts())

    const result = await runInstallerReleaseCli([
      "prepare",
      "--release-version",
      "9.8.7",
      "--artifact-receipts",
      artifactsPath,
      "--output-dir",
      outputDirectory,
    ])

    expect(result).toMatchObject({ status: "ready", candidateId: expect.any(String) })
    expect(
      JSON.parse(readFileSync(join(outputDirectory, "installer-manifest.json"), "utf8")),
    ).toMatchObject({
      schemaVersion: 2,
      releaseVersion: "9.8.7",
    })
    expect(() => readFileSync(join(outputDirectory, "installer-manifest.sig"))).toThrow()
    expect(() => readFileSync(join(outputDirectory, "installer-signing-request.json"))).toThrow()
  })

  it("rehearses and finalizes immutable unsigned inventory without a signature input", async () => {
    const root = temporaryDirectory("knowbee-release-finalize-")
    const artifactsPath = join(root, "artifacts.json")
    const preparedDirectory = join(root, "prepared")
    const rehearsalDirectory = join(root, "rehearsal")
    const finalDirectory = join(root, "final")
    writeJson(artifactsPath, receipts())
    const prepared = await runInstallerReleaseCli([
      "prepare",
      "--release-version",
      "9.8.7",
      "--artifact-receipts",
      artifactsPath,
      "--output-dir",
      preparedDirectory,
    ])
    expect(prepared.status).toBe("ready")
    if (prepared.status !== "ready") return

    const verifiers = join(root, "verifiers.json")
    const platforms = join(root, "platforms.json")
    const dryRuns = join(root, "dry-runs.json")
    const rollback = join(root, "rollback.json")
    writeJson(verifiers, verifierReceipts())
    writeJson(platforms, platformEvidence(prepared.candidateId))
    writeJson(
      dryRuns,
      targets.map(([target]) => ({
        target,
        candidateId: prepared.candidateId,
        artifactSha256: receipts().find((receipt) => receipt.target === target)?.sha256,
        status: "passed",
      })),
    )
    writeJson(rollback, {
      kind: "knowbee.installer.rollback_matrix_receipt",
      schemaVersion: 1,
      candidateId: prepared.candidateId,
      status: "passed",
      targetCount: 5,
    })
    const common = [
      "--manifest",
      join(preparedDirectory, "installer-manifest.json"),
      "--verifier-receipts",
      verifiers,
      "--platform-evidence",
      platforms,
      "--posix-template",
      "installer/install.sh",
      "--powershell-template",
      "installer/install.ps1",
    ]
    expect(
      await runInstallerReleaseCli(["rehearsal", ...common, "--output-dir", rehearsalDirectory]),
    ).toEqual({
      status: "ready",
      candidateId: prepared.candidateId,
    })
    expect(() => readFileSync(join(rehearsalDirectory, "installer-manifest.sig"))).toThrow()
    expect(
      await runInstallerReleaseCli([
        "finalize",
        ...common,
        "--dry-run-receipts",
        dryRuns,
        "--rollback-receipt",
        rollback,
        "--output-dir",
        finalDirectory,
      ]),
    ).toEqual({ status: "ready", candidateId: prepared.candidateId })
    expect(() => readFileSync(join(finalDirectory, "installer-manifest.sig"))).toThrow()
    expect(
      JSON.parse(readFileSync(join(finalDirectory, "installer-release-gate.json"), "utf8")),
    ).toMatchObject({
      status: "passed",
      originTrust: "unsigned_origin_unverified",
    })
  })

  it("rejects linked inputs and never creates a partial output", async () => {
    const root = temporaryDirectory("knowbee-release-linked-")
    const realPath = join(root, "real.json")
    const linkedPath = join(root, "linked.json")
    const outputDirectory = join(root, "prepared")
    writeJson(realPath, receipts())
    symlinkSync(realPath, linkedPath)
    expect(
      await runInstallerReleaseCli([
        "prepare",
        "--release-version",
        "9.8.7",
        "--artifact-receipts",
        linkedPath,
        "--output-dir",
        outputDirectory,
      ]),
    ).toEqual({ status: "rejected", reasonCode: "installer_release_input_unsafe" })
    expect(() => mkdirSync(outputDirectory)).not.toThrow()
  })
})
