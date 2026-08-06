import { createHash, randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import { buildInstallerPlatformBundlePlans } from "./installer-bundle-plan.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"
import { collectPinnedNodeReleaseArchives } from "./node-release-input.mjs"

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const PACKAGE_NAMES = Object.freeze([
  "@sponzey/cli",
  "@sponzey/core",
  "@sponzey/knowbee",
  "@sponzey/webui",
])
const READ_BUFFER_BYTES = 256 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function packageFileName(packageName, packageVersion) {
  return `${packageName.slice(1).replace("/", "-")}-${packageVersion}.tgz`
}

async function hashRegularFile(rootDirectory, fileName, reasonPrefix) {
  const path = resolve(rootDirectory, fileName)
  if (dirname(path) !== rootDirectory) return reject(`${reasonPrefix}_path_unsafe`)
  let file
  try {
    const pathMetadata = await lstat(path, { bigint: true })
    if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) {
      return reject(`${reasonPrefix}_path_unsafe`)
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(path, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let sizeBytes = 0
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes > 10_000_000_000) {
        return reject(`${reasonPrefix}_size_unsupported`)
      }
      hash.update(buffer.subarray(0, bytesRead))
    }
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(sizeBytes) !== after.size
    ) {
      return reject(`${reasonPrefix}_changed`)
    }
    return { status: "ready", receipt: { fileName, sizeBytes, sha256: hash.digest("hex") } }
  } catch {
    return reject(`${reasonPrefix}_unavailable`)
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function collectPackages(rootDirectory, packageVersion, values, kind) {
  const receipts = []
  for (const value of values) {
    const packageName = typeof value === "string" ? value : value.packageName
    const fileName = packageFileName(packageName, packageVersion)
    const collected = await hashRegularFile(rootDirectory, fileName, `${kind}_package`)
    if (collected.status !== "ready") return collected
    receipts.push({
      ...(typeof value === "string" ? {} : { target: value.target }),
      packageName,
      packageVersion,
      ...collected.receipt,
    })
  }
  return { status: "ready", receipts }
}

export async function prepareInstallerBundleInputs(input, dependencies = {}) {
  if (
    typeof input?.packageVersion !== "string" ||
    !VERSION.test(input.packageVersion) ||
    typeof input.inputDirectory !== "string" ||
    typeof input.outputDirectory !== "string" ||
    !(input.shasumsBytes instanceof Uint8Array) ||
    !(input.signatureBytes instanceof Uint8Array) ||
    typeof dependencies.verifyNodeSignature !== "function"
  ) {
    return reject("installer_input_preparation_invalid")
  }
  const inputDirectory = resolve(input.inputDirectory)
  const outputDirectory = resolve(input.outputDirectory)
  const inputMetadata = await lstat(inputDirectory).catch(() => undefined)
  if (!inputMetadata?.isDirectory() || inputMetadata.isSymbolicLink()) {
    return reject("installer_input_directory_unsafe")
  }
  if (await lstat(outputDirectory).catch(() => undefined)) {
    return reject("installer_input_output_exists")
  }
  const parentMetadata = await lstat(dirname(outputDirectory)).catch(() => undefined)
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) {
    return reject("installer_input_output_parent_unsafe")
  }

  const collectNodeArchives = dependencies.collectNodeArchives ?? collectPinnedNodeReleaseArchives
  const node = await collectNodeArchives({
    shasumsBytes: input.shasumsBytes,
    signatureBytes: input.signatureBytes,
    archiveDirectory: inputDirectory,
    verifySignature: dependencies.verifyNodeSignature,
    signal: input.signal,
  })
  if (node.status !== "verified") return node
  const npm = await collectPackages(inputDirectory, input.packageVersion, PACKAGE_NAMES, "npm")
  if (npm.status !== "ready") return npm
  const yeonjang = await collectPackages(
    inputDirectory,
    input.packageVersion,
    INSTALLER_PLATFORM_PROFILES.map((profile) => ({
      target: profile.target,
      packageName: profile.yeonjangPackage,
    })),
    "yeonjang",
  )
  if (yeonjang.status !== "ready") return yeonjang
  const receipts = {
    packageVersion: input.packageVersion,
    nodeArchives: node.receipts,
    npmPackages: npm.receipts,
    yeonjangPackages: yeonjang.receipts,
  }
  const built = buildInstallerPlatformBundlePlans(receipts)
  if (built.status !== "ready") return built

  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`
  try {
    await mkdir(join(temporaryDirectory, "plans"), { recursive: true, mode: 0o700 })
    await writeFile(
      join(temporaryDirectory, "input-receipts.json"),
      `${JSON.stringify(receipts)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    )
    for (const plan of built.plans) {
      await writeFile(
        join(temporaryDirectory, "plans", `${plan.target}.json`),
        `${JSON.stringify(plan)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      )
    }
    if (await lstat(outputDirectory).catch(() => undefined)) {
      return reject("installer_input_output_exists")
    }
    await rename(temporaryDirectory, outputDirectory)
    return {
      status: "ready",
      packageVersion: input.packageVersion,
      targets: built.plans.map((plan) => plan.target),
    }
  } catch {
    return reject("installer_input_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}
