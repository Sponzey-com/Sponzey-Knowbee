import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const tempDirs: string[] = []

function createSeededPromptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-assembly-regression-"))
  tempDirs.push(root)
  ensurePromptSourceFiles(root)
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0776 prompt regression assembly coverage", () => {
  it("includes assembly coverage in prompt source regression results", () => {
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })

    expect(result.assemblyCoverage).toHaveLength(1)
    expect(result.assemblyCoverage[0]).toEqual(expect.objectContaining({
      locale: "en",
      ok: true,
      omittedSourceIds: [],
      truncatedSourceIds: [],
    }))
  })

  it("fails prompt source regression when an active runtime source is truncated", () => {
    const root = createSeededPromptRoot()
    const systemPath = join(root, "prompts", "system.md")
    writeFileSync(
      systemPath,
      `${readFileSync(systemPath, "utf-8")}\n${"Long harmless filler sentence.\n".repeat(8000)}`,
      "utf-8",
    )

    const result = runPromptSourceRegression(root, { locales: ["en"] })

    expect(result.ok).toBe(false)
    expect(result.assemblyCoverage[0].ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "prompt_assembly_source_truncated",
        sourceId: "system",
        locale: "en",
      }),
    ]))
  })
})
