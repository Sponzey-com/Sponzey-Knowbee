import { describe, expect, it } from "vitest"
import {
  type CanonicalResultReportInput,
  buildCanonicalResultReportFacts,
} from "../packages/core/src/index.ts"

function input(overrides: Partial<CanonicalResultReportInput> = {}): CanonicalResultReportInput {
  return {
    goalId: "goal:1",
    workId: "work:1",
    outcome: "completed",
    primaryLanguage: "ko",
    completedScope: ["scope:answer"],
    unresolvedScope: [],
    reasonCode: "goal_achieved",
    verifiedReasonFacts: ["All acceptance criteria passed."],
    evidenceRefs: ["evidence:test:1"],
    nextActions: [],
    ...overrides,
  }
}

describe("task1251 canonical result report facts", () => {
  it.each(["completed", "partial", "impossible", "blocked"] as const)(
    "builds the canonical %s result",
    (outcome) => {
      const report = buildCanonicalResultReportFacts(
        input({
          outcome,
          completedScope: outcome === "completed" || outcome === "partial" ? ["scope:done"] : [],
          unresolvedScope: outcome === "completed" ? [] : ["scope:remaining"],
          reasonCode: `${outcome}_reason`,
          nextActions:
            outcome === "completed"
              ? []
              : [
                  {
                    kind: outcome === "blocked" ? "required_condition" : "user_action",
                    text: "Provide access and retry.",
                  },
                ],
        }),
      )
      expect(report.outcome).toBe(outcome)
    },
  )

  it("requires evidence for completed and impossible reports", () => {
    expect(() => buildCanonicalResultReportFacts(input({ evidenceRefs: [] }))).toThrow(/evidence/i)
    expect(() =>
      buildCanonicalResultReportFacts(
        input({
          outcome: "impossible",
          completedScope: [],
          unresolvedScope: ["scope:x"],
          evidenceRefs: [],
          nextActions: [{ kind: "user_action", text: "Use a supported input." }],
        }),
      ),
    ).toThrow(/evidence/i)
  })

  it("requires both completed and unresolved scope for partial reports", () => {
    expect(() =>
      buildCanonicalResultReportFacts(
        input({
          outcome: "partial",
          completedScope: [],
          unresolvedScope: ["scope:x"],
          nextActions: [{ kind: "user_action", text: "Retry." }],
        }),
      ),
    ).toThrow(/completed scope/i)
    expect(() =>
      buildCanonicalResultReportFacts(
        input({
          outcome: "partial",
          unresolvedScope: [],
          nextActions: [{ kind: "user_action", text: "Retry." }],
        }),
      ),
    ).toThrow(/unresolved scope/i)
  })

  it("requires a resume condition for blocked reports and an action for every non-completed report", () => {
    expect(() =>
      buildCanonicalResultReportFacts(
        input({
          outcome: "blocked",
          completedScope: [],
          unresolvedScope: ["scope:x"],
          nextActions: [],
        }),
      ),
    ).toThrow(/next action/i)
    expect(() =>
      buildCanonicalResultReportFacts(
        input({
          outcome: "blocked",
          completedScope: [],
          unresolvedScope: ["scope:x"],
          nextActions: [{ kind: "user_action", text: "Retry." }],
        }),
      ),
    ).toThrow(/required condition/i)
  })

  it("rejects duplicate, blank, and unbound report facts", () => {
    expect(() => buildCanonicalResultReportFacts(input({ goalId: " " }))).toThrow(/goal id/i)
    expect(() =>
      buildCanonicalResultReportFacts(input({ completedScope: ["scope:x", "scope:x"] })),
    ).toThrow(/unique/i)
    expect(() => buildCanonicalResultReportFacts(input({ verifiedReasonFacts: [] }))).toThrow(
      /reason fact/i,
    )
  })
})
