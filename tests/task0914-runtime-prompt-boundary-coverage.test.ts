import { readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { describe, expect, it } from "vitest"

interface PromptDefinition {
  sourceId: string
  enFilename: string
  usageScope: string
}

function extractPromptDefinitions(): PromptDefinition[] {
  const source = readFileSync(join(process.cwd(), "packages/core/src/memory/knowbee-md.ts"), "utf-8")
  return [...source.matchAll(
    /\{\s*sourceId:\s*"([^"]+)".*?filenames:\s*\{\s*ko:\s*"[^"]+",\s*en:\s*"([^"]+)".*?usageScope:\s*"([^"]+)"/gu,
  )].map((match) => ({
    sourceId: match[1]!,
    enFilename: match[2]!,
    usageScope: match[3]!,
  }))
}

function extractCanonicalBoundaryIds(): string[] {
  const source = readFileSync(join(process.cwd(), "packages/core/src/memory/prompt-regression.ts"), "utf-8")
  const list = source.match(/const CANONICAL_BOUNDARY_PROMPT_SOURCE_IDS = \[([\s\S]*?)\] as const/u)?.[1] ?? ""
  return [...list.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!)
}

describe("task0914 runtime prompt boundary coverage", () => {
  it("keeps every runtime prompt source under canonical boundary validation", () => {
    const runtimeDefinitions = extractPromptDefinitions().filter((definition) => definition.usageScope === "runtime")
    const canonicalIds = new Set(extractCanonicalBoundaryIds())
    const missingIds = runtimeDefinitions
      .map((definition) => definition.sourceId)
      .filter((sourceId) => !canonicalIds.has(sourceId))
      .sort((a, b) => a.localeCompare(b))

    expect(missingIds).toEqual([])
  })

  it("requires runtime prompt source files to declare purpose and out-of-scope boundaries", () => {
    const offenders: string[] = []

    for (const definition of extractPromptDefinitions().filter((candidate) => candidate.usageScope === "runtime")) {
      const path = join(process.cwd(), "prompts", definition.enFilename)
      const content = readFileSync(path, "utf-8")
      if (!/^## Purpose\s*$/imu.test(content)) {
        offenders.push(`${basename(path)} missing ## Purpose`)
      }
      if (!/^## Out Of Scope\s*$/imu.test(content)) {
        offenders.push(`${basename(path)} missing ## Out Of Scope`)
      }
    }

    expect(offenders).toEqual([])
  })
})
