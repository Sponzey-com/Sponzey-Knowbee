import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DEPTH_WORDING_EXAMPLES = [
  "deeply",
  "thoroughly",
  "carefully",
  "깊게 봐줘",
] as const

describe("task0255 depth wording prompt ownership", () => {
  it("keeps depth-wording examples owned by task_intake only", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const promptFiles = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .sort()

    const offenders = promptFiles
      .filter((file) => file !== "task_intake.md")
      .flatMap((file) => {
        const source = readFileSync(join(promptsDir, file), "utf-8")
        return DEPTH_WORDING_EXAMPLES
          .filter((example) => source.includes(example))
          .map((example) => `${file}:${example}`)
      })

    expect(offenders).toEqual([])

    const canonical = readFileSync(join(promptsDir, "task_intake.md"), "utf-8")
    for (const example of DEPTH_WORDING_EXAMPLES) {
      expect(canonical).toContain(example)
    }
  })
})
