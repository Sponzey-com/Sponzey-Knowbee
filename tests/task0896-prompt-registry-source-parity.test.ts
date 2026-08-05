import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), "utf-8")
}

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`Unable to extract block ${startMarker}`)
  return source.slice(start, end)
}

function extractRegistrySourceIds(block: string): string[] {
  return [...block.matchAll(/\bsourceId:\s*["']([a-z0-9_]+)["']/giu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
}

function extractExpectedSourceIds(block: string): string[] {
  return [...block.matchAll(/["']([a-z0-9_]+)["']/giu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
}

describe("task0896 prompt registry source parity", () => {
  it("keeps prompt regression expected ids aligned with the registry definitions", () => {
    const registry = readProjectFile("packages/core/src/memory/knowbee-md.ts")
    const regression = readProjectFile("packages/core/src/memory/prompt-regression.ts")

    const registryBlock = extractBlock(
      registry,
      "const PROMPT_SOURCE_DEFINITIONS",
      "const DEFAULT_PROMPT_SOURCE_SEED_LOCALES",
    )
    const expectedBlock = extractBlock(
      regression,
      "const EXPECTED_PROMPT_SOURCE_IDS",
      "const CANONICAL_BOUNDARY_PROMPT_SOURCE_IDS",
    )

    const registryIds = extractRegistrySourceIds(registryBlock).sort()
    const expectedIds = extractExpectedSourceIds(expectedBlock).sort()

    expect(expectedIds).toEqual(registryIds)
  })
})
