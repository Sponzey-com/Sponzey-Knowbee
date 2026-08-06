import { createHash, randomUUID } from "node:crypto"
import { createWriteStream, existsSync, constants as fsConstants } from "node:fs"
import { link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGzip } from "node:zlib"

import { parseUnsignedInstallerManifest } from "../../packages/core/src/release/installer-contract.js"
import { INSTALLER_NODE_RUNTIME, INSTALLER_PLATFORM_PROFILES } from "./installer-platforms.mjs"

const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SAFE_INPUT_ID = /^[A-Za-z0-9@:/._-]+$/
const READ_BUFFER_BYTES = 256 * 1024
const ZIP32_MAX = 0xffff_ffff

class ArchiveBuildError extends Error {
  constructor(reasonCode) {
    super(reasonCode)
    this.name = "ArchiveBuildError"
    this.reasonCode = reasonCode
  }
}

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parsePlan(value) {
  if (
    !isRecord(value) ||
    value.kind !== "knowbee.installer.bundle_plan" ||
    value.schemaVersion !== 1 ||
    typeof value.packageVersion !== "string" ||
    !VERSION.test(value.packageVersion) ||
    typeof value.target !== "string"
  ) {
    return undefined
  }
  const profile = INSTALLER_PLATFORM_PROFILES.find((candidate) => candidate.target === value.target)
  if (!profile) return undefined
  const expectedOutputName = `knowbee-${value.packageVersion}-${profile.target}.${profile.archive}`
  const expectedEntrypoint = profile.os === "win32" ? "bin/knowbee.cmd" : "bin/knowbee"
  if (
    value.archive !== profile.archive ||
    value.outputName !== expectedOutputName ||
    value.entrypoint !== expectedEntrypoint ||
    !isRecord(value.node) ||
    value.node.version !== INSTALLER_NODE_RUNTIME.version ||
    value.node.moduleAbi !== INSTALLER_NODE_RUNTIME.moduleAbi ||
    !Array.isArray(value.inputs) ||
    value.inputs.length === 0 ||
    !isRecord(value.yeonjang) ||
    (value.yeonjang.status !== "absent" && value.yeonjang.status !== "included") ||
    (value.yeonjang.status === "included" && value.yeonjang.packageName !== profile.yeonjangPackage)
  ) {
    return undefined
  }

  const ids = new Set()
  const fileNames = new Set()
  const inputs = []
  for (const input of value.inputs) {
    if (
      !isRecord(input) ||
      typeof input.id !== "string" ||
      !SAFE_INPUT_ID.test(input.id) ||
      typeof input.fileName !== "string" ||
      input.fileName.length > 240 ||
      !SAFE_FILE_NAME.test(input.fileName) ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > 10_000_000_000 ||
      typeof input.sha256 !== "string" ||
      !SHA256.test(input.sha256) ||
      ids.has(input.id) ||
      fileNames.has(input.fileName)
    ) {
      return undefined
    }
    ids.add(input.id)
    fileNames.add(input.fileName)
    inputs.push(
      Object.freeze({
        id: input.id,
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      }),
    )
  }
  inputs.sort((left, right) => left.fileName.localeCompare(right.fileName, "en"))
  return Object.freeze({
    kind: "knowbee.installer.bundle_plan",
    schemaVersion: 2,
    packageVersion: value.packageVersion,
    target: profile.target,
    archive: profile.archive,
    outputName: expectedOutputName,
    entrypoint: expectedEntrypoint,
    node: INSTALLER_NODE_RUNTIME,
    inputs: Object.freeze(inputs),
    yeonjang:
      value.yeonjang.status === "included" && typeof value.yeonjang.packageName === "string"
        ? Object.freeze({ status: "included", packageName: value.yeonjang.packageName })
        : Object.freeze({ status: "absent" }),
  })
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.byteLength > length) throw new ArchiveBuildError("bundle_archive_entry_name_too_long")
  bytes.copy(header, offset)
}

function writeTarOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0")
  if (encoded.length >= length) throw new ArchiveBuildError("bundle_archive_entry_size_unsupported")
  writeTarString(header, offset, length, `${encoded}\0`)
}

