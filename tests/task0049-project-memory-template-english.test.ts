import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initKnowbeeMd } from "../packages/core/src/memory/knowbee-md.ts"

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "knowbee-template-test-"))
  tempDirs.push(dir)
  return dir
}

function expectEnglishTemplate(content: string): void {
  expect(content).toContain("# Project Memory")
  expect(content).toContain("## Technology Stack")
  expect(content).toContain("## Code Rules")
  expect(content).toContain("## Important Paths")
  expect(content).toContain("## Prohibited Actions")
  expect(content).toContain("## Additional Notes")
  expect(content).not.toContain("# 프로젝트 메모리")
  expect(content).not.toContain("## 기술 스택")
  expect(content).not.toContain("## 금지사항")
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0049 project memory template English normalization", () => {
  it("creates the main KNOWBEE.md template with English sections", () => {
    const dir = createTempDir()
    const filePath = initKnowbeeMd(dir)

    expect(filePath).toBe(join(dir, "KNOWBEE.md"))
    expectEnglishTemplate(readFileSync(filePath, "utf-8"))
  })

})
