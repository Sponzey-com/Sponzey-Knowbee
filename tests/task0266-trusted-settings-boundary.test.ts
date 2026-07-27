import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const TRUSTED_SETTINGS_DEFINITION_MARKERS = [
  "Trusted settings are explicit config values",
  "Trusted settings are limited to explicit config values",
] as const

describe("task0266 trusted settings definition boundary", () => {
  it("keeps trusted-settings source definitions owned by definitions", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const promptFiles = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .sort()

    const offenders = promptFiles
      .filter((file) => file !== "definitions.md")
      .flatMap((file) => {
        const content = readFileSync(join(promptsDir, file), "utf-8")
        return TRUSTED_SETTINGS_DEFINITION_MARKERS
          .filter((marker) => content.includes(marker))
          .map((marker) => `${file}:${marker}`)
      })

    const definitions = readFileSync(join(promptsDir, "definitions.md"), "utf-8")
    const channel = readFileSync(join(promptsDir, "channel.md"), "utf-8")
    const memoryPolicy = readFileSync(join(promptsDir, "memory_policy.md"), "utf-8")

    expect(offenders).toEqual([])
    expect(definitions).toContain("Trusted settings are limited to explicit config values")
    expect(channel).toContain("trusted settings defined in `definitions.md`")
    expect(memoryPolicy).toContain("trusted settings defined in `definitions.md`")
  })
})
