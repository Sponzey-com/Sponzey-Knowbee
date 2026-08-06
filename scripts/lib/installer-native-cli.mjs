import { constants as fsConstants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import { resolve } from "node:path"

const JSON_LIMIT = 2 * 1024 * 1024

export function parseExactOptions(argv, required) {
  if (!Array.isArray(argv) || argv.length !== required.length * 2) return undefined
  const allowed = new Set(required)
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (
      !allowed.has(name) ||
      values.has(name) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      return undefined
    }
    values.set(name, value)
  }
  return required.every((name) => values.has(name)) ? values : undefined
}

export async function readBoundedJson(path) {
  let file
  try {
    const resolved = resolve(path)
    const metadata = await lstat(resolved, { bigint: true })
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size <= 0n ||
      metadata.size > BigInt(JSON_LIMIT)
    ) {
      return undefined
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(resolved, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      return undefined
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    return undefined
  } finally {
    await file?.close().catch(() => undefined)
  }
}

export function emitNativeInspectionResult(result) {
  process.stdout.write(
    `${JSON.stringify(result.status === "ready" && result.attestation ? result.attestation : result)}\n`,
  )
  if (result.status !== "ready") process.exitCode = 1
}
