import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()

function source(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8")
}

function linesWithAny(sourceText: string, patterns: RegExp[]): string[] {
  return sourceText
    .split("\n")
    .map((line, index) => ({ index: index + 1, line }))
    .filter(({ line }) => patterns.some((pattern) => pattern.test(line)))
    .map(({ index, line }) => `${index}: ${line.trim()}`)
}

describe("task001 unified settings policy", () => {
  it("keeps the tracked engineering policy aligned on the unified settings direction", () => {
    const agents = source("AGENTS.md")
    const messageCatalog = source("packages/webui/src/lib/message-catalog.ts")

    expect(agents).toContain("Persisted user settings change only through a validated Use Case")
    expect(messageCatalog).toContain("통합 설정에서 필요한 항목을 확인")
    expect(messageCatalog).toContain("Review the required items in unified settings")
  })

  it("does not expose beginner or advanced mode as a product choice in user-facing notice copy", () => {
    const messageCatalog = source("packages/webui/src/lib/message-catalog.ts")
    const bannedModeCopy = [
      /초보 모드/,
      /고급 모드/,
      /Beginner mode/,
      /beginner mode/,
      /Advanced mode/,
      /advanced mode/,
    ]

    expect(linesWithAny(messageCatalog, bannedModeCopy)).toEqual([])
  })
})
