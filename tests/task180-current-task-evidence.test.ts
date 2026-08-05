import { describe, expect, it } from "vitest"
import { parseTaskMetadata } from "../packages/core/src/diagnostics/plan-drift.ts"

function currentTask(overrides: { done?: boolean; verified?: boolean; report?: string } = {}) {
  const checked = (value = true) => (value ? "x" : " ")
  return `# Task 180. Current evidence

## Status
- [x] Ready
- [x] Red
- [x] Green
- [x] Tidy
- [${checked(overrides.verified)}] Verified
- [${checked(overrides.done)}] Done

## Requirement and Goal
- Verify current evidence.

## Functional Units
- 기능 1: parse status.
- 기능 2: bind evidence.

## Architecture and TDD
- Adapter only.

## Validation
- focused and repository gates.

## Completion Report
${overrides.report ?? "- 12 tests, typecheck, build와 architecture audit가 통과했다."}
`
}

describe("Task 180 current task evidence schema", () => {
  it("classifies exact Verified and Done checkboxes with completion evidence", () => {
    const metadata = parseTaskMetadata(".tasks/task180.md", currentTask())

    expect(metadata).toMatchObject({
      status: "Done",
      completed: true,
      hasAutomatedEvidence: true,
      hasEvidence: true,
      missingSections: [],
    })
  })

  it.each([
    [{ done: false }, "In Progress"],
    [{ verified: false }, "In Progress"],
    [{ report: "- 미완료." }, "Done"],
  ] as const)("fails closed for incomplete current evidence %#", (overrides, status) => {
    const metadata = parseTaskMetadata(".tasks/task180.md", currentTask(overrides))

    expect(metadata.status).toBe(status)
    expect(metadata.completed && metadata.hasEvidence).toBe(false)
  })

  it.each([
    currentTask().replace("- [x] Done", "- [x] Done\n- [x] Done"),
    currentTask().replace("- [x] Ready\n", ""),
    currentTask().replace("- [x] Tidy", "- [x] Review"),
  ])("rejects malformed current status checkboxes %#", (content) => {
    const metadata = parseTaskMetadata(".tasks/task180.md", content)

    expect(metadata.status).toBe("Invalid Status")
    expect(metadata.completed).toBe(false)
  })
})
