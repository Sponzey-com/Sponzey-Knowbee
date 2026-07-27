import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task1012 runs source duplicate entries", () => {
  it("keeps 주요 파일 bullets unique by file name", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/runs/source.md"), "utf-8")
    const start = source.indexOf("## 주요 파일")
    const end = source.indexOf("##", start + "## 주요 파일".length)
    expect(start).toBeGreaterThanOrEqual(0)

    const section = source.slice(start, end === -1 ? undefined : end)
    const fileNames = [...section.matchAll(/^- `([^`]+)`:/gmu)].map((match) => match[1])
    const duplicates = fileNames.filter((fileName, index) => fileNames.indexOf(fileName) !== index)

    expect(duplicates).toEqual([])
    expect(fileNames.filter((fileName) => fileName === "action-execution.ts")).toHaveLength(1)
  })
})