function canWriteUstarPath(path) {
  const bytes = Buffer.from(path, "utf8")
  if (bytes.byteLength <= 100) return true

  const segments = path.split("/")
  for (let index = 1; index < segments.length; index += 1) {
    const prefix = segments.slice(0, index).join("/")
    const name = segments.slice(index).join("/")
    if (Buffer.byteLength(prefix, "utf8") <= 155 && Buffer.byteLength(name, "utf8") <= 100) {
      return true
    }
  }
  return false
}

function writeTarPath(header, path) {
  if (Buffer.byteLength(path, "utf8") <= 100) {
    writeTarString(header, 0, 100, path)
    return
  }
  const segments = path.split("/")
  for (let index = 1; index < segments.length; index += 1) {
    const prefix = segments.slice(0, index).join("/")
    const name = segments.slice(index).join("/")
    if (Buffer.byteLength(prefix, "utf8") <= 155 && Buffer.byteLength(name, "utf8") <= 100) {
      writeTarString(header, 0, 100, name)
      writeTarString(header, 345, 155, prefix)
      return
    }
  }
  throw new ArchiveBuildError("bundle_archive_entry_name_too_long")
}

function paxPathRecord(path) {
  const body = `path=${path}\n`
  let length = Buffer.byteLength(body, "utf8") + 2
  while (true) {
    const record = `${length} ${body}`
    const observedLength = Buffer.byteLength(record, "utf8")
    if (observedLength === length) return Buffer.from(record, "utf8")
    length = observedLength
  }
}

function tarHeader(name, sizeBytes, mode = 0o644, typeFlag = 0x30) {
  const header = Buffer.alloc(512)
  writeTarPath(header, name)
  writeTarOctal(header, 100, 8, mode)
  writeTarOctal(header, 108, 8, 0)
  writeTarOctal(header, 116, 8, 0)
  writeTarOctal(header, 124, 12, sizeBytes)
  writeTarOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  header[156] = typeFlag
  writeTarString(header, 257, 6, "ustar\0")
  writeTarString(header, 263, 2, "00")
  let checksum = 0
  for (const byte of header) checksum += byte
  const checksumText = checksum.toString(8).padStart(6, "0")
  writeTarString(header, 148, 8, `${checksumText}\0 `)
  return header
}

async function* sourceFileChunks({ inputDirectory, input, signal }) {
  if (signal?.aborted) throw new ArchiveBuildError("bundle_archive_cancelled")
  const path = resolve(inputDirectory, input.fileName)
  if (dirname(path) !== inputDirectory) {
    throw new ArchiveBuildError(`bundle_input_path_unsafe:${input.id}`)
  }
  let metadata
  try {
    metadata = await lstat(path, { bigint: true })
  } catch {
    throw new ArchiveBuildError(`bundle_input_unavailable:${input.id}`)
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ArchiveBuildError(`bundle_input_path_unsafe:${input.id}`)
  }

  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
  let file
  try {
    file = await open(path, fsConstants.O_RDONLY | noFollow)
  } catch {
    throw new ArchiveBuildError(`bundle_input_path_unsafe:${input.id}`)
  }
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile()) throw new ArchiveBuildError(`bundle_input_path_unsafe:${input.id}`)
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let sizeBytes = 0
    while (true) {
      if (signal?.aborted) throw new ArchiveBuildError("bundle_archive_cancelled")
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
      hash.update(buffer.subarray(0, bytesRead))
      yield Buffer.from(buffer.subarray(0, bytesRead))
    }
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new ArchiveBuildError(`bundle_input_changed_during_copy:${input.id}`)
    }
    if (sizeBytes !== input.sizeBytes) {
      throw new ArchiveBuildError(`bundle_input_size_mismatch:${input.id}`)
    }
    if (hash.digest("hex") !== input.sha256) {
      throw new ArchiveBuildError(`bundle_input_digest_mismatch:${input.id}`)
    }
  } finally {
    await file.close()
  }
}

function planBytes(plan) {
  return Buffer.from(`${JSON.stringify(plan)}\n`, "utf8")
}

