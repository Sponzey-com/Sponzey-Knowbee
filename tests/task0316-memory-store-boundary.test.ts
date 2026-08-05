import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const coreSrcRoot = join(repoRoot, "packages/core/src")
const allowedImporter = "memory/store.ts"

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir).sort()
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (!entry.endsWith(".ts")) continue
    if (entry.endsWith(".d.ts")) continue
    files.push(path)
  }
  return files
}

function toPosixRelative(path: string): string {
  return relative(coreSrcRoot, path).split(sep).join("/")
}

function importsDbStoreMemoryDocument(source: string): boolean {
  const dbImportPattern = /import\s*\{[\s\S]*?\}\s*from\s*["'][^"']*db\/index\.js["']/g
  return [...source.matchAll(dbImportPattern)]
    .some((match) => /\bstoreMemoryDocument\b/.test(match[0] ?? ""))
}

describe("task0316 memory store boundary", () => {
  it("keeps DB storeMemoryDocument behind the memory store wrapper", () => {
    const offenders = listSourceFiles(coreSrcRoot)
      .map((path) => ({
        path: toPosixRelative(path),
        source: readFileSync(path, "utf-8"),
      }))
      .filter((file) => file.path !== allowedImporter)
      .filter((file) => importsDbStoreMemoryDocument(file.source))
      .map((file) => file.path)

    expect(offenders, `DB storeMemoryDocument direct imports: ${offenders.join(", ")}`).toEqual([])
  })
})
