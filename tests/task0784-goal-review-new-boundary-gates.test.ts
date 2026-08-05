import { describe, expect, it } from "vitest"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"

function item(key: string): GoalReviewGateReport["operations"][number] {
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

describe("task0784 GOAL review new boundary gates", () => {
  it("requires review gates for recent GOAL boundary hardening", () => {
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants).toContain("user_facing_final_response_provenance")
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources).toContain("canonical_prompt_module_coverage")
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources).toContain("prompt_canonical_reference")
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources).toContain("sub_agent_runtime_child_creation_prompt")
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.operations).toContain("yeonjang_required_failure_policy")
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.operations).toContain("generated_artifact_consistency")
    expect(validateGoalReviewGateReport(completeReport())).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("rejects reports that omit final response provenance evidence", () => {
    const report = completeReport()
    report.behaviorInvariants = report.behaviorInvariants
      .filter((gate) => gate.key !== "user_facing_final_response_provenance")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "behaviorInvariants",
      key: "user_facing_final_response_provenance",
      path: "behaviorInvariants.user_facing_final_response_provenance",
    }))
  })

  it("rejects reports that omit canonical prompt module coverage evidence", () => {
    const report = completeReport()
    report.promptSources = report.promptSources
      .filter((gate) => gate.key !== "canonical_prompt_module_coverage")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "promptSources",
      key: "canonical_prompt_module_coverage",
      path: "promptSources.canonical_prompt_module_coverage",
    }))
  })

  it("rejects reports that omit canonical prompt reference evidence", () => {
    const report = completeReport()
    report.promptSources = report.promptSources
      .filter((gate) => gate.key !== "prompt_canonical_reference")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "promptSources",
      key: "prompt_canonical_reference",
      path: "promptSources.prompt_canonical_reference",
    }))
  })

  it("rejects reports that omit generated artifact consistency evidence", () => {
    const report = completeReport()
    report.operations = report.operations
      .filter((gate) => gate.key !== "generated_artifact_consistency")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "operations",
      key: "generated_artifact_consistency",
      path: "operations.generated_artifact_consistency",
    }))
  })
})
