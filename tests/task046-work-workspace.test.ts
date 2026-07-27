import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sortWorkItemsActiveFirst } from "../packages/webui/src/lib/work-route.js"

describe("Task 046 work workspace", () => {
  it("sorts active work before terminal work without mutating the input", () => {
    const input = [
      { key: "done", status: "completed", createdAt: 300, updatedAt: 300 },
      { key: "waiting", status: "awaiting_user", createdAt: 100, updatedAt: 100 },
      { key: "running-b", status: "running", createdAt: 200, updatedAt: 200 },
      { key: "running-a", status: "running", createdAt: 200, updatedAt: 200 },
    ] as const

    expect(sortWorkItemsActiveFirst(input).map((item) => item.key)).toEqual([
      "running-a",
      "running-b",
      "waiting",
      "done",
    ])
    expect(input.map((item) => item.key)).toEqual(["done", "waiting", "running-b", "running-a"])
  })

  it("assigns runs and schedules to separate canonical route elements", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    expect(app).toContain('path="/work/runs"')
    expect(app).toContain('path="/work/schedules"')
    expect(app).toContain('<Navigate to="/work/runs" replace />')
    expect(app).toContain('<WorkWorkspace activeView="runs">')
    expect(app).toContain('<WorkWorkspace activeView="schedules">')
    expect(app).not.toContain("<BeginnerTasksPage />")
  })

  it("keeps the work shell free of API and environment access", () => {
    const source = readFileSync("packages/webui/src/components/work/WorkWorkspace.tsx", "utf8")
    expect(source).toContain('to="/work/runs"')
    expect(source).toContain('to="/work/schedules"')
    expect(source).not.toMatch(/\bapi\.|fetch\(|process\.env|localStorage|sessionStorage/)
    expect(source).not.toContain("RunsPage")
    expect(source).not.toContain("SchedulePage")
  })
})
