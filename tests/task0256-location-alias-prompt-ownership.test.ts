import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const LOCATION_ALIAS_EXAMPLES = [
  "다운로드",
  "다운도르",
  "Downloads",
  "Download folder",
] as const

describe("task0256 location alias prompt ownership", () => {
  it("keeps location-alias examples owned by recovery_policy only", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const promptFiles = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .sort()

    const offenders = promptFiles
      .filter((file) => file !== "recovery_policy.md")
      .flatMap((file) => {
        const source = readFileSync(join(promptsDir, file), "utf-8")
        return LOCATION_ALIAS_EXAMPLES
          .filter((example) => source.includes(example))
          .map((example) => `${file}:${example}`)
      })

    expect(offenders).toEqual([])

    const canonical = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8")
    for (const example of LOCATION_ALIAS_EXAMPLES) {
      expect(canonical).toContain(example)
    }
  })
})
