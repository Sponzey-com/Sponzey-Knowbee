import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const TASKS = ["task232.md", "task233.md", "task234.md", "task235.md", "task236.md"] as const

function readTask(name: string): string {
  return readFileSync(join(ROOT, ".tasks", name), "utf-8")
}

describe("Task 234 active tab info runtime transition task evidence", () => {
  it("keeps runtime transition task evidence linked to validation and closed live paths", () => {
    for (const taskName of TASKS) {
      const content = readTask(taskName)

      expect(content).toContain("## Validation")
      expect(content).toContain("## Result")
      expect(content).toMatch(/pnpm (exec vitest run|--filter @knowbee\/core build|run core:sync-src-artifacts)/u)
      expect(content).toContain("Rust dispatch, Skill mapping, production binding, default live smoke")
      expect(content).toContain("열린 상태로 변경되지 않았다")
    }
  })

  it("keeps the current plan pointed at production exposure recheck before live enable work", () => {
    const plan = readFileSync(join(ROOT, ".tasks", "plan.md"), "utf-8")
    const currentItem = plan.slice(plan.indexOf("205."))

    expect(currentItem).toContain("production exposure audit")
    expect(currentItem).toMatch(/runtime binding (closed 상태|activation.*계속 닫혀)/u)
    expect(currentItem).toContain(".tasks/task232.md")
    expect(currentItem).toContain(".tasks/task236.md")
  })
})
