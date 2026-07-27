import { describe, expect, it } from "vitest"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"

function item(key: string, overrides: Partial<GoalReviewGateReport["documentStructure"][number]> = {}) {
  return {
    key,
    passed: true,
    evidenceRefs: [`evidence:${key}`],
    notes: `reviewed ${key}`,
    ...overrides,
  }
}

function completeReport(overrides: Partial<GoalReviewGateReport> = {}): GoalReviewGateReport {
  return {
    documentStructure: GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure.map((key) => item(key)),
    behaviorInvariants: GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants.map((key) => item(key)),
    promptSources: GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources.map((key) => item(key)),
    harness: GOAL_REVIEW_GATE_REQUIRED_KEYS.harness.map((key) => item(key)),
    operations: GOAL_REVIEW_GATE_REQUIRED_KEYS.operations.map((key) => item(key)),
    ...overrides,
  }
}

describe("task0772 GOAL acceptance review gate", () => {
  it("accepts a complete review gate report", () => {
    expect(validateGoalReviewGateReport(completeReport())).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("rejects missing required review categories", () => {
    const result = validateGoalReviewGateReport({
      documentStructure: completeReport().documentStructure,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "review_category_missing",
        category: "behaviorInvariants",
        path: "behaviorInvariants",
      }),
      expect.objectContaining({
        code: "review_category_missing",
        category: "promptSources",
        path: "promptSources",
      }),
      expect.objectContaining({
        code: "review_category_missing",
        category: "harness",
        path: "harness",
      }),
      expect.objectContaining({
        code: "review_category_missing",
        category: "operations",
        path: "operations",
      }),
    ]))
  })

  it("rejects failed gates and gates without evidence", () => {
    const report = completeReport({
      harness: [
        item("harness_only_path", { passed: false, evidenceRefs: ["evidence:harness_only_path"] }),
        ...GOAL_REVIEW_GATE_REQUIRED_KEYS.harness
          .filter((key) => key !== "harness_only_path")
          .map((key) => item(key)),
      ],
      operations: [
        item("cleanup_reference_policy", { evidenceRefs: [] }),
        ...GOAL_REVIEW_GATE_REQUIRED_KEYS.operations
          .filter((key) => key !== "cleanup_reference_policy")
          .map((key) => item(key)),
      ],
    })
    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "review_gate_failed",
        category: "harness",
        key: "harness_only_path",
        path: "harness.harness_only_path",
      }),
      expect.objectContaining({
        code: "review_evidence_missing",
        category: "operations",
        key: "cleanup_reference_policy",
        path: "operations.cleanup_reference_policy.evidenceRefs",
      }),
    ]))
  })

  it("rejects duplicate gate keys in a category", () => {
    const duplicate = item("canonical_owner_alignment")
    const result = validateGoalReviewGateReport(completeReport({
      documentStructure: [
        ...completeReport().documentStructure,
        duplicate,
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_duplicate",
      category: "documentStructure",
      key: "canonical_owner_alignment",
      path: "documentStructure.canonical_owner_alignment",
    }))
  })
})
