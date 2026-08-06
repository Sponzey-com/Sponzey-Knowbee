import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const SHA256 = /^[a-f0-9]{64}$/
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_SHASUMS_BYTES = 128 * 1024
const MAX_SIGNATURE_BYTES = 64 * 1024
const READ_BUFFER_BYTES = 256 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parseExpectedArchives(values) {
  if (!Array.isArray(values) || values.length === 0) return undefined
  const seenTargets = new Set()
  const seenFiles = new Set()
  const parsed = []
  for (const value of values) {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof value.target !== "string" ||
      value.target.length === 0 ||
      typeof value.fileName !== "string" ||
      value.fileName.length > 240 ||
      !SAFE_FILE_NAME.test(value.fileName) ||
      typeof value.sha256 !== "string" ||
      !SHA256.test(value.sha256) ||
      seenTargets.has(value.target) ||
      seenFiles.has(value.fileName)
    ) {
      return undefined
    }
    seenTargets.add(value.target)
    seenFiles.add(value.fileName)
    parsed.push(
      Object.freeze({ target: value.target, fileName: value.fileName, sha256: value.sha256 }),
    )
  }
  return Object.freeze(parsed)
}

function parseShasums(bytes) {
  let content
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
  const entries = new Map()
  for (const line of content.split(/\r?\n/)) {
    if (line.length === 0) continue
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line)
    if (!match) return undefined
    const digest = match[1]
    const fileName = match[2]
    if (!digest || !fileName || entries.has(fileName)) return undefined
    entries.set(fileName, digest)
  }
  return entries
}

function sameFileIdentity(before, after) {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  )
}

async function collectFileReceipt({ rootDirectory, expected, signal }) {
  if (signal?.aborted) return reject("node_archive_verification_cancelled")
  const path = resolve(rootDirectory, expected.fileName)
  if (dirname(path) !== rootDirectory) return reject(`node_archive_path_unsafe:${expected.target}`)

  try {
    const pathMetadata = await lstat(path, { bigint: true })
    if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) {
      return reject(`node_archive_path_unsafe:${expected.target}`)
    }
  } catch {
    return reject(`node_archive_unavailable:${expected.target}`)
  }

  let file
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(path, fsConstants.O_RDONLY | noFollow)
  } catch {
    return reject(`node_archive_path_unsafe:${expected.target}`)
  }

  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile()) return reject(`node_archive_path_unsafe:${expected.target}`)
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let sizeBytes = 0
    while (true) {
      if (signal?.aborted) return reject("node_archive_verification_cancelled")
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes > 10_000_000_000) {
        return reject(`node_archive_size_unsupported:${expected.target}`)
      }
      hash.update(buffer.subarray(0, bytesRead))
    }
    const after = await file.stat({ bigint: true })
    if (!sameFileIdentity(before, after) || BigInt(sizeBytes) !== after.size) {
      return reject(`node_archive_changed_during_verification:${expected.target}`)
    }
    const observedSha256 = hash.digest("hex")
    if (observedSha256 !== expected.sha256) {
      return reject(`node_archive_digest_mismatch:${expected.target}`)
    }
    return {
      status: "verified",
      receipt: Object.freeze({
        target: expected.target,
        fileName: expected.fileName,
        sizeBytes,
        sha256: observedSha256,
      }),
    }
  } catch {
    return reject(`node_archive_unavailable:${expected.target}`)
  } finally {
    await file.close()
  }
}

export async function collectVerifiedReleaseArchives(input) {
  const expectedArchives = parseExpectedArchives(input?.trustedExpectedArchives)
  if (!expectedArchives) return reject("trusted_node_archive_identity_invalid")
  if (
    !(input.shasumsBytes instanceof Uint8Array) ||
    input.shasumsBytes.byteLength === 0 ||
    input.shasumsBytes.byteLength > MAX_SHASUMS_BYTES ||
    !(input.signatureBytes instanceof Uint8Array) ||
    input.signatureBytes.byteLength === 0 ||
    input.signatureBytes.byteLength > MAX_SIGNATURE_BYTES ||
    typeof input.verifySignature !== "function" ||
    typeof input.archiveDirectory !== "string" ||
    input.archiveDirectory.length === 0
  ) {
    return reject("node_release_input_invalid")
  }

  const payloadBytes = Buffer.from(input.shasumsBytes)
  const signatureBytes = Buffer.from(input.signatureBytes)
  let signatureAccepted = false
  try {
    signatureAccepted =
      (await input.verifySignature({
        payloadBytes: Buffer.from(payloadBytes),
        signatureBytes: Buffer.from(signatureBytes),
      })) === true
  } catch {
    signatureAccepted = false
  }
  if (!signatureAccepted) return reject("node_shasums_signature_invalid")

  const shasums = parseShasums(payloadBytes)
  if (!shasums) return reject("node_shasums_invalid")
  for (const expected of expectedArchives) {
    const digest = shasums.get(expected.fileName)
    if (!digest) return reject(`node_shasums_entry_missing:${expected.target}`)
    if (digest !== expected.sha256) {
      return reject(`node_shasums_digest_mismatch:${expected.target}`)
    }
  }

  const rootDirectory = resolve(input.archiveDirectory)
  const receipts = []
  for (const expected of expectedArchives) {
    const collected = await collectFileReceipt({
      rootDirectory,
      expected,
      signal: input.signal,
    })
    if (collected.status === "rejected") return collected
    receipts.push(collected.receipt)
  }
  return { status: "verified", receipts: Object.freeze(receipts) }
}

export async function collectPinnedNodeReleaseArchives(input) {
  return collectVerifiedReleaseArchives({
    ...input,
    trustedExpectedArchives: INSTALLER_PLATFORM_PROFILES.map((profile) => ({
      target: profile.target,
      fileName: profile.nodeRuntimeArchive,
      sha256: profile.nodeRuntimeSha256,
    })),
  })
}
