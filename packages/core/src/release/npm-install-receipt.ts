import { createHash } from "node:crypto"

export const REQUIRED_NPM_RELEASE_PACKAGE_NAMES = [
  "@sponzey/cli",
  "@sponzey/core",
  "@sponzey/knowbee",
  "@sponzey/webui",
] as const

export interface StagedNpmPackageDigest {
  name: string
  version: string
  digestSha256: string
}

export interface NpmCleanInstallRuntimeIdentity {
  nodeVersion: string
  npmVersion: string
  platform: string
  arch: string
}

export interface NpmCleanInstallReceipt {
  kind: "knowbee.release.npm_clean_install_receipt"
  schemaVersion: 1
  status: "passed"
  issuedAt: number
  packageVersion: string
  packageCount: 4
  packages: readonly StagedNpmPackageDigest[]
  packageSetDigestSha256: string
  runtime: Readonly<NpmCleanInstallRuntimeIdentity>
  installMode: "local_tarballs"
  cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js"
  cliContract: "help_usage_verified"
}

export type NpmInstallReceiptBuildResult =
  | { status: "ready"; receipt: Readonly<NpmCleanInstallReceipt> }
  | { status: "rejected"; reasonCode: string }

export type NpmInstallReceiptVerificationResult =
  | { status: "verified" }
  | { status: "rejected"; reasonCode: string }

const SHA256_PATTERN = /^[a-f0-9]{64}$/

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function packageDigestRecord(value: unknown): value is StagedNpmPackageDigest {
  return (
    objectRecord(value) &&
    typeof value.name === "string" &&
    typeof value.version === "string" &&
    typeof value.digestSha256 === "string"
  )
}

function runtimeIdentityRecord(value: unknown): value is NpmCleanInstallRuntimeIdentity {
  return (
    objectRecord(value) &&
    typeof value.nodeVersion === "string" &&
    typeof value.npmVersion === "string" &&
    typeof value.platform === "string" &&
    typeof value.arch === "string"
  )
}

function validateRuntime(runtime: Readonly<NpmCleanInstallRuntimeIdentity>): boolean {
  return (
    runtime.nodeVersion.trim().length > 0 &&
    runtime.npmVersion.trim().length > 0 &&
    runtime.platform.trim().length > 0 &&
    runtime.arch.trim().length > 0
  )
}

function normalizePackages(
  packages: readonly StagedNpmPackageDigest[],
):
  | { status: "ready"; packages: StagedNpmPackageDigest[]; version: string }
  | { status: "rejected"; reasonCode: string } {
  const seen = new Set<string>()
  for (const item of packages) {
    if (seen.has(item.name)) {
      return { status: "rejected", reasonCode: `package_set_duplicate:${item.name}` }
    }
    seen.add(item.name)
  }
  const required = new Set<string>(REQUIRED_NPM_RELEASE_PACKAGE_NAMES)
  for (const item of packages) {
    if (!required.has(item.name)) {
      return { status: "rejected", reasonCode: `package_set_extra:${item.name}` }
    }
  }
  for (const name of REQUIRED_NPM_RELEASE_PACKAGE_NAMES) {
    if (!seen.has(name)) return { status: "rejected", reasonCode: `package_set_missing:${name}` }
  }
  const versions = new Set(packages.map((item) => item.version))
  if (
    versions.size !== 1 ||
    packages.some((item) => !item.version.trim() || item.version !== item.version.trim())
  ) {
    return { status: "rejected", reasonCode: "package_version_mismatch" }
  }
  const invalidDigest = packages.find((item) => !SHA256_PATTERN.test(item.digestSha256))
  if (invalidDigest) {
    return { status: "rejected", reasonCode: `package_digest_invalid:${invalidDigest.name}` }
  }
  const normalized = REQUIRED_NPM_RELEASE_PACKAGE_NAMES.map((name) => {
    const item = packages.find((candidate) => candidate.name === name)
    if (!item) throw new Error("validated package set is incomplete")
    return Object.freeze({
      name: item.name,
      version: item.version,
      digestSha256: item.digestSha256,
    })
  })
  return { status: "ready", packages: normalized, version: normalized[0]?.version ?? "" }
}

function packageSetDigest(packages: readonly StagedNpmPackageDigest[]): string {
  const hash = createHash("sha256")
  for (const item of packages) {
    hash.update(item.name)
    hash.update("\0")
    hash.update(item.version)
    hash.update("\0")
    hash.update(item.digestSha256)
    hash.update("\n")
  }
  return hash.digest("hex")
}