async function* tarArchiveChunks({ plan, inputDirectory, signal }) {
  const metadata = planBytes(plan)
  yield tarHeader("bundle-plan.json", metadata.byteLength)
  yield metadata
  const metadataPadding = (512 - (metadata.byteLength % 512)) % 512
  if (metadataPadding > 0) yield Buffer.alloc(metadataPadding)

  for (const input of plan.inputs) {
    yield tarHeader(`payload/${input.fileName}`, input.sizeBytes)
    for await (const chunk of sourceFileChunks({ inputDirectory, input, signal })) yield chunk
    const padding = (512 - (input.sizeBytes % 512)) % 512
    if (padding > 0) yield Buffer.alloc(padding)
  }
  yield Buffer.alloc(1024)
}

function safeLayoutPath(value) {
  return (
    value.length > 0 &&
    value.length <= 4096 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (segment) =>
          segment.length > 0 &&
          segment !== "." &&
          segment !== ".." &&
          /^[A-Za-z0-9@._+-]+$/u.test(segment),
      )
  )
}

async function collectLayoutFiles(root, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    const path = join(current, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) throw new ArchiveBuildError("bundle_layout_path_unsafe")
    if (metadata.isDirectory()) {
      await collectLayoutFiles(root, path, output)
      continue
    }
    if (!metadata.isFile()) throw new ArchiveBuildError("bundle_layout_path_unsafe")
    const archivePath = relative(root, path).split(sep).join("/")
    if (!safeLayoutPath(archivePath) || metadata.size > 10_000_000_000) {
      throw new ArchiveBuildError("bundle_layout_path_unsafe")
    }
    const identity = await hashFile(path)
    output.push({
      archivePath,
      path,
      sizeBytes: identity.sizeBytes,
      sha256: identity.sha256,
      mode: metadata.mode & 0o111 ? 0o755 : 0o644,
    })
  }
  output.sort((left, right) => left.archivePath.localeCompare(right.archivePath, "en"))
  const folded = new Set()
  for (const entry of output) {
    const key = entry.archivePath.toLowerCase()
    if (folded.has(key)) throw new ArchiveBuildError("bundle_layout_path_collision")
    folded.add(key)
  }
  return output
}

async function* layoutFileChunks(entry, signal) {
  if (signal?.aborted) throw new ArchiveBuildError("bundle_archive_cancelled")
  const metadata = await lstat(entry.path, { bigint: true })
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ArchiveBuildError("bundle_layout_path_unsafe")
  }
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
  const file = await open(entry.path, fsConstants.O_RDONLY | noFollow)
  try {
    const before = await file.stat({ bigint: true })
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let sizeBytes = 0
    while (true) {
      if (signal?.aborted) throw new ArchiveBuildError("bundle_archive_cancelled")
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
      hash.update(buffer.subarray(0, bytesRead))
      yield Buffer.from(buffer.subarray(0, bytesRead))
    }
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      sizeBytes !== entry.sizeBytes ||
      hash.digest("hex") !== entry.sha256
    ) {
      throw new ArchiveBuildError("bundle_layout_changed_during_copy")
    }
  } finally {
    await file.close()
  }
}

async function* layoutTarArchiveChunks({ files, signal }) {
  for (const entry of files) {
    const requiresPax = !canWriteUstarPath(entry.archivePath)
    if (requiresPax) {
      const pax = paxPathRecord(entry.archivePath)
      yield tarHeader("PaxHeaders.0/path", pax.byteLength, 0o644, 0x78)
      yield pax
      const paxPadding = (512 - (pax.byteLength % 512)) % 512
      if (paxPadding > 0) yield Buffer.alloc(paxPadding)
    }
    yield tarHeader(requiresPax ? "././@PaxPayload" : entry.archivePath, entry.sizeBytes, entry.mode)
    for await (const chunk of layoutFileChunks(entry, signal)) yield chunk
    const padding = (512 - (entry.sizeBytes % 512)) % 512
    if (padding > 0) yield Buffer.alloc(padding)
  }
  yield Buffer.alloc(1024)
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function updateCrc32(crc, chunk) {
  let value = crc
  for (const byte of chunk) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]
  return value >>> 0
}

