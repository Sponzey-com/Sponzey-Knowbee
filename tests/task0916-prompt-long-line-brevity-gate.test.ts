import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const maxPromptLineLength = 420

describe("task0916 prompt long-line brevity gate", () => {
  it("keeps prompt source lines below the overloaded-rule threshold", () => {
    const offenders: string[] = []

    for (const entry of readdirSync(join(process.cwd(), "prompts"))) {
      if (!entry.endsWith(".md")) continue
      const path = join(process.cwd(), "prompts", entry)
      const lines = readFileSync(path, "utf-8").split(/\r?\n/u)
      lines.forEach((line, index) => {
        if (line.length > maxPromptLineLength) {
          offenders.push(`${entry}:${index + 1} length=${line.length}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
