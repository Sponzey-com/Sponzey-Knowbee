import { lstat, readFile, readdir } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

import { hashNativeFile } from "./installer-native-files.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const CANDIDATE_ID = /^sha256:[a-f0-9]{64}$/u
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
const FIXED_ASSETS = Object.freeze([
  "install.ps1",
  "install.sh",
  "installer-manifest.json",
  "installer-release-gate.json",
])

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

function declaredNames(values, expectedTargets) {
  if (!Array.isArray(values)) return undefined
  const byTarget = new Map()
  for (const value of values) {
    if (
      typeof value?.target !== "string" ||
      !expectedTargets.has(value.target) ||
      byTarget.has(value.target) ||
      typeof value.name !== "string" ||
      !SAFE_NAME.test(value.name)
    ) {
      return undefined
    }
    byTarget.set(value.target, value.name)
  }
  return byTarget.size === expectedTargets.size ? [...byTarget.values()] : undefined
}

async function flatRegularNames(assetRoot) {
  const root = resolve(assetRoot)
  const rootMetadata = await lstat(root).catch(() => undefined)
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) return undefined
  const names = await readdir(root)
  for (const name of names) {
    if (basename(name) !== name || !SAFE_NAME.test(name)) return undefined
    const metadata = await lstat(join(root, name)).catch(() => undefined)
    if (!metadata?.isFile() || metadata.isSymbolicLink()) return undefined
  }
  return { root, names: names.sort((left, right) => left.localeCompare(right, "en")) }
}

function sameNames(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export async function collectInstallerFinalizedAssets(input) {
  if (
    typeof input?.candidateId !== "string" ||
    !CANDIDATE_ID.test(input.candidateId) ||
    typeof input.releaseTag !== "string" ||
    !RELEASE_TAG.test(input.releaseTag)
  ) {
    return reject("installer_finalized_input_invalid")
  }
  const targets = new Set(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target))
  const artifacts = declaredNames(input.artifacts, targets)
  const verifiers = declaredNames(input.verifiers, targets)
  const tree = await flatRegularNames(input.assetRoot)
  if (!artifacts || !verifiers || !tree) {
    return reject("installer_finalized_asset_set_invalid")
  }
  const expected = [...FIXED_ASSETS, ...artifacts, ...verifiers].sort((left, right) =>
    left.localeCompare(right, "en"),
  )
  if (new Set(expected).size !== expected.length || !sameNames(tree.names, expected)) {
    return reject("installer_finalized_asset_set_invalid")
  }
  const assets = []
  for (const name of expected) {
    const identity = await hashNativeFile(join(tree.root, name))
    if (!identity) return reject("installer_finalized_asset_set_invalid")
    assets.push({ name, sizeBytes: identity.sizeBytes, sha256: identity.sha256 })
  }
  const manifestIdentity = assets.find((asset) => asset.name === "installer-manifest.json")
  if (!manifestIdentity || `sha256:${manifestIdentity.sha256}` !== input.candidateId) {
    return reject("installer_finalized_candidate_mismatch")
  }
  if (manifestIdentity.sizeBytes > 1024 * 1024) {
    return reject("installer_finalized_manifest_invalid")
  }
  try {
    const manifest = JSON.parse(await readFile(join(tree.root, "installer-manifest.json"), "utf8"))
    if (
      manifest?.kind !== "knowbee.install.manifest" ||
      manifest.schemaVersion !== 2 ||
      manifest.releaseVersion !== input.releaseTag.slice(1)
    ) {
      return reject("installer_finalized_manifest_invalid")
    }
  } catch {
    return reject("installer_finalized_manifest_invalid")
  }
  return {
    status: "ready",
    inventory: Object.freeze({
      kind: "knowbee.installer.finalized_asset_inventory",
      schemaVersion: 1,
      candidateId: input.candidateId,
      releaseTag: input.releaseTag,
      assetCount: assets.length,
      assets: Object.freeze(assets),
    }),
  }
}

export async function verifyInstallerFinalizedAssets(input) {
  const inventory = input?.inventory
  if (
    inventory?.kind !== "knowbee.installer.finalized_asset_inventory" ||
    inventory.schemaVersion !== 1 ||
    typeof inventory.candidateId !== "string" ||
    !CANDIDATE_ID.test(inventory.candidateId) ||
    typeof inventory.releaseTag !== "string" ||
    !RELEASE_TAG.test(inventory.releaseTag) ||
    inventory.assetCount !== 14 ||
    !Array.isArray(inventory.assets) ||
    inventory.assets.length !== 14
  ) {
    return reject("installer_finalized_inventory_invalid")
  }
  const tree = await flatRegularNames(input.assetRoot)
  const expectedNames = inventory.assets.map((asset) => asset?.name)
  if (
    !tree ||
    expectedNames.some((name) => typeof name !== "string" || !SAFE_NAME.test(name)) ||
    new Set(expectedNames).size !== expectedNames.length ||
    !sameNames(
      tree.names,
      [...expectedNames].sort((left, right) => left.localeCompare(right, "en")),
    )
  ) {
    return reject("installer_finalized_asset_set_invalid")
  }
  for (const expected of inventory.assets) {
    const identity = await hashNativeFile(join(tree.root, expected.name))
    if (
      !identity ||
      identity.sizeBytes !== expected.sizeBytes ||
      identity.sha256 !== expected.sha256
    ) {
      return blocked(`installer_finalized_asset_mismatch:${expected.name}`)
    }
  }
  return {
    status: "verified",
    candidateId: inventory.candidateId,
    releaseTag: inventory.releaseTag,
    assetCount: inventory.assetCount,
  }
}
