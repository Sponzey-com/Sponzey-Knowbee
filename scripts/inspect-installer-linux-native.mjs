#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import {
  emitNativeInspectionResult,
  parseExactOptions,
  readBoundedJson,
} from "./lib/installer-native-cli.mjs"
import {
  compareNativeVersion,
  parseElfVersionRequirements,
} from "./lib/installer-native-evidence.mjs"

const execFile = promisify(execFileCallback)
const SHA256 = /^[a-f0-9]{64}$/u
const CANDIDATE_ID = /^sha256:[a-f0-9]{64}$/u
const MAX_FILES = 100_000

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

async function hashRegularFile(path) {
  let file
  try {
    const metadata = await lstat(path, { bigint: true })
    if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(path, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(256 * 1024)
    let sizeBytes = 0
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
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
      return undefined
    }
    return { sizeBytes, sha256: hash.digest("hex") }
  } catch {
    return undefined
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function isElfX64(path) {
  let file
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(path, fsConstants.O_RDONLY | noFollow)
    const header = Buffer.alloc(20)
    const { bytesRead } = await file.read(header, 0, header.byteLength, 0)
    return (
      bytesRead === header.byteLength &&
      header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      header[4] === 2 &&
      header[5] === 1 &&
      header.readUInt16LE(18) === 62
    )
  } catch {
    return false
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function collectElfFiles(current, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    if (output.length > MAX_FILES) throw new Error("too_many_files")
    const path = resolve(current, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) throw new Error("unsafe_tree")
    if (metadata.isDirectory()) {
      await collectElfFiles(path, output)
    } else if (metadata.isFile()) {
      if (await isElfX64(path)) output.push(path)
    } else {
      throw new Error("unsafe_tree")
    }
  }
  return output
}

function maximum(current, value) {
  if (!value) return current
  return !current || compareNativeVersion(value, current) > 0 ? value : current
}

export async function inspectLinuxInstallerNative(input, dependencies = {}) {
  if (
    typeof input?.stageRoot !== "string" ||
    input.verifiedReceipt?.status !== "verified" ||
    input.verifiedReceipt.target !== "linux-x64" ||
    input.verifiedReceipt.originTrust !== "unsigned_origin_unverified" ||
    typeof input.verifiedReceipt.manifestSha256 !== "string" ||
    !CANDIDATE_ID.test(input.verifiedReceipt.manifestSha256) ||
    typeof input.verifiedReceipt.sha256 !== "string" ||
    !SHA256.test(input.verifiedReceipt.sha256) ||
    typeof input.verifierPath !== "string" ||
    input.verifierReceipt?.target !== "linux-x64" ||
    typeof input.verifierReceipt.sha256 !== "string" ||
    !SHA256.test(input.verifierReceipt.sha256) ||
    typeof dependencies.readVersions !== "function"
  ) {
    return reject("installer_linux_native_input_invalid")
  }
  const stageRoot = resolve(input.stageRoot)
  const rootMetadata = await lstat(stageRoot).catch(() => undefined)
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) {
    return reject("installer_linux_stage_unsafe")
  }
  const verifierPath = resolve(input.verifierPath)
  const verifierIdentity = await hashRegularFile(verifierPath)
  if (!verifierIdentity || verifierIdentity.sha256 !== input.verifierReceipt.sha256) {
    return blocked("installer_linux_verifier_identity_mismatch")
  }
  if (!(await isElfX64(verifierPath))) return blocked("installer_linux_verifier_target_mismatch")

  let files
  try {
    files = await collectElfFiles(stageRoot)
  } catch {
    return reject("installer_linux_stage_unsafe")
  }
  if (files.length === 0) return blocked("installer_linux_native_files_missing")
  let maxGlibc
  let maxGlibcxx
  for (const path of files) {
    let parsed
    try {
      parsed = parseElfVersionRequirements(await dependencies.readVersions(path))
    } catch {
      return blocked("installer_linux_abi_inspection_failed")
    }
    if (parsed.status === "rejected") return blocked("installer_linux_abi_inspection_failed")
    maxGlibc = maximum(maxGlibc, parsed.maxGlibc)
    maxGlibcxx = maximum(maxGlibcxx, parsed.maxGlibcxx)
  }
  let verifierVersions
  try {
    verifierVersions = parseElfVersionRequirements(await dependencies.readVersions(verifierPath))
  } catch {
    return blocked("installer_linux_abi_inspection_failed")
  }
  let verifierStatic = false
  if (!verifierVersions.maxGlibc && typeof dependencies.isStaticExecutable === "function") {
    try {
      verifierStatic = (await dependencies.isStaticExecutable(verifierPath)) === true
    } catch {
      verifierStatic = false
    }
  }
  if (
    verifierVersions.status === "rejected" ||
    !maxGlibc ||
    (!verifierVersions.maxGlibc && !verifierStatic) ||
    compareNativeVersion(maxGlibc, "2.28") > 0 ||
    (maxGlibcxx && compareNativeVersion(maxGlibcxx, "3.4.25") > 0) ||
    (verifierVersions.maxGlibc && compareNativeVersion(verifierVersions.maxGlibc, "2.28") > 0)
  ) {
    return {
      ...blocked("installer_linux_abi_floor_exceeded"),
      ...(maxGlibc ? { maxGlibc } : {}),
      ...(maxGlibcxx ? { maxGlibcxx } : {}),
      ...(verifierVersions.maxGlibc ? { verifierMaxGlibc: verifierVersions.maxGlibc } : {}),
    }
  }
  return {
    status: "ready",
    attestation: {
      kind: "knowbee.installer.native_attestation",
      schemaVersion: 1,
      target: "linux-x64",
      candidateId: input.verifiedReceipt.manifestSha256,
      artifactSha256: input.verifiedReceipt.sha256,
      verifierSha256: verifierIdentity.sha256,
      status: "passed",
      originTrust: "unsigned_origin_unverified",
      maxGlibc,
      ...(maxGlibcxx ? { maxGlibcxx } : {}),
      ...(verifierStatic
        ? { verifierLinkage: "static" }
        : { verifierMaxGlibc: verifierVersions.maxGlibc }),
      nativeFileCount: files.length,
    },
  }
}

export function createReadelfVersionReader(readelfPath) {
  return async (path) => {
    const result = await execFile(readelfPath, ["--version-info", "--wide", path], {
      env: {},
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    })
    if (result.stderr !== "") throw new Error("readelf_stderr")
    return result.stdout
  }
}

export function isReadelfStaticallyLinked(dynamicSection) {
  return typeof dynamicSection === "string" && !/\(NEEDED\)/u.test(dynamicSection)
}

function createReadelfStaticInspector(readelfPath) {
  return async (path) => {
    const dynamic = await execFile(readelfPath, ["--dynamic", path], {
      env: {}, maxBuffer: 1024 * 1024, timeout: 30_000,
    })
    return isReadelfStaticallyLinked(dynamic.stdout)
  }
}

export async function runLinuxInstallerNativeCli(argv) {
  const values = parseExactOptions(argv, [
    "--stage",
    "--verified-receipt",
    "--verifier",
    "--verifier-receipt",
    "--readelf",
  ])
  if (!values || !values.get("--readelf")?.startsWith("/")) {
    return reject("installer_linux_native_arguments_invalid")
  }
  const [verifiedReceipt, verifierReceipt] = await Promise.all([
    readBoundedJson(values.get("--verified-receipt")),
    readBoundedJson(values.get("--verifier-receipt")),
  ])
  if (!verifiedReceipt || !verifierReceipt) {
    return reject("installer_linux_native_receipt_invalid")
  }
  const readelf = values.get("--readelf")
  return inspectLinuxInstallerNative(
    {
      stageRoot: values.get("--stage"),
      verifiedReceipt,
      verifierPath: values.get("--verifier"),
      verifierReceipt,
    },
    {
      readVersions: createReadelfVersionReader(readelf),
      isStaticExecutable: createReadelfStaticInspector(readelf),
    },
  )
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  emitNativeInspectionResult(await runLinuxInstallerNativeCli(process.argv.slice(2)))
}
