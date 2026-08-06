#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { INSTALLER_PLATFORM_PROFILES } from "./lib/installer-platforms.mjs"

const READ_BUFFER_BYTES = 256 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function regularDirectory(path, reasonCode) {
  const metadata = await lstat(path).catch(() => undefined)
  return metadata?.isDirectory() && !metadata.isSymbolicLink()
    ? { status: "ready" }
    : reject(reasonCode)
}

async function hashRegularFile(path, reasonCode) {
  let file
  try {
    const metadata = await lstat(path, { bigint: true })
    if (!metadata.isFile() || metadata.isSymbolicLink()) return reject(reasonCode)
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
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes > 10_000_000_000) return reject(reasonCode)
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
      return reject(reasonCode)
    }
    return { status: "ready", sizeBytes, sha256: hash.digest("hex") }
  } catch {
    return reject(reasonCode)
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function readReceipt(path, target) {
  const identity = await hashRegularFile(path, `installer_release_bundle_receipt_unsafe:${target}`)
  if (identity.status !== "ready" || identity.sizeBytes > 1024 * 1024) return identity
  try {
    return { status: "ready", value: JSON.parse(await readFile(path, "utf8")) }
  } catch {
    return reject(`installer_release_bundle_receipt_unsafe:${target}`)
  }
}

export async function collectInstallerReleaseAssets(input) {
  if (
    typeof input?.bundleRoot !== "string" ||
    typeof input.verifierRoot !== "string" ||
    typeof input.outputDirectory !== "string"
  ) {
    return reject("installer_release_asset_input_invalid")
  }
  const bundleRoot = resolve(input.bundleRoot)
  const verifierRoot = resolve(input.verifierRoot)
  const outputDirectory = resolve(input.outputDirectory)
  for (const [path, reason] of [
    [bundleRoot, "installer_release_bundle_root_unsafe"],
    [verifierRoot, "installer_release_verifier_root_unsafe"],
  ]) {
    const checked = await regularDirectory(path, reason)
    if (checked.status !== "ready") return checked
  }
  if (await lstat(outputDirectory).catch(() => undefined)) {
    return reject("installer_release_asset_output_exists")
  }
  const parent = await regularDirectory(
    dirname(outputDirectory),
    "installer_release_asset_output_parent_unsafe",
  )
  if (parent.status !== "ready") return parent

  const artifacts = []
  const verifiers = []
  for (const profile of INSTALLER_PLATFORM_PROFILES) {
    const bundleDirectory = join(bundleRoot, `installer-bundle-${profile.target}`)
    const receiptResult = await readReceipt(
      join(bundleDirectory, "artifact-receipt.json"),
      profile.target,
    )
    if (receiptResult.status !== "ready") return receiptResult
    const receipt = receiptResult.value
    if (
      receipt?.target !== profile.target ||
      receipt.archive !== profile.archive ||
      typeof receipt.name !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(receipt.name) ||
      dirname(resolve(bundleDirectory, receipt.name)) !== bundleDirectory
    ) {
      return reject(`installer_release_bundle_receipt_invalid:${profile.target}`)
    }
    const artifact = await hashRegularFile(
      join(bundleDirectory, receipt.name),
      `installer_release_bundle_unsafe:${profile.target}`,
    )
    if (artifact.status !== "ready") return artifact
    if (artifact.sizeBytes !== receipt.sizeBytes || artifact.sha256 !== receipt.sha256) {
      return reject(`installer_release_bundle_identity_mismatch:${profile.target}`)
    }
    artifacts.push(receipt)

    const verifierName = `knowbee-installer-verify-${profile.target}${profile.os === "win32" ? ".exe" : ""}`
    const verifier = await hashRegularFile(
      join(verifierRoot, `installer-verifier-${profile.target}`, verifierName),
      `installer_release_verifier_unsafe:${profile.target}`,
    )
    if (verifier.status !== "ready") return verifier
    verifiers.push({
      target: profile.target,
      name: verifierName,
      sizeBytes: verifier.sizeBytes,
      sha256: verifier.sha256,
    })
  }

  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    await Promise.all([
      writeFile(
        join(temporaryDirectory, "artifact-receipts.json"),
        `${JSON.stringify(artifacts)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      ),
      writeFile(
        join(temporaryDirectory, "verifier-receipts.json"),
        `${JSON.stringify(verifiers)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      ),
    ])
    if (await lstat(outputDirectory).catch(() => undefined)) {
      return reject("installer_release_asset_output_exists")
    }
    await rename(temporaryDirectory, outputDirectory)
    return { status: "ready", bundleCount: artifacts.length, verifierCount: verifiers.length }
  } catch {
    return reject("installer_release_asset_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function parseArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 6 ||
    argv[0] !== "--bundle-root" ||
    argv[2] !== "--verifier-root" ||
    argv[4] !== "--output-dir"
  ) {
    return reject("installer_release_asset_arguments_invalid")
  }
  return {
    status: "parsed",
    bundleRoot: argv[1],
    verifierRoot: argv[3],
    outputDirectory: argv[5],
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2))
  const result = parsed.status === "parsed" ? await collectInstallerReleaseAssets(parsed) : parsed
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main()
