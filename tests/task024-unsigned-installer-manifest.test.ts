import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { verifyUnsignedInstallerManifest } from "../packages/core/src/release/installer-integrity.js"

const bundle = Buffer.from("unsigned-knowbee-bundle", "utf8")
const digest = createHash("sha256").update(bundle).digest("hex")

function manifest(schemaVersion: number) {
  return Buffer.from(
    JSON.stringify({
      kind: "knowbee.install.manifest",
      schemaVersion,
      releaseVersion: "9.8.7",
      channel: "stable",
      node: { version: "24.18.0", moduleAbi: 137 },
      artifacts: [
        {
          target: "darwin-arm64",
          archive: "tar.gz",
          name: "knowbee-9.8.7-darwin-arm64.tar.gz",
          sizeBytes: bundle.byteLength,
          sha256: digest,
          entrypoint: "bin/knowbee",
          nodeModuleAbi: 137,
        },
        {
          target: "darwin-x64",
          archive: "tar.gz",
          name: "knowbee-9.8.7-darwin-x64.tar.gz",
          sizeBytes: bundle.byteLength,
          sha256: digest,
          entrypoint: "bin/knowbee",
          nodeModuleAbi: 137,
        },
        {
          target: "linux-x64",
          archive: "tar.gz",
          name: "knowbee-9.8.7-linux-x64.tar.gz",
          sizeBytes: bundle.byteLength,
          sha256: digest,
          entrypoint: "bin/knowbee",
          nodeModuleAbi: 137,
          libc: "glibc",
        },
        {
          target: "win32-arm64",
          archive: "zip",
          name: "knowbee-9.8.7-win32-arm64.zip",
          sizeBytes: bundle.byteLength,
          sha256: digest,
          entrypoint: "bin/knowbee.cmd",
          nodeModuleAbi: 137,
        },
        {
          target: "win32-x64",
          archive: "zip",
          name: "knowbee-9.8.7-win32-x64.zip",
          sizeBytes: bundle.byteLength,
          sha256: digest,
          entrypoint: "bin/knowbee.cmd",
          nodeModuleAbi: 137,
        },
      ],
    }),
    "utf8",
  )
}

describe("task024 unsigned installer manifest", () => {
  it("accepts only the raw v2 unsigned manifest and identifies the delivery trust boundary", () => {
    expect(verifyUnsignedInstallerManifest({ rawManifestBytes: manifest(2) })).toMatchObject({
      status: "verified",
      manifestSha256: `sha256:${createHash("sha256").update(manifest(2)).digest("hex")}`,
      originTrust: "unsigned_origin_unverified",
      manifest: { schemaVersion: 2, releaseVersion: "9.8.7" },
    })
  })

  it("rejects a signed v1 manifest instead of treating its artifact hashes as origin authentication", () => {
    expect(verifyUnsignedInstallerManifest({ rawManifestBytes: manifest(1) })).toEqual({
      status: "rejected",
      reasonCode: "schema_version_unsupported",
    })
  })
})
