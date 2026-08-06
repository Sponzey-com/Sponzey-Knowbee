import { createHash, timingSafeEqual } from "node:crypto"

import {
  type InstallerArtifact,
  type UnsignedInstallerManifestV2,
  parseUnsignedInstallerManifest,
} from "./installer-contract.js"

export type InstallerArtifactIntegrityResult =
  | {
      readonly status: "verified"
      readonly target: InstallerArtifact["target"]
      readonly sizeBytes: number
      readonly sha256: string
    }
  | {
      readonly status: "rejected"
      readonly reasonCode: "artifact_size_mismatch" | "artifact_digest_mismatch"
    }

export type UnsignedInstallerManifestVerificationResult =
  | {
      readonly status: "verified"
      readonly manifest: UnsignedInstallerManifestV2
      readonly manifestSha256: `sha256:${string}`
      readonly originTrust: "unsigned_origin_unverified"
    }
  | {
      readonly status: "rejected"
      readonly reasonCode:
        | "manifest_invalid"
        | "schema_version_unsupported"
        | "node_version_unsupported"
        | `artifact_target_missing:${InstallerArtifact["target"]}`
        | `artifact_target_duplicate:${InstallerArtifact["target"]}`
        | `artifact_abi_mismatch:${InstallerArtifact["target"]}`
        | "manifest_bytes_invalid"
    }

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024

function sha256(value: Uint8Array): Buffer {
  return createHash("sha256").update(value).digest()
}

/** Validates v2 structure only; artifact hashes do not authenticate the manifest publisher. */
export function verifyUnsignedInstallerManifest(input: {
  readonly rawManifestBytes: Uint8Array
}): UnsignedInstallerManifestVerificationResult {
  if (
    !(input.rawManifestBytes instanceof Uint8Array) ||
    input.rawManifestBytes.byteLength === 0 ||
    input.rawManifestBytes.byteLength > MAX_MANIFEST_BYTES
  ) {
    return { status: "rejected", reasonCode: "manifest_bytes_invalid" }
  }
  let externalValue: unknown
  try {
    externalValue = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(input.rawManifestBytes),
    )
  } catch {
    return { status: "rejected", reasonCode: "manifest_invalid" }
  }
  const parsed = parseUnsignedInstallerManifest(externalValue)
  if (parsed.status === "rejected") return parsed
  return {
    status: "verified",
    manifest: parsed.manifest,
    manifestSha256: `sha256:${sha256(input.rawManifestBytes).toString("hex")}`,
    originTrust: "unsigned_origin_unverified",
  }
}

export function verifyInstallerArtifactBytes(input: {
  readonly artifact: InstallerArtifact
  readonly bytes: Uint8Array
}): InstallerArtifactIntegrityResult {
  if (input.bytes.byteLength !== input.artifact.sizeBytes) {
    return { status: "rejected", reasonCode: "artifact_size_mismatch" }
  }
  const observed = sha256(input.bytes)
  const expected = Buffer.from(input.artifact.sha256, "hex")
  if (expected.byteLength !== observed.byteLength || !timingSafeEqual(observed, expected)) {
    return { status: "rejected", reasonCode: "artifact_digest_mismatch" }
  }
  return {
    status: "verified",
    target: input.artifact.target,
    sizeBytes: input.bytes.byteLength,
    sha256: observed.toString("hex"),
  }
}
