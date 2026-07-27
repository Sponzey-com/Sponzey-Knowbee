import { describe, expect, it } from "vitest"
import { parseTaskMetadata } from "../packages/core/src/diagnostics/plan-drift.ts"

function numberedTask(completionChecked = true): string {
  return `# Task 001. Numbered evidence fixture

## 1. Task Purpose
- Establish a baseline.

## 2. Current Context
- Historical task format.

## 3. Scope
- Maintenance only.

## 4. Functional Units
- 기능 1: classify.
- 기능 2: verify.

## 5. Architecture Notes
- Adapter boundary only.

## 6. Configuration Rules
- Explicit root input.

## 7. Logging Requirements
- Bounded diagnostics.

## 8. State Machine Requirements
- Batch validation only.

## 9. TDD Plan
- [x] Red reproduced.

## 10. Implementation Checklist
- [x] Parser implemented.

## 11. Validation Checklist
- [x] architecture audit passed.

## 12. Completion Report
- [${completionChecked ? "x" : " "}] focused suite 7 tests passed.
- [x] typecheck and build passed.

## 13. Next Task Decision Hook
- Continue from evidence.

## 14. Stop Conditions
- Preserve historical content.
`
}

describe("Task 183 numbered task evidence", () => {
  it("classifies a complete numbered task without legacy section warnings", () => {
    const metadata = parseTaskMetadata(".tasks/task001.md", numberedTask())

    expect(metadata).toMatchObject({
      status: "Done",
      completed: true,
      hasAutomatedEvidence: true,
      hasEvidence: true,
      missingSections: [],
    })
  })

  it("keeps numbered tasks pending while any completion checkbox is unchecked", () => {
    const metadata = parseTaskMetadata(".tasks/task001.md", numberedTask(false))

    expect(metadata.status).toBe("In Progress")
    expect(metadata.completed).toBe(false)
  })

  it("reports a missing numbered section by its canonical name", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task001.md",
      numberedTask().replace("## 3. Scope\n- Maintenance only.\n\n", ""),
    )

    expect(metadata.missingSections).toContain("Scope")
    expect(metadata.missingSections).not.toContain("기준 문서")
  })

  it("keeps nested result headings inside the completion evidence section", () => {
    const content = numberedTask()
      .replace("- [x] architecture audit passed.", "- [x] validation recorded.")
      .replace(
        "- [x] focused suite 7 tests passed.\n- [x] typecheck and build passed.",
        "- [x] completion recorded.\n\n### Result\n- focused suite 7 tests passed.",
      )

    const metadata = parseTaskMetadata(".tasks/task001.md", content)

    expect(metadata.hasAutomatedEvidence).toBe(true)
  })
})
