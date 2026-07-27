import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function removeInlineCodeSpans(line: string): string {
  return line.replace(/`[^`]*`/gu, "")
}

describe("task1008 runtime prompt English-language guard", () => {
  it("keeps Korean literals in English runtime prompt sources inside inline code spans", () => {
    const offenders: string[] = []
    const sources = loadPromptSourceRegistry(process.cwd())
      .filter((source) => source.locale === "en" && source.usageScope === "runtime")

    for (const source of sources) {
      const lines = source.content.split(/\r?\n/u)
      lines.forEach((line, index) => {
        if (!/[가-힣]/u.test(removeInlineCodeSpans(line))) return
        offenders.push(`${source.sourceId}:${index + 1}:${line.trim()}`)
      })
    }

    expect(offenders).toEqual([])
  })
})
