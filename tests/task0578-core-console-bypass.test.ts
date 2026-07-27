import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

function listTypeScriptSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) return listTypeScriptSourceFiles(fullPath)
      if (!entry.endsWith(".ts")) return []
      if (entry.endsWith(".d.ts")) return []
      return [fullPath]
    })
}

describe("core logger boundary", () => {
  it("does not use direct console calls in core TypeScript source", () => {
    const sourceRoot = fileURLToPath(new URL("../packages/core/src", import.meta.url))
    const offenders = listTypeScriptSourceFiles(sourceRoot)
      .filter((filePath) => /\bconsole\./u.test(readFileSync(filePath, "utf-8")))
      .map((filePath) => relative(sourceRoot, filePath))

    expect(offenders).toEqual([])
  })
})