async function writeAll(file, buffer) {
  let offset = 0
  while (offset < buffer.byteLength) {
    const { bytesWritten } = await file.write(buffer, offset, buffer.byteLength - offset, null)
    if (bytesWritten <= 0) throw new ArchiveBuildError("bundle_archive_write_failed")
    offset += bytesWritten
  }
}

async function writeZipEntry({ file, name, chunks, offset, signal, mode = 0o644 }) {
  const nameBytes = Buffer.from(name, "utf8")
  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x0403_4b50, 0)
  localHeader.writeUInt16LE(20, 4)
  localHeader.writeUInt16LE(0x0808, 6)
  localHeader.writeUInt16LE(0, 8)
  localHeader.writeUInt16LE(0, 10)
  localHeader.writeUInt16LE(0, 12)
  localHeader.writeUInt16LE(nameBytes.byteLength, 26)
  await writeAll(file, localHeader)
  await writeAll(file, nameBytes)

  let crc = 0xffff_ffff
  let sizeBytes = 0
  for await (const chunk of chunks) {
    if (signal?.aborted) throw new ArchiveBuildError("bundle_archive_cancelled")
    sizeBytes += chunk.byteLength
    if (sizeBytes > ZIP32_MAX) throw new ArchiveBuildError("bundle_zip32_size_unsupported")
    crc = updateCrc32(crc, chunk)
    await writeAll(file, chunk)
  }
  crc = (crc ^ 0xffff_ffff) >>> 0
  const descriptor = Buffer.alloc(16)
  descriptor.writeUInt32LE(0x0807_4b50, 0)
  descriptor.writeUInt32LE(crc, 4)
  descriptor.writeUInt32LE(sizeBytes, 8)
  descriptor.writeUInt32LE(sizeBytes, 12)
  await writeAll(file, descriptor)
  return {
    nameBytes,
    crc,
    sizeBytes,
    offset,
    mode,
    totalBytes: localHeader.byteLength + nameBytes.byteLength + sizeBytes + descriptor.byteLength,
  }
}

async function* bufferChunks(buffer) {
  yield buffer
}

async function writeZipArchive({ plan, inputDirectory, path, signal }) {
  const file = await open(path, "wx")
  const centralEntries = []
  let offset = 0
  try {
    const metadata = planBytes(plan)
    const entries = [
      { name: "bundle-plan.json", chunks: bufferChunks(metadata) },
      ...plan.inputs.map((input) => ({
        name: `payload/${input.fileName}`,
        chunks: sourceFileChunks({ inputDirectory, input, signal }),
      })),
    ]
    for (const entry of entries) {
      const written = await writeZipEntry({ file, ...entry, offset, signal })
      centralEntries.push(written)
      offset += written.totalBytes
    }
    const centralOffset = offset
    for (const entry of centralEntries) {
      const header = Buffer.alloc(46)
      header.writeUInt32LE(0x0201_4b50, 0)
      header.writeUInt16LE(0x0314, 4)
      header.writeUInt16LE(20, 6)
      header.writeUInt16LE(0x0808, 8)
      header.writeUInt16LE(0, 10)
      header.writeUInt32LE(entry.crc, 16)
      header.writeUInt32LE(entry.sizeBytes, 20)
      header.writeUInt32LE(entry.sizeBytes, 24)
      header.writeUInt16LE(entry.nameBytes.byteLength, 28)
      header.writeUInt32LE(entry.offset, 42)
      header.writeUInt32LE((((0o100000 | entry.mode) & 0xffff) * 0x10000) >>> 0, 38)
      await writeAll(file, header)
      await writeAll(file, entry.nameBytes)
      offset += header.byteLength + entry.nameBytes.byteLength
    }
    const centralSize = offset - centralOffset
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x0605_4b50, 0)
    end.writeUInt16LE(centralEntries.length, 8)
    end.writeUInt16LE(centralEntries.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralOffset, 16)
    await writeAll(file, end)
  } finally {
    await file.close()
  }
}

