import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runInstallerNativeEvidenceCli } from "../scripts/compose-installer-native-evidence.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"

const directories: string[] = []
const candidateId = `sha256:${"f".repeat(64)}`

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task020 native evidence CLI", () => {
  it("publishes five exact candidate-bound platform records atomically", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-native-compose-"))
    directories.push(root)
    const attestationRoot = join(root, "attestations")
    mkdirSync(attestationRoot)
    const artifacts = INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
      target: profile.target,
      sha256: String.fromCharCode(97 + index).repeat(64),
    }))
    const verifiers = INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
      target: profile.target,
      sha256: String(5 + index).repeat(64),
    }))
    const artifactsPath = join(root, "artifacts.json")
    const verifiersPath = join(root, "verifiers.json")
    writeFileSync(artifactsPath, JSON.stringify(artifacts))
    writeFileSync(verifiersPath, JSON.stringify(verifiers))
    for (const profile of INSTALLER_PLATFORM_PROFILES) {
      writeFileSync(
        join(attestationRoot, `native-attestation-${profile.target}.json`),
        JSON.stringify({
          kind: "knowbee.installer.native_attestation",
          schemaVersion: 1,
          target: profile.target,
          candidateId,
          artifactSha256: artifacts.find((value) => value.target === profile.target)?.sha256,
          verifierSha256: verifiers.find((value) => value.target === profile.target)?.sha256,
          status: "passed",
          nativeFileCount: 3,
          originTrust: "unsigned_origin_unverified",
          ...(profile.os === "linux"
            ? {
                  maxGlibc: "2.28",
                  maxGlibcxx: "3.4.25",
                  verifierLinkage: "static",
                }
            : {}),
        }),
      )
    }
    const output = join(root, "output")
    const result = await runInstallerNativeEvidenceCli([
      "--candidate-id",
      candidateId,
      "--artifact-receipts",
      artifactsPath,
      "--verifier-receipts",
      verifiersPath,
      "--attestation-root",
      attestationRoot,
      "--output-dir",
      output,
    ])

    expect(result).toEqual({ status: "ready", candidateId, targetCount: 5 })
    expect(JSON.parse(readFileSync(join(output, "platform-evidence.json"), "utf8"))).toHaveLength(5)
  })
})
