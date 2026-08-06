import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  verifyInstallerArtifactBytes,
  verifyUnsignedInstallerManifest,
} from "../packages/core/src/release/installer-integrity.js"

const artifactBytes = Buffer.from("knowbee-platform-bundle", "utf8")
const artifactDigest = createHash("sha256").update(artifactBytes).digest("hex")

function rawManifest(schemaVersion = 2): Buffer {
  return Buffer.from(JSON.stringify({ kind: "knowbee.install.manifest", schemaVersion, releaseVersion: "1.2.3", channel: "stable", node: { version: "24.7.0", moduleAbi: 137 }, artifacts: ["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"].map((target) => ({ target, archive: target.startsWith("win32-") ? "zip" : "tar.gz", name: `knowbee-${target}.${target.startsWith("win32-") ? "zip" : "tar.gz"}`, sizeBytes: artifactBytes.byteLength, sha256: artifactDigest, entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee", nodeModuleAbi: 137, ...(target === "linux-x64" ? { libc: "glibc" } : {}) })) }), "utf8")
}

describe("task002 installer integrity", () => {
  it("verifies unsigned v2 bytes while disclosing unauthenticated origin", () => {
    const bytes = rawManifest()
    expect(verifyUnsignedInstallerManifest({ rawManifestBytes: bytes })).toMatchObject({ status: "verified", originTrust: "unsigned_origin_unverified", manifestSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` })
  })

  it("rejects legacy signed schema and malformed bytes", () => {
    expect(verifyUnsignedInstallerManifest({ rawManifestBytes: rawManifest(1) })).toEqual({ status: "rejected", reasonCode: "schema_version_unsupported" })
    expect(verifyUnsignedInstallerManifest({ rawManifestBytes: Buffer.from("{") })).toEqual({ status: "rejected", reasonCode: "manifest_invalid" })
  })

  it("verifies exact artifact size and SHA-256 before activation", () => {
    const verified = verifyUnsignedInstallerManifest({ rawManifestBytes: rawManifest() })
    expect(verified.status).toBe("verified")
    if (verified.status !== "verified") return
    const artifact = verified.manifest.artifacts[0]
    expect(artifact).toBeDefined()
    if (!artifact) return
    expect(verifyInstallerArtifactBytes({ artifact, bytes: artifactBytes })).toMatchObject({ status: "verified", sha256: artifactDigest })
    expect(verifyInstallerArtifactBytes({ artifact, bytes: Buffer.concat([artifactBytes, Buffer.of(0)]) })).toEqual({ status: "rejected", reasonCode: "artifact_size_mismatch" })
  })
})