export function buildNpmCleanInstallReceipt(input: {
  packages: readonly StagedNpmPackageDigest[]
  runtime: Readonly<NpmCleanInstallRuntimeIdentity>
  issuedAt: number
  cliHelpVerified: boolean
}): NpmInstallReceiptBuildResult {
  const normalized = normalizePackages(input.packages)
  if (normalized.status === "rejected") return normalized
  if (!validateRuntime(input.runtime)) {
    return { status: "rejected", reasonCode: "install_runtime_identity_invalid" }
  }
  if (!Number.isSafeInteger(input.issuedAt) || input.issuedAt < 0) {
    return { status: "rejected", reasonCode: "install_receipt_issued_at_invalid" }
  }
  if (!input.cliHelpVerified) {
    return { status: "rejected", reasonCode: "installed_cli_contract_failed" }
  }
  const receipt: Readonly<NpmCleanInstallReceipt> = Object.freeze({
    kind: "knowbee.release.npm_clean_install_receipt",
    schemaVersion: 1,
    status: "passed",
    issuedAt: input.issuedAt,
    packageVersion: normalized.version,
    packageCount: 4,
    packages: Object.freeze([...normalized.packages]),
    packageSetDigestSha256: packageSetDigest(normalized.packages),
    runtime: Object.freeze({ ...input.runtime }),
    installMode: "local_tarballs",
    cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js",
    cliContract: "help_usage_verified",
  })
  return { status: "ready", receipt }
}

export function verifyNpmCleanInstallReceipt(input: {
  receipt: unknown
  packages: readonly StagedNpmPackageDigest[]
}): NpmInstallReceiptVerificationResult {
  if (!objectRecord(input.receipt)) {
    return { status: "rejected", reasonCode: "install_receipt_invalid" }
  }
  const receipt = input.receipt as unknown as Partial<NpmCleanInstallReceipt>
  if (
    receipt.kind !== "knowbee.release.npm_clean_install_receipt" ||
    receipt.schemaVersion !== 1 ||
    receipt.status !== "passed" ||
    !Array.isArray(receipt.packages) ||
    !receipt.packages.every(packageDigestRecord) ||
    typeof receipt.packageSetDigestSha256 !== "string" ||
    !runtimeIdentityRecord(receipt.runtime) ||
    receipt.installMode !== "local_tarballs" ||
    receipt.cliEntrypoint !== "@sponzey/knowbee/bin/knowbee.js" ||
    receipt.cliContract !== "help_usage_verified" ||
    !Number.isSafeInteger(receipt.issuedAt) ||
    (receipt.issuedAt ?? -1) < 0
  ) {
    return { status: "rejected", reasonCode: "install_receipt_invalid" }
  }
  const recorded = normalizePackages(receipt.packages)
  if (recorded.status === "rejected") {
    return { status: "rejected", reasonCode: `install_receipt_${recorded.reasonCode}` }
  }
  const current = normalizePackages(input.packages)
  if (current.status === "rejected") return current
  if (receipt.packageVersion !== recorded.version || receipt.packageCount !== 4) {
    return { status: "rejected", reasonCode: "install_receipt_binding_invalid" }
  }
  if (!validateRuntime(receipt.runtime)) {
    return { status: "rejected", reasonCode: "install_receipt_runtime_invalid" }
  }
  if (receipt.packageSetDigestSha256 !== packageSetDigest(recorded.packages)) {
    return { status: "rejected", reasonCode: "install_receipt_aggregate_digest_invalid" }
  }
  for (const recordedPackage of recorded.packages) {
    const currentPackage = current.packages.find((item) => item.name === recordedPackage.name)
    if (!currentPackage || currentPackage.version !== recordedPackage.version) {
      return { status: "rejected", reasonCode: `package_version_mismatch:${recordedPackage.name}` }
    }
    if (currentPackage.digestSha256 !== recordedPackage.digestSha256) {
      return {
        status: "rejected",
        reasonCode: `package_digest_mismatch:${recordedPackage.name}`,
      }
    }
  }
  if (receipt.packageSetDigestSha256 !== packageSetDigest(current.packages)) {
    return { status: "rejected", reasonCode: "package_set_digest_mismatch" }
  }
  return { status: "verified" }
}