async function writeLayoutZipArchive({ files, path, signal }) {
  const file = await open(path, "wx")
  const centralEntries = []
  let offset = 0
  try {
    for (const entry of files) {
      const written = await writeZipEntry({
        file,
        name: entry.archivePath,
        chunks: layoutFileChunks(entry, signal),
        offset,
        signal,
        mode: entry.mode,
      })
      centralEntries.push(written)
      offset += written.totalBytes
    }
    const centralOffset = offset
    for (const entry of centralEntries) {
      const header = Buffer.alloc(46)
      header.writeUInt32LE(0x0201_4b50, 0)
      header.writeUInt16LE(0x0314, 4)
      header.writeUInt16LE(20, 6)
      header.writeUInt16LE(0x0808, 8)
      header.writeUInt16LE(0, 10)
      header.writeUInt32LE(entry.crc, 16)
      header.writeUInt32LE(entry.sizeBytes, 20)
      header.writeUInt32LE(entry.sizeBytes, 24)
      header.writeUInt16LE(entry.nameBytes.byteLength, 28)
      header.writeUInt32LE((((0o100000 | entry.mode) & 0xffff) * 0x10000) >>> 0, 38)
      header.writeUInt32LE(entry.offset, 42)
      await writeAll(file, header)
      await writeAll(file, entry.nameBytes)
      offset += header.byteLength + entry.nameBytes.byteLength
    }
    const centralSize = offset - centralOffset
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x0605_4b50, 0)
    end.writeUInt16LE(centralEntries.length, 8)
    end.writeUInt16LE(centralEntries.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralOffset, 16)
    await writeAll(file, end)
  } finally {
    await file.close()
  }
}

async function writeTarGzipArchive({ plan, inputDirectory, path, signal }) {
  await pipeline(
    Readable.from(tarArchiveChunks({ plan, inputDirectory, signal })),
    createGzip({ level: 9, mtime: 0 }),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
    { signal },
  )
  const file = await open(path, "r+")
  try {
    await file.write(Buffer.from([0xff]), 0, 1, 9)
  } finally {
    await file.close()
  }
}

async function writeLayoutTarGzipArchive({ files, path, signal }) {
  await pipeline(
    Readable.from(layoutTarArchiveChunks({ files, signal })),
    createGzip({ level: 9, mtime: 0 }),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
    { signal },
  )
  const file = await open(path, "r+")
  try {
    await file.write(Buffer.from([0xff]), 0, 1, 9)
  } finally {
    await file.close()
  }
}

async function hashFile(path) {
  const file = await open(path, "r")
  try {
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let sizeBytes = 0
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      sizeBytes += bytesRead
      hash.update(buffer.subarray(0, bytesRead))
    }
    return { sizeBytes, sha256: hash.digest("hex") }
  } finally {
    await file.close()
  }
}

async function safeUnlink(path) {
  try {
    await unlink(path)
  } catch {}
}

export async function writeInstallerPlatformBundle(input) {
  const plan = parsePlan(input?.plan)
  if (
    !plan ||
    typeof input.inputDirectory !== "string" ||
    input.inputDirectory.length === 0 ||
    typeof input.outputDirectory !== "string" ||
    input.outputDirectory.length === 0
  ) {
    return reject("bundle_plan_invalid")
  }
  const inputDirectory = resolve(input.inputDirectory)
  const outputDirectory = resolve(input.outputDirectory)
  const finalPath = join(outputDirectory, plan.outputName)
  const temporaryPath = join(
    outputDirectory,
    `.${plan.outputName}.${process.pid}.${randomUUID()}.tmp`,
  )
  if (existsSync(finalPath)) return reject("bundle_output_exists")

  try {
    const inputMetadata = await lstat(inputDirectory)
    if (!inputMetadata.isDirectory() || inputMetadata.isSymbolicLink()) {
      return reject("bundle_input_directory_unsafe")
    }
    await mkdir(outputDirectory, { recursive: true })
    const outputMetadata = await lstat(outputDirectory)
    if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) {
      return reject("bundle_output_directory_unsafe")
    }
    if (plan.archive === "zip") {
      await writeZipArchive({ plan, inputDirectory, path: temporaryPath, signal: input.signal })
    } else {
      await writeTarGzipArchive({ plan, inputDirectory, path: temporaryPath, signal: input.signal })
    }
    const identity = await hashFile(temporaryPath)
    await link(temporaryPath, finalPath)
    await unlink(temporaryPath)
    return {
      status: "ready",
      path: finalPath,
      artifact: Object.freeze({
        target: plan.target,
        archive: plan.archive,
        name: plan.outputName,
        sizeBytes: identity.sizeBytes,
        sha256: identity.sha256,
        entrypoint: plan.entrypoint,
        nodeModuleAbi: plan.node.moduleAbi,
        ...(plan.target === "linux-x64" ? { libc: "glibc" } : {}),
      }),
    }
  } catch (error) {
    await safeUnlink(temporaryPath)
    if (error instanceof ArchiveBuildError) return reject(error.reasonCode)
    if (input.signal?.aborted) return reject("bundle_archive_cancelled")
    return reject("bundle_archive_write_failed")
  }
}

