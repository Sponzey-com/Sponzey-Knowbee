import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const DOC_PATHS = [
  "packages/core/src/topology/source.md",
  "packages/core/src/runs/source.md",
  "packages/core/src/orchestration/source.md",
  "packages/webui/src/components/topology/source.md",
]

function stripCodeSpans(source: string): string {
  return source.replace(/`[^`]*`/g, "")
}

describe("task1011 source doc sub-agent terminology", () => {
  it("keeps source doc prose aligned to sub-agent terminology", () => {
    for (const path of DOC_PATHS) {
      const absolute = join(process.cwd(), path)
      const prose = stripCodeSpans(readFileSync(absolute, "utf-8"))

      expect(prose, relative(process.cwd(), absolute)).not.toMatch(/실행자/u)
      expect(prose, relative(process.cwd(), absolute)).not.toMatch(/업무\s*노드/u)
      expect(prose, relative(process.cwd(), absolute)).not.toMatch(/노드\s*(?:설명|정의|선택|그래프)/u)
    }
  })
})
