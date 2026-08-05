import { describe, expect, it } from "vitest"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"

function item(key: string): GoalReviewGateReport["promptSources"][number] {
  return {
    key,
    passed: true,
    evidenceRefs: [`evidence:${key}`],
  }
}

function completeReport(): GoalReviewGateReport {
  return {
    documentStructure: GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure.map((key) => item(key)),
    behaviorInvariants: GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants.map((key) => item(key)),
    promptSources: GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources.map((key) => item(key)),
    harness: GOAL_REVIEW_GATE_REQUIRED_KEYS.harness.map((key) => item(key)),
    operations: GOAL_REVIEW_GATE_REQUIRED_KEYS.operations.map((key) => item(key)),
  }
}

describe("task0777 GOAL review prompt assembly coverage gate", () => {
  it("requires prompt assembly coverage in the prompt source review gates", () => {
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources).toContain("prompt_assembly_coverage")
    expect(validateGoalReviewGateReport(completeReport())).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("rejects GOAL review reports that omit prompt assembly coverage evidence", () => {
    const report = completeReport()
    report.promptSources = report.promptSources.filter((gate) => gate.key !== "prompt_assembly_coverage")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "promptSources",
      key: "prompt_assembly_coverage",
      path: "promptSources.prompt_assembly_coverage",
    }))
  })
})
