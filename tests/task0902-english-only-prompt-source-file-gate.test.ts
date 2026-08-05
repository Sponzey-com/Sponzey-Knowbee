import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0902 English-only prompt source file gate", () => {
  it("keeps repository prompt source files English-only by file variant", () => {
    const promptFiles = readdirSync(join(process.cwd(), "prompts"))
      .filter((file) => file.endsWith(".md"))
      .sort()

    expect(promptFiles.filter((file) => file.endsWith(".ko.md"))).toEqual([])
  })

  it("keeps prompt source seeding limited to English canonical files", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/memory/knowbee-md.ts"),
      "utf-8",
    )

    expect(source).toContain('const DEFAULT_PROMPT_SOURCE_SEED_LOCALES = ["en"] as const')
    expect(source).toContain("return [definition.filenames.en]")
    expect(source).not.toContain("return [definition.filenames.ko")
  })
})
