import { lstatSync, readdirSync } from "node:fs"
import { basename, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const scannedRoots = [
  "prompts",
  "packages/core/src",
  "packages/cli/src",
  "packages/webui/src",
  "scripts",
  "tests",
] as const

const forbiddenBasenames = new Set([".DS_Store"])
const forbiddenSuffixes = [
  ".bak",
  ".backup",
  ".tmp",
  ".orig",
  ".rej",
  ".swp",
  ".swo",
] as const

function isForbiddenTemporaryArtifact(path: string): boolean {
  const name = basename(path)
  return forbiddenBasenames.has(name) || name.endsWith("~") || forbiddenSuffixes.some((suffix) => name.endsWith(suffix))
}

function listFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      files.push(...listFiles(path))
      continue
    }
    files.push(path)
  }
  return files
}

describe("task0912 maintenance temporary artifact gate", () => {
  it("keeps source, prompt, script, and test directories free of local backup artifacts", () => {
    const offenders = scannedRoots
      .flatMap((scannedRoot) => listFiles(resolve(root, scannedRoot)))
      .filter(isForbiddenTemporaryArtifact)
      .map((path) => relative(root, path))
      .sort((a, b) => a.localeCompare(b))

    expect(offenders).toEqual([])
  })
})
