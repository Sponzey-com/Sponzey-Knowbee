import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const sourceRoots = [
  resolve(root, "packages/core/src"),
  resolve(root, "packages/cli/src"),
]

function listTypeScriptSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listTypeScriptSourceFiles(path))
      continue
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) files.push(path)
  }
  return files
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length
}

describe("task0911 user-facing notice final-response metadata gate", () => {
  it("requires final-response notices to remain non-final and non-identity-claiming", () => {
    const offenders: string[] = []
    const requiredRendering = /renderingRequired:\s*"llm_final_response"/gu
    const guardedRendering =
      /renderingRequired:\s*"llm_final_response"[\s\S]{0,180}?finalAnswer:\s*false[\s\S]{0,180}?assistantIdentityClaim:\s*false/gu

    for (const file of sourceRoots.flatMap(listTypeScriptSourceFiles)) {
      const source = readFileSync(file, "utf-8")
      const requiredCount = countMatches(source, requiredRendering)
      if (requiredCount === 0) continue
      const guardedCount = countMatches(source, guardedRendering)
      if (guardedCount !== requiredCount) {
        offenders.push(`${relative(root, file)} required=${requiredCount} guarded=${guardedCount}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
