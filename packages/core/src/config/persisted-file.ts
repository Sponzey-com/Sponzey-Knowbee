import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import JSON5 from "json5"
import type { RuntimePaths } from "./paths.js"

export type PersistedConfigPaths = Pick<RuntimePaths, "configFile">

export interface PersistedConfigFileSystem {
  exists(path: string): boolean
  makeDirectory(path: string): void
  readText(path: string): string
  writeText(path: string, content: string): void
  rename(sourcePath: string, targetPath: string): void
  remove(path: string): void
}

export const NODE_PERSISTED_FILE_SYSTEM: PersistedConfigFileSystem = Object.freeze({
  exists: existsSync,
  makeDirectory: (path: string) => { mkdirSync(path, { recursive: true }) },
  readText: (path: string) => readFileSync(path, "utf-8"),
  writeText: (path: string, content: string) => { writeFileSync(path, content, "utf-8") },
  rename: renameSync,
  remove: (path: string) => { rmSync(path, { force: true }) },
})

export function readPersistedRawConfig(
  paths: PersistedConfigPaths,
  fileSystem: PersistedConfigFileSystem = NODE_PERSISTED_FILE_SYSTEM,
): Record<string, unknown> {
  if (!fileSystem.exists(paths.configFile)) return {}
  try {
    const parsed = JSON5.parse(fileSystem.readText(paths.configFile))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function writePersistedRawConfig(
  raw: Record<string, unknown>,
  paths: PersistedConfigPaths,
  fileSystem: PersistedConfigFileSystem = NODE_PERSISTED_FILE_SYSTEM,
): void {
  writeAtomicTextFile(paths.configFile, JSON5.stringify(raw, null, 2), fileSystem)
}

export function writeAtomicTextFile(
  targetPath: string,
  content: string,
  fileSystem: PersistedConfigFileSystem = NODE_PERSISTED_FILE_SYSTEM,
): void {
  fileSystem.makeDirectory(dirname(targetPath))
  const tempPath = `${targetPath}.tmp-${randomUUID()}`
  try {
    fileSystem.writeText(tempPath, content)
    fileSystem.rename(tempPath, targetPath)
  } finally {
    fileSystem.remove(tempPath)
  }
}
