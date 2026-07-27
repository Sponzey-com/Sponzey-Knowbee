import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const COUNT_SIGNAL_MARKERS = [
  "fixed retry count",
  "retry count",
  "attempt count",
  "delegation turn count",
  "queue retry count",
  "repeated failure count",
  "retry_exhausted",
  "max_attempts_reached",
  "retry_budget_exhausted",
  "delegation_turns_exhausted",
  "too_many_failures",
] as const

describe("task0258 count-signal prompt ownership", () => {
  it("keeps retry and attempt telemetry examples owned by recovery_policy only", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const promptFiles = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .sort()

    const offenders = promptFiles
      .filter((file) => file !== "recovery_policy.md")
      .flatMap((file) => {
        const source = readFileSync(join(promptsDir, file), "utf-8").toLowerCase()
        return COUNT_SIGNAL_MARKERS
          .filter((marker) => source.includes(marker))
          .map((marker) => `${file}:${marker}`)
      })

    expect(offenders).toEqual([])

    const canonical = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8").toLowerCase()
    for (const marker of COUNT_SIGNAL_MARKERS) {
      expect(canonical).toContain(marker)
    }
  })
})