export async function writeInstallerFilesystemBundle(input) {
  const plan = parsePlan(input?.plan)
  if (
    !plan ||
    typeof input.layoutDirectory !== "string" ||
    typeof input.outputDirectory !== "string"
  ) {
    return reject("bundle_layout_archive_input_invalid")
  }
  const layoutDirectory = resolve(input.layoutDirectory)
  const outputDirectory = resolve(input.outputDirectory)
  const finalPath = join(outputDirectory, plan.outputName)
  const temporaryPath = join(
    outputDirectory,
    `.${plan.outputName}.${process.pid}.${randomUUID()}.tmp`,
  )
  if (existsSync(finalPath)) return reject("bundle_output_exists")

  try {
    const rootMetadata = await lstat(layoutDirectory)
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      return reject("bundle_layout_directory_unsafe")
    }
    const files = await collectLayoutFiles(layoutDirectory)
    const entrypoint = files.find((entry) => entry.archivePath === plan.entrypoint)
    if (!entrypoint || (plan.archive === "tar.gz" && entrypoint.mode !== 0o755)) {
      return reject("bundle_layout_entrypoint_invalid")
    }
    await mkdir(outputDirectory, { recursive: true })
    const outputMetadata = await lstat(outputDirectory)
    if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) {
      return reject("bundle_output_directory_unsafe")
    }
    if (plan.archive === "zip") {
      await writeLayoutZipArchive({ files, path: temporaryPath, signal: input.signal })
    } else {
      await writeLayoutTarGzipArchive({ files, path: temporaryPath, signal: input.signal })
    }
    const identity = await hashFile(temporaryPath)
    await link(temporaryPath, finalPath)
    await unlink(temporaryPath)
    return {
      status: "ready",
      path: finalPath,
      artifact: Object.freeze({
        target: plan.target,
        archive: plan.archive,
        name: plan.outputName,
        sizeBytes: identity.sizeBytes,
        sha256: identity.sha256,
        entrypoint: plan.entrypoint,
        nodeModuleAbi: plan.node.moduleAbi,
        ...(plan.target === "linux-x64" ? { libc: "glibc" } : {}),
      }),
    }
  } catch (error) {
    await safeUnlink(temporaryPath)
    if (error instanceof ArchiveBuildError) return reject(error.reasonCode)
    if (input.signal?.aborted) return reject("bundle_archive_cancelled")
    return reject("bundle_archive_write_failed")
  }
}

export function buildUnsignedInstallerManifestCandidate(input) {
  if (
    !isRecord(input) ||
    typeof input.releaseVersion !== "string" ||
    !Array.isArray(input.artifacts)
  ) {
    return reject("manifest_candidate_invalid")
  }
  const artifactByTarget = new Map(input.artifacts.map((artifact) => [artifact?.target, artifact]))
  const artifacts = INSTALLER_PLATFORM_PROFILES.map((profile) =>
    artifactByTarget.get(profile.target),
  )
  const manifest = {
    kind: "knowbee.install.manifest",
    schemaVersion: 2,
    releaseVersion: input.releaseVersion,
    channel: "stable",
    node: INSTALLER_NODE_RUNTIME,
    artifacts,
  }
  const parsed = parseUnsignedInstallerManifest(manifest)
  if (parsed.status === "rejected") return reject(`manifest_candidate_invalid:${parsed.reasonCode}`)
  const rawManifestBytes = Buffer.from(`${JSON.stringify(parsed.manifest)}\n`, "utf8")
  return { status: "ready", manifest: parsed.manifest, rawManifestBytes }
}
