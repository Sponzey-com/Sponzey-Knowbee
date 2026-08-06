import { createHash } from "node:crypto"

export interface InstallerHealthIdentity {
  readonly releaseVersion: string
  readonly stateDirectoryFingerprint: `sha256:${string}`
}

export function buildInstallerHealthIdentity(input: {
  readonly releaseVersion: string
  readonly stateDirectory: string
}): InstallerHealthIdentity {
  const releaseVersion = input.releaseVersion.trim().replace(/^v/u, "")
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(releaseVersion) ||
    input.stateDirectory.length === 0 ||
    input.stateDirectory.length > 4096
  ) {
    throw new Error("installer_health_identity_invalid")
  }
  return Object.freeze({
    releaseVersion,
    stateDirectoryFingerprint: `sha256:${createHash("sha256")
      .update(input.stateDirectory)
      .digest("hex")}`,
  })
}
