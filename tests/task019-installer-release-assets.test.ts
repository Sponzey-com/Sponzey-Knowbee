import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { collectInstallerReleaseAssets } from "../scripts/collect-installer-release-assets.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-release-assets-"))
  directories.push(root)
  const bundleRoot = join(root, "bundles")
  const verifierRoot = join(root, "verifiers")
  const outputDirectory = join(root, "receipts")
  mkdirSync(bundleRoot)
  mkdirSync(verifierRoot)
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const bundleDirectory = join(bundleRoot, `installer-bundle-${profile.target}`)
    const verifierDirectory = join(verifierRoot, `installer-verifier-${profile.target}`)
    mkdirSync(bundleDirectory)
    mkdirSync(verifierDirectory)
    const name = `knowbee-9.8.7-${profile.target}.${profile.archive}`
    const bytes = Buffer.from(`bundle:${profile.target}`)
    writeFileSync(join(bundleDirectory, name), bytes)
    writeFileSync(
      join(bundleDirectory, "artifact-receipt.json"),
      `${JSON.stringify({
        target: profile.target,
        archive: profile.archive,
        name,
        sizeBytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        entrypoint: profile.os === "win32" ? "bin/knowbee.cmd" : "bin/knowbee",
        nodeModuleAbi: 137,
        ...(profile.os === "linux" ? { libc: "glibc" } : {}),
      })}\n`,
    )
    const verifierName = `knowbee-installer-verify-${profile.target}${profile.os === "win32" ? ".exe" : ""}`
    writeFileSync(join(verifierDirectory, verifierName), `verifier:${profile.target}`)
  }
  return { root, bundleRoot, verifierRoot, outputDirectory }
}

describe("task019 installer release assets", () => {
  it("re-hashes exactly five bundle and verifier artifacts into publish receipts", async () => {
    const input = fixture()
    expect(
      await collectInstallerReleaseAssets({
        bundleRoot: input.bundleRoot,
        verifierRoot: input.verifierRoot,
        outputDirectory: input.outputDirectory,
      }),
    ).toEqual({ status: "ready", bundleCount: 5, verifierCount: 5 })
    expect(
      JSON.parse(readFileSync(join(input.outputDirectory, "artifact-receipts.json"), "utf8")),
    ).toHaveLength(5)
    expect(
      JSON.parse(readFileSync(join(input.outputDirectory, "verifier-receipts.json"), "utf8")),
    ).toHaveLength(5)
  })

  it("rejects a bundle changed after its builder receipt", async () => {
    const input = fixture()
    writeFileSync(
      join(input.bundleRoot, "installer-bundle-linux-x64", "knowbee-9.8.7-linux-x64.tar.gz"),
      "changed",
    )
    expect(
      await collectInstallerReleaseAssets({
        bundleRoot: input.bundleRoot,
        verifierRoot: input.verifierRoot,
        outputDirectory: input.outputDirectory,
      }),
    ).toEqual({
      status: "rejected",
      reasonCode: "installer_release_bundle_identity_mismatch:linux-x64",
    })
  })
})
