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
  it("keeps AGENTS and plan aligned on the unified settings direction", () => {
    const agents = source("AGENTS.md")
    const plan = source(".tasks/plan.md")

    expect(agents).toContain("초보/고급 화면 분리는 제거")
    expect(agents).toContain("하나의 통합 설정 화면")
    expect(plan).toContain("별도 초보/고급 모드를 선택하지 않고도 하나의 통합 설정 화면")
    expect(plan).toContain("Phase 1. Policy Inventory and Static Guard")
  })

  it("documents compatibility boundaries for old UI mode terms before implementation changes", () => {
    const inventory = source(".tasks/architecture-cleanup-inventory.md")

    expect(inventory).toContain("Unified Settings Compatibility Boundaries")
    expect(inventory).toContain("beginner")
    expect(inventory).toContain("advanced")
    expect(inventory).toContain("simple")
    expect(inventory).toContain("사용자-facing copy")
    expect(inventory).toContain("통합 설정")
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

