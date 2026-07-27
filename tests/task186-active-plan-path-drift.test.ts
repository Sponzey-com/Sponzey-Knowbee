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

function task(done: boolean, reference: string): string {
  return `# Path evidence fixture

## Status
- [x] Ready
- [x] Red
- [x] Green
- [x] Tidy
- [${done ? "x" : " "}] Verified
- [${done ? "x" : " "}] Done

## Requirement and Goal
- Verify path scope.

## Functional Units
- 기능 1: classify.
- 기능 2: verify.

## Architecture and TDD
- Maintenance adapter only.

## Validation
- [x] path fixture passed.

## Completion Report
- 1 test passed.
- Reference: \`${reference}\`
`
}

describe("Task 186 active plan path drift", () => {
  it("warns only for current-plan and active-task missing paths", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task186-path-drift-"))
    tempDirs.push(root)
    mkdirSync(join(root, ".tasks", "phase001"), { recursive: true })
    mkdirSync(join(root, ".tasks", "phase002"), { recursive: true })
    writeFileSync(
      join(root, ".tasks", "plan.md"),
      "# Plan\n- Template: `.tasks/taskNNN.md`\n- Active: `packages/missing-current.ts`\n",
      "utf-8",
    )
    writeFileSync(join(root, ".tasks", "task001.md"), task(true, "packages/historical.ts"), "utf-8")
    writeFileSync(
      join(root, ".tasks", "task002.md"),
      task(false, "packages/missing-active.ts"),
      "utf-8",
    )
    writeFileSync(
      join(root, ".tasks", "phase001", "goal.md"),
      "# Historical Goal\n- `packages/historical-phase.ts`\n",
      "utf-8",
    )
    writeFileSync(join(root, ".tasks", "phase002", "plan.md"), "# Historical Plan\n", "utf-8")

    const report = runPlanDriftCheck({ rootDir: root })
    const references = report.warnings
      .filter((warning) => warning.code === "missing_referenced_path")
      .map((warning) => warning.detail.reference)

    expect(references).toEqual(["packages/missing-current.ts", "packages/missing-active.ts"])
  })
})
