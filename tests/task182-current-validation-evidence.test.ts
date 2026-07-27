import { describe, expect, it } from "vitest"
import { parseTaskMetadata } from "../packages/core/src/diagnostics/plan-drift.ts"

function currentTask(
  validationLine: string,
  completionReport = "- 구현 범위와 잔여 위험을 확인했다.",
): string {
  return `# Task 182. Validation evidence fixture

## Status
- [x] Ready
- [x] Red
- [x] Green
- [x] Tidy
- [x] Verified
- [x] Done

## Requirement and Goal
- Verify checked evidence.

## Functional Units
- 기능 1: collect evidence.
- 기능 2: reject unchecked evidence.

## Architecture and TDD
- Maintenance adapter only.

## TDD Evidence
${validationLine}

## Validation Evidence
- [x] architecture audit passed.

## Completion Report
${completionReport}
`
}

describe("Task 182 current validation evidence", () => {
  it("accepts checked structured validation evidence with a completion report", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task182.md",
      currentTask("- [x] canonical runtime integration 31 tests passed."),
    )

    expect(metadata).toMatchObject({
      status: "Done",
      completed: true,
      hasAutomatedEvidence: true,
      hasEvidence: true,
    })
  })

  it("extracts commands only from checked current evidence lines", () => {
    const checked = parseTaskMetadata(
      ".tasks/task182.md",
      currentTask(
        "- [x] `pnpm vitest run tests/task182-current-validation-evidence.test.ts` passed.",
      ),
    )
    const unchecked = parseTaskMetadata(
      ".tasks/task182.md",
      currentTask("- [ ] `pnpm vitest run tests/not-run.test.ts`"),
    )

    expect(checked.evidenceCommands).toContain(
      "pnpm vitest run tests/task182-current-validation-evidence.test.ts",
    )
    expect(unchecked.evidenceCommands).not.toContain("pnpm vitest run tests/not-run.test.ts")
  })

  it("keeps incomplete completion reports unverified despite checked validation", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task182.md",
      currentTask("- [x] 31 tests passed.", "- 미완료."),
    )

    expect(metadata.completed).toBe(true)
    expect(metadata.hasEvidence).toBe(false)
  })
})
