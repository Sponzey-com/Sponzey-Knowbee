import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import { resolve } from "node:path"

const MAX_FILES = 100_000

export async function hashNativeFile(path) {
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
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes > 10_000_000_000) return undefined
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

export async function inspectNativeHeader(path) {
  let file
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(path, fsConstants.O_RDONLY | noFollow)
    const header = Buffer.alloc(4096)
    const { bytesRead } = await file.read(header, 0, header.byteLength, 0)
    const bytes = header.subarray(0, bytesRead)
    if (bytes.length >= 8 && bytes.readUInt32LE(0) === 0xfeedfacf) {
      const cpu = bytes.readUInt32LE(4)
      if (cpu === 0x0100000c) return { format: "mach_o_64", cpu: "arm64" }
      if (cpu === 0x01000007) return { format: "mach_o_64", cpu: "x64" }
      return { format: "mach_o_64", cpu: "unsupported" }
    }
    if (bytes.length >= 20 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      if (bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 62) {
        return { format: "elf_64", cpu: "x64" }
      }
      return { format: "elf", cpu: "unsupported" }
    }
    if (bytes.length >= 64 && bytes.subarray(0, 2).toString("ascii") === "MZ") {
      const offset = bytes.readUInt32LE(0x3c)
      if (
        offset <= bytes.length - 6 &&
        bytes.subarray(offset, offset + 4).equals(Buffer.from([0x50, 0x45, 0, 0]))
      ) {
        const machine = bytes.readUInt16LE(offset + 4)
        if (machine === 0x8664) return { format: "pe_32_plus", cpu: "x64" }
        if (machine === 0xaa64) return { format: "pe_32_plus", cpu: "arm64" }
        return { format: "pe", cpu: "unsupported" }
      }
    }
    return undefined
  } catch {
    return undefined
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function collectSafeTreeAt(current, output) {
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    if (output.files.length > MAX_FILES) throw new Error("too_many_files")
    const path = resolve(current, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) throw new Error("unsafe_tree")
    if (metadata.isDirectory()) {
      if (entry.name.endsWith(".app")) output.applicationBundles.push(path)
      await collectSafeTreeAt(path, output)
    } else if (metadata.isFile()) {
      output.files.push(path)
    } else {
      throw new Error("unsafe_tree")
    }
  }
  return output
}

export async function collectSafeTree(root) {
  return collectSafeTreeAt(root, { files: [], applicationBundles: [] })
}

export async function selectNativeFiles(files, expectedFormat, expectedCpu) {
  const selected = []
  for (const path of files) {
    const identity = await inspectNativeHeader(path)
    if (!identity) continue
    if (identity.format !== expectedFormat || identity.cpu !== expectedCpu) {
      throw new Error("native_target_mismatch")
    }
    selected.push(path)
  }
  return selected
}
