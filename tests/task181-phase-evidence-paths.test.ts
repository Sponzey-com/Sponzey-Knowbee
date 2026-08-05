import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runPlanDriftCheck } from "../packages/core/src/diagnostics/plan-drift.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task181-phase-evidence-"))
  tempDirs.push(root)
  mkdirSync(join(root, ".tasks", "phase001"), { recursive: true })
  mkdirSync(join(root, ".tasks", "phase002"), { recursive: true })
  writeFileSync(join(root, ".tasks", "phase002", "plan.md"), "# Phase 002 Plan\n", "utf-8")
  return root
}

describe("Task 181 historical phase evidence paths", () => {
  it("accepts the phase001 historical goal when no plan exists", () => {
    const root = createWorkspace()
    writeFileSync(join(root, ".tasks", "phase001", "goal.md"), "# Phase 001 Goal\n", "utf-8")

    const report = runPlanDriftCheck({ rootDir: root })

    expect(report.phasePlans).toContainEqual({
      phase: "phase001",
      path: ".tasks/phase001/goal.md",
      exists: true,
    })
    expect(
      report.warnings.some(
        (warning) => warning.code === "phase_plan_missing" && warning.detail.phase === "phase001",
      ),
    ).toBe(false)
  })

  it("prefers plan evidence when both accepted phase001 artifacts exist", () => {
    const root = createWorkspace()
    writeFileSync(join(root, ".tasks", "phase001", "plan.md"), "# Phase 001 Plan\n", "utf-8")
    writeFileSync(join(root, ".tasks", "phase001", "goal.md"), "# Phase 001 Goal\n", "utf-8")

    const report = runPlanDriftCheck({ rootDir: root })

    expect(report.phasePlans[0]).toEqual({
      phase: "phase001",
      path: ".tasks/phase001/plan.md",
      exists: true,
    })
  })

  it("warns with bounded candidates only when every phase artifact is missing", () => {
    const root = createWorkspace()

    const report = runPlanDriftCheck({ rootDir: root })
    const warning = report.warnings.find(
      (candidate) =>
        candidate.code === "phase_plan_missing" && candidate.detail.phase === "phase001",
    )

    expect(warning).toMatchObject({
      path: ".tasks/phase001/plan.md",
      detail: {
        phase: "phase001",
        expectedPaths: [".tasks/phase001/plan.md", ".tasks/phase001/goal.md"],
      },
    })
  })
})
