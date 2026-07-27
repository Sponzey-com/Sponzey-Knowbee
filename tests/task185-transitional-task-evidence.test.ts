import { describe, expect, it } from "vitest"
import { parseTaskMetadata } from "../packages/core/src/diagnostics/plan-drift.ts"

const status = `## Status
- [x] Ready
- [x] Red
- [x] Green
- [x] Tidy
- [x] Verified
- [x] Done`

function base(body: string): string {
  return `# Task 185. Transitional evidence fixture

${status}

## Requirement and Goal
- Verify transitional roles.

## Functional Units
- 기능 1: completion role.
- 기능 2: evidence role.

${body}
`
}

describe("Task 185 transitional task evidence", () => {
  it("accepts Validation Report as an explicit completion evidence role", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task019.md",
      base(`## Validation Report
- export boundary 11 tests and regression 20 tests passed.

## Architecture Decision
- Public and Audit projections remain separate.`),
    )

    expect(metadata).toMatchObject({
      status: "Done",
      completed: true,
      hasAutomatedEvidence: true,
      hasEvidence: true,
      missingSections: [],
    })
  })

  it("combines Done Criteria and Result as completion evidence", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task035.md",
      base(`## Architecture and TDD
- Queue policy remains in the application boundary.

## Validation
- [x] integration tests passed.

## Done Criteria
- [x] admission is bounded.

## Result
- focused 44 tests, typecheck and build passed.`),
    )

    expect(metadata.missingSections).toEqual([])
    expect(metadata.hasEvidence).toBe(true)
  })

  it("keeps prose and checked Validation Evidence but drops unchecked commands", () => {
    const metadata = parseTaskMetadata(
      ".tasks/task172.md",
      base(`## Architecture and TDD
- Explicit application ports.

## Validation Evidence
- \`pnpm vitest run tests/task172-live-acceptance-runtime-factory.test.ts\`: 4 tests passed.
- [x] architecture audit passed.
- [ ] \`pnpm vitest run tests/not-run.test.ts\`

## Completion Report
- Runtime factory wiring was completed.`),
    )

    expect(metadata.hasAutomatedEvidence).toBe(true)
    expect(metadata.evidenceCommands).toContain(
      "pnpm vitest run tests/task172-live-acceptance-runtime-factory.test.ts",
    )
    expect(metadata.evidenceCommands).not.toContain("pnpm vitest run tests/not-run.test.ts")
  })
})
