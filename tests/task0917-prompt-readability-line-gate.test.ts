import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const maxReadablePromptLineLength = 300

describe("task0917 prompt readability line gate", () => {
  it("keeps prompt source lines readable without overloaded rule lines", () => {
    const offenders: string[] = []

    for (const entry of readdirSync(join(process.cwd(), "prompts"))) {
      if (!entry.endsWith(".md")) continue
      const path = join(process.cwd(), "prompts", entry)
      const lines = readFileSync(path, "utf-8").split(/\r?\n/u)
      lines.forEach((line, index) => {
        if (line.length > maxReadablePromptLineLength) {
          offenders.push(`${entry}:${index + 1} length=${line.length}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
