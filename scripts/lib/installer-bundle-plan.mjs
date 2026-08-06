import { INSTALLER_NODE_RUNTIME, INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

export const REQUIRED_INSTALLER_NPM_PACKAGES = Object.freeze([
  "@sponzey/cli",
  "@sponzey/core",
  "@sponzey/knowbee",
  "@sponzey/webui",
])

const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFileReceipt(value) {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    value.fileName.length <= 240 &&
    SAFE_FILE_NAME.test(value.fileName) &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    value.sizeBytes <= 10_000_000_000 &&
    typeof value.sha256 === "string" &&
    SHA256.test(value.sha256)
  )
}

function inputReceipt(id, value) {
  return Object.freeze({
    id,
    fileName: value.fileName,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  })
}

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function validateNodeArchives(values) {
  if (!Array.isArray(values) || values.some((value) => !isFileReceipt(value))) {
    return reject("node_archive_receipt_invalid")
  }
  const selected = new Map()
  for (const value of values) {
    if (typeof value.target !== "string") return reject("node_archive_receipt_invalid")
    if (selected.has(value.target)) return reject(`node_archive_duplicate:${value.target}`)
    selected.set(value.target, value)
  }
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const value = selected.get(profile.target)
    if (!value) return reject(`node_archive_missing:${profile.target}`)
    if (value.fileName !== profile.nodeRuntimeArchive) {
      return reject(`node_archive_name_mismatch:${profile.target}`)
    }
    if (value.sha256 !== profile.nodeRuntimeSha256) {
      return reject(`node_archive_digest_mismatch:${profile.target}`)
    }
  }
  if (selected.size !== INSTALLER_PLATFORM_PROFILES.length) {
    const known = new Set(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target))
    const unexpected = [...selected.keys()].find((target) => !known.has(target))
    return reject(`node_archive_target_unexpected:${unexpected ?? "unknown"}`)
  }
  return { status: "valid", selected }
}

function validateNpmPackages(values, packageVersion) {
  if (
    !Array.isArray(values) ||
    values.some(
      (value) =>
        !isFileReceipt(value) ||
        typeof value.packageName !== "string" ||
        typeof value.packageVersion !== "string",
    )
  ) {
    return reject("npm_package_receipt_invalid")
  }
  const selected = new Map()
  for (const value of values) {
    if (selected.has(value.packageName)) return reject(`npm_package_duplicate:${value.packageName}`)
    selected.set(value.packageName, value)
  }
  for (const packageName of REQUIRED_INSTALLER_NPM_PACKAGES) {
    const value = selected.get(packageName)
    if (!value) return reject(`npm_package_missing:${packageName}`)
    if (value.packageVersion !== packageVersion) {
      return reject(`npm_package_version_mismatch:${packageName}`)
    }
  }
  if (selected.size !== REQUIRED_INSTALLER_NPM_PACKAGES.length) {
    const known = new Set(REQUIRED_INSTALLER_NPM_PACKAGES)
    const unexpected = [...selected.keys()].find((packageName) => !known.has(packageName))
    return reject(`npm_package_unexpected:${unexpected ?? "unknown"}`)
  }
  return { status: "valid", selected }
}

function validateYeonjangPackages(values, packageVersion) {
  if (
    !Array.isArray(values) ||
    values.some(
      (value) =>
        !isFileReceipt(value) ||
        typeof value.target !== "string" ||
        typeof value.packageName !== "string" ||
        typeof value.packageVersion !== "string",
    )
  ) {
    return reject("yeonjang_package_receipt_invalid")
  }
  const selected = new Map()
  for (const value of values) {
    if (selected.has(value.target)) return reject(`yeonjang_package_duplicate:${value.target}`)
    const profile = INSTALLER_PLATFORM_PROFILES.find(
      (candidate) => candidate.target === value.target,
    )
    if (!profile) return reject(`yeonjang_package_target_unsupported:${value.target}`)
    if (value.packageName !== profile.yeonjangPackage) {
      return reject(`yeonjang_package_target_mismatch:${value.target}`)
    }
    if (value.packageVersion !== packageVersion) {
      return reject(`yeonjang_package_version_mismatch:${value.target}`)
    }
    selected.set(value.target, value)
  }
  return { status: "valid", selected }
}

export function buildInstallerPlatformBundlePlans(input) {
  if (
    !isRecord(input) ||
    typeof input.packageVersion !== "string" ||
    !VERSION.test(input.packageVersion)
  ) {
    return reject("package_version_invalid")
  }
  const node = validateNodeArchives(input.nodeArchives)
  if (node.status === "rejected") return node
  const npm = validateNpmPackages(input.npmPackages, input.packageVersion)
  if (npm.status === "rejected") return npm
  const yeonjang = validateYeonjangPackages(input.yeonjangPackages, input.packageVersion)
  if (yeonjang.status === "rejected") return yeonjang

  const plans = INSTALLER_PLATFORM_PROFILES.map((profile) => {
    const nodeArchive = node.selected.get(profile.target)
    const targetYeonjang = yeonjang.selected.get(profile.target)
    const inputs = [
      inputReceipt("node", nodeArchive),
      ...REQUIRED_INSTALLER_NPM_PACKAGES.map((packageName) =>
        inputReceipt(`npm:${packageName}`, npm.selected.get(packageName)),
      ),
      ...(targetYeonjang
        ? [inputReceipt(`yeonjang:${targetYeonjang.packageName}`, targetYeonjang)]
        : []),
    ]
    return Object.freeze({
      kind: "knowbee.installer.bundle_plan",
      schemaVersion: 1,
      packageVersion: input.packageVersion,
      target: profile.target,
      archive: profile.archive,
      outputName: `knowbee-${input.packageVersion}-${profile.target}.${profile.archive}`,
      entrypoint: profile.os === "win32" ? "bin/knowbee.cmd" : "bin/knowbee",
      node: INSTALLER_NODE_RUNTIME,
      inputs: Object.freeze(inputs),
      yeonjang: targetYeonjang
        ? Object.freeze({ status: "included", packageName: targetYeonjang.packageName })
        : Object.freeze({ status: "absent" }),
    })
  })
  return { status: "ready", plans: Object.freeze(plans) }
}
