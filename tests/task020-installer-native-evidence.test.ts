import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  buildInstallerNativePlatformEvidence,
  parseElfVersionRequirements,
} from "../scripts/lib/installer-native-evidence.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"

const candidateId = `sha256:${"f".repeat(64)}`

function fixture() {
  const artifacts = INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
    target: profile.target,
    sha256: String.fromCharCode(97 + index).repeat(64),
  }))
  const verifiers = INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
    target: profile.target,
    sha256: String(5 + index).repeat(64),
  }))
  const attestations = INSTALLER_PLATFORM_PROFILES.map((profile) => ({
    kind: "knowbee.installer.native_attestation",
    schemaVersion: 1,
    target: profile.target,
    candidateId,
    artifactSha256: artifacts.find((value) => value.target === profile.target)?.sha256,
    verifierSha256: verifiers.find((value) => value.target === profile.target)?.sha256,
    status: "passed",
    originTrust: "unsigned_origin_unverified",
    nativeFileCount: 4,
    ...(profile.os === "linux"
      ? {
            maxGlibc: "2.28",
            maxGlibcxx: "3.4.25",
            verifierLinkage: "static",
          }
      : {}),
  }))
  return {
    artifacts,
    verifiers,
    attestations,
  }
}

describe("task020 installer native evidence", () => {
  it("keeps native package builds unsigned while retaining Node supplier GPG verification", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    expect(workflow).toContain("SHASUMS256.txt.sig")
    expect(workflow).toContain("x86_64-unknown-linux-musl")
    expect(workflow).toContain("image: rockylinux/rockylinux:8.10")
    expect(workflow).toContain("--app-bundle")
    expect(workflow).not.toMatch(/(?:codesign|notarytool|stapler|signtool|AUTHENTICODE|DEVELOPER_ID)/iu)
  })

  it("re-stages unsigned candidate bytes on every native OS before aggregation", () => {
    const workflow = readFileSync(".github/workflows/installer-native-evidence.yml", "utf8")
    expect(workflow).toContain("unsigned_origin_unverified")
    expect(workflow).toContain("--stage")
    expect(workflow).toContain("inspect-installer-native.mjs")
    expect(workflow).toContain("inspect-installer-linux-native.mjs")
    expect(workflow).toContain("compose-installer-native-evidence.mjs")
    expect(workflow).toContain("installer-native-evidence-${{ inputs.release_tag }}")
    expect(workflow).toContain("cat \"$verified_receipt\"")
    expect(workflow).toContain("cat \"$attestation\"")
    expect(workflow).toContain("mkdir -p release/native")
    expect(workflow).not.toMatch(/INSTALLER_(?:ED25519_)?PRIVATE_KEY/iu)
  })

  it("documents unsigned native evidence and fail-closed recovery", () => {
    const runbook = readFileSync("docs/release-runbook.md", "utf8")
    expect(runbook).toContain("unsigned_origin_unverified")
    expect(runbook).toContain("installer-native-evidence.yml")
    expect(runbook).toContain("Rocky Linux 8.10")

    const scripts = readFileSync("scripts/source.md", "utf8")
    expect(scripts).toContain("inspect-installer-native.mjs")
    expect(scripts).toContain("compose-installer-native-evidence.mjs")
  })

  it("parses the maximum required ELF symbol versions numerically", () => {
    expect(
      parseElfVersionRequirements(`
        Name: GLIBC_2.9 Flags: none Version: 2
        Name: GLIBC_2.28 Flags: none Version: 3
        Name: GLIBCXX_3.4.9 Flags: none Version: 4
        Name: GLIBCXX_3.4.25 Flags: none Version: 5
      `),
    ).toEqual({ maxGlibc: "2.28", maxGlibcxx: "3.4.25" })
  })

  it("admits five target receipts only when unsigned origin, native target and exact digests pass", () => {
    const input = fixture()
    expect(buildInstallerNativePlatformEvidence({ candidateId, ...input })).toEqual({
      status: "ready",
      evidence: INSTALLER_PLATFORM_PROFILES.map((profile) =>
        expect.objectContaining({
          target: profile.target,
          candidateId,
          status: "passed",
        }),
      ),
    })
  })

  it("blocks missing unsigned disclosure, newer ABI and verifier mismatches", () => {
    const mac = fixture()
    mac.attestations[0] = { ...mac.attestations[0], originTrust: "publisher_authenticated" }
    expect(buildInstallerNativePlatformEvidence({ candidateId, ...mac })).toEqual({
      status: "blocked",
      reasonCode: "installer_native_platform_gate_failed:darwin-arm64",
    })

    const linux = fixture()
    linux.attestations[2] = { ...linux.attestations[2], maxGlibc: "2.31" }
    expect(buildInstallerNativePlatformEvidence({ candidateId, ...linux })).toEqual({
      status: "blocked",
      reasonCode: "installer_native_platform_gate_failed:linux-x64",
    })

    const mismatch = fixture()
    mismatch.attestations[4] = {
      ...mismatch.attestations[4],
      verifierSha256: "0".repeat(64),
    }
    expect(buildInstallerNativePlatformEvidence({ candidateId, ...mismatch })).toEqual({
      status: "blocked",
      reasonCode: "installer_native_verifier_mismatch:win32-x64",
    })

    const stale = fixture()
    stale.attestations[0] = {
      ...stale.attestations[0],
      candidateId: `sha256:${"e".repeat(64)}`,
    }
    expect(buildInstallerNativePlatformEvidence({ candidateId, ...stale })).toEqual({
      status: "blocked",
      reasonCode: "installer_native_candidate_mismatch:darwin-arm64",
    })
  })
})
