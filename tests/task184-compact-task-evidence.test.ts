import { describe, expect, it } from "vitest"
import { parseTaskMetadata } from "../packages/core/src/diagnostics/plan-drift.ts"

function compactTask(completionChecked = true): string {
  return `# Task 006. Compact evidence fixture

## Purpose
- [x] Establish current requirements.

## Functional Units
- [x] 기능 1: extract.
- [x] 기능 2: verify.

## Architecture/TDD/Validation
- [x] Red was reproduced.
- [x] focused tests were executed.

## Completion and Next Decision
- [${completionChecked ? "x" : " "}] implementation and validation were recorded.
- [x] next task was selected.

### Result
- focused 23 tests, generated 3 tests, typecheck and Biome passed.

## Stop Conditions
- [ ] Product requirements cannot be identified.
- [ ] The full plan is complete.
`
}

describe("Task 184 compact task evidence", () => {
  it("classifies completed compact tasks independently from unchecked stop guards", () => {
    const metadata = parseTaskMetadata(".tasks/task006.md", compactTask())

    expect(metadata).toMatchObject({
      status: "Done",
      completed: true,
      hasAutomatedEvidence: true,
      hasEvidence: true,
      missingSections: [],
    })
  })

  it("keeps a compact task pending when a completion checkbox is unchecked", () => {
    const metadata = parseTaskMetadata(".tasks/task006.md", compactTask(false))

    expect(metadata.status).toBe("In Progress")
    expect(metadata.completed).toBe(false)
  })

  it("reports missing compact sections without legacy section names", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task006.md",
      compactTask().replace(
        "## Functional Units\n- [x] 기능 1: extract.\n- [x] 기능 2: verify.\n\n",
        "",
      ),
    )

    expect(metadata.missingSections).toContain("Functional Units")
    expect(metadata.missingSections).not.toContain("목표")
  })
})
