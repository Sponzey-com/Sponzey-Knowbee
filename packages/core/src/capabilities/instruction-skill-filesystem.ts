import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"

export type InstructionSkillSourceReadResult =
  | {
      ok: true
      content: string
      checksum: `sha256:${string}`
      byteLength: number
    }
  | {
      ok: false
      reasonCode:
        | "instruction_source_unavailable"
        | "instruction_source_identity_changed"
        | "instruction_manifest_missing"
        | "instruction_source_too_large"
        | "instruction_source_not_utf8"
        | "instruction_source_empty"
    }

export function readInstructionSkillSource(input: {
  sourceRef: string
  maxBytes: number
}): InstructionSkillSourceReadResult {
  const sourceRef = input.sourceRef.trim()
  if (
    !sourceRef ||
    sourceRef.includes("\0") ||
    !Number.isInteger(input.maxBytes) ||
    input.maxBytes < 1
  ) {
    return { ok: false, reasonCode: "instruction_source_unavailable" }
  }

  let sourceStat: ReturnType<typeof lstatSync>
  let canonicalSource: string
  try {
    sourceStat = lstatSync(sourceRef)
    canonicalSource = realpathSync(sourceRef)
  } catch {
    return { ok: false, reasonCode: "instruction_source_unavailable" }
  }
  if (sourceStat.isSymbolicLink() || canonicalSource !== resolve(sourceRef)) {
    return { ok: false, reasonCode: "instruction_source_identity_changed" }
  }

  const manifestPath = sourceStat.isDirectory()
    ? join(canonicalSource, "SKILL.md")
    : canonicalSource
  if (sourceStat.isFile() && basename(canonicalSource) !== "SKILL.md") {
    return { ok: false, reasonCode: "instruction_manifest_missing" }
  }

  let manifestStat: ReturnType<typeof statSync>
  try {
    const manifestLinkStat = lstatSync(manifestPath)
    const canonicalManifest = realpathSync(manifestPath)
    if (manifestLinkStat.isSymbolicLink() || canonicalManifest !== manifestPath) {
      return { ok: false, reasonCode: "instruction_source_identity_changed" }
    }
    manifestStat = statSync(canonicalManifest)
  } catch {
    return { ok: false, reasonCode: "instruction_manifest_missing" }
  }
  if (!manifestStat.isFile()) {
    return { ok: false, reasonCode: "instruction_manifest_missing" }
  }
  if (manifestStat.size > input.maxBytes) {
    return { ok: false, reasonCode: "instruction_source_too_large" }
  }

  let bytes: Buffer
  try {
    bytes = readFileSync(manifestPath)
  } catch {
    return { ok: false, reasonCode: "instruction_source_unavailable" }
  }
  if (bytes.byteLength > input.maxBytes) {
    return { ok: false, reasonCode: "instruction_source_too_large" }
  }

  let content: string
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reasonCode: "instruction_source_not_utf8" }
  }
  if (!content.trim()) return { ok: false, reasonCode: "instruction_source_empty" }

  return {
    ok: true,
    content,
    checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    byteLength: bytes.byteLength,
  }
}
